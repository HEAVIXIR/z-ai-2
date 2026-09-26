/* ============================================================
   HEAVIX — Wave 3B · SEO Control Plane (Service Layer)
   ------------------------------------------------------------
   Higher-level service over the existing src/lib/seo.ts helpers.

   Per task:
     • updateSEO(...) — single-call upsert + audit 'seo.update'
     • getSEO(...)    — fetch SEO metadata for an entity
     • generateSitemap() — returns sitemap.xml content as a string
     • getRobotsTxt()    — returns robots.txt content as a string

   All mutations emit audit log entries via `logAudit`.

   The existing /api/admin/seo route (Wave C1 / P2-28) keeps its
   PUT handler for backward compat with the existing admin client,
   and the new Wave 3B route also accepts POST. Both call updateSEO.
   ============================================================ */

import { db } from "@/lib/db";
import type { SEOMetadata } from "@prisma/client";
import {
  getSEO as fetchSEO,
  upsertSEO,
  absoluteUrl,
  SEO_ENTITY_TYPES,
} from "@/lib/seo";
import { logAudit } from "@/lib/audit";

const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://havix.ir";

const SITE_NAME = "هویکس";

const STATIC_PATHS: { url: string; priority: number; changeFreq: string }[] = [
  { url: "/", priority: 1.0, changeFreq: "daily" },
  { url: "/listings", priority: 0.9, changeFreq: "daily" },
  { url: "/brands", priority: 0.8, changeFreq: "weekly" },
  { url: "/store", priority: 0.7, changeFreq: "weekly" },
  { url: "/knowledge", priority: 0.6, changeFreq: "weekly" },
  { url: "/categories", priority: 0.6, changeFreq: "weekly" },
];

/* ── updateSEO ─────────────────────────────────────────────── */

export interface UpdateSEOInput {
  entityType: string;
  entityId: string;
  /** meta title (≤60 chars recommended) */
  title?: string;
  /** meta description (≤160 chars recommended) */
  description?: string;
  /** keywords (comma-separated) */
  keywords?: string;
  /** canonical URL */
  canonical?: string;
  /** robots directive string: "index,follow" | "noindex,nofollow" | "index,nofollow" | … */
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  /** JSON-LD string */
  structuredData?: string;
  sitemapPriority?: number;
  sitemapChangeFreq?: string;
  /** User performing the update (for audit). */
  actorId?: string | null;
}

function parseRobots(
  robots: string | undefined,
): { robotsIndex: boolean; robotsFollow: boolean } {
  if (!robots) return { robotsIndex: true, robotsFollow: true };
  const lower = String(robots).toLowerCase();
  return {
    robotsIndex: !/noindex/i.test(lower),
    robotsFollow: !/nofollow/i.test(lower),
  };
}

export async function updateSEO(
  input: UpdateSEOInput,
): Promise<SEOMetadata> {
  if (!input.entityType || !input.entityId) {
    throw new Error("entityType و entityId الزامی هستند.");
  }
  if (!(SEO_ENTITY_TYPES as readonly string[]).includes(input.entityType)) {
    throw new Error("entityType نامعتبر است.");
  }

  const { robotsIndex, robotsFollow } = parseRobots(input.robots);

  // Map Wave 3B task field names → schema field names.
  const patch: Partial<
    Omit<
      SEOMetadata,
      "id" | "entityType" | "entityId" | "createdAt" | "updatedAt"
    >
  > = {};
  if (input.title !== undefined) patch.metaTitle = input.title;
  if (input.description !== undefined) patch.metaDescription = input.description;
  if (input.keywords !== undefined) patch.keywords = input.keywords;
  if (input.canonical !== undefined) patch.canonicalUrl = input.canonical;
  if (input.ogTitle !== undefined) patch.ogTitle = input.ogTitle;
  if (input.ogDescription !== undefined) patch.ogDescription = input.ogDescription;
  if (input.ogImage !== undefined) patch.ogImage = input.ogImage;
  if (input.structuredData !== undefined) patch.structuredData = input.structuredData;
  if (input.sitemapPriority !== undefined) patch.sitemapPriority = input.sitemapPriority;
  if (input.sitemapChangeFreq !== undefined) patch.sitemapChangeFreq = input.sitemapChangeFreq;
  patch.robotsIndex = robotsIndex;
  patch.robotsFollow = robotsFollow;

  const seo = await upsertSEO(input.entityType, input.entityId, patch);

  await logAudit({
    actorId: input.actorId ?? null,
    actorType: "ADMIN",
    action: "seo.update",
    entityType: "SEOMetadata",
    entityId: seo.id,
    after: {
      entityType: input.entityType,
      entityId: input.entityId,
      ...patch,
    },
    reason: `به‌روزرسانی SEO برای ${input.entityType} #${input.entityId}`,
  });

  return seo;
}

/* ── getSEO (re-export shape) ──────────────────────────────── */

export async function getSEO(
  entityType: string,
  entityId: string,
): Promise<SEOMetadata | null> {
  return fetchSEO(entityType, entityId);
}

export interface ListSEOInput {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

/**
 * List SEO metadata rows with optional filters.
 * Mirrors the Wave 3B admin GET contract.
 */
export async function listSEO(
  input: ListSEOInput = {},
): Promise<SEOMetadata[]> {
  const limit = Math.max(1, Math.min(500, input.limit ?? 200));
  const where: { entityType?: string; entityId?: string } = {};
  if (input.entityType) where.entityType = input.entityType;
  if (input.entityId) where.entityId = input.entityId;
  try {
    return await db.sEOMetadata.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}

/* ── generateSitemap ───────────────────────────────────────── */

type SitemapUrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the complete sitemap.xml document as a string.
 *
 * Queries:
 *   • static paths (/, /listings, /brands, /store, /knowledge, /categories)
 *   • all active categories  (slug)
 *   • all active brands      (slug)
 *   • all PUBLISHED listings (slug)
 *   • all published articles (slug)
 * • honors per-entity SEO overrides (robotsIndex / sitemapPriority /
 *   sitemapChangeFreq) — entities with robotsIndex=false are omitted.
 */
export async function generateSitemap(): Promise<string> {
  const entries: SitemapUrlEntry[] = [];

  // Static pages
  for (const p of STATIC_PATHS) {
    entries.push({
      loc: absoluteUrl(p.url),
      lastmod: new Date().toISOString(),
      changefreq: p.changeFreq,
      priority: p.priority,
    });
  }

  // Fetch public entities in parallel — fail open (skip on error)
  const [categories, brands, listings, articles] = await Promise.all([
    db.category
      .findMany({
        where: { active: true },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => []),
    db.brand
      .findMany({
        where: { active: true },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => []),
    db.listing
      .findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, slug: true, updatedAt: true },
      })
      .catch(() => []),
    db.article
      .findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, slug: true, updatedAt: true, publishedAt: true },
      })
      .catch(() => []),
  ]);

  // Fetch SEO overrides in parallel
  const [catSEO, brandSEO, listingSEO, articleSEO] = await Promise.all([
    fetchSeoMap("Category", categories.map((c) => c.id)),
    fetchSeoMap("Brand", brands.map((b) => b.id)),
    fetchSeoMap("Listing", listings.map((l) => l.id)),
    fetchSeoMap("Article", articles.map((a) => a.id)),
  ]);

  // Categories
  for (const c of categories) {
    if (!c.slug) continue;
    const seo = catSEO.get(c.id);
    if (seo?.robotsIndex === false) continue;
    entries.push({
      loc: `${SITE_BASE_URL}/categories/${c.slug}`,
      lastmod: (c.updatedAt ?? new Date()).toISOString(),
      changefreq: seo?.sitemapChangeFreq ?? "weekly",
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Brands
  for (const b of brands) {
    if (!b.slug) continue;
    const seo = brandSEO.get(b.id);
    if (seo?.robotsIndex === false) continue;
    entries.push({
      loc: `${SITE_BASE_URL}/brands/${b.slug}`,
      lastmod: (b.updatedAt ?? new Date()).toISOString(),
      changefreq: seo?.sitemapChangeFreq ?? "weekly",
      priority: seo?.sitemapPriority ?? 0.6,
    });
  }

  // Listings
  for (const l of listings) {
    if (!l.slug) continue;
    const seo = listingSEO.get(l.id);
    if (seo?.robotsIndex === false) continue;
    entries.push({
      loc: `${SITE_BASE_URL}/listings/${l.slug}`,
      lastmod: (l.updatedAt ?? new Date()).toISOString(),
      changefreq: seo?.sitemapChangeFreq ?? "weekly",
      priority: seo?.sitemapPriority ?? 0.7,
    });
  }

  // Articles (knowledge base)
  for (const a of articles) {
    if (!a.slug) continue;
    const seo = articleSEO.get(a.id);
    if (seo?.robotsIndex === false) continue;
    entries.push({
      loc: `${SITE_BASE_URL}/knowledge/${a.slug}`,
      lastmod: (a.publishedAt ?? a.updatedAt ?? new Date()).toISOString(),
      changefreq: seo?.sitemapChangeFreq ?? "monthly",
      priority: seo?.sitemapPriority ?? 0.5,
    });
  }

  // Build XML
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${xmlEscape(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${xmlEscape(e.changefreq)}</changefreq>`);
      if (typeof e.priority === "number") {
        parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/* ── getRobotsTxt ──────────────────────────────────────────── */

/**
 * Build the robots.txt content. Mirrors src/app/robots.ts but
 * returns the plain-text body so any HTTP route (the Wave 3B
 * /api/robots-txt or any other future consumer) can serve it.
 */
export function getRobotsTxt(): string {
  const sitemapUrl = absoluteUrl("/sitemap.xml");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /dashboard/",
    "Disallow: /seller/",
    "Disallow: /login",
    "Disallow: /register",
    "",
    `Host: ${SITE_BASE_URL}`,
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");
}

/* ── helpers ──────────────────────────────────────────────── */

type SeoMapEntry = {
  sitemapPriority: number | null;
  sitemapChangeFreq: string | null;
  robotsIndex: boolean | null;
};

async function fetchSeoMap(
  entityType: string,
  entityIds: string[],
): Promise<Map<string, SeoMapEntry>> {
  const out = new Map<string, SeoMapEntry>();
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
        sitemapPriority: r.sitemapPriority,
        sitemapChangeFreq: r.sitemapChangeFreq,
        robotsIndex: r.robotsIndex,
      });
    }
  } catch {
    /* ignore — fall back to defaults */
  }
  return out;
}

export { SITE_BASE_URL, SITE_NAME, SEO_ENTITY_TYPES };
