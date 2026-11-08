import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { isPreviewDeployment } from "@/lib/site-config";

/* ============================================================
   HEAVIX — robots.ts
   ------------------------------------------------------------
   Preview deployments remain crawlable so crawlers can observe the
   X-Robots-Tag: noindex response header applied by middleware. They
   intentionally do not advertise the production sitemap or host.
   ============================================================ */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pure policy builder, exported so host-based Preview behavior is testable. */
export function buildRobots(hostname?: string): MetadataRoute.Robots {
  const preview = isPreviewDeployment(hostname);
  const rules: MetadataRoute.Robots["rules"] = [
    {
      userAgent: "*",
      allow: "/",
      // Disallow admin + API + auth routes — they're not for indexing.
      disallow: ["/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register"],
    },
  ];

  if (preview) {
    // Do not block crawling: the runtime X-Robots-Tag must be discoverable.
    return { rules };
  }

  return {
    rules,
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl(""),
  };
}

export default function robots(): MetadataRoute.Robots {
  // Cloudflare supplies HEAVIX_ENV=preview and Vercel supplies VERCEL_ENV.
  // The middleware also uses the request hostname as a defensive fallback.
  return buildRobots();
}
