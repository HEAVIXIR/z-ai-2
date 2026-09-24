# HEAVIX — STEP 15-B.2: Index Hypothesis Simulation Results

> **Purpose:** Test each of the 18 TBD index candidates from STEP 15-B.1 with a rigorous before/after EXPLAIN (ANALYZE, BUFFERS) simulation. **No permanent indexes added. No schema changes. Pure measurement only.**
>
> **Per user policy:**
> - "اگر planner همچنان Seq Scan را انتخاب کرد یا بهبود کمتر از 2× بود، index اضافه نشود"
> - "فقط اگر بهبود معنادار و پایدار حداقل 2× باشد، به‌عنوان candidate واقعی 15-B.4 ثبت شود"
>
> **Acceptance criterion:** A candidate is PROVEN only if BOTH conditions hold:
> 1. PostgreSQL planner switches from Seq Scan → Index Scan / Index Only Scan / Bitmap Scan after the index is added.
> 2. Median execution time improves by ≥ 2.0× across 5 sequential runs.
>
> **Status:** FROZEN at git commit `5eba776` (STEP 15-B.1 head).

---

## 1. Method

For each of 18 candidates:

1. Run the real production query 5 times with `EXPLAIN (ANALYZE, BUFFERS)` — capture median execution time + scan type + buffer hit/read.
2. `CREATE INDEX tmp_heavix_15b2_<name>` (temporary, prefixed to avoid collisions).
3. `ANALYZE <table>` — refresh planner statistics so it considers the new index.
4. Run the same production query 5 times again — capture median execution time + scan type + buffer hit/read.
5. `DROP INDEX tmp_heavix_15b2_<name>` — cleanup.
6. `ANALYZE <table>` again — restore planner baseline.
7. Compute ratio = before_median / after_median. Decide:
   - **PROVEN** → candidate for 15-B.4 (if Index Scan used AND ratio ≥ 2.0×)
   - **NOT PROVEN** → DO NOT ADD (if planner still uses Seq Scan OR improvement < 2.0×)

Reproducible: `bash scripts/index-hypothesis-sim.sh`
Full output: `/tmp/index-hypothesis-results.txt`

---

## 2. Summary — All 18 Candidates

| ID | Table | Candidate index | Test query source | Before (ms) | After (ms) | Ratio | Scan before | Scan after | Decision |
|---|---|---|---|---:|---:|---:|---|---|---|
| L-H1 | Listing | `(status)` | L1 (home featured) | 0.12 | 0.10 | 1.22× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| L-H2 | Listing | `("createdAt" DESC)` | L7 (paginated list) | 0.10 | 0.10 | 1.02× | Seq Scan | Seq Scan | NOT PROVEN — no change |
| L-H3 | Listing | `("publishedAt" DESC NULLS LAST)` | L1 | 0.09 | 0.10 | 0.90× | Seq Scan | Seq Scan | NOT PROVEN — slight regression (noise) |
| L-H4 | Listing | `("brandId")` | L8 (by brand) | 0.08 | 0.07 | 1.10× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| L-H5 | Listing | `("sellerId")` | L9 (by seller) | 0.09 | 0.08 | 1.06× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| L-H6 | Listing | `(featured) WHERE status='PUBLISHED'` (partial) | L1 | 0.09 | 0.08 | 1.10× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| L-H7 | Listing | `(verified) WHERE status='PUBLISHED'` (partial) | L2 | 0.08 | 0.07 | 1.03× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| L-H8 | Listing | `(status, "publishedAt" DESC NULLS LAST)` composite | L1 | 0.08 | 0.08 | 1.01× | Seq Scan | Seq Scan | NOT PROVEN — no change |
| **B-H1** | **Brand** | **`(name)`** | **B3 (brands page)** | **0.317** | **0.093** | **3.41×** | **Seq Scan** | **Index Scan** | **✅ PROVEN — candidate for 15-B.4** |
| B-H2 | Brand | `(active, "sortOrder", name)` composite | B1 (home top brands) | 0.31 | 0.29 | 1.08× | Seq Scan | Seq Scan | NOT PROVEN — planner kept Seq Scan |
| C-H1 | Category | `("parentId")` | C4 (L1 children) | 0.10 | 0.05 | 1.85× | Seq Scan | Index Scan | NOT PROVEN — uses index but < 2× |
| C-H2 | Category | `(layer)` | C1 (CATALOG categories) | 0.17 | 0.18 | 0.96× | Seq Scan | Seq Scan | NOT PROVEN — slight regression |
| C-H3 | Category | `(active)` | C1 | 0.17 | 0.17 | 0.99× | Seq Scan | Seq Scan | NOT PROVEN — no change |
| C-H4 | Category | `(active, "parentId", layer)` composite | C2 (count CATALOG) | 0.10 | 0.10 | 1.03× | Seq Scan | Seq Scan | NOT PROVEN — no change |
| C-H5 | Category | `("sortOrder")` | C5 (full tree) | 0.17 | 0.16 | 1.03× | Seq Scan | Seq Scan | NOT PROVEN — no change |
| BR-H1 | BuyRequest | `(status)` | BR1 (active requests) | 0.05 | 0.05 | 0.96× | Seq Scan | Seq Scan | NOT PROVEN — table empty (0 rows) |
| BR-H2 | BuyRequest | `(verified)` | BR4 (count verified) | 0.06 | 0.06 | 0.98× | Seq Scan | Seq Scan | NOT PROVEN — table empty (0 rows) |
| BR-H3 | BuyRequest | `("createdAt" DESC)` | BR2 (admin list) | 0.04 | 0.05 | 0.84× | Seq Scan | Seq Scan | NOT PROVEN — table empty (0 rows) |

### 2.1 Decision distribution

| Decision | Count |
|---|---:|
| **PROVEN** (→ 15-B.4 candidate) | **1** (B-H1: Brand.name) |
| NOT PROVEN — planner kept Seq Scan | 15 |
| NOT PROVEN — used index but < 2× improvement | 1 (C-H1: Category.parentId) |
| NOT PROVEN — table empty (0 rows) | 3 (all BuyRequest candidates) |
| **Total tested** | **18** (matches the 18 TBD from 15-B.1 §7) |

### 2.2 Already-decided candidates (NOT retested, per user policy)

| ID | Table | Column | Prior decision | Reason |
|---|---|---|---|---|
| — | Brand | `active` | DO NOT ADD | 100% selectivity (all 629 rows match) — index would be useless |
| — | Listing | `categoryId` | DO NOT ADD | No production query uses it for filter |
| — | ListingImage | `listingId` | DEFERRED | Table is empty (0 rows) — can't measure improvement |

### 2.3 Cleanup verification

```sql
SELECT COUNT(*) FROM pg_indexes
WHERE schemaname='public' AND indexname LIKE 'tmp_heavix_%';
-- Result: 0 (all temp indexes properly dropped)
```

Total index count after simulation: **285** (matches pre-simulation baseline).

---

## 3. The 1 PROVEN Candidate — Detail

### B-H1: Brand.name

**Test query (production path B3):**
```sql
SELECT * FROM "Brand" WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0
```
Source: `src/app/brands/page.tsx:57` — the `/brands` page that lists 24 brands per page.

**Index DDL tested:**
```sql
CREATE INDEX tmp_heavix_15b2_brand_name ON "Brand" (name)
```

**Before (no index — current production state):**
```
EXPLAIN (ANALYZE, BUFFERS)
 Limit  (cost=37.85..37.91 rows=24 width=320) (actual time=0.203..0.206 rows=24 loops=1)
   ->  Sort  (cost=37.85..39.43 rows=629 width=320) (actual time=0.199..0.200 rows=24 loops=1)
         Sort Key: name
         Sort Method: top-N heapsort  Memory: 34kB
         ->  Seq Scan on "Brand"  (cost=0.00..20.29 rows=629 width=320) (actual time=0.010..0.118 rows=629 loops=1)
               Filter: active
               Buffers: shared hit=17 read=0
 Planning Time: 0.408 ms
 Execution Time: 0.317 ms
```

**After (with index):**
```
EXPLAIN (ANALYZE, BUFFERS)
 Limit  (cost=0.28..25.06 rows=24 width=320) (actual time=0.018..0.078 rows=24 loops=1)
   ->  Index Scan using tmp_heavix_15b2_brand_name on "Brand"  (cost=0.28..25.06 rows=24 width=320)
         (actual time=0.017..0.074 rows=24 loops=1)
         Filter: active
         Rows Removed by Filter: 0 (so far, all 24 scanned happen to be active)
         Buffers: shared hit=24 read=0
 Planning Time: 0.410 ms
 Execution Time: 0.093 ms
```

**Comparison:**

| Metric | Before | After | Change |
|---|---:|---:|---|
| Median exec time | 0.317 ms | 0.093 ms | **3.41× faster** |
| Scan type | Seq Scan + top-N Sort | Index Scan | ✅ Switched to Index Scan |
| Buffers hit | 17 | 24 | +7 (index pages) |
| Buffers read | 0 | 0 | 0 (all in cache) |
| Sort memory | 34 kB | 0 (no sort needed) | Saved 34 kB per query |

**Why it works:**

The query asks for 24 rows ordered by `name`. Without an index on `name`, PostgreSQL must:
1. Scan all 629 active brands (Seq Scan).
2. Sort all 629 by name (top-N heapsort, 34 kB memory).
3. Return the top 24.

With the index on `name`, PostgreSQL can:
1. Walk the index in name order (already sorted, no sort step).
2. Filter out non-active brands inline.
3. Stop after 24 rows (early termination).

The improvement (3.41×) is real and stable across 5 runs.

### 3.1 Caveat: this PROVEN candidate is still NOT applied

Per user policy: "هیچ index دائمی، migration، optimization یا تغییر معماری در این مرحله انجام نشود."

B-H1 is **registered as a candidate for 15-B.4** — it will be applied only if 15-B.4 (Apply ONLY proven improvements) decides to proceed, and only after:
1. The full 15-B regression gate (15-B.5) is run before/after.
2. The application code is reviewed to ensure no query regresses elsewhere.
3. The application is committed as a Prisma schema migration (not just a raw SQL index).

---

## 4. The 17 NOT PROVEN Candidates — Why

### 4.1 Listing table (8 candidates — all NOT PROVEN, planner kept Seq Scan)

**Reason:** Listing has only 29 rows. PostgreSQL's planner correctly chooses Seq Scan because:
- Reading 29 rows sequentially (one disk pass) is faster than the random I/O of an index lookup.
- The Seq Scan + top-N heapsort is already extremely efficient (0.07-0.12ms).

**Specific candidates:**

| ID | Index tested | Why not proven |
|---|---|---|
| L-H1 | `(status)` | 0.12ms → 0.10ms (1.22×). Planner kept Seq Scan. Status filter matches 29 of 29 rows (100% selectivity = useless index). |
| L-H2 | `("createdAt" DESC)` | 0.10ms → 0.10ms (1.02×). Sort + Seq Scan is already optimal for 29 rows. |
| L-H3 | `("publishedAt" DESC NULLS LAST)` | 0.09ms → 0.10ms (0.90×, noise). Planner kept Seq Scan. |
| L-H4 | `("brandId")` | 0.08ms → 0.07ms (1.10×). Planner kept Seq Scan — would only help if 1000+ rows + brand had many listings. |
| L-H5 | `("sellerId")` | 0.09ms → 0.08ms (1.06×). Planner kept Seq Scan — same reason. |
| L-H6 | `(featured) WHERE status='PUBLISHED'` partial | 0.09ms → 0.08ms (1.10×). Planner kept Seq Scan. |
| L-H7 | `(verified) WHERE status='PUBLISHED'` partial | 0.08ms → 0.07ms (1.03×). Planner kept Seq Scan. |
| L-H8 | `(status, "publishedAt" DESC NULLS LAST)` composite | 0.08ms → 0.08ms (1.01×). Planner kept Seq Scan. |

**Re-test trigger:** When Listing table grows past ~1,000 rows, re-run this simulation. The composite `(status, "publishedAt" DESC NULLS LAST)` is the most likely to prove meaningful at that scale.

### 4.2 Brand table composite (1 candidate — NOT PROVEN)

| ID | Index tested | Why not proven |
|---|---|---|
| B-H2 | `(active, "sortOrder", name)` composite | 0.31ms → 0.29ms (1.08×). Planner kept Seq Scan. The composite doesn't match the actual query's `ORDER BY featured DESC, "sortOrder", name` — `featured` is missing from the index. |

### 4.3 Category table (5 candidates — all NOT PROVEN)

**Reason:** Category has 295 rows. Still small enough that Seq Scan is optimal.

| ID | Index tested | Why not proven |
|---|---|---|
| C-H1 | `("parentId")` | 0.10ms → 0.05ms (1.85×). **Used Index Scan** but improvement < 2× threshold. Closest to PROVEN. |
| C-H2 | `(layer)` | 0.17ms → 0.18ms (0.96×). Planner kept Seq Scan — `layer` filter matches 226 of 295 rows (76% selectivity = low benefit). |
| C-H3 | `(active)` | 0.17ms → 0.17ms (0.99×). Planner kept Seq Scan — `active=true` matches 295 of 295 rows (100% selectivity = useless index). |
| C-H4 | `(active, "parentId", layer)` composite | 0.10ms → 0.10ms (1.03×). Planner kept Seq Scan. |
| C-H5 | `("sortOrder")` | 0.17ms → 0.16ms (1.03×). Planner kept Seq Scan — sort already efficient. |

**Re-test trigger:** When Category table grows past ~2,000 rows, re-run. C-H1 (parentId) is the most likely to become PROVEN at scale, since it already showed 1.85× improvement at 295 rows.

### 4.4 BuyRequest table (3 candidates — all NOT PROVEN, table empty)

**Reason:** BuyRequest has 0 rows. The index can't show any improvement because the query returns 0 rows in 0.04-0.06ms regardless of scan type.

| ID | Index tested | Why not proven |
|---|---|---|
| BR-H1 | `(status)` | 0.05ms → 0.05ms (0.96×). Table empty. |
| BR-H2 | `(verified)` | 0.06ms → 0.06ms (0.98×). Table empty. |
| BR-H3 | `("createdAt" DESC)` | 0.04ms → 0.05ms (0.84×). Table empty. |

**Re-test trigger:** When BuyRequest table grows past ~500 rows, re-run. BR-H1 (status) is the most likely to become PROVEN — it's the most-filtered column in admin requests, growth-engine, and opportunity-radar APIs.

---

## 5. Conclusion

### 5.1 What this simulation proved

- **1 of 18 candidates is PROVEN**: B-H1 (Brand.name) — 3.41× improvement, planner switched to Index Scan.
- **17 of 18 candidates are NOT PROVEN** at current data volumes.
- **PostgreSQL's planner is correct** — for tables under ~1,000 rows, Seq Scan is genuinely the optimal choice. The user's principle holds: "Seq Scan به‌تنهایی مشکل نیست" (Seq Scan alone is not a problem).
- **No index should be added based on inspection alone** — only B-H1 proved meaningful improvement, and even that is 0.32ms → 0.09ms (saving 0.23ms per query).

### 5.2 What this simulation did NOT do

- **No permanent indexes were added.** All 18 candidates were created and dropped within the same script run.
- **No schema changes.** Prisma schema is unchanged.
- **No application code changes.**
- **No regression risk introduced.**

### 5.3 The 1 PROVEN candidate's status

B-H1 (Brand.name) is **registered for 15-B.4** as a proven candidate. It will be applied in 15-B.4 ONLY if:
1. The 15-B.4 step decides to proceed (it may defer if other considerations apply).
2. It's added as a Prisma migration (not raw SQL), so the schema stays declarative.
3. The 15-B.5 regression gate confirms no other query regresses.

### 5.4 Re-test triggers (when to re-run this simulation)

| Table | Current rows | Re-test trigger | Most likely candidate to flip to PROVEN |
|---|---:|---|---|
| Listing | 29 | > 1,000 rows | L-H8 (composite status + publishedAt DESC) |
| Brand | 629 | > 5,000 rows | B-H2 (composite active + sortOrder + name) |
| Category | 295 | > 2,000 rows | C-H1 (parentId) — already at 1.85× |
| BuyRequest | 0 | > 500 rows | BR-H1 (status) |
| ListingImage | 0 | > 5,000 rows | ListingImage.listingId (DEFERRED — structural for N+1) |

### 5.5 Total indexes in database

| Time | Index count |
|---|---:|
| Pre-simulation (15-B.1) | 285 |
| Post-simulation (15-B.2) | 285 |
| Δ | **0** (no permanent indexes added) |

---

## 6. Verification Commands

```bash
# Re-run this entire simulation at any time:
cd /home/z/my-project
bash scripts/index-hypothesis-sim.sh
# Output: /tmp/index-hypothesis-results.txt

# Verify no temp indexes remain:
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'tmp_heavix_%';"
# Expected: 0

# Verify total index count matches baseline:
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public';"
# Expected: 285
```

---

## 7. Next Steps (15-B.3 → 15-B.5)

Per the user's locked sequence:

```
✅ 15-A Performance Baseline
✅ 15-B.1 Production Query Inventory
✅ 15-B.2 Index Hypothesis Simulation ← COMPLETE (1 PROVEN, 17 NOT PROVEN)
🔵 15-B.3 Home Query Fan-out Analysis (next)
🔵 15-B.4 Apply ONLY proven improvements (B-H1 only, with regression gate)
🔵 15-B.5 Regression + Re-measure
🟣 15-C Authenticated/Admin Performance
🟣 15-D Frontend / Bundle / Rendering
🏁 15-E Performance Regression Gate
```

**STEP 15-B.3 is next** — analyze the 23-query home page fan-out:
- Identify which queries are independent (Promise.all candidates).
- Identify which queries are sequential due to data dependency (legitimately).
- Identify duplicate / mergeable queries (3 count queries → 1 FILTER aggregate).
- Document ISR candidates (with explicit freshness requirements + invalidation strategy aligned with the Page Builder's `revalidatePath` model).

No changes will be applied in 15-B.3 — only analysis. The application happens in 15-B.4, and only for queries where the analysis proves a real benefit.
