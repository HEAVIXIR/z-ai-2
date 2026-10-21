/**
 * HEAVIX — STEP 15.37-B — CSRF Enforcement Regression Tests
 * ============================================================
 *
 * Covers findings F-004, F-005, F-006 from the STEP 15.36 audit:
 *
 *   F-004 (High)  : `checkCsrf()` was permissive — returned `true`
 *                   when NO Origin/Referer header was present. This
 *                   made the layer a no-op for same-origin browser
 *                   requests that omit Origin (and was ineffective
 *                   against attacks that suppress Origin).
 *
 *   F-005 (Medium): `checkCsrfStrict()` existed but was dead code
 *                   — not imported or called by any route.
 *
 *   F-006 (Medium): `checkCsrf` was NOT applied to the auth
 *                   mutation routes (login, register,
 *                   resend-verification, verify-email, logout).
 *
 * These tests are CONTRACT-LEVEL: they import `checkCsrf` from
 * `@/lib/csrf` and assert on its boolean return value. They also
 * verify (via fs.readFileSync + module introspection) that:
 *   - `checkCsrfStrict` is no longer exported (F-005 fix —
 *     consolidated into the single fail-closed `checkCsrf`).
 *   - The 4 explicitly named auth mutation routes + logout now
 *     invoke `checkCsrf` (F-006 fix).
 *
 * No DB, no running server. Runs under `bunx vitest run
 * tests/security/csrf-enforcement.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { checkCsrf } from "@/lib/csrf";

// ─────────────────────────────────────────────────────────────
// Helpers — build a Request with specific method + headers.
// ─────────────────────────────────────────────────────────────

const TRUSTED_ORIGIN =
  (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

function makeReq(
  method: string,
  opts: { origin?: string | null; referer?: string | null; headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers();
  if (opts.origin !== undefined && opts.origin !== null) {
    headers.set("origin", opts.origin);
  }
  if (opts.referer !== undefined && opts.referer !== null) {
    headers.set("referer", opts.referer);
  }
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
  }
  // Always include a JSON content-type to mimic a fetch() POST.
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`${TRUSTED_ORIGIN}/api/test-csrf`, {
    method,
    headers,
    body: ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase())
      ? JSON.stringify({ x: 1 })
      : undefined,
  });
}

// ─────────────────────────────────────────────────────────────
// F-004 — fail-closed policy on mutation methods
// ─────────────────────────────────────────────────────────────

describe("F-004 fix: checkCsrf is fail-closed for mutation methods", () => {
  it("POST with trusted Origin → true (pass)", () => {
    expect(checkCsrf(makeReq("POST", { origin: TRUSTED_ORIGIN }))).toBe(true);
  });

  it("POST with trusted Origin + path suffix → true (pass)", () => {
    // Origin is just scheme+host+port; but the route may also receive a
    // Referer with a path. We exercise Referer here.
    expect(
      checkCsrf(makeReq("POST", { referer: `${TRUSTED_ORIGIN}/login` })),
    ).toBe(true);
  });

  it("POST with untrusted Origin (different host) → false (403)", () => {
    expect(
      checkCsrf(makeReq("POST", { origin: "https://evil.example.com" })),
    ).toBe(false);
  });

  it("POST with untrusted Origin (different port) → false (403)", () => {
    // Same host, different port — must NOT match (port is part of origin).
    expect(
      checkCsrf(makeReq("POST", { origin: `${TRUSTED_ORIGIN}:9999` })),
    ).toBe(false);
  });

  it("POST with untrusted Referer (different scheme) → false (403)", () => {
    // Mismatched scheme: expected http(s)://... but received a different
    // scheme. We construct an explicit http-vs-https mismatch when the
    // trusted origin uses https, or a http-vs-https mismatch otherwise.
    const oppositeScheme = TRUSTED_ORIGIN.startsWith("https://")
      ? TRUSTED_ORIGIN.replace(/^https:/, "http:")
      : TRUSTED_ORIGIN.replace(/^http:/, "https:");
    expect(
      checkCsrf(makeReq("POST", { referer: `${oppositeScheme}/x` })),
    ).toBe(false);
  });

  it("POST with NEITHER Origin NOR Referer → false (403, fail-closed)", () => {
    // The core F-004 fix: previously this returned `true` (permissive).
    // Now it must return `false` (fail-closed).
    expect(checkCsrf(makeReq("POST", {}))).toBe(false);
  });

  it("PATCH with no Origin/Referer → false (403, fail-closed)", () => {
    expect(checkCsrf(makeReq("PATCH", {}))).toBe(false);
  });

  it("PUT with no Origin/Referer → false (403, fail-closed)", () => {
    expect(checkCsrf(makeReq("PUT", {}))).toBe(false);
  });

  it("DELETE with no Origin/Referer → false (403, fail-closed)", () => {
    expect(checkCsrf(makeReq("DELETE", {}))).toBe(false);
  });

  it("POST with trusted Origin AND untrusted Referer → false (defense-in-depth)", () => {
    // If both headers are present, BOTH must match — otherwise reject.
    expect(
      checkCsrf(
        makeReq("POST", {
          origin: TRUSTED_ORIGIN,
          referer: "https://evil.example.com/login",
        }),
      ),
    ).toBe(false);
  });

  it("POST with trusted Referer AND untrusted Origin → false", () => {
    expect(
      checkCsrf(
        makeReq("POST", {
          origin: "https://evil.example.com",
          referer: `${TRUSTED_ORIGIN}/login`,
        }),
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// F-004 — safe methods are exempt
// ─────────────────────────────────────────────────────────────

describe("F-004 fix: safe methods are exempt from CSRF", () => {
  it("GET with no Origin → true (pass, safe method)", () => {
    expect(checkCsrf(makeReq("GET", {}))).toBe(true);
  });

  it("HEAD with no Origin → true (pass, safe method)", () => {
    expect(checkCsrf(makeReq("HEAD", {}))).toBe(true);
  });

  it("OPTIONS with no Origin → true (pass, safe method)", () => {
    expect(checkCsrf(makeReq("OPTIONS", {}))).toBe(true);
  });

  it("GET with untrusted Origin → true (safe method bypasses Origin check)", () => {
    // GET cannot mutate state; cross-origin GET is a CORS concern, not CSRF.
    expect(
      checkCsrf(makeReq("GET", { origin: "https://evil.example.com" })),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// F-004 — malformed Origin / Referer are rejected
// ─────────────────────────────────────────────────────────────

describe("F-004 fix: malformed Origin / Referer are rejected", () => {
  it("POST with malformed Origin (no scheme) → false", () => {
    expect(checkCsrf(makeReq("POST", { origin: "evil.example.com" }))).toBe(false);
  });

  it("POST with malformed Origin (javascript: scheme) → false", () => {
    expect(
      checkCsrf(makeReq("POST", { origin: "javascript:alert(1)" })),
    ).toBe(false);
  });

  it("POST with malformed Origin (data: scheme) → false", () => {
    expect(
      checkCsrf(makeReq("POST", { origin: "data:text/html,foo" })),
    ).toBe(false);
  });

  it("POST with empty Origin header → false", () => {
    // Empty string is technically "present" but matches nothing.
    expect(checkCsrf(makeReq("POST", { origin: "" }))).toBe(false);
  });

  it("POST with whitespace-only Origin → false", () => {
    expect(checkCsrf(makeReq("POST", { origin: "   " }))).toBe(false);
  });

  it("POST with Origin containing the trusted origin as substring (prefix attack) → false", () => {
    // evil-host that starts with the trusted origin's host name but is
    // actually a different origin. E.g. trusted=`http://localhost:3000`
    // and attacker=`http://localhost:3000.evil.example.com` — must NOT
    // match (we require either exact equality or `expected + "/"`).
    expect(
      checkCsrf(
        makeReq("POST", { origin: `${TRUSTED_ORIGIN}.evil.example.com` }),
      ),
    ).toBe(false);
  });

  it("POST with Referer that is just the trusted origin + no path → true", () => {
    // Exact equality (no trailing slash) is allowed.
    expect(checkCsrf(makeReq("POST", { referer: TRUSTED_ORIGIN }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Non-browser client exemptions (webhook / cron / API token)
// ─────────────────────────────────────────────────────────────

describe("F-006 fix: non-browser clients are exempt from CSRF", () => {
  it("POST with Authorization: Bearer header → true (API token client)", () => {
    expect(
      checkCsrf(
        makeReq("POST", {
          headers: { authorization: "Bearer some-jwt-or-opaque-token" },
        }),
      ),
    ).toBe(true);
  });

  it("POST with x-cron-key header → true (cron ticker client)", () => {
    expect(
      checkCsrf(
        makeReq("POST", {
          headers: { "x-cron-key": process.env.CRON_SECRET || "test-cron-key" },
        }),
      ),
    ).toBe(true);
  });

  it("POST with x-webhook-signature header → true (webhook callback)", () => {
    expect(
      checkCsrf(
        makeReq("POST", {
          headers: { "x-webhook-signature": "sha256=abc123" },
        }),
      ),
    ).toBe(true);
  });

  it("POST with x-api-key header → true (internal API token client)", () => {
    expect(
      checkCsrf(
        makeReq("POST", {
          headers: { "x-api-key": "internal-service-key" },
        }),
      ),
    ).toBe(true);
  });

  it("POST with empty Authorization header (no value) → false (still CSRF-checked)", () => {
    // An empty Authorization header should NOT exempt the request.
    expect(
      checkCsrf(
        makeReq("POST", {
          headers: { authorization: "" },
        }),
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// F-005 — checkCsrfStrict is removed (consolidated)
// ─────────────────────────────────────────────────────────────

describe("F-005 fix: checkCsrfStrict dead code is removed", () => {
  it("src/lib/csrf.ts no longer exports checkCsrfStrict", async () => {
    // The function was dead code (never imported anywhere). It has been
    // consolidated into the single fail-closed `checkCsrf`.
    const mod = await import("@/lib/csrf");
    expect(mod).not.toHaveProperty("checkCsrfStrict");
    expect(typeof mod.checkCsrf).toBe("function");
  });

  it("no source file under src/ imports checkCsrfStrict", () => {
    // Walk src/ and ensure no .ts/.tsx file references checkCsrfStrict
    // (other than the csrf.ts module comment documenting its removal).
    const root = path.resolve(__dirname, "..", "..", "src");
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, "utf8");
          // Allow the csrf.ts module itself, which contains the
          // removal notice in a comment.
          if (full.endsWith(path.join("lib", "csrf.ts"))) continue;
          if (/\bcheckCsrfStrict\b/.test(content)) {
            offenders.push(full);
          }
        }
      }
    }
    walk(root);
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// F-006 — auth mutation routes now invoke checkCsrf
// ─────────────────────────────────────────────────────────────

describe("F-006 fix: auth mutation routes now invoke checkCsrf", () => {
  const AUTH_ROUTES = [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/register/route.ts",
    "src/app/api/auth/resend-verification/route.ts",
    "src/app/api/auth/verify-email/route.ts",
    "src/app/api/auth/logout/route.ts",
  ];

  for (const rel of AUTH_ROUTES) {
    it(`${rel} imports + calls checkCsrf`, () => {
      const abs = path.resolve(__dirname, "..", "..", rel);
      const code = fs.readFileSync(abs, "utf8");
      // Must import the helper.
      expect(code).toMatch(/from\s+["']@\/lib\/csrf["']/);
      // Must invoke it inside the POST handler.
      expect(code).toMatch(/checkCsrf\s*\(/);
      // Must return 403 on failure.
      expect(code).toMatch(/status:\s*403/);
    });
  }

  it("every auth route POST handler calls checkCsrf BEFORE the try block", () => {
    // Defensive: the CSRF check must run early, before any DB / IO work.
    for (const rel of AUTH_ROUTES) {
      const abs = path.resolve(__dirname, "..", "..", rel);
      const code = fs.readFileSync(abs, "utf8");
      // Find the POST function body start.
      const postMatch = code.match(
        /export async function POST[\s\S]*?\n\}\s*$/m,
      );
      expect(postMatch, `expected POST handler in ${rel}`).not.toBeNull();
      const postBody = postMatch![0];
      const csrfIdx = postBody.indexOf("checkCsrf(");
      const tryIdx = postBody.indexOf("try {");
      expect(csrfIdx, `expected checkCsrf( in ${rel} POST`).toBeGreaterThan(-1);
      // try block may not exist in all routes; if it does, CSRF must
      // precede it.
      if (tryIdx > -1) {
        expect(csrfIdx, `${rel}: checkCsrf must run before try block`).toBeLessThan(tryIdx);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Sanity: env manipulation does not leak across tests
// ─────────────────────────────────────────────────────────────

describe("NEXTAUTH_URL configuration", () => {
  const original = process.env.NEXTAUTH_URL;

  beforeAll(() => {
    // Pin the trusted origin so the prefix-attack + scheme-mismatch
    // assertions above are deterministic.
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = original;
    }
  });

  it("honors a custom NEXTAUTH_URL when set", () => {
    process.env.NEXTAUTH_URL = "https://heavix.example";
    try {
      // Trusted origin must now be https://heavix.example.
      expect(
        checkCsrf(makeReq("POST", { origin: "https://heavix.example" })),
      ).toBe(true);
      // http (wrong scheme) must be rejected.
      expect(
        checkCsrf(makeReq("POST", { origin: "http://heavix.example" })),
      ).toBe(false);
    } finally {
      process.env.NEXTAUTH_URL = "http://localhost:3000";
    }
  });

  it("strips a trailing slash from NEXTAUTH_URL", () => {
    process.env.NEXTAUTH_URL = "https://heavix.example/";
    try {
      // Path-suffixed match still works after trailing-slash strip.
      expect(
        checkCsrf(makeReq("POST", { origin: "https://heavix.example" })),
      ).toBe(true);
      expect(
        checkCsrf(makeReq("POST", { referer: "https://heavix.example/dashboard" })),
      ).toBe(true);
    } finally {
      process.env.NEXTAUTH_URL = "http://localhost:3000";
    }
  });
});
