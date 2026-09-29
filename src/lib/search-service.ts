import { db } from "@/lib/db";
import {
  normalizeSearchQuery,
  buildSearchWhere,
  type PrismaWhere,
} from "@/lib/search";
import { normalizeAliasValue } from "@/lib/brand-alias";

/* ============================================================
   HEAVIX — Search Service (Phase 4 deepening)
   ------------------------------------------------------------
   Single source of truth for HEAVIX search/discovery business
   logic. Wraps Prisma queries with:
     • Persian-aware normalization (ي→ی, ك→ک, ZWNJ strip, etc.)
     • Faceted filtering (category / brand / transaction / price /
       condition / year / location)
     • Sort + pagination
     • Autocomplete (brands + categories + popular searches)
     • Related searches (queries with shared normalized prefix)
     • Listing comparison (specs side-by-side)

   Public API (all server-only):
     search(params)            → unified listing search with facets
     getSuggestions(q, limit) → autocomplete
     getFacets(filters)        → available filter values + counts
     getRelatedSearches(q)    → related search terms
     compareListings(ids[])    → side-by-side comparison data

   All functions degrade gracefully — they return empty arrays
   rather than throwing — so callers can compose them in parallel
   Promise.all blocks without worrying about partial failures.

   ============================================================ */

/* ──────────────── Types ──────────────── */

export type SearchType = "listings" | "brands" | "categories" | "all";

export type SortMode =
  | "newest"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "featured";

export type ListingCondition = "NEW" | "USED" | "REFURBISHED";

export interface SearchParams {
  q?: string | null;
  type?: SearchType;
  category?: string | null; // slug OR free text
  brand?: string | null; // slug OR free text
  transactionType?: string | null; // key (SALE | RENT | ...)
  province?: string | null;
  city?: string | null;
  priceMin?: number | string | null;
  priceMax?: number | string | null;
  condition?: ListingCondition | null;
  yearMin?: number | null;
  yearMax?: number | null;
  sort?: SortMode | null;
  page?: number;
  limit?: number;
}

export interface SearchHit {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  shortDesc: string | null;
  price: string | null;
  priceType: string;
  listingType: string;
  condition: string | null;
  province: string | null;
  city: string | null;
  year: number | null;
  workingHours: number | null;
  featured: boolean;
  verified: boolean;
  publishedAt: string | null;
  brand: {
    id: string;
    name: string;
    nameEn: string | null;
    slug: string;
    country: string | null;
  } | null;
  category: {
    id: string;
    name: string;
    nameEn: string | null;
    slug: string;
    icon: string | null;
  } | null;
  image: string | null;
}

export interface SearchResult {
  results: SearchHit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Suggestion {
  type: "brand" | "category" | "recent";
  id?: string;
  label: string;
  sublabel?: string;
  slug?: string;
}

export interface FacetBucket {
  id?: string;
  name?: string;
  slug?: string;
  value?: string;
  label?: string;
  count: number;
}

export interface Facets {
  categories: FacetBucket[];
  brands: FacetBucket[];
  transactionTypes: FacetBucket[];
  provinces: FacetBucket[];
  conditions: FacetBucket[];
  priceRange: { min: number | null; max: number | null };
}

export interface FacetFilters {
  category?: string | null;
  brand?: string | null;
  transactionType?: string | null;
  province?: string | null;
  city?: string | null;
  condition?: ListingCondition | null;
  priceMin?: number | string | null;
  priceMax?: number | string | null;
}

export interface RelatedSearch {
  query: string;
  normalizedQuery: string;
  count: number;
}

export interface ComparisonAttribute {
  attributeId: string;
  key: string | null;
  name: string;
  nameEn: string | null;
  label: string;
  unit: string | null;
  type: string;
  // resolved display value (textValue | numberValue | option label | boolean)
  value: string | null;
}

export interface ComparisonListing {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  shortDesc: string | null;
  price: string | null;
  priceType: string;
  listingType: string;
  condition: string | null;
  province: string | null;
  city: string | null;
  year: number | null;
  workingHours: number | null;
  featured: boolean;
  verified: boolean;
  publishedAt: string | null;
  brand: { id: string; name: string; slug: string; nameEn: string | null } | null;
  category: { id: string; name: string; slug: string; nameEn: string | null } | null;
  image: string | null;
  attributes: ComparisonAttribute[];
}

export interface ComparisonResult {
  listings: ComparisonListing[];
  // union of all attribute keys across the selected listings, with each
  // listing's value aligned in the same order. Makes side-by-side
  // rendering trivial in the client.
  attributeRows: Array<{
    attributeId: string;
    key: string | null;
    label: string;
    unit: string | null;
    values: Array<string | null>; // aligned to listings[] order
  }>;
}

/* ──────────────── Helpers ──────────────── */

const CONDITION_LABELS: Record<string, string> = {
  NEW: "نو",
  USED: "کارکرده",
  REFURBISHED: "بازسازی شده",
};

/**
 * Convert a SearchParams.sort value to a Prisma orderBy array.
 *
 * `featured` (default) preserves the original "featured DESC, then
 * newest" behavior — featured ads float to the top.
 */
function sortToOrderBy(sort: SortMode | null | undefined): Record<string, "asc" | "desc">[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "price-asc":
      return [{ price: "asc" }, { createdAt: "desc" }];
    case "price-desc":
      return [{ price: "desc" }, { createdAt: "desc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "featured":
    default:
      return [{ featured: "desc" }, { createdAt: "desc" }];
  }
}

/**
 * Coerce a priceMin/priceMax input (number, string, BigInt-able)
 * to a `bigint | null`. Non-numeric / negative values are dropped
 * (returns null) so callers can spread cleanly.
 */
function toBigInt(v: number | string | null | undefined): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    const n = typeof v === "string" ? v.replace(/[^\d-]/g, "") : String(v);
    if (n === "" || n === "-") return null;
    const bi = BigInt(n);
    return bi < 0n ? null : bi;
  } catch {
    return null;
  }
}

/**
 * Build the listing-side `where` clause combining all faceted filters.
 * Always restricts to status === "PUBLISHED".
 *
 * Returned object is typed as `any` so it can be passed straight to
 * Prisma `db.listing.findMany({ where })` without friction.
 */
function buildListingWhere(params: SearchParams): PrismaWhere {
  const where: PrismaWhere = { status: "PUBLISHED" };

  // ── Free text ──
  const q = params.q?.trim();
  if (q) {
    const textClause = buildSearchWhere(["title", "shortDesc", "description"], q);
    if (textClause) where.OR = textClause.OR;
  }

  // ── Category (slug OR name contains) ──
  const cat = params.category?.trim();
  if (cat) {
    const catClause: PrismaWhere = {
      OR: [
        { category: { slug: cat } },
        { category: { name: { contains: normalizeSearchQuery(cat) } } },
      ],
    };
    where.OR = where.OR
      ? [...(where.OR as PrismaWhere[]), ...((catClause as any)?.OR || [])]
      : (catClause as any)?.OR;
  }

  // ── Brand (slug OR name/nameEn contains) ──
  const br = params.brand?.trim();
  if (br) {
    const brandClause: PrismaWhere = {
      OR: [
        { brand: { slug: br } },
        { brand: { name: { contains: normalizeSearchQuery(br) } } },
        { brand: { nameEn: { contains: normalizeSearchQuery(br) } } },
      ],
    };
    where.OR = where.OR
      ? [...(where.OR as PrismaWhere[]), ...((brandClause as any)?.OR || [])]
      : (brandClause as any)?.OR;
  }

  // ── Transaction type (key OR legacy listingType) ──
  if (params.transactionType) {
    const tt = params.transactionType.trim();
    const ttClauses: PrismaWhere[] = [
      { transactionType: { key: tt } },
      { listingType: tt },
    ];
    where.OR = where.OR
      ? [...(where.OR as PrismaWhere[]), ...ttClauses]
      : ttClauses;
  }

  // ── Province ──
  const prov = params.province?.trim();
  if (prov) {
    const provClauses: PrismaWhere[] = [
      { provinceId: prov },
      { province: { contains: normalizeSearchQuery(prov) } },
    ];
    where.OR = where.OR
      ? [...(where.OR as PrismaWhere[]), ...provClauses]
      : provClauses;
  }

  // ── City ──
  const c = params.city?.trim();
  if (c) {
    const cityClauses: PrismaWhere[] = [
      { cityId: c },
      { city: { contains: normalizeSearchQuery(c) } },
    ];
    where.OR = where.OR
      ? [...(where.OR as PrismaWhere[]), ...cityClauses]
      : cityClauses;
  }

  // ── Price range (BigInt) ──
  const priceMin = toBigInt(params.priceMin);
  const priceMax = toBigInt(params.priceMax);
  if (priceMin !== null || priceMax !== null) {
    const priceFilter: Record<string, bigint> = {};
    if (priceMin !== null) priceFilter.gte = priceMin;
    if (priceMax !== null) priceFilter.lte = priceMax;
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { price: priceFilter },
    ];
  }

  // ── Condition ──
  if (params.condition) {
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { condition: params.condition },
    ];
  }

  // ── Year range ──
  const yearMin = params.yearMin ?? null;
  const yearMax = params.yearMax ?? null;
  if (yearMin !== null || yearMax !== null) {
    const yearFilter: Record<string, number> = {};
    if (yearMin !== null) yearFilter.gte = Number(yearMin);
    if (yearMax !== null) yearFilter.lte = Number(yearMax);
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { year: yearFilter },
    ];
  }

  return where;
}

/* ──────────────── Public API ──────────────── */

/**
 * Unified listing search with faceted filters.
 *
 * Behavior:
 *   • Always restricts to status === "PUBLISHED".
 *   • Persian-normalized free-text OR over title / shortDesc / description.
 *   • Facets: category, brand, transactionType, province, city, price
 *     range, condition, year range.
 *   • Sort: newest | oldest | price-asc | price-desc | featured.
 *   • Pagination: page (1-indexed) + limit (capped at 100).
 *
 * Returns `{ results, total, page, limit, totalPages }`.
 */
export async function search(params: SearchParams): Promise<SearchResult> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const where = buildListingWhere(params);
  const orderBy = sortToOrderBy(params.sort);

  const [total, rows] = await Promise.all([
    db.listing.count({ where: where as any }),
    db.listing.findMany({
      where: where as any,
      skip: offset,
      take: limit,
      orderBy: orderBy as any,
      include: {
        brand: {
          select: { id: true, name: true, nameEn: true, slug: true, country: true },
        },
        category: {
          select: { id: true, name: true, nameEn: true, slug: true, icon: true },
        },
        images: { take: 1, orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  const results: SearchHit[] = rows.map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    shortDesc: l.shortDesc,
    price: l.price ? l.price.toString() : null,
    priceType: l.priceType,
    listingType: l.listingType,
    condition: l.condition,
    province: l.province,
    city: l.city,
    year: l.year,
    workingHours: l.workingHours,
    featured: l.featured,
    verified: l.verified,
    publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null,
    brand: l.brand
      ? {
          id: l.brand.id,
          name: l.brand.name,
          nameEn: l.brand.nameEn,
          slug: l.brand.slug,
          country: l.brand.country,
        }
      : null,
    category: l.category
      ? {
          id: l.category.id,
          name: l.category.name,
          nameEn: l.category.nameEn,
          slug: l.category.slug,
          icon: l.category.icon,
        }
      : null,
    image: l.images?.[0]?.url ?? null,
  }));

  return {
    results,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Autocomplete suggestions for the search box.
 *
 * Composes 3 sources in parallel:
 *   1. brands — name / nameEn / slug / aliases (normalized)
 *   2. categories — name / nameEn / slug
 *   3. recent popular SearchQuery rows (only those with results)
 *
 * The combined list is capped at `limit * 2` so the UI can show a
 * few brand + category + recent hits without truncating one source.
 *
 * Returns `{ suggestions, normalized }` so the caller can canonicalize
 * the user's typed query before doing the real search.
 */
export async function getSuggestions(
  q: string,
  limit: number = 5,
): Promise<{ suggestions: Suggestion[]; normalized: string }> {
  const cap = Math.min(10, Math.max(1, limit));
  const rawQ = (q ?? "").trim();
  if (!rawQ || rawQ.length < 2) {
    return { suggestions: [], normalized: "" };
  }

  // Persian normalization for the `contains` clauses below.
  const normalized = normalizeSearchQuery(rawQ);
  // Brand-alias-aware normalization (also collapses Arabic→Persian).
  const aliasNorm = normalizeAliasValue(rawQ);

  const [brands, categories, recentQueries] = await Promise.all([
    db.brand.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: normalized } },
          { nameEn: { contains: normalized } },
          { slug: { contains: normalized.toLowerCase() } },
          { aliases: { some: { normalizedValue: { contains: aliasNorm } } } },
        ],
      },
      select: { id: true, name: true, nameEn: true, slug: true },
      take: cap,
    }),
    db.category.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: normalized } },
          { nameEn: { contains: normalized } },
          { slug: { contains: normalized.toLowerCase() } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: cap,
    }),
    db.searchQuery
      .findMany({
        where: {
          query: { contains: normalized },
          hasResults: true,
        },
        select: { query: true, resultCount: true },
        orderBy: { createdAt: "desc" },
        take: cap,
      })
      .catch(() => [] as Array<{ query: string; resultCount: number }>),
  ]);

  const suggestions: Suggestion[] = [
    ...brands.map((b) => ({
      type: "brand" as const,
      id: b.id,
      label: b.name,
      sublabel: b.nameEn || undefined,
      slug: b.slug,
    })),
    ...categories.map((c) => ({
      type: "category" as const,
      id: c.id,
      label: c.name,
      slug: c.slug,
    })),
    ...recentQueries.map((sq) => ({
      type: "recent" as const,
      label: sq.query,
      sublabel: `${sq.resultCount} نتیجه`,
    })),
  ].slice(0, cap * 2);

  return { suggestions, normalized };
}

/**
 * Compute the available facet values for filtering, with counts of
 * matching PUBLISHED listings per bucket.
 *
 * The optional `filters` argument lets the caller request facets
 * scoped to a parent context — e.g. "given the user picked category X,
 * what brand buckets are still available?". When `filters` is null /
 * empty, all facets are computed against the full PUBLISHED set.
 *
 * Returns:
 *   {
 *     categories: [{ id, name, slug, count }],
 *     brands: [{ id, name, slug, count }],
 *     transactionTypes: [{ id, name, slug, value, label, count }],
 *     provinces: [{ name, count }],
 *     conditions: [{ value, label, count }],
 *     priceRange: { min, max }
 *   }
 */
export async function getFacets(filters: FacetFilters = {}): Promise<Facets> {
  // Base where clause: only PUBLISHED listings, scoped to the
  // caller's filter context. (priceMin/priceMax are NOT applied here
  // — the facet buckets are computed against the unfiltered-by-price
  // set so users can see all available price points.)
  const where: PrismaWhere = { status: "PUBLISHED" };

  if (filters.category) {
    const cat = filters.category.trim();
    const catClause: PrismaWhere = {
      OR: [
        { category: { slug: cat } },
        { category: { name: { contains: normalizeSearchQuery(cat) } } },
      ],
    };
    where.AND = [...((where.AND as PrismaWhere[] | undefined) ?? []), catClause];
  }
  if (filters.brand) {
    const br = filters.brand.trim();
    const brandClause: PrismaWhere = {
      OR: [
        { brand: { slug: br } },
        { brand: { name: { contains: normalizeSearchQuery(br) } } },
        { brand: { nameEn: { contains: normalizeSearchQuery(br) } } },
      ],
    };
    where.AND = [...((where.AND as PrismaWhere[] | undefined) ?? []), brandClause];
  }
  if (filters.transactionType) {
    const tt = filters.transactionType.trim();
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { OR: [{ transactionType: { key: tt } }, { listingType: tt }] },
    ];
  }
  if (filters.province) {
    const prov = filters.province.trim();
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { OR: [{ provinceId: prov }, { province: { contains: normalizeSearchQuery(prov) } }] },
    ];
  }
  if (filters.city) {
    const c = filters.city.trim();
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { OR: [{ cityId: c }, { city: { contains: normalizeSearchQuery(c) } }] },
    ];
  }
  if (filters.condition) {
    where.AND = [
      ...((where.AND as PrismaWhere[] | undefined) ?? []),
      { condition: filters.condition },
    ];
  }

  const [
    categories,
    brands,
    transactionTypes,
    provinceRows,
    conditionRows,
    priceAgg,
  ] = await Promise.all([
    db.category.findMany({
      where: { active: true, parentId: { not: null }, listings: { some: where as any } },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { listings: { where: where as any } } },
      },
      orderBy: { name: "asc" },
      take: 50,
    }),
    db.brand.findMany({
      where: { active: true, listings: { some: where as any } },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { listings: { where: where as any } } },
      },
      orderBy: { name: "asc" },
      take: 50,
    }),
    db.transactionType
      .findMany({
        where: { active: true },
        select: {
          id: true,
          key: true,
          nameFa: true,
          nameEn: true,
          _count: { select: { listings: { where: where as any } } },
        },
      })
      .catch(() => []),
    db.listing
      .findMany({
        where: { ...((where as any) ?? {}), province: { not: null } },
        select: { province: true },
      })
      .then((rows) => {
        const counts: Record<string, number> = {};
        for (const r of rows) {
          if (r.province) counts[r.province] = (counts[r.province] || 0) + 1;
        }
        return Object.entries(counts).map(([name, count]) => ({
          name,
          count,
        }));
      }),
    db.listing
      .findMany({
        where: { ...((where as any) ?? {}), condition: { not: null } },
        select: { condition: true },
      })
      .then((rows) => {
        const counts: Record<string, number> = {};
        for (const r of rows) {
          if (r.condition) counts[r.condition] = (counts[r.condition] || 0) + 1;
        }
        return Object.entries(counts).map(([value, count]) => ({
          value,
          label: CONDITION_LABELS[value] || value,
          count,
        }));
      }),
    db.listing
      .aggregate({
        where: { ...((where as any) ?? {}), price: { not: null } },
        _min: { price: true },
        _max: { price: true },
      })
      .then((agg) => ({
        min: agg._min.price ? Number(agg._min.price) : null,
        max: agg._max.price ? Number(agg._max.price) : null,
      }))
      .catch(() => ({ min: null, max: null })),
  ]);

  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: (c._count as any).listings ?? 0,
    })),
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      count: (b._count as any).listings ?? 0,
    })),
    transactionTypes: (transactionTypes as any[]).map((t) => ({
      id: t.id,
      value: t.key,
      name: t.nameFa,
      label: t.nameFa,
      count: (t._count as any)?.listings ?? 0,
    })),
    provinces: provinceRows.map((p) => ({ name: p.name, count: p.count })),
    conditions: conditionRows,
    priceRange: priceAgg,
  };
}

/**
 * Related searches — finds other SearchQuery rows whose normalized
 * form shares a token-prefix with the user's query. Useful for the
 * "related searches" chip rail under the search box.
 *
 * Returns up to 10 distinct related queries (excluding the exact
 * user query itself), sorted by frequency in the last 30 days.
 */
export async function getRelatedSearches(q: string): Promise<RelatedSearch[]> {
  const rawQ = (q ?? "").trim();
  if (!rawQ) return [];
  const normalized = normalizeSearchQuery(rawQ);
  if (!normalized) return [];

  // Pull recent queries that contain the normalized term (broad match)
  // OR whose own normalized form contains the user's term.
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await db.searchQuery
    .findMany({
      where: {
        hasResults: true,
        createdAt: { gte: since },
        OR: [
          { query: { contains: rawQ } },
          { normalizedQuery: { contains: normalized } },
          { normalizedQuery: normalized },
        ],
      },
      select: { query: true, normalizedQuery: true },
      take: 200,
    })
    .catch(() => [] as Array<{ query: string; normalizedQuery: string }>);

  // Aggregate by normalizedQuery, exclude the exact user query itself.
  const map = new Map<string, { query: string; count: number }>();
  for (const r of rows) {
    if (r.normalizedQuery === normalized) continue;
    const ex = map.get(r.normalizedQuery);
    if (ex) {
      ex.count++;
    } else {
      map.set(r.normalizedQuery, { query: r.query, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([normalizedQuery, v]) => ({
      query: v.query,
      normalizedQuery,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Side-by-side comparison data for up to 4 listings.
 *
 * Loads each listing with brand / category / images / attribute
 * values (joined to AttributeDefinition + AttributeOption), then
 * aligns attributes across listings into a flat `attributeRows`
 * array so the client can render a single comparison table without
 * doing its own pivot.
 *
 * Public (no auth) — only PUBLISHED listings are returned; any
 * non-published / non-existent id in the input is silently dropped.
 *
 * Caps the input at 4 ids (more is meaningless UX-wise and would
 * make the response unwieldy).
 */
export async function compareListings(ids: string[]): Promise<ComparisonResult> {
  const cleaned = (ids ?? [])
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .slice(0, 4)
    .map((x) => x.trim());

  if (cleaned.length === 0) {
    return { listings: [], attributeRows: [] };
  }

  // Use findMany + filter to preserve the caller's id order (we
  // can't `orderBy` by a raw id list in Prisma). `ListingAttributeValue`
  // has no Prisma relation to `AttributeOption` (optionId is a plain
  // string FK), so we resolve the option labels in a second query and
  // join them here in JS.
  let rows: any[] = [];
  try {
    rows = await db.listing.findMany({
      where: { id: { in: cleaned }, status: "PUBLISHED" },
      include: {
        brand: {
          select: { id: true, name: true, slug: true, nameEn: true },
        },
        category: {
          select: { id: true, name: true, slug: true, nameEn: true },
        },
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        attributeValues: {
          include: {
            attribute: {
              select: {
                id: true,
                key: true,
                name: true,
                nameEn: true,
                unit: true,
                type: true,
              },
            },
          },
        },
      },
    });
  } catch {
    rows = [];
  }

  // Collect optionIds across all listings, fetch the corresponding
  // AttributeOption rows in one shot, build a label lookup map.
  const optionIds = new Set<string>();
  for (const r of rows) {
    for (const av of r.attributeValues ?? []) {
      if (av.optionId) optionIds.add(av.optionId);
    }
  }
  const optionRows = optionIds.size > 0
    ? await db.attributeOption
        .findMany({
          where: { id: { in: Array.from(optionIds) } },
          select: { id: true, value: true, label: true },
        })
        .catch(() => [] as Array<{ id: string; value: string; label: string | null }>)
    : [];
  const optionLabelById = new Map<string, { value: string; label: string | null }>(
    optionRows.map((o) => [o.id, { value: o.value, label: o.label }]),
  );

  // Re-order to match the input `cleaned` order so the UI columns
  // line up with what the user picked. Drop unknown ids.
  const byId = new Map<string, any>(rows.map((r) => [r.id, r]));
  const orderedRows = cleaned
    .map((id) => byId.get(id))
    .filter((r): r is any => Boolean(r));

  const listings: ComparisonListing[] = orderedRows.map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    shortDesc: l.shortDesc,
    price: l.price ? l.price.toString() : null,
    priceType: l.priceType,
    listingType: l.listingType,
    condition: l.condition,
    province: l.province,
    city: l.city,
    year: l.year,
    workingHours: l.workingHours,
    featured: l.featured,
    verified: l.verified,
    publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null,
    brand: l.brand
      ? {
          id: l.brand.id,
          name: l.brand.name,
          slug: l.brand.slug,
          nameEn: l.brand.nameEn,
        }
      : null,
    category: l.category
      ? {
          id: l.category.id,
          name: l.category.name,
          slug: l.category.slug,
          nameEn: l.category.nameEn,
        }
      : null,
    image: l.images?.[0]?.url ?? null,
    attributes: l.attributeValues.map((av: any) => ({
      attributeId: av.attributeId,
      key: av.attribute?.key ?? null,
      name: av.attribute?.name ?? "",
      nameEn: av.attribute?.nameEn ?? null,
      label: av.attribute?.name ?? av.attribute?.nameEn ?? av.attribute?.key ?? "",
      unit: av.attribute?.unit ?? null,
      type: av.attribute?.type ?? "TEXT",
      value: resolveAttributeValue(av, optionLabelById.get(av.optionId ?? "") ?? null),
    })),
  }));

  // Build the pivot: union of all attribute keys across listings,
  // with each listing's value aligned in the same order.
  const attrOrder = new Map<string, {
    attributeId: string;
    key: string | null;
    label: string;
    unit: string | null;
  }>();
  const valueByListing = new Map<string, Map<string, string | null>>();

  for (const l of listings) {
    const m = new Map<string, string | null>();
    for (const a of l.attributes) {
      m.set(a.attributeId, a.value);
      if (!attrOrder.has(a.attributeId)) {
        attrOrder.set(a.attributeId, {
          attributeId: a.attributeId,
          key: a.key,
          label: a.label,
          unit: a.unit,
        });
      }
    }
    valueByListing.set(l.id, m);
  }

  const attributeRows = Array.from(attrOrder.values()).map((meta) => ({
    ...meta,
    values: listings.map((l) => valueByListing.get(l.id)?.get(meta.attributeId) ?? null),
  }));

  return { listings, attributeRows };
}

/* ──────────────── private helpers (kept local) ──────────────── */

/**
 * Resolve a ListingAttributeValue row to a single display string,
 * accounting for the active storage column (textValue / numberValue /
 * booleanValue / option label / dateValue).
 *
 * The `option` argument is the looked-up AttributeOption row (joined
 * in JS, since ListingAttributeValue.optionId has no Prisma relation).
 * When present, its label (or value fallback) is preferred over the
 * raw textValue.
 */
function resolveAttributeValue(
  av: {
    textValue: string | null;
    numberValue: number | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
  },
  option: { value: string; label: string | null } | null,
): string | null {
  if (option) return option.label || option.value;
  if (av.textValue !== null && av.textValue !== undefined && av.textValue !== "") {
    return av.textValue;
  }
  if (av.numberValue !== null && av.numberValue !== undefined) {
    return String(av.numberValue);
  }
  if (av.booleanValue !== null && av.booleanValue !== undefined) {
    return av.booleanValue ? "بله" : "خیر";
  }
  if (av.dateValue) {
    try {
      return av.dateValue.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  return null;
}
