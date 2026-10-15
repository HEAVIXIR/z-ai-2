import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { SITE_BASE_URL } from "@/lib/site-config";

/* ============================================================
   HEAVIX — robots.ts (P2-28)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md P2-28
   ------------------------------------------------------------
   Next.js metadata-route robots.txt.
   Allow all, point to the sitemap.

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
        // Disallow admin + API + auth routes — they're not for indexing.
        disallow: ["/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_BASE_URL,
  };
}
