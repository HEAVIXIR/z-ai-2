/**
 * HEAVIX — STEP 15.37-D — Security Headers + Build Integrity Contract Test
 *
 * Verifies two findings from the STEP 15.36 security audit:
 *
 * F-013 (High) — `typescript.ignoreBuildErrors: true` in next.config.ts.
 *   This silently allowed TypeScript errors (including security-relevant
 *   type mismatches) to ship to production. Remediation: the flag must be
 *   absent or set to `false`.
 *
 * F-014 (High) — `next.config.ts` defined NO `headers()` function.
 *   Remediation: a `headers()` function must be present and return a
 *   defense-in-depth security header stack (CSP, HSTS, X-Frame-Options,
 *   X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
 *
 * This is a STATIC + DYNAMIC contract test:
 *   - Static: parses `next.config.ts` source to assert structure.
 *   - Dynamic: imports the config module and invokes `headers()` to assert
 *     the runtime return value contains the expected header names and
 *     directive values.
 *
 * Why dynamic? The `headers()` function returns a Promise resolving to an
 * array of `{ source, headers: [{key, value}] }`. Asserting only the source
 * code would not catch a runtime bug (e.g. returning an empty array, or a
 * typo'd key). Importing the config and calling `headers()` directly gives
 * us end-to-end coverage of the configuration without starting a full
 * Next.js server.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ────────────────────────────────────────────────

function readConfigSource(): string {
  const fullPath = path.join(process.cwd(), "next.config.ts");
  return fs.readFileSync(fullPath, "utf-8");
}

// ─── F-013: ignoreBuildErrors must be OFF ───────────────────

describe("F-013: typescript.ignoreBuildErrors is disabled", () => {
  const code = readConfigSource();

  it("does NOT set typescript.ignoreBuildErrors to true", () => {
    // The literal `ignoreBuildErrors: true` must not appear anywhere in the
    // typescript block of next.config.ts.
    expect(code).not.toMatch(/ignoreBuildErrors:\s*true/);
  });

  it("explicitly sets typescript.ignoreBuildErrors to false (defense-in-depth: comment + value)", () => {
    // We require the explicit `false` value with a documented reason so that
    // future maintainers don't silently flip it back to `true`.
    expect(code).toMatch(/ignoreBuildErrors:\s*false/);
  });

  it("contains a comment referencing F-013 (audit traceability)", () => {
    // Audit-trail: the remediation must be linked back to the finding id so
    // future audits can trace the rationale.
    expect(code).toMatch(/F-013/);
  });
});

// ─── F-014: security headers must be configured ─────────────

describe("F-014: next.config.ts defines a headers() function (static)", () => {
  const code = readConfigSource();

  it("declares a headers() function on the NextConfig object", () => {
    // Must be present either as `headers()` or `async headers()`.
    expect(code).toMatch(/headers\s*\(\s*\)\s*\{/);
  });

  it("returns a route entry whose source matches all paths", () => {
    // `/:path*` is the Next.js glob matcher that matches every route.
    expect(code).toMatch(/source:\s*['"`]\/:path\*['"`]/);
  });

  it("includes the F-014 audit-trail comment", () => {
    expect(code).toMatch(/F-014/);
  });

  it("declares every required security header key as a literal in source", () => {
    const requiredKeys = [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ];
    for (const key of requiredKeys) {
      expect(code, `expected header key literal: ${key}`).toContain(
        `"${key}"`,
      );
    }
  });
});

// ─── F-014: dynamic invocation of headers() ─────────────────
//
// We import the compiled next.config module and invoke headers() to verify
// the runtime return value. This catches structural bugs (e.g. the function
// returning an empty array, or omitting a header) that pure source-grep
// assertions would miss.

describe("F-014: headers() runtime contract (dynamic)", () => {
  type HeadersResult = Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;

  async function loadHeadersResult(): Promise<HeadersResult> {
    // Use an absolute path + cache-busting query so repeated test runs in the
    // same process don't get a cached module.
    const configPath = path.resolve(process.cwd(), "next.config.ts");
    const url = pathToFileURLWithCacheBust(configPath);
    const mod = (await import(url)) as { default: { headers?: () => Promise<HeadersResult> } };
    const cfg = mod.default;
    expect(cfg.headers, "next.config must export a headers() function").toBeTypeOf("function");
    const result = await cfg.headers!();
    return result;
  }

  it("headers() returns a non-empty array", async () => {
    const result = await loadHeadersResult();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("headers() includes a catch-all route entry (source = /:path*)", async () => {
    const result = await loadHeadersResult();
    const catchAll = result.find((r) => r.source === "/:path*");
    expect(catchAll, "expected an entry with source '/:path*'").toBeDefined();
    expect(catchAll!.headers.length).toBeGreaterThanOrEqual(6);
  });

  it("catch-all entry contains all 6 required security headers", async () => {
    const result = await loadHeadersResult();
    const catchAll = result.find((r) => r.source === "/:path*");
    expect(catchAll).toBeDefined();
    const keys = new Set(catchAll!.headers.map((h) => h.key));
    const required = [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ];
    for (const key of required) {
      expect(keys.has(key), `missing header: ${key}`).toBe(true);
    }
  });

  it("Strict-Transport-Security has max-age >= 63072000 (2 years) and includeSubDomains + preload", async () => {
    const result = await loadHeadersResult();
    const hsts = findHeader(result, "Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts!.value).toMatch(/max-age=(\d+)/);
    const maxAge = Number(hsts!.value.match(/max-age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(63072000);
    expect(hsts!.value).toContain("includeSubDomains");
    expect(hsts!.value).toContain("preload");
  });

  it("X-Frame-Options is DENY", async () => {
    const result = await loadHeadersResult();
    const xfo = findHeader(result, "X-Frame-Options");
    expect(xfo).toBeDefined();
    expect(xfo!.value.trim()).toBe("DENY");
  });

  it("X-Content-Type-Options is nosniff", async () => {
    const result = await loadHeadersResult();
    const xcto = findHeader(result, "X-Content-Type-Options");
    expect(xcto).toBeDefined();
    expect(xcto!.value.trim()).toBe("nosniff");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", async () => {
    const result = await loadHeadersResult();
    const rp = findHeader(result, "Referrer-Policy");
    expect(rp).toBeDefined();
    expect(rp!.value.trim()).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy denies camera, microphone, geolocation, payment", async () => {
    const result = await loadHeadersResult();
    const pp = findHeader(result, "Permissions-Policy");
    expect(pp).toBeDefined();
    expect(pp!.value).toContain("camera=()");
    expect(pp!.value).toContain("microphone=()");
    expect(pp!.value).toContain("geolocation=()");
    expect(pp!.value).toContain("payment=()");
  });

  it("Content-Security-Policy contains every required directive", async () => {
    const result = await loadHeadersResult();
    const csp = findHeader(result, "Content-Security-Policy");
    expect(csp).toBeDefined();
    const v = csp!.value;
    // Required directives per F-014 spec.
    expect(v).toContain("default-src 'self'");
    expect(v).toContain("script-src");
    expect(v).toContain("style-src");
    expect(v).toContain("img-src");
    expect(v).toContain("font-src");
    expect(v).toContain("connect-src");
    expect(v).toContain("frame-ancestors 'none'");
    expect(v).toContain("base-uri 'self'");
    expect(v).toContain("form-action 'self'");
  });

  it("CSP default-src is restricted to 'self' (no wildcards, no http:)", async () => {
    const result = await loadHeadersResult();
    const csp = findHeader(result, "Content-Security-Policy")!.value;
    // Extract default-src value
    const m = csp.match(/default-src\s+([^;]+)/);
    expect(m).toBeTruthy();
    const defaultSrc = m![1].trim();
    expect(defaultSrc).toBe("'self'");
  });

  it("CSP frame-ancestors is 'none' (anti-clickjacking)", async () => {
    const result = await loadHeadersResult();
    const csp = findHeader(result, "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("CSP documents the 'unsafe-inline'/'unsafe-eval' tradeoff for Next.js (source comment)", () => {
    // Source-level audit-trail: the comment explaining why 'unsafe-inline'
    // and 'unsafe-eval' are present must exist in next.config.ts so future
    // maintainers understand the tradeoff.
    const code = readConfigSource();
    expect(code).toMatch(/unsafe-inline/);
    expect(code).toMatch(/unsafe-eval/);
    expect(code).toMatch(/Next\.js/);
  });
});

// ─── Helpers (dynamic) ─────────────────────────────────────

function findHeader(
  result: Array<{ source: string; headers: Array<{ key: string; value: string }> }>,
  key: string,
): { key: string; value: string } | undefined {
  for (const entry of result) {
    const found = entry.headers.find((h) => h.key === key);
    if (found) return found;
  }
  return undefined;
}

function pathToFileURLWithCacheBust(p: string): string {
  // Build a file:// URL with a cache-busting query string so vitest doesn't
  // hand us a stale module from a previous test run in the same process.
  const sep = process.platform === "win32" ? "/" : "/";
  const url = "file://" + encodeURI(p.replace(/\\/g, sep)).replace(/#/g, "%23");
  return `${url}?t=${Date.now()}`;
}
