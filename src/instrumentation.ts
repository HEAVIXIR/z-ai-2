/* ============================================================
   HEAVIX — Process Resilience Instrumentation (R-08 Fix)
   ------------------------------------------------------------
   This file is the Next.js canonical place for registering
   process-level error handlers and observability hooks.

   Problem (R-08, P1):
   - When PostgreSQL becomes unavailable, Prisma's query engine
     emits unhandled promise rejections from pending operations.
   - Node.js default behavior: unhandled rejection → process termination.
   - This causes the entire Next.js server to crash on ANY DB outage,
     even though the health endpoint has correct try/catch.
   - Docker restart:unless-stopped recovers, but with downtime.

   Fix (Option A — minimal process error handlers):
   - unhandledRejection: LOG but do NOT crash. The specific request
     that caused the rejection will fail, but the process stays alive
     to serve other requests. When DB recovers, new requests succeed.
   - uncaughtException: LOG and exit(1). Uncaught exceptions indicate
     potentially corrupted state — graceful shutdown is safer than
     continuing. Docker will restart the container.
   - SIGTERM/SIGINT: graceful shutdown for container orchestration.

   Design decisions:
   - NO retry logic (per /expert: "retry فقط برای عملیات قابل تکرار")
   - NO connection pool changes (Option B — deferred until Option A
     proven insufficient)
   - NO health/readiness separation (Option C — over-engineering for now)
   - Handler is simple, auditable, and follows Next.js recommended pattern
   ============================================================ */

export async function register() {
  // Only register in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // ── unhandledRejection: log but continue ──
  // Prisma connection errors become unhandled rejections when the DB
  // drops. We log them and let the process continue serving other
  // requests. The affected request will fail (caller gets error),
  // but the process survives to auto-recover when DB returns.
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[instrumentation] Unhandled Rejection:', reason);
    // Intentionally NOT exiting — allows process to survive DB outages.
    // The specific request that triggered this will get an error response,
    // but the process stays alive for other requests + auto-recovery.
  });

  // ── uncaughtException: log and exit ──
  // Uncaught exceptions indicate potentially corrupted state.
  // Safer to shut down and let Docker restart the container.
  process.on('uncaughtException', (error) => {
    console.error('[instrumentation] Uncaught Exception:', error);
    process.exit(1);
  });

  // ── SIGTERM: graceful shutdown (container orchestration) ──
  process.on('SIGTERM', () => {
    console.log('[instrumentation] SIGTERM received — graceful shutdown');
    process.exit(0);
  });

  // ── SIGINT: graceful shutdown (Ctrl+C in dev) ──
  process.on('SIGINT', () => {
    console.log('[instrumentation] SIGINT received — graceful shutdown');
    process.exit(0);
  });

  console.log('[instrumentation] Process resilience handlers registered');
}
