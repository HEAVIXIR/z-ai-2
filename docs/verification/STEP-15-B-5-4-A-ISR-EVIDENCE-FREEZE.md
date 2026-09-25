# HEAVIX — STEP 15-B.5.4-A: ISR Evidence Freeze

> **Purpose:** Before applying any ISR/cache, extract ALL Homepage data queries, ALL mutation routes that affect Homepage data, existing revalidation paths, and shared dependencies. **NO CODE CHANGES** — this is pure evidence extraction.
>
> **Per user policy:**
> - "قبل از اعمال ISR/Cache نباید مستقیماً revalidate و revalidateTag را وارد کد کنیم. ابتدا باید Evidence Freeze طراحی ISR و ماتریس دقیق Mutation → Tag → Path → TTL را استخراج کنیم"
> - "ISR اگر بدون پوشش کامل invalidation اجرا شود، می‌تواند دادهٔ قدیمی را به کاربر نشان دهد"
>
> **Status:** FROZEN at git commit `f907da5` (STEP 15-B.5.3 head).

---

## 1. Homepage Prisma Queries (35 total)

### 1.1 Direct queries in `src/app/page.tsx` (24 queries)

| ID | Line | Prisma operation | Table | Data category | Tier (from 15-B.4.5) |
|---|---:|---|---|---|---|
| Q1 | 52 | `db.brand.findMany({ active, take 20, include _count.listings })` | Brand | Brands | 2 (semi-dynamic) |
| Q2 | 58 | `db.category.findMany({ active, CATALOG, include _count.listings })` | Category | Taxonomy | 2 |
| Q3 | 78 | `db.homeCategoryConfig.findUnique({ id: "main" })` | HomeCategoryConfig | Config | 1 (nearly-constant) |
| Q4 | 79 | `db.siteSettings.findUnique({ id: "main" })` | SiteSettings | Config | 1 |
| Q5 | 93 | `db.listing.findMany({ PUBLISHED, featured, take 8 })` | Listing | Listings | 3 (real-time) |
| Q6 | 99 | `db.listing.findMany({ verifiedOnlyFlag ? verified : PUBLISHED, take 8 })` | Listing | Listings | 3 |
| Q7 | 107 | `db.listing.findMany({ PUBLISHED, showInLatest, take 10 })` | Listing | Listings | 3 |
| Q8 | 119 | `db.listing.count({ PUBLISHED })` | Listing | Stats | 2 |
| Q9 | 120 | `db.brand.count({ active })` | Brand | Stats | 2 |
| Q10 | 121 | `db.category.count({ active, parentId null, CATALOG })` | Category | Stats | 2 |
| Q11 | 122 | `db.listing.count({ PUBLISHED, featured })` | Listing | Stats | 2 |
| Q12 | 123 | `db.listing.count({ PUBLISHED, verified })` | Listing | Stats | 2 (DEAD CODE) |
| Q13 | 124 | `db.buyRequest.findMany({ ACTIVE, take 6 })` | BuyRequest | Requests | 2 |
| Q14 | 129 | `db.article.findMany({ PUBLISHED, take 4 })` | Article | Content | 1 |
| Q15 | 135 | `db.hotSearch.findMany({ active, take 9 })` | HotSearch | Content | 1 |
| Q16 | 141 | `db.homePageSection.findMany({ active })` | HomePageSection | Config | 1 |
| Q17 | 203 | `db.heroConfig.findUnique({ id: "main" })` | HeroConfig | Config | 1 |
| Q18 | 211 | `db.category.findFirst({ slug: "machinery", active })` | Category | Taxonomy | 2 |
| Q19 | 223 | `db.category.findMany({ parentId: machinery.id, active, take 12 })` | Category | Taxonomy | 2 |
| Q20a | 245 | `db.brandDisplay.findMany({ showOnHomepage })` | BrandDisplay | Config | 1 |
| Q20b | 249 | `db.brand.findMany({ featured, active, select id })` | Brand | Brands | 2 |
| Q20c | 259 | `db.brand.findMany({ id IN [...], active, take 20 })` | Brand | Brands | 2 |
| Q27 | 407 | `db.listing.findMany({ id IN heroCardIds, PUBLISHED })` (conditional) | Listing | Listings | 3 |

### 1.2 Indirect queries via `getActiveStats()` in `src/lib/site-stats.ts` (11 queries)

| ID | Line | Prisma operation | Table | Data category | Tier |
|---|---:|---|---|---|---|
| Q20d | 112 | `db.siteStat.findMany({ active })` | SiteStat | Config | 1 |
| Q23 | 64 | `db.category.count({ parentId null, active })` | Category | Stats | 2 |
| Q24 | 66 | `db.brand.count({ active })` | Brand | Stats | 2 (eliminated in 15-B.5.1) |
| Q25 | 69 | `db.listing.count({ PUBLISHED })` | Listing | Stats | 2 (eliminated in 15-B.5.1) |
| Q26 | 71 | `db.province.count()` | Province | Stats | 2 |
| — | 73 | `db.productModel.count()` | ProductModel | Stats | 2 (fires if SiteStat configured) |
| — | 75 | `db.company.count()` | Company | Stats | 2 (fires if configured) |
| — | 77 | `db.user.count()` | User | Stats | 2 (fires if configured) |
| — | 80 | `db.auction.count({ LIVE })` | Auction | Stats | 2 (fires if configured) |
| — | 82 | `db.rFQ.count({ OPEN })` | RFQ | Stats | 2 (fires if configured) |

**Currently configured SiteStat rows:** categories, brands, listings, provinces (4 active rows).
**Queries actually firing via getActiveStats:** Q20d + Q23 + Q26 = 3 queries (Q24/Q25 eliminated by 15-B.5.1 precomputed values).

### 1.3 Total query count per home render

| Source | Count |
|---|---:|
| Direct in page.tsx | 24 (22 firing + 2 conditional skipped) |
| Indirect via getActiveStats | 3 (Q20d + Q23 + Q26; Q24/Q25 eliminated) |
| **Total** | **~25 queries per home render** |

---

## 2. Mutation Routes Affecting Homepage Data (~40 routes across 12 data categories)

### 2.1 Brand mutations (12 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/taxonomy/brands/route.ts` | POST | Q1, Q9, Q20b |
| `src/app/api/taxonomy/brands/[id]/route.ts` | PATCH, DELETE | Q1, Q9, Q20b, Q20c |
| `src/app/api/taxonomy/brands/[id]/categories/route.ts` | POST | Q2 (brand-category links) |
| `src/app/api/taxonomy/brands/[id]/models/route.ts` | POST | (indirect: ProductModel) |
| `src/app/api/brand-families/route.ts` | POST | (indirect) |
| `src/app/api/brand-families/[id]/route.ts` | PATCH, DELETE | (indirect) |
| `src/app/api/admin/brands-ai/route.ts` | POST | Q1, Q9 |
| `src/app/api/admin/brands/[id]/search-logo/route.ts` | POST | Q1 (logoUrl) |
| `src/app/api/admin/brands/[id]/logo/route.ts` | PATCH | Q1 (logoUrl) |
| `src/app/api/admin/store/brands/[id]/route.ts` | PATCH, DELETE | Q1, Q9 |
| `src/app/api/admin/store/brands/route.ts` | POST | Q1, Q9 |
| `src/app/api/admin/home/trusted-brands/route.ts` | POST, PATCH | Q20a (BrandDisplay) |

### 2.2 Category mutations (8 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/taxonomy/categories/route.ts` | POST | Q2, Q10, Q18, Q19, Q23 |
| `src/app/api/taxonomy/categories/[id]/route.ts` | PATCH, DELETE | Q2, Q10, Q18, Q19, Q23 |
| `src/app/api/taxonomy/brands/[id]/categories/route.ts` | POST | Q2 (brand-category links) |
| `src/app/api/attributes/[id]/categories/route.ts` | POST | Q2 |
| `src/app/api/admin/store/categories/[id]/route.ts` | PATCH, DELETE | Q2, Q10 |
| `src/app/api/admin/store/categories/route.ts` | POST | Q2, Q10 |
| `src/app/api/admin/categories/[id]/generate-image/route.ts` | POST | Q2 (imageUrl) |
| `src/app/api/admin/home/categories/route.ts` | POST, PATCH | Q3 (HomeCategoryConfig) |

### 2.3 Listing mutations (7 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/listings/route.ts` | POST | Q5-Q8, Q11, Q12, Q27 |
| `src/app/api/listings/[id]/route.ts` | PATCH, DELETE | Q5-Q8, Q11, Q12, Q27 |
| `src/app/api/listings/[id]/attributes/route.ts` | POST, PATCH | Q5-Q7 (attribute display) |
| `src/app/api/admin/listings/[id]/route.ts` | PATCH | Q5-Q8, Q11, Q12, Q27 |
| `src/app/api/admin/listings/route.ts` | POST | Q5-Q8, Q11, Q12, Q27 |
| `src/app/api/admin/listings/[id]/reject/route.ts` | POST | Q5-Q7 (status change) |
| `src/app/api/ai-listing-builder/route.ts` | POST | Q5-Q8, Q11, Q12 |

### 2.4 Settings mutations (1 route)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/site-settings/route.ts` | PATCH | Q4 (verifiedOnlyFlag, logo, footer, etc.) |

### 2.5 HomePageSection mutations (1 route, 4 home API routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/homepage-sections/route.ts` | POST, PATCH, DELETE | Q16 (section ordering/visibility) |
| `src/app/api/admin/home/categories/route.ts` | POST, PATCH | Q3 (HomeCategoryConfig) |
| `src/app/api/admin/home/verified-machines/route.ts` | POST, PATCH | (admin config for verified section) |
| `src/app/api/admin/home/trusted-brands/route.ts` | POST, PATCH | Q20a (BrandDisplay) |

### 2.6 HeroConfig mutations (1 route)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/hero/route.ts` | POST, PATCH | Q17 (heroConfig) + Q27 (hero card listing IDs) |

### 2.7 BuyRequest mutations (4 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/requests/route.ts` | POST | Q13 |
| `src/app/api/requests/[id]/route.ts` | PATCH, DELETE | Q13 |
| `src/app/api/requests/[id]/matches/route.ts` | GET (no mutation) | — |
| `src/app/api/admin/requests/[id]/route.ts` | PATCH, DELETE | Q13 |

### 2.8 Article mutations (4 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/articles/route.ts` | POST | Q14 |
| `src/app/api/admin/articles/[id]/route.ts` | PATCH, DELETE | Q14 |
| `src/app/api/admin/knowledge/generate-article/route.ts` | POST | Q14 |
| `src/app/api/articles/[slug]/route.ts` | PATCH, DELETE | Q14 |

### 2.9 HotSearch mutations (4 routes)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/hot-searches/route.ts` | POST | Q15 |
| `src/app/api/admin/hot-searches/[id]/route.ts` | PATCH, DELETE | Q15 |

### 2.10 Universal Resource API (covers all 18 registered resources)

| Route | Methods | Affects |
|---|---|---|
| `src/app/api/admin/resources/[resource]/route.ts` | POST | ANY resource (listing, brand, user, etc.) |
| `src/app/api/admin/resources/[resource]/[id]/route.ts` | PATCH, DELETE | ANY resource |

**CRITICAL:** The Universal Resource API is a single route that handles mutations for ALL 18 registered resources. It currently has NO `revalidatePath`/`revalidateTag` calls. This is the BIGGEST gap — any resource mutation via the Universal API bypasses all cache invalidation.

### 2.11 SiteStat mutations

No dedicated route — mutations likely go through the Universal Resource API (`/api/admin/resources/site-stats` or similar). Affects Q20d + Q23 + Q24.

### 2.12 Province mutations

Rare — no dedicated route visible. Affects Q24 only.

### 2.13 BrandDisplay mutations

Handled via `src/app/api/admin/home/trusted-brands/route.ts` (already listed in 2.5). Affects Q20a.

---

## 3. Existing Revalidation Paths

### 3.1 What EXISTS today

| Route | Revalidation calls | Target |
|---|---|---|
| `/api/admin/pages/[id]/publish/route.ts` | `revalidatePath('/${page.slug}')` + `revalidatePath('/')` + `revalidatePath('/admin/pages/${pageId}')` | Page Builder publish |
| `/api/admin/pages/[id]/rollback/route.ts` | same 3 calls | Page Builder rollback |

### 3.2 What does NOT exist

| Gap | Routes affected |
|---|---|
| NO `revalidateTag` calls anywhere | — |
| NO `revalidatePath` in brand mutation routes | 12 routes |
| NO `revalidatePath` in category mutation routes | 8 routes |
| NO `revalidatePath` in listing mutation routes | 7 routes |
| NO `revalidatePath` in settings mutation route | 1 route |
| NO `revalidatePath` in home section mutation routes | 4 routes |
| NO `revalidatePath` in hero mutation route | 1 route |
| NO `revalidatePath` in buyRequest mutation routes | 4 routes |
| NO `revalidatePath` in article mutation routes | 4 routes |
| NO `revalidatePath` in hotSearch mutation routes | 2 routes |
| NO `revalidatePath` in Universal Resource API | 2 routes (POST + PATCH/DELETE) |

**Total gap: ~40 mutation routes have NO cache invalidation hooks.**

### 3.3 Current cache settings

| Page | Setting | Effect |
|---|---|---|
| `src/app/page.tsx` | `export const dynamic = "force-dynamic"` | Every request re-renders (NO cache) |
| `src/app/sell-in-7-days/page.tsx` | `export const dynamic = "force-dynamic"` | Every request re-renders |
| `src/app/preview/page/[key]/page.tsx` | `export const dynamic = 'force-dynamic'` | Preview must show latest draft (correct) |

---

## 4. Shared Dependencies Analysis

### 4.1 Mutation → Data category → Homepage query mapping

| Mutation event | Tag (proposed) | Homepage queries affected | Tier | Freshness req |
|---|---|---|---|---|
| **Listing create/update/delete/publish** | `home:listings` | Q5, Q6, Q7, Q8, Q11, Q12, Q27 | 3 | HIGH — must be immediately visible |
| **Brand create/update/delete** | `home:brands` | Q1, Q9, Q20b, Q20c | 2 | MEDIUM — 5min stale OK |
| **Category create/update/delete** | `home:categories` | Q2, Q10, Q18, Q19, Q23 | 2 | LOW — 10min stale OK |
| **SiteSettings update** | `home:settings` | Q4 | 1 | LOW — 1h stale OK |
| **HomePageSection mutation** | `home:sections` | Q16 | 1 | LOW — 1h stale OK |
| **HeroConfig update** | `home:hero` | Q17, Q27 | 1 | LOW — 1h stale OK |
| **HomeCategoryConfig update** | `home:cat-config` | Q3 | 1 | LOW — 1h stale OK |
| **BuyRequest create/update/delete** | `home:requests` | Q13 | 2 | MEDIUM — 1min stale OK |
| **Article create/update/delete** | `home:articles` | Q14 | 1 | LOW — 10min stale OK |
| **HotSearch create/update/delete** | `home:hot-searches` | Q15 | 1 | MEDIUM — 10min stale OK |
| **SiteStat update** | `home:stats` | Q20d, Q23, Q24 | 1 | LOW — 5min stale OK |
| **Province mutation** | `home:stats` | Q24 | 2 | MEDIUM — 1min stale OK |
| **BrandDisplay mutation** | `home:brands` | Q20a | 1 | LOW — 5min stale OK |

### 4.2 Proposed tag taxonomy (granular)

```
home                    — nuclear tag, invalidates ENTIRE homepage cache
home:listings           — Q5, Q6, Q7, Q8, Q11, Q12, Q27 (Tier 3 — real-time)
home:brands             — Q1, Q9, Q20a, Q20b, Q20c (Tier 2 — semi-dynamic)
home:categories         — Q2, Q10, Q18, Q19, Q23 (Tier 2 — semi-dynamic)
home:settings           — Q4 (Tier 1 — nearly-constant)
home:sections            — Q16 (Tier 1)
home:hero               — Q17, Q27 (Tier 1)
home:cat-config         — Q3 (Tier 1)
home:requests           — Q13 (Tier 2)
home:articles           — Q14 (Tier 1)
home:hot-searches       — Q15 (Tier 1)
home:stats              — Q20d, Q23, Q24, Q26 (Tier 1+2)
```

### 4.3 Critical: Tier 3 (listings) must NOT be cached

Per 15-B.4.5 design: Q5, Q6, Q7 (featured/verified/latest listings) have HIGH freshness requirement — users must see new listings immediately. These should NOT be cached. The `revalidate` on the home page must be set to a value that allows OTHER tiers to be cached but re-fetches Tier 3 data.

**This is the core design challenge:** Next.js ISR caches the ENTIRE page output, not individual queries. If `revalidate: 60` is set on the home page, ALL queries (including Tier 3 listings) would be stale by up to 60s. This violates the Tier 3 freshness requirement.

**Possible approaches:**
1. **`revalidate: 0` + `unstable_cache` per query** — cache individual queries with different TTLs
2. **`revalidate: 60` + `revalidateTag('home:listings')` on listing mutations** — accept 60s staleness for listings (requires business approval)
3. **Move Tier 3 to client-side fetching** — server renders cached Tier 1+2, client fetches Tier 3 fresh

This design decision must be resolved in 15-B.5.4-B (Cache Contract) before any implementation.

---

## 5. Sell-in-7-days page (second consumer of getActiveStats)

`src/app/sell-in-7-days/page.tsx:118` also calls `getActiveStats()`. This page is also `force-dynamic`. If ISR is added to the home page, this page's `getActiveStats` call is independent and unaffected (it doesn't pass precomputed values). No invalidation hooks needed for this page unless it also gets ISR.

---

## 6. Summary

| Metric | Value |
|---|---:|
| Total Homepage Prisma queries per render | ~25 |
| Total mutation routes affecting Homepage | ~40 |
| Mutation routes with existing revalidation | 2 (Page Builder publish + rollback only) |
| Mutation routes WITHOUT revalidation | ~38 |
| `revalidateTag` calls in codebase | 0 |
| Pages with `force-dynamic` (no cache) | 3 (home, sell-in-7-days, preview) |
| Data categories (for tag taxonomy) | 12 |
| Proposed cache tags | 12 (granular) + 1 (nuclear `home`) |
| Tier 3 (real-time, NO cache) queries | 3 (Q5, Q6, Q7) |
| Tier 1+2 (cacheable) queries | ~22 |

### 6.1 Critical gap

**If ISR is applied to the home page WITHOUT adding `revalidateTag`/`revalidatePath` hooks to the ~38 mutation routes that lack them, users will see stale data.** Specifically:
- Brand mutations → stale brand data for up to TTL duration
- Category mutations → stale taxonomy for up to TTL
- Listing mutations → stale listings for up to TTL (UNACCEPTABLE for Tier 3)
- Settings mutations → stale settings for up to TTL
- All home section/hero/config mutations → stale layout for up to TTL

### 6.2 Universal Resource API is the biggest gap

The Universal Resource API (`/api/admin/resources/[resource]`) handles mutations for ALL 18 registered resources in a single route handler. It currently has ZERO `revalidatePath`/`revalidateTag` calls. This means ANY resource mutation (listing, brand, user, etc.) via the Universal API bypasses all cache invalidation.

Adding invalidation to the Universal API requires mapping the resource key to the appropriate tag(s):
- `listing` → `revalidateTag('home:listings')`
- `brand` → `revalidateTag('home:brands')`
- `category` → `revalidateTag('home:categories')`
- Other resources → no homepage impact (no invalidation needed)

---

## 7. What This Step Did NOT Do

- ✅ No code changes made (evidence extraction only)
- ✅ No `revalidate` added to any page
- ✅ No `revalidateTag` calls added to any route
- ✅ No `revalidatePath` calls added to any route
- ✅ No `unstable_cache` wrappers added
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved

---

## 8. Next Steps

```
✅ 15-B.5.4-A Evidence Freeze ← COMPLETE (this document)
🔵 15-B.5.4-B Cache Contract (next — define TTL + tag + invalidation per data category)
🔵 15-B.5.4-C Implementation (only after contract approved)
🔵 15-B.5.4-D Freshness Tests (mutate → invalidate → verify fresh)
🔵 15-B.5.4-E Performance Gate (TTFB comparison before/after)
🔵 15-B.5.4-F Final Decision (GREEN/YELLOW/RED)
```

### 8.1 Open design questions for 15-B.5.4-B

1. **Tier 3 handling:** How to cache Tier 1+2 data without caching Tier 3 listings? (3 approaches proposed in §4.3)
2. **Universal API mapping:** How to map resource key → tag in the Universal Resource API?
3. **TTL strategy:** Single `revalidate` value vs per-query `unstable_cache`?
4. **Preview route:** Must remain `force-dynamic` (preview shows latest draft) — how to ensure this?
5. **Sell-in-7-days page:** Also calls `getActiveStats` — should it get ISR too, or stay dynamic?
