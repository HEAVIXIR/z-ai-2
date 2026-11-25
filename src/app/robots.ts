import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { IS_PREVIEW_DEPLOYMENT, SITE_BASE_URL } from "@/lib/site-config";

/**
 * Public pages remain crawlable. Private UI routes publish page-level
 * noindex metadata, so crawlers must be allowed to fetch them and observe
 * that directive. Only API endpoints are disallowed at crawl level.
 * Preview intentionally omits the sitemap.
 */
export const revalidate = 3600;
export const runtime = "nodejs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
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
