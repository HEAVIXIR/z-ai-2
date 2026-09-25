import { NextResponse, type NextRequest } from "next/server";

/* ============================================================
   HEAVIX Edge Middleware — Admin Auth Boundary (Track E)
   ------------------------------------------------------------
   Purpose:
     Reject unauthenticated requests to `/admin/*` (pages) and
     `/api/admin/*` (API) BEFORE they reach the route handlers.
     This is a defense-in-depth edge boundary; the existing
     `src/app/admin/layout.tsx` (server-side `getCurrentUser()`
     check) and per-route handlers continue to enforce the real,
     DB-backed authorization via `src/lib/auth.ts`.

   Behavior:
     • `/admin/*` page routes without the admin cookie → 302 → /login
     • `/api/admin/*` API routes without the admin cookie → 401 JSON
     • Everything else (incl. the public routes listed below) → pass-through

   Cookie:
     The token is issued by `createSession()` in `src/lib/auth.ts` and
     stored under the `heavix-admin` cookie name (exported as
     `ADMIN_COOKIE` from that module). We intentionally DO NOT import
     `src/lib/auth.ts` here because it transitively imports
     `next/headers`, `node:crypto`, and the Prisma client — none of
     which are available in the Edge runtime that middleware runs in
     by default. Instead, the cookie name is duplicated below with a
     single source-of-truth comment.

   Notes / Out of scope (per Track E spec):
     • No rate-limiting (handled per-route via `src/lib/rate-limit.ts`).
     • No CSRF token check in middleware.
     • No DB-backed session validation at the edge — middleware only
       checks for cookie *presence*. The actual session hash lookup
       happens server-side in `isAuthenticated()` /
       `getCurrentUser()`. A cookie that is present but invalid will
       still be rejected by those layers (and will land on /login via
       the admin layout's `redirect("/login")`).
   ============================================================ */

// MUST match `ADMIN_COOKIE` in `src/lib/auth.ts` (line 24).
const ADMIN_COOKIE_NAME = "heavix-admin";

/** Page routes that require admin authentication. */
const ADMIN_PAGE_PREFIX = "/admin";
/** API routes that require admin authentication. */
const ADMIN_API_PREFIX = "/api/admin";

/**
 * Public routes that must NEVER be intercepted by middleware, even if
 * a future matcher accidentally expands. These are listed here for
 * documentation; the `matcher` config below already restricts
 * middleware to admin paths only, so these routes never enter this
 * function in practice.
 */
const PUBLIC_ROUTES = [
  "/",
  "/store",
  "/listings",
  "/api/store",
  "/api/listings",
  "/api/products",
  "/api/health",
  "/api/auth",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only admin paths ever reach here (see `matcher` below), but guard
  // defensively so future changes can't accidentally lock out public
  // routes.
  const isAdminPage = pathname === ADMIN_PAGE_PREFIX || pathname.startsWith(`${ADMIN_PAGE_PREFIX}/`);
  const isAdminApi = pathname.startsWith(`${ADMIN_API_PREFIX}/`);

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  // Presence-only cookie check. The cryptographic hash verification
  // against the `AdminSession` table happens server-side in
  // `src/lib/auth.ts` — see `isAuthenticated()`.
  const adminCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

  if (adminCookie && adminCookie.length > 0) {
    // Cookie present — let the request proceed. The server-side admin
    // layout / route handlers will validate the session hash against
    // the DB and reject if it is expired or revoked.
    return NextResponse.next();
  }

  // No admin cookie → block.
  if (isAdminApi) {
    // API: return 401 JSON (no redirect — API clients expect JSON).
    return NextResponse.json(
      { error: "Unauthorized", message: "Admin authentication required." },
      { status: 401 },
    );
  }

  // Page: redirect to /login, preserving the original destination.
  const loginUrl = req.nextUrl.clone();
  const redirectTo = pathname + (req.nextUrl.search ?? "");
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  // Stash the original URL so /login can bounce back after auth.
  loginUrl.searchParams.set("redirect", redirectTo);
  return NextResponse.redirect(loginUrl, 307);
}

/**
 * Matcher — only run middleware on admin paths. This keeps
 * middleware cheap (Edge) and guarantees that the PUBLIC_ROUTES
 * listed above (and every other public path) is never intercepted.
 *
 * - `/admin/:path*`        → admin pages
 * - `/api/admin/:path*`    → admin API routes
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

// Silence "unused" warnings for the documentation-only PUBLIC_ROUTES
// export (it's intentionally exported for future tooling/tests).
void PUBLIC_ROUTES;
