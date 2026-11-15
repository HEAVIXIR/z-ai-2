import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { IS_PREVIEW_DEPLOYMENT, SITE_BASE_URL } from "@/lib/site-config";

/**
 * Public pages remain crawlable in Preview so search engines can observe
 * the page-level noindex directive. Preview intentionally omits the sitemap;
 * Production publishes the canonical sitemap and host.
 */
export const revalidate = 3600;
export const runtime = "nodejs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private application routes are never crawlable.
        disallow: ["/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register"],
      },
    ],
    ...(!IS_PREVIEW_DEPLOYMENT
      ? {
          sitemap: absoluteUrl("/sitemap.xml"),
          host: SITE_BASE_URL,
        }
      : {}),
  };
}
