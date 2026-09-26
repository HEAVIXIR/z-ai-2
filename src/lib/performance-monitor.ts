/**
 * HEAVIX — T5-A: Performance Monitor (request timing helper)
 * ------------------------------------------------------------
 * Lightweight, dependency-free request-timing utility. The goal is
 * NOT a full APM replacement — it's the minimal in-process surface
 * that ships with the app and lets operators see which API routes
 * are slow (>500ms by default) directly on /admin/observability.
 *
 * Usage in a Next.js Route Handler:
 *
 *   import { withTiming } from "@/lib/performance-monitor";
 *
 *   export const GET = withTiming("GET /api/listings", async (req) => {
 *     // ... route body ...
 *   });
 *
 * Or, for finer control inside a route that already wraps everything
 * in try/catch:
 *
 *   import { recordRequest } from "@/lib/performance-monitor";
 *
 *   const t0 = performance.now();
 *   try {
 *     // ... work ...
 *   } finally {
 *     recordRequest("GET /api/listings", t0);
 *   }
 *
 * What it does:
 *   • Measures wall-clock latency via `performance.now()` (sub-millis).
 *   • Appends to an in-memory ring buffer (CAP = 200 entries, FIFO).
 *   • Logs any request over SLOW_THRESHOLD_MS (default 500ms) to the
 *     console as `[slow-request]` with a structured payload, so log
 *     aggregators can pick it up.
 *   • Exposes `getSlowRequests()` / `getRecentRequests()` /
 *     `getStats()` for the observability dashboard to render.
 *
 * What it does NOT do:
 *   • No external shipping (no StatsD / OpenTelemetry / Sentry). The
 *     `trackError`-style header on src/lib/error-tracking.ts explains
 *     the upgrade path: swap the internals here, call sites remain
 *     unchanged.
 *   • No per-user attribution — only endpoint + latency + status.
 *     PII should never land in a perf log.
 *   • No persistence — the ring buffer lives in-process and resets
 *     on every deploy / restart. That's intentional: this is a
 *     tactical "what is slow right now" view, not a long-term store.
 */

/* ============================================================
   Types
   ============================================================ */

export interface RequestRecord {
  /** Endpoint label, e.g. "GET /api/listings". */
  endpoint: string;
  /** Wall-clock latency in milliseconds (sub-ms resolution). */
  latencyMs: number;
  /** ISO timestamp of when the request completed. */
  timestamp: string;
  /** Optional HTTP status code, when known. */
  status?: number;
  /** Optional flag for slow requests (>= SLOW_THRESHOLD_MS). */
  slow?: boolean;
}

export interface PerformanceStats {
  /** Total requests observed in the ring buffer. */
  total: number;
  /** Number of requests that breached the slow threshold. */
  slowCount: number;
  /** Average latency across the ring buffer (ms). -1 if empty. */
  avgLatencyMs: number;
  /** P95 latency across the ring buffer (ms). -1 if empty. */
  p95LatencyMs: number;
  /** Max latency observed in the ring buffer (ms). -1 if empty. */
  maxLatencyMs: number;
  /** Currently-configured slow threshold (ms). */
  slowThresholdMs: number;
}

/* ============================================================
   Constants
   ============================================================ */

/**
 * Default threshold above which a request is flagged as "slow" and
 * logged to console. 500ms is a reasonable default for an internal
 * admin tool — anything below human-perceivable latency (200ms) gets
 * noisy, anything above 1s is too lax.
 */
export const SLOW_THRESHOLD_MS = 500;

/**
 * Maximum number of records kept in the in-memory ring buffer. The
 * buffer is FIFO: once full, the oldest entry is dropped on insert.
 * 200 lets the observability dashboard render the last ~200 requests
 * without unbounded memory growth in long-running processes.
 */
export const CAP = 200;

/* ============================================================
   In-memory ring buffer
   ============================================================ */

// Module-private mutable state. Single-process by design — Next.js
// route handlers may run in different worker processes, but each
// process gets its own view, which is fine for a tactical dashboard.
const buffer: RequestRecord[] = [];

function appendRecord(rec: RequestRecord): void {
  buffer.push(rec);
  if (buffer.length > CAP) {
    buffer.shift(); // drop oldest — FIFO ring
  }
}

/* ============================================================
   Core API
   ============================================================ */

/**
 * Record a request completion. Called either directly from a route's
 * finally block, or implicitly by `withTiming`.
 *
 * `startMs` should be a `performance.now()` value captured at the
 * start of the request handler. We compute `performance.now() - startMs`
 * here so the recorded latency includes everything between the start
 * marker and now (including the DB / external calls).
 *
 * `status` is optional — pass it when known so the dashboard can
 * show e.g. all 500s vs. all 200s side-by-side.
 */
export function recordRequest(
  endpoint: string,
  startMs: number,
  status?: number,
): void {
  const latencyMs = Math.max(0, performance.now() - startMs);
  const slow = latencyMs >= SLOW_THRESHOLD_MS;
  const rec: RequestRecord = {
    endpoint,
    latencyMs: Math.round(latencyMs * 1000) / 1000, // 3-decimal precision
    timestamp: new Date().toISOString(),
    slow,
  };
  if (status !== undefined) rec.status = status;

  appendRecord(rec);

  // Best-effort console log for slow requests — log aggregators can
  // pick up the structured `[slow-request]` prefix.
  if (slow) {
    console.warn("[slow-request]", rec);
  }
}

/**
 * Wrap a Next.js Route Handler with automatic timing.
 *
 *   export const GET = withTiming("GET /api/listings", async (req) => { ... });
 *
 * The wrapper:
 *   1. Captures `performance.now()` at entry.
 *   2. Calls the handler.
 *   3. On resolve / reject, records the request via `recordRequest`.
 *   4. Re-throws the original error so Next.js's error handling
 *      still kicks in (we don't swallow — we just observe).
 *
 * Status code: if the handler returns a `Response` / `NextResponse`,
 * we read `.status` off it; otherwise we leave status undefined.
 */
export function withTiming<TArgs extends unknown[], TRes>(
  endpoint: string,
  handler: (...args: TArgs) => Promise<TRes>,
): (...args: TArgs) => Promise<TRes> {
  return async function timed(...args: TArgs): Promise<TRes> {
    const t0 = performance.now();
    try {
      const res = await handler(...args);
      // Try to pull the HTTP status off the response — both NextResponse
      // and the standard `Response` expose `.status`.
      const status =
        typeof res === "object" && res !== null && "status" in res
          ? Number((res as { status: number }).status)
          : undefined;
      recordRequest(endpoint, t0, status);
      return res;
    } catch (err) {
      // Still record — failed requests are often the slow ones.
      recordRequest(endpoint, t0, 500);
      throw err;
    }
  };
}

/* ============================================================
   Read API for observability dashboard
   ============================================================ */

/**
 * Returns the slowest requests currently in the ring buffer, newest
 * first. A request is "slow" if its latencyMs >= SLOW_THRESHOLD_MS.
 */
export function getSlowRequests(limit = 50): RequestRecord[] {
  return buffer
    .filter((r) => r.slow)
    .slice(-limit)
    .reverse();
}

/**
 * Returns the most recent requests (slow or not), newest first.
 */
export function getRecentRequests(limit = 50): RequestRecord[] {
  return buffer.slice(-limit).reverse();
}

/**
 * Aggregate stats across the ring buffer. P95 is computed by sorting
 * a copy of the latency array and picking the index at the 95th
 * percentile. If the buffer is empty, all numeric fields are -1
 * so the dashboard can show "no data" rather than NaN.
 */
export function getStats(): PerformanceStats {
  if (buffer.length === 0) {
    return {
      total: 0,
      slowCount: 0,
      avgLatencyMs: -1,
      p95LatencyMs: -1,
      maxLatencyMs: -1,
      slowThresholdMs: SLOW_THRESHOLD_MS,
    };
  }
  const latencies = buffer.map((r) => r.latencyMs).sort((a, b) => a - b);
  const sum = latencies.reduce((s, v) => s + v, 0);
  const avg = sum / latencies.length;
  // P95 index — for small buffers this clamps to the last element.
  const p95Idx = Math.min(
    latencies.length - 1,
    Math.floor(latencies.length * 0.95),
  );
  const p95 = latencies[p95Idx];
  const max = latencies[latencies.length - 1];
  return {
    total: buffer.length,
    slowCount: buffer.filter((r) => r.slow).length,
    avgLatencyMs: Math.round(avg * 1000) / 1000,
    p95LatencyMs: Math.round(p95 * 1000) / 1000,
    maxLatencyMs: Math.round(max * 1000) / 1000,
    slowThresholdMs: SLOW_THRESHOLD_MS,
  };
}

/**
 * Test-only helper: clear the ring buffer. Exported so unit tests
 * can reset state between cases. NOT for production use.
 */
export function _resetForTests(): void {
  buffer.length = 0;
}
