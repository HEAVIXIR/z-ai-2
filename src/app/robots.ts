import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { IS_PREVIEW_DEPLOYMENT, SITE_BASE_URL } from "@/lib/site-config";

/* ============================================================
   HEAVIX — robots.ts (P2-28)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md P2-28
   ------------------------------------------------------------
   Next.js metadata-route robots.txt.
   Allow public pages. Private UI routes publish noindex metadata;
   only API endpoints are disallowed at crawl level.

   STEP 13.00: SITE_BASE_URL is now imported from @/lib/site-config
   (single source of truth). The previous local fallback to
   "https://havix.ir" is removed.
   ============================================================ */

export const revalidate = 3600; // 1 hour
export const runtime = "nodejs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private UI routes emit noindex metadata; crawlers must be able to
        // fetch those pages to observe it. API endpoints remain disallowed.
        disallow: ["/api/"],
      },
    ],
    ...(IS_PREVIEW_DEPLOYMENT ? {} : { sitemap: absoluteUrl("/sitemap.xml") }),
    host: SITE_BASE_URL,
  };
}
