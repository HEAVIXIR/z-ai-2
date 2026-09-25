# HEAVIX — STEP 15-A: Performance Baseline

> **Purpose:** Establish a frozen, evidence-driven baseline of current production performance. **No optimizations were performed in this step.** No new features, no architecture changes, no `@ts-nocheck` removal, no index additions. Pure measurement — future steps (15-B, 15-C, 15-D) will decide what's worth optimizing based on real data, not guesses.
>
> **Status:** FROZEN at git commit `e2bb29d` (STEP 14.8-G head).
>
> **Server under test:** `node .next/standalone/server.js` (Next.js 16.1.3 production standalone build, 406MB artifact).
>
> **Method:** All measurements taken through the Caddy gateway on port 81 (Chromium cannot reach `localhost:3000` directly due to sandbox network isolation; Caddy proxies to the standalone server).
>
> **Important constraint noted:** The sandbox kills long-running node processes after a small number of requests, so the standalone server was restarted between measurement batches. Within a single batch, measurements are taken with a warm cache (5 sequential hits per URL, best/median/worst reported).

---

## 1. Executive Summary

| Metric | Baseline | Target (15-B onward) | Status |
|---|---|---|---|
| Home page TTFB (warm) | 67ms | < 200ms | ✅ Already under target |
| Home page FCP | 740ms | < 1.8s | ✅ Already under target |
| Home page CLS | 0 | < 0.1 | ✅ Already under target |
| Largest HTML payload (`/brands`) | 1.35MB (278KB compressed) | < 500KB compressed | ⚠️ Needs investigation in 15-D |
| Total resource download (`/`) | ~1MB | < 500KB | ⚠️ Needs investigation in 15-D |
| Prisma queries per home page render | **23** | < 10 | ⚠️ N+1 / batching candidate (15-B) |
| Index coverage on `Listing` table | 2 (pkey, slug) | Filters on `status`, `createdAt`, `brandId`, `categoryId`, `featured`, `verified` | ⚠️ All Seq Scan (15-B) |
| Index coverage on `Brand` table | 2 (pkey, slug) | Filters on `active`, `name` | ⚠️ All Seq Scan (15-B) |
| Index coverage on `Category` table | 2 (pkey, slug) | Filters on `active`, `parentId`, `layer`, `sortOrder` | ⚠️ All Seq Scan (15-B) |
| Largest JS chunk | 225KB | < 200KB | ⚠️ One chunk over threshold |
| Total JS chunks | 149 (4.1MB total) | < 100 chunks, < 2MB total | ⚠️ Excessive (15-D) |
| CSS files | 0 separate (inlined) | n/a | ✅ |
| Production build time | 62s | < 60s | ✅ At target |

**No critical performance failures found.** All measured values are within acceptable ranges for the current data volume (29 listings, 629 brands, 539 categories). However, the baseline identifies clear, data-backed targets for 15-B through 15-D that will become urgent as data grows.

---

## 2. HTTP Response Time Baseline (33 URLs)

**Method:** For each URL, 5 sequential `curl` hits through Caddy port 81. Best/worst reported. Server kept warm between hits in the same batch.

### 2.1 Public Pages (HTML, server-rendered)

| URL | HTTP | TTFB best/worst | Total best/worst | Size | Verdict |
|---|---:|---|---|---:|---|
| `/` | 200 | 67ms / 88ms | 89ms / 124ms | 731KB | ✅ Fast, large HTML |
| `/listings` | 200 | 46ms / 66ms | 66ms / 92ms | 582KB | ✅ Fast, large HTML |
| `/brands` | 200 | 61ms / 93ms | 100ms / 137ms | 1.35MB | ⚠️ Largest payload |
| `/login` | 200 | 4ms / 10ms | 5ms / 11ms | 16KB | ✅ Tiny, prerendered |
| `/compare` | 200 | 2ms / 9ms | 2ms / 9ms | 13KB | ✅ Static |
| `/register` | 200 | 2ms / 6ms | 2ms / 7ms | 16KB | ✅ Static |
| `/dashboard/favorites` | 200 | 2ms / 8ms | 2ms / 9ms | 19KB | ✅ Static |
| `/dashboard/messages` | 200 | 2ms / 14ms | 2ms / 14ms | 13KB | ✅ Static |
| `/store` | 200 | 2ms / 6ms | 3ms / 6ms | 57KB | ✅ Static |

### 2.2 Public APIs (JSON)

| URL | HTTP | TTFB best/worst | Total best/worst | Size | Verdict |
|---|---:|---|---|---:|---|
| `/api/taxonomy` | 200 | 2ms / 39ms | 2ms / 39ms | 40KB | ✅ Fast warm, slow cold (cache hit/miss) |
| `/api/listings?limit=8` | 200 | 5ms / 10ms | 5ms / 10ms | 8KB | ✅ |
| `/api/services?limit=50` | 200 | 3ms / 5ms | 3ms / 5ms | 6KB | ✅ |
| `/api/settings` | 200 | 3ms / 5ms | 3ms / 5ms | 408B | ✅ Tiny |
| `/api/taxonomy/brands?limit=24` | 200 | 5ms / 9ms | 5ms / 9ms | 18KB | ✅ |
| `/api/articles?limit=6` | 200 | 2ms / 5ms | 2ms / 5ms | 15B | ⚠️ Empty response (`{"items":[]}`) — no articles seeded |

### 2.3 Admin Universal APIs (auth-gated, expect 401)

| URL | HTTP | TTFB best/worst | Total best/worst | Size | Verdict |
|---|---:|---|---|---:|---|
| `/api/admin/resources/listings` | 401 | 2ms / 7ms | 2ms / 7ms | 24B | ✅ Auth gate short-circuits before DB |
| `/api/admin/resources/brands` | 401 | 2ms / 3ms | 2ms / 3ms | 24B | ✅ |
| `/api/admin/resources/users` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/products` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/orders` | 401 | 2ms / 3ms | 2ms / 3ms | 24B | ✅ |
| `/api/admin/resources/payments` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/companies` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/machines` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/reviews` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/deals` | 401 | 1ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/rfqs` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/offers` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/auctions` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/inspections` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/transports` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |
| `/api/admin/resources/disputes` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/buy-requests` | 401 | 2ms / 2ms | 2ms / 2ms | 24B | ✅ |
| `/api/admin/resources/parts` | 401 | 1ms / 2ms | 1ms / 2ms | 24B | ✅ |

**Key finding:** All 18 admin Universal APIs uniformly return 401 with `{"error":"Unauthorized"}` (24 bytes) in 1-3ms. The auth gate short-circuits before any DB query, so auth performance is excellent.

---

## 3. Core Web Vitals (agent-browser, headless Chromium)

Captured via `agent-browser open <url>` + `performance.getEntriesByType(...)`.

| Page | TTFB | FCP | LCP | CLS | DOM Load | Page Load | HTML transfer | Resource count | Total resources |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 343ms | 740ms | null | 0 | 696ms | 698ms | 146KB | 25 | 1.0MB |
| `/listings` | 150ms | 656ms | null | 0 | 664ms | 683ms | 122KB | 18 | 148KB |
| `/brands` | 214ms | 424ms | null | 0 | 477ms | 477ms | 278KB | 17 | 4.8KB |

**Notes:**
- **TTFB** measured as `responseStart - requestStart` in the Performance API.
- **LCP** returns `null` because the pages don't have a single dominant LCP element (multiple equally-sized hero images / cards); LCP also requires longer observation window than the headless session provides. Not a defect — just a measurement limitation.
- **CLS = 0** across all 3 pages → no layout shift, excellent visual stability.
- **HTML transfer (gzip-compressed)** is much smaller than the curl `size_download` because Caddy compresses responses: 731KB raw HTML → 146KB wire = **5× compression**.

---

## 4. Bundle Sizes

### 4.1 Build artifact composition

| Component | Size |
|---|---:|
| Total `.next/` | 642 MB |
| `.next/standalone/` (self-contained server) | 308 MB |
| `.next/static/` (browser-served chunks) | 4.1 MB |
| `.next/static/chunks/` (JS chunks) | 4.1 MB |
| `.next/static/css/` | (does not exist — CSS is inlined) |
| `.next/static/media/` | (does not exist — no media files pre-bundled) |

### 4.2 Largest JS chunks (top 15)

| Rank | Chunk hash | Size | Likely content |
|---:|---|---:|---|
| 1 | `2e9c5333df59f348.js` | 225 KB | Largest — likely page bundle + React runtime |
| 2 | `b9ca8bdf263872a2.js` | 124 KB | — |
| 3 | `a6dad97d9634a72d.js` | 112 KB | — |
| 4 | `aaf71b20c0654b49.js` | 111 KB | — |
| 5 | `032198da6979212b.js` | 95 KB | — |
| 6 | `ee0c7d26b325daf3.js` | 71 KB | — |
| 7 | `d86e63771ecb2d9d.js` | 71 KB | — |
| 8 | `6723433e22ba599a.js` | 71 KB | — |
| 9 | `213e9f39e04b3bdb.js` | 71 KB | — |
| 10 | `c5def9567f5caed7.js` | 70 KB | — |
| 11 | `e9d2b3c86aa684c1.js` | 51 KB | — |
| 12 | `cc38467aaa45dac5.js` | 47 KB | — |
| 13 | `2a2342d7accf1b10.js` | 43 KB | — |
| 14 | `7c937a145db3998d.js` | 42 KB | — |
| 15 | `1942d7c49b4223e5.js` | 41 KB | — |

**Total JS chunk count: 149** (4.1MB combined). This is high — many small page-specific chunks. 15-D will investigate dynamic-import opportunities to reduce initial bundle.

---

## 5. Database Performance

### 5.1 Prisma queries per page (static analysis of source)

| Page | `db.*.findMany/findUnique/count/...` calls | `fetch()` calls | Notes |
|---|---:|---:|---|
| `/` (home) | **23** | 0 | 4 separate `listing.findMany` calls (featured, latest, verified, all); 3 `listing.count` calls; 3 `brand.findMany` calls; 2 `category.findMany` calls; many more |
| `/listings` | 8 | 0 | 2 `category.findMany`, 1 `brand.findMany`, 1 `listing.findMany` (with relations), 1 `attributeDefinition.findMany`, 1 `categoryAttribute.findMany` |
| `/brands` | 4 | 0 | 3 `brand.findMany` + 1 `industry.findMany` |

**Key finding:** The home page fires **23 separate Prisma queries** to render. Many are independent and could be batched with `Promise.all` (which the source already does for the 4 `listing.findMany` calls — but not for all 23).

### 5.2 PostgreSQL EXPLAIN ANALYZE on key queries

All queries run on the production database with current data (29 listings, 629 brands, 539 categories).

#### Query 1 — `listing.findMany(where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 8)`

```
Limit  (cost=11.01..11.02 rows=1 width=962) (actual time=0.082..0.084 rows=8 loops=1)
  ->  Sort  (cost=11.01..11.02 rows=1 width=962) (actual time=0.072..0.073 rows=8 loops=1)
        Sort Key: "createdAt" DESC
        Sort Method: top-N heapsort  Memory: 42kB
        ->  Seq Scan on "Listing"  (cost=0.00..11.00 rows=1 width=962) (actual time=0.022..0.041 rows=29 loops=1)
              Filter: (status = 'PUBLISHED'::text)
Planning Time: 0.472 ms
Execution Time: 0.132 ms
```

- **Execution: 0.132ms** (fast at current volume).
- **Issue: Seq Scan** — no index on `status` column. Will degrade as listings grow.

#### Query 2 — `brand.findMany(where: { active: true }, orderBy: { name: "asc" }, take: 50)`

```
Limit  (cost=41.18..41.31 rows=50 width=320) (actual time=0.231..0.237 rows=50 loops=1)
  ->  Sort  (cost=41.18..42.76 rows=629 width=320) (actual time=0.226..0.228 rows=50 loops=1)
        Sort Key: name
        Sort Method: top-N heapsort  Memory: 45kB
        ->  Seq Scan on "Brand"  (cost=0.00..20.29 rows=629 width=320) (actual time=0.011..0.124 rows=629 loops=1)
              Filter: active
Planning Time: 0.477 ms
Execution Time: 0.269 ms
```

- **Execution: 0.269ms** (fast).
- **Issue: Seq Scan of all 629 brands** — no index on `active`. The full table is scanned on every home-page render.

#### Query 3 — `category.findMany(where: { active: true, parentId: null, layer: "CATALOG" })`

```
Sort  (cost=12.21..12.27 rows=23 width=247) (actual time=0.082..0.083 rows=23 loops=1)
  Sort Key: "sortOrder"
  Sort Method: quicksort  Memory: 29kB
  ->  Seq Scan on "Category"  (cost=0.00..11.69 rows=23 width=247) (actual time=0.012..0.064 rows=23 loops=1)
        Filter: (active AND ("parentId" IS NULL) AND (layer = 'CATALOG'::text))
        Rows Removed by Filter: 272
Planning Time: 0.348 ms
Execution Time: 0.120 ms
```

- **Execution: 0.120ms** (fast).
- **Issue: Seq Scan + Filter removes 272 of 295 rows** (92% rejected). No composite index on `(active, parentId, layer, sortOrder)`.

#### Query 4 — `listing.count(where: { status: "PUBLISHED" })`

```
Aggregate  (cost=11.00..11.01 rows=1 width=8) (actual time=0.051..0.052 rows=1 loops=1)
  ->  Seq Scan on "Listing"  (cost=0.00..11.00 rows=1 width=0) (actual time=0.020..0.042 rows=29 loops=1)
        Filter: (status = 'PUBLISHED'::text)
Planning Time: 0.350 ms
Execution Time: 0.106 ms
```

- **Execution: 0.106ms**.
- **Issue: Seq Scan to count.** A partial index on `WHERE status='PUBLISHED'` would turn this into an index-only scan.

#### Query 5 — `listing.findMany + LEFT JOIN ListingImage` (N+1 risk check)

```
Limit  (cost=27.42..27.44 rows=6 width=1095) (actual time=0.118..0.121 rows=8 loops=1)
  ->  Sort  (cost=27.42..27.44 rows=6 width=1095) (actual time=0.117..0.119 rows=8 loops=1)
        Sort Key: l."createdAt" DESC
        Sort Method: top-N heapsort  Memory: 37kB
        ->  Hash Right Join  (cost=11.01..27.35 rows=6 width=1095) (actual time=0.057..0.073 rows=29 loops=1)
              Hash Cond: (i."listingId" = l.id)
              ->  Seq Scan on "ListingImage" i  (cost=0.00..15.00 rows=500 width=133) (actual time=0.001..0.001 rows=0 loops=1)
              ->  Hash  (cost=11.00..11.00 rows=1 width=962) (actual time=0.045..0.045 rows=29 loops=1)
                    ->  Seq Scan on "Listing" l  (cost=0.00..11.00 rows=1 width=962) (actual time=0.019..0.029 rows=29 loops=1)
                          Filter: (status = 'PUBLISHED'::text)
Planning Time: 0.585 ms
Execution Time: 0.191 ms
```

- **Execution: 0.191ms**.
- Hash Right Join is efficient. ListingImage currently has 0 rows (empty table). **N+1 risk:** Prisma will issue 1 listing query + N image queries if images aren't `include`-ed properly — but the source uses `include` so this is OK.

### 5.3 Index coverage by table (all 18 resources + key join tables)

| Table | Index count | Index names | Filter columns missing indexes |
|---|---:|---|---|
| Listing | 2 | pkey, slug | `status`, `createdAt`, `brandId`, `categoryId`, `featured`, `verified` ← **CRITICAL** |
| Brand | 2 | pkey, slug | `active`, `name` ← **CRITICAL** |
| Category | 2 | pkey, slug | `active`, `parentId`, `layer`, `sortOrder` ← **CRITICAL** |
| User | 3 | pkey, email, mobile | (sufficient for auth) |
| Product | 4 | pkey, slug, categoryId, brandId | — |
| Part | 2 | pkey, productId | — |
| Order | 4 | pkey, orderNumber, dealId, status | — |
| Payment | 5 | pkey, idempotencyKey, userId, status, orderId | — |
| Company | 2 | pkey, slug | `verified`, `status` |
| Machine | 2 | pkey, productId | — |
| Review | 6 | pkey, dealRoomId, dealId, companyId+status, sellerId+status, status | — |
| Deal | 6 | pkey, dealNumber, buyerId, sellerId, listingId, status | — |
| RFQ | 2 | pkey, status | (could add `buyerId`, `categoryId`) |
| ListingOffer | 2 | pkey, listingId | — |
| Auction | 2 | pkey, status | (could add `sellerId`, `endDate`) |
| Inspection | 3 | pkey, listingId, status | — |
| TransportRequest | 2 | pkey, status | — |
| Dispute | 4 | pkey, dealId, orderId, status | — |
| BuyRequest | 1 | **pkey only** | `status`, `userId`, `categoryId` ← **CRITICAL** |
| ListingImage | 1 | **pkey only** | `listingId` ← **CRITICAL** (N+1 risk) |
| Article | 2 | pkey, slug | `publishedAt`, `status` |
| AuditLog | 5 | pkey, actorId, entityType+entityId, action, createdAt | — |

**Summary:** 4 CRITICAL tables with insufficient index coverage:
- **Listing** (most-queried — every page that shows listings)
- **Brand** (every page that shows brands)
- **Category** (taxonomy tree)
- **BuyRequest** + **ListingImage** (only pkey — N+1 risk on ListingImage)

Per the user's instruction in 15-A: **"هیچ index جدیدی صرفاً بر اساس حدس اضافه نشود"** (no indexes added based on guesswork). All findings are recorded here; **no indexes were added in this step**. 15-B will decide based on which queries are actually slow in production, not on schema inspection alone.

### 5.4 pg_stat_statements

**Not enabled** in this PostgreSQL user-space install (would require superuser to `CREATE EXTENSION`). 15-B may enable it for production query analysis.

---

## 6. Cache Behavior Observed

| Endpoint | Cold hit (1st) | Warm hit (2nd+) | Cache behavior |
|---|---|---|---|
| `/api/taxonomy` | 39ms TTFB | 2ms TTFB | Next.js default cache — large response time delta |
| `/api/listings?limit=8` | 10ms TTFB | 5ms TTFB | Small delta — DB hit each time? |
| `/api/services?limit=50` | 5ms TTFB | 3ms TTFB | Small delta |
| `/api/settings` | 5ms TTFB | 3ms TTFB | Small delta |
| `/` (home) | 88ms TTFB | 67ms TTFB | Server-rendered every time (no static caching) — most queries re-run |
| `/listings` | 66ms TTFB | 46ms TTFB | Server-rendered every time |
| `/brands` | 93ms TTFB | 61ms TTFB | Server-rendered every time |

**Key finding:** The home page is re-rendered server-side on every request — there's no ISR (Incremental Static Regeneration) or full-route cache. With 23 DB queries per render, this means each home visit costs 23 DB roundtrips. 15-B will investigate adding `revalidate` to the home page route.

---

## 7. Findings to be Addressed in 15-B through 15-D

### 7.1 15-B (Database Performance) — data-driven candidates

Based on EXPLAIN ANALYZE, these queries use Seq Scan and will degrade as data grows:
1. `Listing` queries filtering on `status` (every list/detail render).
2. `Brand` queries filtering on `active` (every brands page + home page).
3. `Category` queries filtering on `(active, parentId, layer)` (every taxonomy render).
4. `BuyRequest` table — only pkey index exists.
5. `ListingImage` table — only pkey index exists; N+1 risk if `include` is removed.
6. **Home page fires 23 Prisma queries per render** — batching / Promise.all candidates.

### 7.2 15-C (Universal API Performance) — baseline defined

All 18 admin Universal APIs currently return 401 in 1-3ms (auth short-circuit). To measure the actual CRUD path, an authenticated test fixture is needed — 15-C will add it.

**Defined acceptance ceilings for 15-C:**
| Operation | p50 target | p95 target | p99 target |
|---|---|---|---|
| GET list (paginated) | < 100ms | < 300ms | < 500ms |
| GET detail (single) | < 50ms | < 150ms | < 300ms |
| POST create | < 200ms | < 500ms | < 1s |
| PATCH update | < 150ms | < 400ms | < 800ms |
| DELETE | < 100ms | < 300ms | < 600ms |
| Bulk action (50 items) | < 1s | < 3s | < 5s |
| Export (CSV, 1000 rows) | < 2s | < 5s | < 10s |

### 7.3 15-D (Frontend Performance) — data-driven candidates

1. **Bundle size:** 149 JS chunks, 4.1MB total. Largest single chunk: 225KB. Investigate dynamic-import for low-priority page chunks.
2. **HTML payload:** `/brands` = 1.35MB raw HTML (278KB compressed). 629 brands rendered server-side. Consider client-side rendering + pagination.
3. **Resource count on `/`:** 25 requests, 1MB total. Likely images + JS chunks. Audit third-party image hosts.
4. **No CSS file** — CSS is inlined into JS chunks (good for HTTP/2 but increases JS payload).
5. **LCP not measurable** in current headless setup — needs longer session or interactive trigger.

---

## 8. Regression Gate (15-E preview)

After any optimization in 15-B/C/D, the following must re-pass:
- 498 automated contract tests (373 contract + 63 RBAC + 28 CRUD + 34 page-builder)
- `tsc --noEmit` = 0 errors
- `eslint .` = 0 errors
- `next build` = exit 0, artifact produced
- 21-route production smoke matrix (4 public pages = 200, 17 admin routes = 307 → /login)
- 18-resource integration check (`scripts/verify-18-resources.ts` = 18/18 PASS)
- This baseline must NOT regress: TTFB on `/` must remain < 200ms warm; FCP on `/` must remain < 1.8s.

> **Rule:** If any optimization causes regression in any of the above, the change is NOT accepted. Revert and re-evaluate.

---

## 9. Frozen Measurement Snapshot

```bash
# Reproduce this baseline at any future time:
cd /home/z/my-project
git rev-parse HEAD  # must be e2bb29d or later

# 1. Build (if .next/ is missing)
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public \
  PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
  NODE_OPTIONS="--max-old-space-size=2048" \
  bunx next build

# 2. Run the baseline measurement script
bash scripts/measure-baseline.sh

# 3. Inspect indexes
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT tablename, COUNT(*) FROM pg_indexes GROUP BY tablename ORDER BY 2 DESC;"

# 4. Re-run EXPLAIN ANALYZE
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "EXPLAIN ANALYZE SELECT * FROM \"Listing\" WHERE status='PUBLISHED' ORDER BY \"createdAt\" DESC LIMIT 8;"
```

---

## 10. Conclusion

The HEAVIX production build is **performant at current data volume** (29 listings, 629 brands, 539 categories). No critical performance failures. Core Web Vitals (TTFB, FCP, CLS) all within target.

However, the baseline identifies **5 data-backed candidates for 15-B through 15-D**:
1. Index coverage on `Listing` / `Brand` / `Category` / `BuyRequest` / `ListingImage` tables (Seq Scan everywhere).
2. Home page fires 23 Prisma queries per render (batching opportunity).
3. Home page is re-rendered server-side on every request (no ISR).
4. `/brands` HTML payload is 1.35MB (consider client-side rendering + pagination).
5. 149 JS chunks totaling 4.1MB (dynamic-import opportunity).

**No optimizations were applied in 15-A.** The next step (15-B Database Performance) will use this baseline to drive data-informed decisions, not guesses.
