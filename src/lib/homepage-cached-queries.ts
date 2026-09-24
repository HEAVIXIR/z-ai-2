/**
 * HEAVIX — STEP 15-B.5.4-C.3: Cached Homepage Queries
 *
 * Per-query unstable_cache wrappers for T1 (TTL=3600s) and T2 (TTL=300s) data.
 * T3 listing queries (Q5/Q6/Q7) are NOT cached — they remain server-rendered
 * fresh on every request per Cache Contract (15-B.5.4-B).
 *
 * Semantic equivalence: each cached function performs the EXACT same Prisma query
 * as the inline code it replaces — same predicate, same ordering, same select/include.
 * The only difference: the result is cached with TTL + tag-based invalidation.
 *
 * force-dynamic on the page is RETAINED — unstable_cache works at the data level,
 * independent of the page's dynamic setting. T3 freshness is preserved.
 */

import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';

// ═══════════════════════════════════════════════════════════════
// T1 QUERIES (TTL=3600s, nearly-constant data)
// ═══════════════════════════════════════════════════════════════

// Q3: homeCategoryConfig.findUnique({ where: { id: "main" } })
export const getCachedHomeCategoryConfig = unstable_cache(
  async () => {
    return db.homeCategoryConfig.findUnique({ where: { id: 'main' } });
  },
  ['homeCategoryConfig', 'main'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.catConfig] },
);

// Q4: siteSettings.findUnique({ where: { id: "main" } })
export const getCachedSiteSettings = unstable_cache(
  async () => {
    return db.siteSettings.findUnique({ where: { id: 'main' } });
  },
  ['siteSettings', 'main'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.settings] },
);

// Q14: article.findMany({ where: { status: "PUBLISHED" }, orderBy: publishedAt DESC NULLS LAST, take: 4, select: ... })
export const getCachedArticles = unstable_cache(
  async () => {
    return db.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      take: 4,
      select: { id: true, slug: true, title: true, excerpt: true, category: true, coverImage: true, viewCount: true },
    });
  },
  ['article', 'published', '4'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.articles] },
);

// Q15: hotSearch.findMany({ where: { active: true }, orderBy: sortOrder ASC, take: 9 })
export const getCachedHotSearches = unstable_cache(
  async () => {
    return db.hotSearch.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      take: 9,
    });
  },
  ['hotSearch', 'active', '9'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.hotSearches] },
);

// Q16: homePageSection.findMany({ where: { active: true }, orderBy: order ASC })
export const getCachedHomePageSections = unstable_cache(
  async () => {
    return db.homePageSection.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
  },
  ['homePageSection', 'active'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.sections] },
);

// Q17: heroConfig.findUnique({ where: { id: "main" } })
export const getCachedHeroConfig = unstable_cache(
  async () => {
    return db.heroConfig.findUnique({ where: { id: 'main' } });
  },
  ['heroConfig', 'main'],
  { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.hero] },
);

// ═══════════════════════════════════════════════════════════════
// T2 QUERIES (TTL=300s, semi-dynamic data)
// ═══════════════════════════════════════════════════════════════

// Q1: brand.findMany({ where: { active: true }, orderBy: [featured DESC, sortOrder ASC, name ASC], include: _count.listings, take: 20 })
export const getCachedTopBrands = unstable_cache(
  async () => {
    return db.brand.findMany({
      where: { active: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { listings: { where: { status: 'PUBLISHED' } } } } },
      take: 20,
    });
  },
  ['brand', 'topBrands', '20'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.brands] },
);

// Q2: category.findMany({ where: { active: true, layer: "CATALOG" }, orderBy: sortOrder ASC, include: _count.listings })
export const getCachedCatalogCategories = unstable_cache(
  async () => {
    return db.category.findMany({
      where: { active: true, layer: 'CATALOG' },
      orderBy: [{ sortOrder: 'asc' }],
      include: { _count: { select: { listings: { where: { status: 'PUBLISHED' } } } } },
    });
  },
  ['category', 'catalog'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.categories] },
);

// Q9: brand.count({ where: { active: true } })
export const getCachedBrandCount = unstable_cache(
  async () => {
    return db.brand.count({ where: { active: true } });
  },
  ['brand', 'count', 'active'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.brands] },
);

// Q13: buyRequest.findMany({ where: { status: "ACTIVE" }, orderBy: [verified DESC, createdAt DESC], take: 6 })
export const getCachedActiveRequests = unstable_cache(
  async () => {
    return db.buyRequest.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      take: 6,
    });
  },
  ['buyRequest', 'active', '6'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.requests] },
);

// Q18: category.findFirst({ where: { slug: "machinery", active: true }, select: { id: true } })
export const getCachedMachineryRoot = unstable_cache(
  async () => {
    return db.category.findFirst({
      where: { slug: 'machinery', active: true },
      select: { id: true },
    });
  },
  ['category', 'machinery'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.categories] },
);

// Q19: category.findMany({ where: { parentId: <dynamic>, active: true }, orderBy: [sortOrder ASC, name ASC], take: 12, include: _count.listings })
// parentId is DYNAMIC — included in keyParts for cache key differentiation
export const getCachedL1Children = unstable_cache(
  async (parentId: string) => {
    return db.category.findMany({
      where: { parentId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 12,
      include: { _count: { select: { listings: { where: { status: 'PUBLISHED' } } } } },
    });
  },
  ['category', 'l1children'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.categories] },
);

// Q20a: brandDisplay.findMany({ where: { showOnHomepage: true }, select: { brandId: true } })
export const getCachedBrandDisplayIds = unstable_cache(
  async () => {
    return db.brandDisplay.findMany({
      where: { showOnHomepage: true },
      select: { brandId: true },
    });
  },
  ['brandDisplay', 'showOnHomepage'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.brands] },
);

// Q20b: brand.findMany({ where: { featured: true, active: true }, select: { id: true } })
export const getCachedFeaturedBrandIds = unstable_cache(
  async () => {
    return db.brand.findMany({
      where: { featured: true, active: true },
      select: { id: true },
    });
  },
  ['brand', 'featured', 'ids'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.brands] },
);

// Q20c: brand.findMany({ where: { id: { in: <dynamic> }, active: true }, orderBy: [...], take: 20, include: _count.listings })
// ids is DYNAMIC — included in keyParts via the argument
export const getCachedTrustedBrands = unstable_cache(
  async (ids: string[]) => {
    if (ids.length === 0) return [];
    return db.brand.findMany({
      where: { id: { in: ids }, active: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 20,
      include: { _count: { select: { listings: { where: { status: 'PUBLISHED' } } } } },
    });
  },
  ['brand', 'trustedByIds'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.brands] },
);

// Q20d: siteStat.findMany({ where: { active: true }, orderBy: [sortOrder ASC, createdAt ASC] })
export const getCachedSiteStats = unstable_cache(
  async () => {
    return db.siteStat.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },
  ['siteStat', 'active'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.stats] },
);

// Q23: category.count({ where: { parentId: null, active: true } })
export const getCachedCategoryCount = unstable_cache(
  async () => {
    return db.category.count({ where: { parentId: null, active: true } });
  },
  ['category', 'count', 'rootActive'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.categories] },
);

// Q24: province.count()
export const getCachedProvinceCount = unstable_cache(
  async () => {
    return db.province.count();
  },
  ['province', 'count'],
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.stats] },
);

// ═══════════════════════════════════════════════════════════════
// T3 QUERIES — NOT CACHED (deliberately excluded)
// ═══════════════════════════════════════════════════════════════
// Q5, Q6, Q7 (listing findMany), Q8 (listing count), Q11 (featured count),
// Q12 (verified count — DEAD CODE), Q27 (hero card listings — conditional)
// remain inline in page.tsx — fresh on every request.
// ═══════════════════════════════════════════════════════════════
