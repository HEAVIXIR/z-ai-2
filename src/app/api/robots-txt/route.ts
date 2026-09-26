import { getRobotsTxt } from "@/lib/seo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/robots-txt — Wave 3B explicit robots.txt endpoint
   ------------------------------------------------------------
   Returns the robots.txt body as `text/plain`.

   NOTE: the canonical Next.js metadata-route robots lives at
   src/app/robots.ts and is served at /robots.txt. This API
   route is the Wave 3B "explicit" endpoint — useful for cron,
   health-checks, and external consumers that want to fetch the
   robots policy via the API namespace.
   ============================================================ */

export async function GET() {
  try {
    const body = getRobotsTxt();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err: any) {
    console.error("[api/robots-txt] generation failed:", err?.message ?? err);
    // Minimal fallback
    const fallback = "User-agent: *\nAllow: /\n";
    return new Response(fallback, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
