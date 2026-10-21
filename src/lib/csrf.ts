/* ============================================================
   HEAVIX — CSRF defense (F-004 / F-005 / F-006 hardening)
   ------------------------------------------------------------
   Fail-closed Origin/Referer verification for mutation routes.

   ------------------------------------------------------------
   POLICY (F-004 fix — was permissive, now fail-closed):
   ------------------------------------------------------------
     1. SAFE methods (GET / HEAD / OPTIONS) → PASS unconditionally.
        These methods do not mutate server state, so CSRF is N/A.
     2. Bearer-token clients (`Authorization: Bearer ...`) → PASS.
        Browsers cannot forge the Authorization header on a
        cross-origin request without a CORS preflight that the
        attacker's origin cannot satisfy. A request bearing an
        Authorization header is therefore, by construction, a
        non-browser API client (server-to-server, CLI, mobile app).
     3. Shared-secret non-browser clients (x-cron-key,
        x-webhook-signature, x-api-key) → PASS.
        These authenticate via shared secrets rather than cookies
        and therefore cannot be CSRF victims. Covers cron tickers
        (e.g. /api/admin/pages/check-scheduled), webhook callbacks
        (e.g. /api/store/payments/gateway/callback), and API-token
        clients.
     4. Browser mutation requests (POST / PATCH / PUT / DELETE
        without an Authorization / shared-secret header):
          - Require at least one of Origin / Referer.
          - If Origin is present, MUST match the expected origin
            (scheme + host + port, exact prefix match).
          - If Referer is present, MUST match the expected origin.
          - If BOTH missing → REJECT (fail-closed).
          - If a header is present but malformed or cross-origin → REJECT.

   ------------------------------------------------------------
   WHY FAIL-CLOSED?
   ------------------------------------------------------------
   The previous permissive policy (return `true` whenever Origin
   was absent) made this layer a no-op for same-origin browser
   requests that omit the Origin header. That is unsafe because
   some browsers omit Origin on same-origin GET-style navigation,
   and certain attack vectors (e.g. `<form>` POSTs from another
   origin) do not always include a verifiable Origin. The W3C
   CSRF defense guidance is to require a verifiable Origin or
   Referer on every state-changing request.

   ------------------------------------------------------------
   EXPECTED ORIGIN SOURCE:
   ------------------------------------------------------------
     `process.env.NEXTAUTH_URL` (already used elsewhere).
     Falls back to `http://localhost:3000` in dev / test.

   ------------------------------------------------------------
   USAGE (in a route handler):
   ------------------------------------------------------------
     import { checkCsrf } from "@/lib/csrf";
     if (!checkCsrf(req)) {
       return NextResponse.json({ error: "CSRF" }, { status: 403 });
     }

   ============================================================ */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Request headers that identify a NON-browser client. Presence of
 * any of these on a mutation request exempts it from CSRF because
 * the client is authenticated by a shared secret rather than a
 * browser cookie — and CSRF can only be mounted against cookie-
 * authenticated browser sessions.
 *
 * NOTE: a CSRF attacker cannot forge these headers from a browser
 * on a cross-origin request. The browser forbids setting
 * `Authorization` on cross-origin fetch() without a CORS
 * preflight, and CORS preflight responses are gated by the
 * server's CORS policy (which only allows the application's own
 * origin). Form submissions cannot set these headers at all.
 */
const NON_BROWSER_AUTH_HEADERS = [
  "authorization", // Bearer token (API client)
  "x-cron-key", // Cron tickers (Vercel Cron, GitHub Actions)
  "x-webhook-signature", // Webhook endpoints (payment gateways, etc.)
  "x-api-key", // API token clients (internal services)
] as const;

function expectedOrigin(): string {
  // Strip trailing slash so prefix-match is unambiguous.
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function hasNonBrowserAuthHeader(req: Request): boolean {
  for (const h of NON_BROWSER_AUTH_HEADERS) {
    const v = req.headers.get(h);
    if (v !== null && v.length > 0) return true;
  }
  return false;
}

/**
 * Validate an Origin / Referer header value against the expected
 * origin. Returns `false` if the header is missing, malformed, or
 * does not match the expected origin's scheme + host + port.
 *
 * Accepts an exact match OR a path-suffixed match
 * (e.g. `https://heavix.com/login` matches expected `https://heavix.com`).
 */
function originMatches(header: string | null, expected: string): boolean {
  if (!header) return false;
  // Reject obviously malformed header values: anything that is not
  // a clean `http(s)://host[:port][/path]` URL.
  if (!/^https?:\/\/[^\s/@]+(:\d+)?(\/[^\s]*)?$/i.test(header)) return false;
  if (header === expected) return true;
  // Path-suffixed match: must be `expected + "/" + ...`.
  return header.startsWith(expected + "/");
}

/**
 * Fail-closed CSRF check.
 *
 * Safe methods (GET / HEAD / OPTIONS) always pass.
 * Mutation methods (POST / PATCH / PUT / DELETE) require a
 * verifiable Origin or Referer matching `process.env.NEXTAUTH_URL`,
 * UNLESS the request is a non-browser client (Authorization /
 * x-cron-key / x-webhook-signature / x-api-key header present).
 *
 * Returns `true` if the request passes the CSRF policy, `false`
 * if it must be rejected with HTTP 403.
 */
export function checkCsrf(req: Request): boolean {
  const method = (req.method || "GET").toUpperCase();

  // 1. Safe methods are exempt — they do not mutate state.
  if (SAFE_METHODS.has(method)) return true;

  // 2. Non-browser clients (bearer / shared-secret) are exempt.
  if (hasNonBrowserAuthHeader(req)) return true;

  // 3. Browser mutation request → require a verifiable Origin/Referer.
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const expected = expectedOrigin();

  // Fail-closed: require at least one of Origin / Referer.
  if (!origin && !referer) return false;

  // Any present header MUST match the expected origin.
  if (origin && !originMatches(origin, expected)) return false;
  if (referer && !originMatches(referer, expected)) return false;

  return true;
}

/* ============================================================
   NOTE ON CONSOLIDATION (F-005 fix):
   ------------------------------------------------------------
   The previous `checkCsrfStrict` function was dead code — defined
   but never imported or called anywhere. It has been REMOVED in
   favor of a single, fail-closed `checkCsrf` that subsumes its
   semantics. The old permissive-vs-strict split is no longer
   needed because the consolidated `checkCsrf` is already strict
   for mutation methods (the original `checkCsrfStrict` behavior)
   while remaining lenient for safe methods (GET/HEAD/OPTIONS).

   Downstream code that previously imported `checkCsrfStrict`
   (none did, per F-005 audit) is unaffected.
   ============================================================ */
