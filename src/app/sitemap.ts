import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";
import { IS_PREVIEW_DEPLOYMENT, SITE_BASE_URL } from "@/lib/site-config";

/* ============================================================
   HEAVIX — sitemap.ts (P2-28)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md P2-28
   ------------------------------------------------------------
   Next.js metadata-route sitemap. Public, cached 1 hour via
   `revalidate = 3600`. Includes:
     • static public pages (including the /knowledge index)
     • active categories and brands
     • published listings and canonical /articles pages
     • active companies and brand-scoped models with published inventory
   Excludes preview deployments and honors per-entity SEOMetadata.

   STEP 13.00: SITE_BASE_URL is now imported from @/lib/site-config
   (single source of truth). The previous local fallback to
   "https://havix.ir" is removed.
   ============================================================ */

export const revalidate = 3600; // 1 hour
export const runtime = "nodejs";

const STATIC_PATHS: { url: string; priority: number; changeFreq: string }[] = [
  { url: "/", priority: 1.0, changeFreq: "daily" },
  { url: "/listings", priority: 0.9, changeFreq: "daily" },
  { url: "/brands", priority: 0.8, changeFreq: "weekly" },
  { url: "/store", priority: 0.7, changeFreq: "weekly" },
  { url: "/knowledge", priority: 0.6, changeFreq: "weekly" },
  { url: "/categories", priority: 0.6, changeFreq: "weekly" },
];

type SitemapRow = {
  entityType: string;
  entityId: string;
  sitemapPriority: number | null;
  sitemapChangeFreq: string | null;
  robotsIndex: boolean | null;
};

async function getSEOOverridesByType(
  entityType: string,
  entityIds: string[],
): Promise<Map<string, SitemapRow>> {
  const out = new Map<string, SitemapRow>();
  if (entityIds.length === 0) return out;
  try {
    const rows = await db.sEOMetadata.findMany({
      where: { entityType, entityId: { in: entityIds } },
      select: {
        entityId: true,
        sitemapPriority: true,
        sitemapChangeFreq: true,
        robotsIndex: true,
      },
    });
    for (const r of rows) {
      out.set(r.entityId, {
        entityType,
        entityId: r.entityId,
        sitemapPriority: r.sitemapPriority,
        sitemapChangeFreq: r.sitemapChangeFreq,
        robotsIndex: r.robotsIndex,
      });
    }
  } catch {
    console.error(`[sitemap] SEO override lookup failed for ${entityType}; using defaults`);
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (IS_PREVIEW_DEPLOYMENT) return [];

  const base = SITE_BASE_URL;

  // Fetch only public, index-worthy entities in parallel.
  const [categories, brands, listings, articles, companies, modelRows] = await Promise.all([
    db.category
      .findMany({
        where: { active: true },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => {
        console.error("[sitemap] category lookup failed; category URLs omitted");
        return [];
      }),
    db.brand
      .findMany({
        where: { active: true },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => {
        console.error("[sitemap] brand lookup failed; brand URLs omitted");
        return [];
      }),
    db.listing
      .findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => {
        console.error("[sitemap] listing lookup failed; listing URLs omitted");
        return [];
      }),
    db.article
      .findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, slug: true, updatedAt: true, publishedAt: true },
      })
      .catch(() => {
        console.error("[sitemap] article lookup failed; article URLs omitted");
        return [];
      }),
    db.company
      .findMany({
        where: { status: "ACTIVE", listings: { some: { status: "PUBLISHED" } } },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => {
        console.error("[sitemap] company lookup failed; company URLs omitted");
        return [];
      }),
    db.productModel
      .findMany({
        where: { status: "ACTIVE", listings: { some: { status: "PUBLISHED" } } },
        select: {
          id: true,
          slug: true,
          updatedAt: true,
          brand: { select: { slug: true, active: true } },
        },
      })
      .catch(() => {
        console.error("[sitemap] model lookup failed; model URLs omitted");
        return [];
      }),
  ]);
  const models = modelRows.filter((m) => m.brand?.active && m.brand.slug);

  // Fetch SEO overrides in parallel.
  const [catSEO, brandSEO, listingSEO, articleSEO, companySEO, modelSEO] = await Promise.all([
    getSEOOverridesByType("Category", categories.map((c) => c.id)),
    getSEOOverridesByType("Brand", brands.map((b) => b.id)),
    getSEOOverridesByType("Listing", listings.map((l) => l.id)),
    getSEOOverridesByType("Article", articles.map((a) => a.id)),
    getSEOOverridesByType("Company", companies.map((c) => c.id)),
    getSEOOverridesByType("ProductModel", models.map((m) => m.id)),
  ]);

  const out: MetadataRoute.Sitemap = [];

  // Static pages
  for (const p of STATIC_PATHS) {
    out.push({
      url: absoluteUrl(p.url),
      changeFrequency: p.changeFreq as any,
      priority: p.priority,
    });
  }

  // Categories
  for (const c of categories) {
    const seo = catSEO.get(c.id);
    if (seo?.robotsIndex === false) continue; // honor robots noindex
    out.push({
      url: `${base}/categories/${c.slug}`,
      lastModified: c.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "weekly") as any,
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Brands
  for (const b of brands) {
    const seo = brandSEO.get(b.id);
    if (seo?.robotsIndex === false) continue;
    out.push({
      url: `${base}/brands/${b.slug}`,
      lastModified: b.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "weekly") as any,
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Companies with published inventory
  for (const company of companies) {
    const seo = companySEO.get(company.id);
    if (seo?.robotsIndex === false) continue;
    out.push({
      url: `${base}/companies/${encodeURIComponent(company.slug)}`,
      lastModified: company.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "weekly") as any,
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Brand-scoped model URLs avoid cross-brand slug collisions.
  for (const model of models) {
    const seo = modelSEO.get(model.id);
    if (seo?.robotsIndex === false || !model.brand?.slug) continue;
    out.push({
      url: `${base}/brands/${encodeURIComponent(model.brand.slug)}/models/${encodeURIComponent(model.slug)}`,
      lastModified: model.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "weekly") as any,
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Listings
  for (const l of listings) {
    const seo = listingSEO.get(l.id);
    if (seo?.robotsIndex === false) continue;
    out.push({
      url: `${base}/listings/${l.slug}`,
      lastModified: l.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "weekly") as any,
      priority: seo?.sitemapPriority ?? 0.7,
    });
  }

  // Articles
  for (const a of articles) {
    const seo = articleSEO.get(a.id);
    if (seo?.robotsIndex === false) continue;
    out.push({
      url: `${base}/articles/${encodeURIComponent(a.slug)}`,
      lastModified: a.publishedAt ?? a.updatedAt ?? new Date(),
      changeFrequency: (seo?.sitemapChangeFreq ?? "monthly") as any,
      priority: seo?.sitemapPriority ?? 0.5,
    });
  }

  return out;
}
