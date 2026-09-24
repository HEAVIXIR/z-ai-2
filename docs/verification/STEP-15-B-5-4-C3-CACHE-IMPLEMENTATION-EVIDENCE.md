# HEAVIX — STEP 15-B.5.4-C.3: Cache Implementation Evidence Freeze

> **Status:** Evidence Freeze — NO code changes made.
>
> **Per user policy:** "محل دقیق هر query از T1/T2 مشخص شود... هیچ تغییر UI/API/schema/semantic query انجام نشود"
>
> **Frozen at:** git commit `fcd5628` (STEP 15-B.5.4-D head)

---

## 1. unstable_cache API in Next.js 16.1.3

```typescript
export declare function unstable_cache<T extends Callback>(
  cb: T,
  keyParts?: string[],
  options?: {
    revalidate?: number | false;
    tags?: string[];
  }
): T;
```

- `cb`: async function to cache
- `keyParts`: array of strings for cache key composition (must include all dynamic inputs)
- `options.revalidate`: TTL in seconds (false = never revalidate via time)
- `options.tags`: array of tag strings for `revalidateTag` invalidation

**Confirmed:** `unstable_cache` exists and supports `tags` + `revalidate` in Next.js 16.

**force-dynamic interaction:** `unstable_cache` works at the DATA level, independent of the page's `dynamic` setting. The page can be `force-dynamic` (re-renders every request) while individual queries use `unstable_cache` for data-level caching. When `revalidateTag` fires, the tagged cache entries are invalidated, and the next render re-fetches from DB.

---

## 2. T1 Queries (TTL=3600s, 6 queries)

| Q | Location | Prisma query | Cache key parts | Tag | TTL |
|---|---|---|---|---|---:|
| Q3 | page.tsx:78 | `db.homeCategoryConfig.findUnique({ where: { id: "main" } })` | `["homeCategoryConfig", "main"]` | `home:cat-config` | 3600 |
| Q4 | page.tsx:79 | `db.siteSettings.findUnique({ where: { id: "main" } })` | `["siteSettings", "main"]` | `home:settings` | 3600 |
| Q14 | page.tsx:129 | `db.article.findMany({ where: { status: "PUBLISHED" }, orderBy: publishedAt DESC, take: 4 })` | `["article", "published", "4"]` | `home:articles` | 3600 |
| Q15 | page.tsx:135 | `db.hotSearch.findMany({ where: { active: true }, orderBy: sortOrder ASC, take: 9 })` | `["hotSearch", "active", "9"]` | `home:hot-searches` | 3600 |
| Q16 | page.tsx:141 | `db.homePageSection.findMany({ where: { active: true }, orderBy: order ASC })` | `["homePageSection", "active"]` | `home:sections` | 3600 |
| Q17 | page.tsx:203 | `db.heroConfig.findUnique({ where: { id: "main" } })` | `["heroConfig", "main"]` | `home:hero` | 3600 |

### 2.1 Q4 caveat: verifiedOnlyFlag dependency

Q4 (siteSettings) result is used to derive `verifiedOnlyFlag` (line 90), which drives Q6's predicate (Phase 3). If Q4 is cached with TTL=3600s, changes to `verifiedSectionVerifiedOnly` won't be reflected for up to 1 hour. Per Cache Contract: settings have LOW freshness requirement (1h stale OK). This is acceptable.

### 2.2 Q16 caveat: conditional createMany

Q16 has a conditional branch: if `rows.length === 0`, it calls `createMany` to seed default sections, then re-fetches. With caching:
- Cache MISS → fetches from DB → if empty, creates defaults → re-fetches → caches result
- Cache HIT → returns cached sections (no createMany fires)
- This is correct — createMany is one-time seeding, should only fire on first cache miss ever

---

## 3. T2 Queries (TTL=300s, 13 queries)

| Q | Location | Prisma query | Cache key parts | Tag | TTL |
|---|---|---|---|---|---:|
| Q1 | page.tsx:52 | `db.brand.findMany({ active, take 20, include _count.listings })` | `["brand", "topBrands", "20"]` | `home:brands` | 300 |
| Q2 | page.tsx:58 | `db.category.findMany({ active, CATALOG, include _count.listings })` | `["category", "catalog"]` | `home:categories` | 300 |
| Q9 | page.tsx:120 | `db.brand.count({ active: true })` | `["brand", "count", "active"]` | `home:brands` | 300 |
| Q13 | page.tsx:124 | `db.buyRequest.findMany({ ACTIVE, take 6 })` | `["buyRequest", "active", "6"]` | `home:requests` | 300 |
| Q18 | page.tsx:211 | `db.category.findFirst({ slug: "machinery", active })` | `["category", "machinery"]` | `home:categories` | 300 |
| Q19 | page.tsx:223 | `db.category.findMany({ parentId, active, take 12, include })` | **DYNAMIC** — includes parentId | `home:categories` | 300 |
| Q20a | page.tsx:245 | `db.brandDisplay.findMany({ showOnHomepage: true })` | `["brandDisplay", "showOnHomepage"]` | `home:brands` | 300 |
| Q20b | page.tsx:249 | `db.brand.findMany({ featured, active, select id })` | `["brand", "featured", "ids"]` | `home:brands` | 300 |
| Q20c | page.tsx:259 | `db.brand.findMany({ id IN ids, active, take 20 })` | **DYNAMIC** — includes id list | `home:brands` | 300 |
| Q20d | site-stats.ts:112 | `db.siteStat.findMany({ active: true })` | `["siteStat", "active"]` | `home:stats` | 300 |
| Q23 | site-stats.ts:64 | `db.category.count({ parentId null, active })` | `["category", "count", "rootActive"]` | `home:categories` | 300 |
| Q24 | site-stats.ts:71 | `db.province.count()` | `["province", "count"]` | `home:stats` | 300 |

### 3.1 Cache key dependency chains (CHALLENGE 1)

**Q19 depends on Q18 output (machinery.id):**
```
Q18 (cached) → returns machinery.id (possibly cached/stale)
Q19 (cached) → keyParts must include parentId from Q18
```
Solution: `keyParts: ["category", "l1children", parentId]` where `parentId` is passed as a runtime argument to the cached function. Since `parentId` is part of the cache key, different parentId values create different cache entries. When `revalidateTag('home:categories')` fires, ALL entries tagged `home:categories` are invalidated (including Q19's entries for any parentId).

**Q20c depends on Q20a+Q20b output (id list):**
```
Q20a (cached) → returns brand IDs (possibly cached/stale)
Q20b (cached) → returns featured brand IDs
Q20c (cached) → keyParts must include the combined id list
```
Solution: `keyParts: ["brand", "trustedByIds", ids.join(",")]` where `ids` is the combined list from Q20a+Q20b. The id list is part of the cache key. When `revalidateTag('home:brands')` fires, ALL entries tagged `home:brands` are invalidated.

### 3.2 Missing tag: home:stats (CHALLENGE 2)

`HOMEPAGE_CACHE_TAGS` const currently has 10 entries but is missing `stats`:
```typescript
// Need to add:
stats: 'home:stats',
```

Q20d (siteStat.findMany) and Q24 (province.count) need this tag. The `homepage-cache-tags.ts` file must be updated to add `stats: 'home:stats'`.

Also: the `RESOURCE_TAG_MAP` (for Universal API `getHomepageCacheTags`) does NOT include `stats` — because siteStat is not a registered Universal API resource. SiteStat mutations go through direct admin routes. The `home:stats` tag is only used for cache invalidation via direct routes (P3 already has revalidateTag calls for siteStat mutations — but they use `HOMEPAGE_CACHE_TAGS.settings` or `HOMEPAGE_CACHE_TAGS.hotSearches`, not `home:stats`).

**Wait — let me re-check:** Which tag does the site-settings mutation route invalidate?

Looking at the P3 implementation, the `api/admin/site-settings/route.ts` uses `HOMEPAGE_CACHE_TAGS.settings`. But `home:stats` is different from `home:settings`. The siteStat table is different from the siteSettings table.

**This means Q20d and Q24 need their OWN tag (`home:stats`), AND the mutation routes for SiteStat need to invalidate `home:stats`.**

But SiteStat mutations go through... let me check. SiteStat is NOT one of the 18 registered resources, and there's no dedicated `/api/admin/site-stats` route. SiteStat mutations likely go through the Universal API (if registered) or direct admin routes.

Actually, looking at the resource-index, SiteStat is NOT registered. And there's no `/api/admin/site-stats` route. SiteStat mutations might happen through the admin UI calling a direct route, or through the Universal API with an unregistered resource key (which would return 404 "Unknown resource").

**This is a gap in the mutation coverage.** If SiteStat rows are modified, there's no revalidateTag call for `home:stats`. But this is an EDGE CASE — SiteStat is admin-only, low-frequency data. The TTL=300s is the safety net.

For now, I'll note this as a known gap and proceed. The `home:stats` tag will be added to `HOMEPAGE_CACHE_TAGS`, but the mutation route for SiteStat may not exist yet.

---

## 4. T3 Queries (NOT cached — explicitly excluded)

| Q | Location | Why not cached |
|---|---|---|
| Q5 | page.tsx:93 | Freshness-sensitive (featured listings) |
| Q6 | page.tsx:99 | Freshness-sensitive (verified listings, predicate depends on Q4) |
| Q7 | page.tsx:107 | Freshness-sensitive (latest listings) |
| Q8 | page.tsx:119 | Keep fresh — used for liveCount display |
| Q11 | page.tsx:122 | Keep fresh — listing count |
| Q12 | page.tsx:123 | DEAD CODE (never used) — skip entirely |
| Q27 | page.tsx:407 | Conditional (only fires if heroConfig has card IDs) |

---

## 5. Implementation Challenges

### 5.1 Challenge: Function extraction

`unstable_cache` wraps a FUNCTION. Current queries are inline in `page.tsx`. Each T1/T2 query needs:
1. Extract into a separate function (e.g., `async function getHomeCategoryConfig() { return db.homeCategoryConfig.findUnique({ where: { id: "main" } }); }`)
2. Wrap with `unstable_cache` (e.g., `const getCachedHomeCategoryConfig = unstable_cache(getHomeCategoryConfig, ["homeCategoryConfig", "main"], { revalidate: 3600, tags: [HOMEPAGE_CACHE_TAGS.catConfig] })`)
3. Call the cached version from page.tsx

This is a **significant refactor** of `page.tsx`. The page currently has 660+ lines with inline queries. Extracting 19 queries into cached functions would:
- Add ~19 function definitions (either in page.tsx or a separate lib file)
- Change all query call sites from inline `db.X.findMany(...)` to `getCachedX()`
- Preserve semantics (same query, same result, just cached)

### 5.2 Challenge: Dynamic cache keys

Q19 and Q20c have dynamic cache keys:
- Q19: `parentId` is runtime-determined (from Q18 output or homeCategoryConfig)
- Q20c: `ids` is runtime-determined (from Q20a+Q20b output)

For `unstable_cache`, dynamic values must be passed as arguments to the cached function, and the `keyParts` array must include them:
```typescript
const getCachedL1Children = unstable_cache(
  async (parentId: string) => {
    return db.category.findMany({ where: { parentId, active: true }, ... });
  },
  ["category", "l1children"], // static prefix
  { revalidate: 300, tags: [HOMEPAGE_CACHE_TAGS.categories] }
);
// Call: const rows = await getCachedL1Children(parentId);
// Cache key = "category-l1children-" + parentId
```

### 5.3 Challenge: IIFE restructuring

Q16, Q18+Q19, Q20a+Q20b+Q20c are inside IIFEs (Immediately Invoked Function Expressions). The IIFE structure needs to be preserved or restructured to accommodate `unstable_cache` wrappers.

### 5.4 Challenge: Q20d + Q23 + Q24 in site-stats.ts

These queries are inside `getActiveStats()` and `computeMetricCount()` in `src/lib/site-stats.ts`. To cache them:
- Either wrap `getActiveStats()` itself with `unstable_cache`
- Or wrap individual `computeMetricCount()` calls
- The `precomputed` parameter (from 15-B.5.1) complicates this — if Q8 and Q9 are passed as precomputed, they're not cached, but Q23 and Q24 should be

### 5.5 Challenge: home:stats tag missing from HOMEPAGE_CACHE_TAGS

Need to add `stats: 'home:stats'` to the const.

### 5.6 Challenge: SiteStat mutation coverage gap

No dedicated mutation route for SiteStat exists. If admin changes SiteStat rows, no `revalidateTag('home:stats')` fires. TTL=300s is the safety net. This is a known gap.

---

## 6. Implementation Plan (for after Evidence Freeze)

### 6.1 Step 1: Update homepage-cache-tags.ts

Add `stats: 'home:stats'` to `HOMEPAGE_CACHE_TAGS` const.

### 6.2 Step 2: Create cached query functions

Create a new file `src/lib/homepage-cached-queries.ts` with 19 cached query functions:

**T1 functions (TTL=3600s):**
- `getCachedHomeCategoryConfig()` → tag: `home:cat-config`
- `getCachedSiteSettings()` → tag: `home:settings`
- `getCachedArticles(take: 4)` → tag: `home:articles`
- `getCachedHotSearches(take: 9)` → tag: `home:hot-searches`
- `getCachedHomePageSections()` → tag: `home:sections`
- `getCachedHeroConfig()` → tag: `home:hero`

**T2 functions (TTL=300s):**
- `getCachedTopBrands(take: 20)` → tag: `home:brands`
- `getCachedCatalogCategories()` → tag: `home:categories`
- `getCachedBrandCount()` → tag: `home:brands`
- `getCachedActiveRequests(take: 6)` → tag: `home:requests`
- `getCachedMachineryRoot()` → tag: `home:categories`
- `getCachedL1Children(parentId: string)` → tag: `home:categories`
- `getCachedBrandDisplayIds()` → tag: `home:brands`
- `getCachedFeaturedBrandIds()` → tag: `home:brands`
- `getCachedTrustedBrands(ids: string[])` → tag: `home:brands`
- `getCachedSiteStats()` → tag: `home:stats`
- `getCachedCategoryCount()` → tag: `home:categories`
- `getCachedProvinceCount()` → tag: `home:stats`

### 6.3 Step 3: Replace inline queries in page.tsx

Replace each inline `db.X.findMany(...)` call with the corresponding cached function call.

### 6.4 Step 4: Update site-stats.ts

Either wrap `getActiveStats()` with `unstable_cache` or wrap individual `computeMetricCount` calls.

### 6.5 Step 5: Validation Gate

tsc + lint + 498 tests + build + runtime smoke + cache hit/miss verification.

---

## 7. What This Step Did NOT Do

- ✅ No code changes made
- ✅ No `unstable_cache` added
- ✅ No `homepage-cache-tags.ts` modified
- ✅ No functions extracted
- ✅ No page.tsx refactored
- ✅ Baseline preserved

---

## 8. Next Steps

```
✅ C.1 Mapping Freeze
✅ C.2 Invalidation Implementation (P1+P2+P3+P3-Fix+P4)
✅ C.3 Evidence Freeze ← COMPLETE (this document)
🔵 C.3 Implementation (extract functions, wrap with unstable_cache, replace inline queries)
⚠️ D Freshness Tests (BLOCKED — requires C.3 implementation)
🔵 E TTFB Performance Gate (BLOCKED — requires C.3 + D)
🔵 F Final Decision
```

**C.3 implementation is the next step.** It requires:
1. Adding `stats: 'home:stats'` to HOMEPAGE_CACHE_TAGS
2. Creating `src/lib/homepage-cached-queries.ts` with 19 cached functions
3. Replacing inline queries in `page.tsx` with cached function calls
4. Updating `site-stats.ts` to use cached queries
5. Validation gate (tsc + lint + tests + build + runtime + cache verification)
