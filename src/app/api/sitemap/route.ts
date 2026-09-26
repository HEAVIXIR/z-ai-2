import { generateSitemap } from "@/lib/seo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/sitemap — Wave 3B explicit sitemap.xml endpoint
   ------------------------------------------------------------
   Returns the sitemap document as `application/xml`.

   NOTE: the canonical Next.js metadata-route sitemap lives at
   src/app/sitemap.ts and is served at /sitemap.xml. This API
   route is the Wave 3B "explicit" endpoint — useful for cron,
   health-checks, and external consumers that want to fetch the
   sitemap via the API namespace.
   ============================================================ */

export async function GET() {
  try {
    const xml = await generateSitemap();
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err: any) {
    console.error("[api/sitemap] generation failed:", err?.message ?? err);
    const fallback =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
    return new Response(fallback, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
