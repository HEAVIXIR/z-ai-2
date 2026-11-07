import { NextResponse, type NextRequest } from "next/server";

const USER_COOKIE_NAME = "heavix-user";
const ADMIN_PAGE_PREFIX = "/admin";
const ADMIN_API_PREFIX = "/api/admin";
const PUBLIC_UPLOADS_PREFIX = "/uploads/";

function isPrivateMediaSidecar(pathname: string): boolean {
  let normalized = pathname.toLowerCase();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Malformed encoded paths under uploads fail closed below.
    return normalized.startsWith(PUBLIC_UPLOADS_PREFIX);
  }
  return normalized.startsWith(PUBLIC_UPLOADS_PREFIX) &&
    normalized.endsWith(".meta.json");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sidecar metadata is an internal implementation detail, not a public
  // asset. Middleware must intercept it before Next serves files from /public.
  if (isPrivateMediaSidecar(pathname)) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const isAdminPage = pathname === ADMIN_PAGE_PREFIX || pathname.startsWith(`${ADMIN_PAGE_PREFIX}/`);
  const isAdminApi = pathname.startsWith(`${ADMIN_API_PREFIX}/`);

  if (!isAdminPage && !isAdminApi) return NextResponse.next();
  if (pathname.endsWith("/health")) return NextResponse.next();

  const userCookie = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (userCookie && userCookie.length > 0) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json(
      { error: "Unauthorized", message: "User authentication required." },
      { status: 401 },
    );
  }

  const loginUrl = req.nextUrl.clone();
  const redirectTo = pathname + (req.nextUrl.search ?? "");
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("redirect", redirectTo);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/uploads/:path*"],
};
