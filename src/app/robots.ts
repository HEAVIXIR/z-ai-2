import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { IS_PREVIEW_DEPLOYMENT, isPreviewDeployment } from "@/lib/site-config";

/**
 * Preview remains crawlable so crawlers can observe the request-time
 * X-Robots-Tag noindex header, but must not advertise production URLs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function buildRobots(hostname?: string): MetadataRoute.Robots {
  const preview = IS_PREVIEW_DEPLOYMENT || isPreviewDeployment(hostname);
  const rules: MetadataRoute.Robots["rules"] = [
    {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register"],
    },
  ];

  if (preview) return { rules };

  return {
    rules,
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl(""),
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
