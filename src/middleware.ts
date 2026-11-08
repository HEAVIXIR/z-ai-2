import { NextResponse, type NextRequest } from "next/server";
import { isPreviewDeployment } from "@/lib/site-config";

const USER_COOKIE_NAME = "heavix-user";
const ADMIN_PAGE_PREFIX = "/admin";
const ADMIN_API_PREFIX = "/api/admin";

function withPreviewRobotsHeader(response: NextResponse, isPreview: boolean) {
  if (isPreview) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPreview = isPreviewDeployment(req.nextUrl.hostname);
  const isAdminPage = pathname === ADMIN_PAGE_PREFIX || pathname.startsWith(`${ADMIN_PAGE_PREFIX}/`);
  const isAdminApi = pathname.startsWith(`${ADMIN_API_PREFIX}/`);

  // Prevent crawler discovery and production-canonical sitemap leakage on
  // public Preview hosts even when Worker bindings are not exposed to process.env.
  if (isPreview && pathname === "/robots.txt") {
    return withPreviewRobotsHeader(
      new NextResponse("User-agent: *\\nDisallow: /\\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
      true,
    );
  }
  if (isPreview && pathname === "/sitemap.xml") {
    return withPreviewRobotsHeader(new NextResponse(null, { status: 404 }), true);
  }

  // Apply the noindex header to every Preview response at request time.
  if (!isAdminPage && !isAdminApi) {
    return withPreviewRobotsHeader(NextResponse.next(), isPreview);
  }
  if (pathname.endsWith("/health")) {
    return withPreviewRobotsHeader(NextResponse.next(), isPreview);
  }

  const userCookie = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (userCookie && userCookie.length > 0) {
    return withPreviewRobotsHeader(NextResponse.next(), isPreview);
  }

  if (isAdminApi) {
    return withPreviewRobotsHeader(
      NextResponse.json(
        { error: "Unauthorized", message: "User authentication required." },
        { status: 401 },
      ),
      isPreview,
    );
  }

  const loginUrl = req.nextUrl.clone();
  const redirectTo = pathname + (req.nextUrl.search ?? "");
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("redirect", redirectTo);
  return withPreviewRobotsHeader(NextResponse.redirect(loginUrl, 307), isPreview);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
