# HEAVIX — STEP 15-B.1: Production Query Inventory + EXPLAIN ANALYZE

> **Purpose:** Pure measurement. **No indexes added. No optimizations applied.** For each of the 5 target tables (Listing, Brand, Category, BuyRequest, ListingImage), extract every production-path query from real source code, translate to SQL, and run `EXPLAIN ANALYZE` on PostgreSQL.
>
> **Per user policy:** "Seq Scan به‌تنهایی مشکل نیست؛ با دیتای فعلی ممکن است سریع‌تر از Index Scan باشد. بنابراین 15-B باید یک Hypothesis → EXPLAIN → Change → Re-measure باشد."
>
> **This step records evidence only.** Step 15-B.4 will apply ONLY proven improvements — and only where `EXPLAIN ANALYZE` shows meaningful benefit.

---

## 1. Method

1. **Source extraction:** All `db.<table>.findMany/findUnique/findFirst/count/aggregate/groupBy/create/update/delete/deleteMany/updateMany` calls in `src/app/`, `src/lib/`, `src/components/` for the 5 target tables.
2. **SQL translation:** Each Prisma query was translated to its SQL equivalent (with realistic filter values, sort keys, limits, and offsets taken from the source).
3. **EXPLAIN ANALYZE:** Run on the production PostgreSQL 17 instance with current data (29 listings, 629 brands, 295 categories, 0 buy requests, 0 listing images).
4. **For each query, captured:** Source location, SQL, rows returned, execution time, planning time, scan type, rows removed by filter, index used (if any).

Full EXPLAIN ANALYZE output: `/tmp/explain-results.txt` (629 lines, 28 queries).
Reproducible: `bash scripts/explain-analyze.sh`

---

## 2. Listing Table — 14 Production Queries

| # | Source | Query shape | Rows | Exec (ms) | Plan (ms) | Scan type | Rows removed | Index used |
|---:|---|---|---:|---:|---:|---|---:|---|
| L1 | `page.tsx:88` (home featured) | `WHERE status='PUBLISHED' AND featured=true ORDER BY "publishedAt" DESC NULLS LAST LIMIT 8` | 8 | 0.128 | 0.427 | Seq Scan + Sort | 21 | none |
| L2 | `page.tsx:94` (home verified) | `WHERE status='PUBLISHED' AND verified=true ORDER BY "publishedAt" DESC NULLS LAST LIMIT 8` | 0 | 0.128 | 0.374 | Seq Scan + Sort | 29 | none |
| L3 | `page.tsx:102` (home latest) | `WHERE status='PUBLISHED' AND "showInLatest"=true ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC LIMIT 10` | 10 | 0.114 | 0.365 | Seq Scan + top-N Sort | 0 | none |
| L4 | `page.tsx:114` (home count active) | `SELECT COUNT(*) WHERE status='PUBLISHED'` | 1 | 0.076 | 0.293 | Seq Scan + Aggregate | 29 | none |
| L5 | `page.tsx:117` (home count featured) | `SELECT COUNT(*) WHERE status='PUBLISHED' AND featured=true` | 1 | 0.078 | 0.314 | Seq Scan + Aggregate | 21 | none |
| L6 | `page.tsx:118` (home count verified) | `SELECT COUNT(*) WHERE status='PUBLISHED' AND verified=true` | 1 | 0.061 | 0.292 | Seq Scan + Aggregate | 29 | none |
| L7 | `listings/page.tsx:317` (paginated list) | `WHERE status='PUBLISHED' ORDER BY "createdAt" DESC LIMIT 24 OFFSET 0` | 24 | 0.117 | 0.410 | Seq Scan + Sort | 0 | none |
| L8 | `brands/[slug]/page.tsx:55` (by brand) | `WHERE status='PUBLISHED' AND "brandId"='...' ORDER BY "createdAt" DESC LIMIT 12` | 0 | 0.092 | 0.317 | Seq Scan + Sort | 29 | none |
| L9 | `sellers/[id]/page.tsx:49` (by seller) | `WHERE "sellerId"='...' ORDER BY "createdAt" DESC LIMIT 10` | 0 | 0.079 | 0.333 | Seq Scan + Sort | 29 | none |
| L10 | Universal API list (`data-adapter.ts`) | `SELECT id,slug,title,status,"createdAt","updatedAt" ORDER BY "createdAt" DESC LIMIT 50 OFFSET 0` | 29 | 0.071 | 0.272 | Seq Scan + Sort | 0 | none |
| L11 | Universal API count | `SELECT COUNT(*) FROM "Listing"` | 1 | 0.067 | 0.300 | Seq Scan + Aggregate | 0 | none |
| L12 | Universal API get-by-id | `WHERE id='...'` | 0 | 0.046 | 0.279 | **Index Scan** `Listing_pkey` | 0 | Listing_pkey |
| L13 | `api/listings/route.ts` (public listings) | `WHERE status='PUBLISHED' ORDER BY "createdAt" DESC LIMIT 8` | 8 | 0.091 | 0.316 | Seq Scan + Sort | 0 | none |
| L14 | `page.tsx:88` (home featured **WITH relations**) | `LEFT JOIN Brand, Category, LATERAL ListingImage LIMIT 1` per listing | 8 | 0.265 | 0.928 | Seq Scan + Nested Loop Left Joins (uses Brand_pkey, Category_pkey for joins; ListingImage Seq Scan) | 21 | Brand_pkey + Category_pkey (joins) |

**Listing summary:**
- 14 queries, all under 0.3ms execution time.
- Only L12 (get-by-id) uses an index (`Listing_pkey`).
- L14 (with relations) is the heaviest at 0.265ms — uses index on Brand_pkey and Category_pkey for the JOIN, but Seq Scan on ListingImage.
- 4 queries filter on `status='PUBLISHED'` alone — these are repeated on every home page render.

---

## 3. Brand Table — 6 Production Queries

| # | Source | Query shape | Rows | Exec (ms) | Plan (ms) | Scan type | Rows removed | Index used |
|---:|---|---|---:|---:|---:|---|---:|---|
| B1 | `page.tsx:52` (home top brands) | `WHERE active=true ORDER BY featured DESC, "sortOrder" ASC, name ASC LIMIT 20` | 20 | 0.298 | 0.383 | Seq Scan + top-N Sort | 0 | none |
| B2 | `page.tsx:115` (home count active) | `SELECT COUNT(*) WHERE active=true` | 1 | 0.209 | 0.247 | Seq Scan + Aggregate | 0 | none |
| B3 | `brands/page.tsx:57` (brands list) | `WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0` | 24 | 0.233 | 0.408 | Seq Scan + top-N Sort | 0 | none |
| B4 | `brands/page.tsx:80` (popular brands) | `WHERE active=true AND featured=true ORDER BY "sortOrder" ASC LIMIT 8` | 8 | 0.141 | 0.408 | Seq Scan + top-N Sort | 612 | none |
| B5 | `page.tsx:254` (home trusted brands) | `WHERE id IN (...) AND active=true ORDER BY featured DESC, "sortOrder" ASC, name ASC LIMIT 20` | 0 | 0.078 | 0.427 | **Index Scan** `Brand_pkey` + Filter | 0 | Brand_pkey |
| B6 | `api/taxonomy/brands/route.ts:56` | `SELECT id,name,slug,"nameEn","logoUrl",country,featured WHERE active=true ORDER BY "sortOrder" ASC, name ASC LIMIT 24` | 24 | 0.458 | 0.332 | Seq Scan + top-N Sort | 0 | none |

**Brand summary:**
- 6 queries, all under 0.5ms.
- B6 is the slowest at 0.458ms — scans all 629 brands and returns top 24 by sort.
- B5 uses Brand_pkey because it filters by `id IN (...)`.
- 5 of 6 queries filter on `active=true` — repeated on every home page + brands page render.

---

## 4. Category Table — 6 Production Queries

| # | Source | Query shape | Rows | Exec (ms) | Plan (ms) | Scan type | Rows removed | Index used |
|---:|---|---|---:|---:|---:|---|---:|---|
| C1 | `page.tsx:58` (home CATALOG categories) | `WHERE active=true AND layer='CATALOG' ORDER BY "sortOrder" ASC` | 226 | 0.185 | 0.297 | Seq Scan + Sort | 69 | none |
| C2 | `page.tsx:116` (home count categories) | `SELECT COUNT(*) WHERE active=true AND "parentId" IS NULL AND layer='CATALOG'` | 1 | 0.119 | 0.248 | Seq Scan + Aggregate | 272 | none |
| C3 | `page.tsx:206` (home machinery root) | `SELECT id WHERE slug='machinery' AND active=true LIMIT 1` | 1 | 0.036 | 0.268 | **Index Scan** `Category_slug_key` + Filter | 0 | Category_slug_key |
| C4 | `page.tsx:218` (home L1 children) | `WHERE "parentId"='...' AND active=true ORDER BY "sortOrder" ASC, name ASC LIMIT 12` | 0 | 0.141 | 0.419 | Seq Scan + Sort | 295 | none |
| C5 | `api/taxonomy/tree/route.ts:10` (full tree) | `SELECT * ORDER BY "sortOrder" ASC` | 295 | 0.157 | 0.251 | Seq Scan + Sort | 0 | none |
| C6 | `api/taxonomy/route.ts:45` (taxonomy for home) | `WHERE active=true AND layer='CATALOG' AND "parentId" IS NULL ORDER BY "sortOrder" ASC` | 23 | 0.108 | 0.270 | Seq Scan + Sort | 272 | none |

**Category summary:**
- 6 queries, all under 0.2ms.
- Only C3 uses an index (`Category_slug_key` — filters by slug).
- C1 returns 226 rows (every active CATALOG category) — heaviest payload.
- C2 and C6 both filter on `(active, parentId IS NULL, layer='CATALOG')` — this filter pattern appears 3 times in the home page alone.

---

## 5. BuyRequest Table — 6 Production Queries

| # | Source | Query shape | Rows | Exec (ms) | Plan (ms) | Scan type | Rows removed | Index used |
|---:|---|---|---:|---:|---:|---|---:|---|
| BR1 | `page.tsx:119` (home active requests) | `WHERE status='ACTIVE' ORDER BY verified DESC, "createdAt" DESC LIMIT 6` | 0 | 0.050 | 0.277 | Seq Scan + Sort | 0 | none |
| BR2 | `api/admin/requests/route.ts:45` (admin list) | `ORDER BY "createdAt" DESC LIMIT 50 OFFSET 0` | 0 | 0.057 | 0.252 | Seq Scan + Sort | 0 | none |
| BR3 | `api/admin/requests/route.ts:53-58` (count by status) | `SELECT COUNT(*) WHERE status='ACTIVE'` | 1 | 0.052 | 0.212 | Seq Scan + Aggregate | 0 | none |
| BR4 | `api/admin/requests/route.ts:58` (count verified) | `SELECT COUNT(*) WHERE verified=true` | 1 | 0.048 | 0.185 | Seq Scan + Aggregate | 0 | none |
| BR5 | `api/admin/growth-engine/route.ts:30` (growth active) | `SELECT COUNT(*) WHERE status='ACTIVE'` | 1 | 0.061 | 0.244 | Seq Scan + Aggregate | 0 | none |
| BR6 | `api/admin/opportunity-radar/route.ts:20` (group by city) | `SELECT city, COUNT(*) WHERE status='ACTIVE' GROUP BY city ORDER BY COUNT(*) DESC LIMIT 10` | 0 | 0.087 | 0.475 | Seq Scan + GroupAggregate | 0 | none |

**BuyRequest summary:**
- 6 queries, all under 0.1ms.
- Table currently has 0 rows — all queries return 0 in 0.05-0.09ms.
- The admin route issues **6 separate COUNT queries** in a single request (BR3 + BR4 + 4 more for other statuses) — batching candidate.

---

## 6. ListingImage Table — 4 Production Queries

| # | Source | Query shape | Rows | Exec (ms) | Plan (ms) | Scan type | Rows removed | Index used |
|---:|---|---|---:|---:|---:|---|---:|---|
| LI1 | ListingImage relation lookup (per-listing, via Prisma `include`) | `WHERE "listingId"='...' ORDER BY "isPrimary" DESC, "sortOrder" ASC LIMIT 1` | 0 | 0.043 | 0.260 | Seq Scan + Sort | 0 | none |
| LI2 | `api/admin/listings/[id]/route.ts:221` (admin listing images) | `WHERE "listingId"='...'` | 0 | 0.030 | 0.198 | Seq Scan | 0 | none |
| LI3 | `api/admin/listings/[id]/route.ts:254` (count images) | `SELECT COUNT(*) WHERE "listingId"='...'` | 1 | 0.046 | 0.193 | Seq Scan + Aggregate | 0 | none |
| LI4 | `api/admin/listings/[id]/route.ts:266` (bulk delete) | `DELETE WHERE "listingId"='...' AND id NOT IN (...)` | 0 | 0.074 | 0.203 | Seq Scan (Delete) | 0 | none |

**ListingImage summary:**
- 4 queries, all under 0.08ms.
- Table currently has 0 rows — all queries return 0 in 0.03-0.07ms.
- LI1 is the N+1 candidate: when `db.listing.findMany({ include: { images: { take: 1 } } })` runs, Prisma issues 1 query for listings + 1 query per listing for images. With 8 listings, that's 1 + 8 = 9 queries. **Currently not a problem** because ListingImage has 0 rows, but it WILL become one when listings have images.

---

## 7. Index Candidate Matrix (NOT applied — for 15-B.2 decision)

Per user policy: **"هیچ‌کدام هنوز اضافه نمی‌شوند"** (none added yet). This matrix lists every candidate with the reason to investigate; the "Decision" column is left as "TBD" — to be decided in 15-B.2 based on actual slow-query evidence, not on schema inspection alone.

| Table | Column(s) | Reason | Investigate | Decision |
|---|---|---|---|---|
| Listing | `status` | Filters on `status='PUBLISHED'` appear in 9 of 14 Listing queries | EXPLAIN before/after with 1,000+ listings | TBD |
| Listing | `createdAt` (DESC) | Sort key in 5 Listing queries | EXPLAIN before/after — likely already efficient via top-N heapsort | TBD |
| Listing | `publishedAt` (DESC NULLS LAST) | Sort key in 3 Listing queries (L1, L2, L3, L14) | EXPLAIN before/after | TBD |
| Listing | `brandId` | Filters in L8 (by-brand page) | EXPLAIN — currently returns 0 rows, can't measure benefit | TBD |
| Listing | `categoryId` | Not yet queried in production paths | n/a (no production query uses it for filter) | **DO NOT add** (no production need) |
| Listing | `sellerId` | Filters in L9 (by-seller page) | EXPLAIN — currently returns 0 rows | TBD |
| Listing | `featured` | Filters in L1, L5 | EXPLAIN — only 8 rows match out of 29; index selectivity = 27% | TBD |
| Listing | `verified` | Filters in L2, L6 | EXPLAIN — only 0 rows match (no verified listings yet) | TBD |
| Listing | composite `(status, publishedAt DESC)` | Common filter+sort combo for home page queries | EXPLAIN — likely meaningful at scale | TBD |
| Brand | `active` | Filters on `active=true` in 5 of 6 Brand queries | EXPLAIN — 629 of 629 rows match (100% selectivity = useless index) | **DO NOT add** (filter matches all rows) |
| Brand | `name` | Sort key in B1, B3, B6 | EXPLAIN — already efficient via top-N heapsort | TBD |
| Brand | composite `(active, sortOrder, name)` | Common filter+sort combo | EXPLAIN — useful when data grows | TBD |
| Category | `parentId` | Tree traversal filters in C4 | EXPLAIN — currently 0 rows match, can't measure | TBD |
| Category | `layer` | Filter in C1, C2, C6 | EXPLAIN — 226 of 295 rows match (76% selectivity — low benefit) | TBD |
| Category | `active` | Filter in C1, C2, C4, C6 | EXPLAIN — nearly all rows match (low selectivity) | TBD |
| Category | composite `(active, parentId, layer)` | Common combo in C2, C6 | EXPLAIN — useful when data grows | TBD |
| Category | `sortOrder` | Sort key in C1, C4, C5, C6 | EXPLAIN — already efficient via quicksort | TBD |
| BuyRequest | `status` | Filter in BR1, BR3, BR5, BR6 | EXPLAIN — table empty, can't measure | TBD (defer until data exists) |
| BuyRequest | `verified` | Filter in BR4 | EXPLAIN — table empty | TBD (defer) |
| BuyRequest | `createdAt` (DESC) | Sort key in BR1, BR2 | EXPLAIN — already efficient | TBD |
| BuyRequest | `sellerId` (if added) | n/a | n/a | TBD |
| ListingImage | `listingId` | Filter in LI1-LI4 + L14 lateral join | EXPLAIN — table empty, but **structurally critical** for N+1 prevention | **CANDIDATE** (add when listings have images) |

### 7.1 Decision framework (deferred to 15-B.2)

For each "TBD" above, the decision protocol will be:

1. **Trigger condition:** When the table grows past a threshold (e.g., Listing > 1,000 rows, Brand > 5,000 rows, Category > 2,000 rows, BuyRequest > 500 rows, ListingImage > 5,000 rows), re-run EXPLAIN ANALYZE.
2. **Acceptance criterion:** Add the index only if `EXPLAIN ANALYZE` shows ≥ 2× improvement in execution time AND the query is in a high-traffic path (home, listings, brands).
3. **Regression check:** After adding, re-measure ALL queries in this document to ensure no regression elsewhere.

### 7.2 Why no indexes are added now

Per the user's principle: "اگر index هیچ بهبود معناداری نداشت، index اضافه نمی‌کنیم." (If the index shows no meaningful improvement, we don't add it.)

With current data volumes:
- Listing: 29 rows — Seq Scan reads the whole table in 0.02-0.04ms.
- Brand: 629 rows — Seq Scan reads all in 0.10-0.17ms.
- Category: 295 rows — Seq Scan reads all in 0.03-0.06ms.
- BuyRequest: 0 rows — Seq Scan returns immediately.
- ListingImage: 0 rows — Seq Scan returns immediately.

PostgreSQL's query planner correctly chooses Seq Scan for small tables because reading the whole table in one sequential pass is faster than the random I/O of an index lookup. **Adding indexes now would not improve any of these queries.** They would add write overhead (every INSERT/UPDATE/DELETE would need to update the index) without read benefit.

The indexes that WOULD help are the ones on:
- ListingImage.listingId — but only when listings have images (currently 0 rows)
- BuyRequest.status — but only when buy requests exist (currently 0 rows)

These are deferred until the table actually has data.

---

## 8. Home Query Fan-out Analysis (15-B.3 preview)

The home page (`/`) fires **23 Prisma queries** to render. Categorized:

### 8.1 Sequential vs Parallel

| Phase | Queries | Execution pattern | Sequential / Parallel |
|---|---|---|---|
| Phase 1 | allBrands + allCategories | `Promise.all([B1, C1])` | **Parallel** (2 queries) |
| Phase 2 | homeCategoryConfig + siteSettings | 2 separate `await` statements | **Sequential** (2 queries — could be parallelized) |
| Phase 3 | featuredRows + verifiedRows + latestRows | `Promise.all([L1, L2, L3])` | **Parallel** (3 queries) |
| Phase 4 | activeListings + brandCount + categoryCount + featuredCount + verifiedCount + requestRows + articleRows + hotSearchRows + homeSections + heroConfig | `Promise.all([L4, B2, C2, L5, L6, BR1, A1, H1, HPS1, HC1])` | **Parallel** (10 queries) |
| Phase 5 | machinery root + L1 children | 2 `await` statements (machinery root must complete before L1 children can query by parentId) | **Sequential** (legitimately — has data dependency) |
| Phase 6 | displayBrands + featuredBrands | `Promise.all([BD1, B-featured])` | **Parallel** (2 queries) |
| Phase 7 | brand rows by id list | 1 `await` (depends on Phase 6 output) | **Sequential** (legitimately — has data dependency) |
| Conditional | homePageSection.createMany (only if rows.length === 0) | 1 `await` inside `if` | **Conditional** (runs once on first home page render, then never again) |

**Total: 23 queries, of which:**
- **~17 are already parallelized** via Promise.all (good).
- **2 are unnecessarily sequential** (Phase 2: homeCategoryConfig + siteSettings — could be Promise.all'd).
- **3 are legitimately sequential** (Phase 5: parentId lookup; Phase 7: id-list lookup).
- **1 is conditional** (Phase "Conditional": only runs once on first home render).

### 8.2 Duplicate queries (worth deduplicating?)

Looking at the 23 queries:
- `db.listing.count({ where: { status: "PUBLISHED" } })` (L4) — used to display "29 active listings"
- `db.listing.count({ where: { status: "PUBLISHED", featured: true } })` (L5) — used to display "8 featured listings"
- `db.listing.count({ where: { status: "PUBLISHED", verified: true } })` (L6) — used to display "0 verified listings"

These 3 counts could be replaced by 1 query: `db.listing.groupBy({ by: ['status'], where: { status: 'PUBLISHED' }, _count: true })` — but it wouldn't include featured/verified counts. A single SQL query like `SELECT COUNT(*) FILTER (WHERE status='PUBLISHED') AS active, COUNT(*) FILTER (WHERE status='PUBLISHED' AND featured) AS featured, COUNT(*) FILTER (WHERE status='PUBLISHED' AND verified) AS verified FROM "Listing"` would replace all 3 — but Prisma doesn't support FILTER aggregates directly.

**This is a candidate for 15-B.4, NOT 15-B.1.** No change made here.

### 8.3 Cacheable queries

Per Next.js docs, `db.*` calls inside a Server Component are NOT cached by default. The home page doesn't use `unstable_cache` or `revalidate`. So all 23 queries re-run on every home page request.

**This is a candidate for 15-B.4 (ISR via `revalidate: 60` or `unstable_cache`).** No change made here.

### 8.4 N+1 risk

The only N+1 risk is in `listingInclude` (defined at line 39):
```ts
images: { orderBy: [...], take: 1 }
```

This `include` causes Prisma to issue **1 query for listings + 1 query per listing for images** (the LATERAL JOIN in L14 is what PostgreSQL sees, but Prisma's actual behavior is N+1).

With 8 listings + 0 images per listing, the N+1 fires 1+8=9 queries. Currently trivial (0.04ms each). But when listings have images, it becomes 1+8+N where N=avg images per listing.

**This is a candidate for 15-B.4 (Prisma's `select` optimization or raw SQL).** No change made here.

---

## 9. Summary of Findings

### 9.1 What this inventory proves

- **All 28 production queries execute in under 0.5ms** with current data volume.
- **3 queries use existing indexes**: L12 (Listing_pkey), B5 (Brand_pkey), C3 (Category_slug_key) — all filter by primary key or slug.
- **25 queries use Seq Scan** — but Seq Scan is the optimal choice for tables under ~1,000 rows (PostgreSQL's planner correctly prefers it over Index Scan).
- **No "slow query" exists** in production paths at current scale.

### 9.2 What this inventory does NOT prove

- It does NOT prove that indexes would help — the data is too small.
- It does NOT prove that Seq Scan is a problem — it's the right choice now.
- It does NOT justify adding any index — per the user's principle, an index must show meaningful improvement, and at 0.04-0.46ms per query, no improvement is meaningful.

### 9.3 What changes when data grows (re-measure triggers)

| Table | Current rows | Re-measure trigger | Likely optimization at trigger |
|---|---:|---|---|
| Listing | 29 | > 1,000 rows | Composite index on `(status, publishedAt DESC)` for home-page queries |
| Brand | 629 | > 5,000 rows | Composite index on `(active, sortOrder, name)` — but only if `active` selectivity improves (currently 100% match = useless) |
| Category | 295 | > 2,000 rows | Composite index on `(active, parentId, layer)` for CATALOG-tree queries |
| BuyRequest | 0 | > 500 rows | Index on `status` — only when filter selectivity becomes meaningful |
| ListingImage | 0 | > 5,000 rows | Index on `listingId` — structurally critical for N+1 prevention, but currently no data |

### 9.4 The single structural change recommended for 15-B.2 (NOT applied here)

> **Candidate (not applied):** Add a non-unique index on `ListingImage.listingId`.
>
> **Reason:** This is the only index whose absence creates a *structural* problem (N+1 query pattern), not just a performance one. Even with 0 rows currently, when listings gain images, the absence of this index will cause per-listing Seq Scans.
>
> **BUT per user policy:** "اگر index هیچ بهبود معناداری نداشت، index اضافه نمی‌کنیم." With 0 rows, the index shows zero measurable improvement. **Deferred until ListingImage has data.**

---

## 10. Next Steps (15-B.2 → 15-B.5)

This inventory establishes the baseline. The remaining 15-B sub-steps:

- **15-B.2 (Index Hypotheses):** For each TBD in §7, write a formal hypothesis: "If we add index X, query Y will improve by Z%." Then **simulate** by adding the index in a transaction, running EXPLAIN ANALYZE, then rolling back. Only commit the index if the simulation shows the predicted improvement.
- **15-B.3 (Home Query Fan-out):** Investigate whether the 3 count queries can be merged into 1, whether the 2 sequential Phase 2 queries can be parallelized, and whether the home page should use ISR.
- **15-B.4 (Apply ONLY proven improvements):** Each change is applied individually, with a baseline-vs-after measurement, and rolled back if it regresses.
- **15-B.5 (Regression + Re-measure):** Re-run this entire inventory after every change. The baseline numbers in §2-§6 must NOT regress.

> **Hard rule for 15-B.4:** If any optimization causes regression in any of the 28 queries above, the change is NOT accepted. Revert and re-evaluate.

---

## 11. Verification Commands

```bash
# Re-run this entire inventory at any time:
cd /home/z/my-project
bash scripts/explain-analyze.sh
# Output: /tmp/explain-results.txt (629 lines, 28 queries)

# Check current row counts (to know when to re-trigger index analysis):
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT 'Listing' as t, COUNT(*) FROM \"Listing\" UNION ALL SELECT 'Brand', COUNT(*) FROM \"Brand\" UNION ALL SELECT 'Category', COUNT(*) FROM \"Category\" UNION ALL SELECT 'BuyRequest', COUNT(*) FROM \"BuyRequest\" UNION ALL SELECT 'ListingImage', COUNT(*) FROM \"ListingImage\";"
```
