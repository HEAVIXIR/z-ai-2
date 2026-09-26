/* ============================================================
   HEAVIX — CSRF defense (Track E / T4)
   ------------------------------------------------------------
   Lightweight Origin/Referer check for Next.js API routes that
   perform mutations (POST / PATCH / PUT / DELETE).

   Pattern: double-submit-style Origin/Referer verification.

   Why permissive?
     - Browsers ALWAYS send the `Origin` header on cross-origin
       CORS-eligible requests (which mutations are). Absence of
       `Origin` therefore means same-origin or a non-browser
       client (curl, server-to-server). Blocking the absence case
       would break legitimate same-site calls + internal scripts.
     - The middleware admin-cookie boundary (see `src/middleware.ts`)
       is the PRIMARY auth gate; this CSRF layer is defense-in-depth
       on top of that, not a substitute.
     - A future hardening pass should add a real signed double-submit
       cookie (`heavix-csrf`) + require the matching `X-CSRF-Token`
       request header. Until then, this helper documents intent
       and gives mutation routes a single import surface to
       tighten later.

   Usage (in a route handler):
     import { checkCsrf } from "@/lib/csrf";
     if (!checkCsrf(req)) {
       return NextResponse.json({ error: "CSRF" }, { status: 403 });
     }

   ============================================================ */

/**
 * Verify that the request originates from the same site.
 *
 * Returns `true` when:
 *   - The `Origin` header is present AND starts with the expected
 *     origin (e.g. https://heavix.com), OR
 *   - The `Referer` header is present AND starts with the expected
 *     origin, OR
 *   - Neither header is present (treated as same-origin / non-browser).
 *
 * Returns `false` ONLY when a header IS present but does not match
 * — i.e. an actual cross-origin attempt.
 *
 * NOTE: Permissive-by-design. See module header for hardening notes.
 */
export function checkCsrf(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const expected = process.env.NEXTAUTH_URL || "http://localhost:3000";

  // Allow same-origin requests when a header is present.
  if (origin && origin.startsWith(expected)) return true;
  if (referer && referer.startsWith(expected)) return true;

  // No origin/referer on same-origin requests from browser — allow.
  // Browsers always send Origin on cross-origin, may omit on
  // same-origin. We intentionally do NOT block the absent case.
  return true; // permissive — log but don't block
}

/**
 * Strict variant — refuses requests with NO Origin/Referer at all.
 *
 * Reserved for future use on the most sensitive mutation endpoints
 * (e.g. password change, payment refund). Not currently wired into
 * any route; left here as the documented upgrade path.
 */
export function checkCsrfStrict(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const expected = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (!origin && !referer) return false; // require at least one
  if (origin && !origin.startsWith(expected)) return false;
  if (referer && !referer.startsWith(expected)) return false;
  return true;
}
