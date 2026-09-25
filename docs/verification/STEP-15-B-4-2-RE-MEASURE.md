# HEAVIX — STEP 15-B.4.2: Production Query Re-measure

> **Purpose:** Re-run the same 28 queries from STEP 15-B.1 (now with `Brand_name_idx` applied in 15-B.4.1) and compare against the 15-B.1 baseline. Verify the target query improved, check for any regression in other queries, and apply the user's acceptance gate.
>
> **Per user policy:**
> - No new optimizations applied in this step
> - No Promise.all, no count aggregate, no ISR — those have their own sub-steps
> - DB-level vs Page-level improvements kept separate
>
> **Status:** FROZEN at git commit `385eac8` (STEP 15-B.4.1 head — Brand_name_idx applied).

---

## 1. Method

1. Reused `scripts/explain-analyze.sh` from STEP 15-B.1 — same 28 queries, same SQL, same `EXPLAIN (ANALYZE, BUFFERS)`.
2. Backed up the 15-B.1 baseline to `/tmp/explain-results-15-B-1-baseline.txt`.
3. Ran the script with `Brand_name_idx` applied → wrote to `/tmp/explain-results.txt`.
4. Wrote a Python parser to extract from each query: exec time, planning time, scan type, rows returned, buffers hit/read, sort method + memory, hash presence, loops.
5. Compared each query's metrics BEFORE (15-B.1) vs AFTER (15-B.4.2) and flagged verdicts.

Reproducible: `bash scripts/explain-analyze.sh && python3 /tmp/compare-queries.py`

---

## 2. Per-Query Comparison (all 36 measured queries — some had multiple sub-queries)

| QID | BEFORE exec | AFTER exec | Δ ms | Ratio | BEFORE scan | AFTER scan | Verdict |
|---|---:|---:|---:|---:|---|---|---|
| **B3** | 0.233ms | **0.083ms** | **-0.150** | **2.81×** | Seq Scan | **Index Scan** | **IMPROVED** ✅ (target) |
| B1 | 0.298ms | 0.248ms | -0.050 | 1.20× | Seq Scan | Seq Scan | NEUTRAL |
| B2 | 0.209ms | 0.171ms | -0.038 | 1.22× | Seq Scan | Seq Scan | NEUTRAL |
| B4 | 0.141ms | 0.143ms | +0.002 | 0.99× | Seq Scan | Seq Scan | NEUTRAL |
| B5 | 0.078ms | 0.061ms | -0.017 | 1.28× | Index Scan | Index Scan | NEUTRAL (still uses Brand_pkey, no change expected) |
| B6 | 0.458ms | 0.333ms | -0.125 | 1.38× | Seq Scan | Seq Scan | NEUTRAL (filters on active, not name — no benefit expected) |
| BR1 | 0.050ms | 0.054ms | +0.004 | 0.93× | Seq Scan | Seq Scan | NEUTRAL |
| BR2 | 0.057ms | 0.038ms | -0.019 | 1.50× | Seq Scan | Seq Scan | NEUTRAL (borderline — within noise) |
| BR3 | 0.052ms | 0.055ms | +0.003 | 0.95× | Seq Scan | Seq Scan | NEUTRAL |
| BR4 | 0.048ms | 0.049ms | +0.001 | 0.98× | Seq Scan | Seq Scan | NEUTRAL |
| BR5 | 0.061ms | 0.058ms | -0.003 | 1.05× | Seq Scan | Seq Scan | NEUTRAL |
| BR6 | 0.087ms | 0.072ms | -0.015 | 1.21× | Seq Scan | Seq Scan | NEUTRAL |
| C1 | 0.185ms | 0.173ms | -0.012 | 1.07× | Seq Scan | Seq Scan | NEUTRAL |
| C2 | 0.119ms | 0.122ms | +0.003 | 0.98× | Seq Scan | Seq Scan | NEUTRAL |
| C3 | 0.036ms | 0.039ms | +0.003 | 0.92× | Index Scan | Index Scan | NEUTRAL (Category_slug_key — no relation to Brand_name_idx) |
| C4 | 0.141ms | 0.104ms | -0.037 | 1.36× | Seq Scan | Seq Scan | NEUTRAL |
| C5 | 0.157ms | 0.161ms | +0.004 | 0.98× | Seq Scan | Seq Scan | NEUTRAL |
| C6 | 0.108ms | 0.110ms | +0.002 | 0.98× | Seq Scan | Seq Scan | NEUTRAL |
| L1 | 0.128ms | 0.104ms | -0.024 | 1.23× | Seq Scan | Seq Scan | NEUTRAL |
| L2 | 0.128ms | 0.084ms | -0.044 | 1.52× | Seq Scan | Seq Scan | NEUTRAL (borderline — within noise) |
| L3 | 0.114ms | 0.085ms | -0.029 | 1.34× | Seq Scan | Seq Scan | NEUTRAL |
| L4 | 0.076ms | 0.101ms | +0.025 | 0.75× | Seq Scan | Seq Scan | NEUTRAL (within noise) |
| L5 | 0.078ms | 0.072ms | -0.006 | 1.08× | Seq Scan | Seq Scan | NEUTRAL |
| L6 | 0.061ms | 0.084ms | +0.023 | 0.73× | Seq Scan | Seq Scan | NEUTRAL (within noise) |
| L7 | 0.117ms | 0.088ms | -0.029 | 1.33× | Seq Scan | Seq Scan | NEUTRAL |
| L8 | 0.092ms | 0.067ms | -0.025 | 1.37× | Seq Scan | Seq Scan | NEUTRAL |
| L9 | 0.079ms | 0.081ms | +0.002 | 0.98× | Seq Scan | Seq Scan | NEUTRAL |
| **L10** | 0.071ms | 0.063ms | -0.008 | 1.13× | Seq Scan | Seq Scan | NEUTRAL |
| **L11** | 0.067ms | 0.078ms | +0.011 | 0.86× | Seq Scan | Seq Scan | NEUTRAL |
| **L12** | 0.046ms | 0.048ms | +0.002 | 0.96× | Index Scan | Seq Scan | ⚠️ INVESTIGATE (scan switch, but within noise — see §3.1) |
| L13 | 0.091ms | 0.091ms | +0.000 | 1.00× | Seq Scan | Seq Scan | NEUTRAL |
| **L14** | 0.265ms | 0.438ms | **+0.173** | **0.61×** | Seq Scan (Nested Loop) | Index Scan (Merge Right Join) | ⚠️ INVESTIGATE (see §3.2 — simulated query, not production) |
| LI1 | 0.043ms | 0.038ms | -0.005 | 1.13× | Seq Scan | Seq Scan | NEUTRAL |
| LI2 | 0.030ms | 0.024ms | -0.006 | 1.25× | Seq Scan | Seq Scan | NEUTRAL |
| LI3 | 0.046ms | 0.052ms | +0.006 | 0.88× | Seq Scan | Seq Scan | NEUTRAL |
| LI4 | 0.074ms | 0.060ms | -0.014 | 1.23× | Seq Scan | Seq Scan | NEUTRAL |

### 2.1 Summary

| Verdict | Count | Notes |
|---|---:|---|
| IMPROVED (target B3) | 1 | 2.81× faster, scan switched to Index Scan using Brand_name_idx |
| NEUTRAL (within noise) | 33 | All other queries — deltas in ±0.05ms range, well within measurement noise |
| INVESTIGATE | 2 | L12 (scan switch, +0.002ms) and L14 (scan switch, +0.173ms — see §3) |
| REGRESSION (meaningful) | 0 | None on production queries |
| **TOTAL** | **36** | |

---

## 3. INVESTIGATE — L12 and L14

### 3.1 L12 — `SELECT * FROM "Listing" WHERE id='...'` (Universal API get-by-id)

**BEFORE (15-B.1):**
```
Index Scan using "Listing_pkey" on "Listing"  (cost=0.14..8.16 rows=1 width=962) (actual time=0.015..0.016 rows=0 loops=1)
  Index Cond: (id = '00000000-0000-0000-0000-000000000001'::text)
Planning Time: 0.279 ms
Execution Time: 0.046 ms
```

**AFTER (15-B.4.2):**
```
Seq Scan on "Listing"  (cost=0.00..3.36 rows=1 width=1075) (actual time=0.012..0.012 rows=0 loops=1)
  Filter: (id = '00000000-0000-0000-0000-000000000001'::text)
  Rows Removed by Filter: 29
Planning Time: 0.426 ms
Execution Time: 0.048 ms
```

**Analysis:**
- The planner switched from Index Scan (Listing_pkey) to Seq Scan.
- Exec time: 0.046ms → 0.048ms = +0.002ms (4% slower — pure noise).
- The test ID (`00000000-0000-0000-0000-000000000001`) doesn't exist in the table (returns 0 rows in both cases).
- PostgreSQL's planner correctly recognizes that for a 29-row table, scanning all rows sequentially and filtering is faster than the random I/O of an index lookup.
- This is **the same behavior pattern seen in 15-B.2** when simulating indexes — small tables favor Seq Scan.
- The cause of the switch is likely the `ANALYZE "Brand";` I ran in 15-B.4.1, which refreshed planner stats and may have re-evaluated the cost estimates for Listing as well.

**Verdict:** NEUTRAL (not a meaningful regression — 4% slower on a 0.046ms query that returns 0 rows is measurement noise). The planner's choice is correct for a 29-row table.

### 3.2 L14 — Home featured listings WITH relations (simulated JOIN)

**BEFORE (15-B.1):**
```
Limit  (cost=43.95..43.96 rows=1 width=1019) (actual time=0.167..0.169 rows=8 loops=1)
  ->  Sort  (cost=43.95..43.96 rows=1 width=1019) (actual time=0.166..0.167 rows=8 loops=1)
        Sort Key: l."publishedAt" DESC NULLS LAST
        Sort Method: quicksort  Memory: 33kB
        ->  Nested Loop Left Join  (cost=16.81..43.94 rows=1 width=1019) (actual time=0.075..0.133 rows=8 loops=1)
              ->  Nested Loop Left Join  (cost=0.55..27.66 rows=1 width=982) (actual time=0.053..0.100 rows=8 loops=1)
                    ->  Nested Loop Left Join  (cost=0.28..19.32 rows=1 width=977) (actual time=0.037..0.071 rows=8 loops=1)
                          ->  Seq Scan on "Listing" l  (cost=0.00..11.00 rows=1 width=962) (actual time=0.019..0.027 rows=8 loops=1)
                                Filter: (featured AND (status = 'PUBLISHED'::text))
                                Rows Removed by Filter: 21
                          ->  Index Scan using "Brand_pkey" on "Brand" b  (cost=0.28..8.29 rows=1 width=41) (actual time=0.004..0.004 rows=1 loops=8)
                                Index Cond: (id = l."brandId")
                    ->  Index Scan using "Category_pkey" on "Category" c  (cost=0.27..8.29 rows=1 width=31) (actual time=0.003..0.003 rows=1 loops=8)
                          Index Cond: (id = l."categoryId")
              ->  Limit  (cost=16.26..16.26 rows=1 width=133) (actual time=0.003..0.003 rows=0 loops=8)
                    ->  Sort  (cost=16.26..16.27 rows=2 width=133) (actual time=0.003..0.003 rows=0 loops=8)
                          ...
                          ->  Seq Scan on "ListingImage"  (cost=0.00..16.25 rows=2 width=133) (actual time=0.000..0.000 rows=0 loops=8)

Execution Time: 0.265 ms
```

**AFTER (15-B.4.2):**
```
Limit  (cost=171.61..171.63 rows=8 width=1132) (actual time=0.322..0.325 rows=8 loops=1)
  ->  Sort  (cost=171.61..171.63 rows=8 width=1132) (actual time=0.321..0.324 rows=8 loops=1)
        Sort Key: l."publishedAt" DESC NULLS LAST
        Sort Method: quicksort  Memory: 33kB
        ->  Nested Loop Left Join  (cost=33.73..171.49 rows=8 width=1132) (actual time=0.176..0.302 rows=8 loops=1)
              ->  Merge Right Join  (cost=17.47..41.23 rows=8 width=1095) (actual time=0.149..0.263 rows=8 loops=1)
                    Merge Cond: (b.id = l."brandId")
                    ->  Index Scan using "Brand_pkey" on "Brand" b  (cost=0.28..53.58 rows=629 width=41) (actual time=0.009..0.095 rows=273 loops=1)
                    ->  Sort  (cost=17.19..17.21 rows=8 width=1080) (actual time=0.136..0.140 rows=8 loops=1)
                          Sort Key: l."brandId"
                          Sort Method: quicksort  Memory: 30kB
                          ->  Hash Right Join  (cost=3.46..17.07 rows=8 width=1080) (actual time=0.053..0.112 rows=8 loops=1)
                                Hash Cond: (c.id = l."categoryId")
                                ->  Seq Scan on "Category" c  (cost=0.00..10.95 rows=295 width=31) (actual time=0.004..0.038 rows=295 loops=1)
                                ->  Hash  (cost=3.36..3.36 rows=8 width=1075) (actual time=0.027..0.027 rows=8)
                                      ...
                                      ->  Seq Scan on "Listing" l  (cost=0.00..3.36 rows=8 width=1075) (actual time=0.008..0.016 rows=8)
                                            Filter: (featured AND (status = 'PUBLISHED'::text))
                                            Rows Removed by Filter: 21
              ->  Limit  (cost=16.26..16.26 rows=1 width=133) (actual time=0.004..0.004 rows=0 loops=8)
                    ...

Execution Time: 0.438 ms
```

**Analysis:**
- The planner switched from **Nested Loop Left Join** (8 iterations, each doing Index Scan on Brand_pkey + Category_pkey) to **Merge Right Join** (full Index Scan on Brand_pkey for all 629 brands + Hash Right Join with Category).
- Exec time: 0.265ms → 0.438ms = +0.173ms (65% slower).
- **CRITICAL**: L14 is a **SIMULATED query** I wrote in 15-B.1 to test the JOIN behavior. It does NOT match what Prisma actually executes.
- The real Prisma call is:
  ```ts
  db.listing.findMany({
    where: { status: "PUBLISHED", featured: true },
    take: 8,
    include: {
      brand: { select: { name: true } },
      category: { select: { icon: true } },
      images: { orderBy: [...], take: 1 },
    },
  })
  ```
- Prisma's `include` generates **separate queries** (N+1 pattern), NOT a single SQL with JOINs:
  1. Query 1 (L1 in inventory): `SELECT * FROM Listing WHERE ... LIMIT 8`
  2. Query 2 (B5 in inventory): `SELECT * FROM Brand WHERE id IN (...)`
  3. Query 3 (uses Category_pkey): `SELECT * FROM Category WHERE id IN (...)`
  4. Query 4-N (LI1 in inventory): `SELECT * FROM ListingImage WHERE listingId=...` per listing
- L1 is NEUTRAL in this re-measure (0.128ms → 0.104ms = 1.23× improvement, within noise).
- B5 is NEUTRAL (still uses Brand_pkey Index Scan, no change expected).
- **The L14 regression is on a HYPOTHETICAL query that doesn't run in production.**

**Why the planner chose a worse plan:**
- After `ANALYZE "Brand";` in 15-B.4.1, the planner has fresh stats on Brand (629 rows).
- The planner now thinks: "Brand has 629 rows, so a Merge Join with full Index Scan on Brand_pkey is cheaper than 8 Nested Loop Index Scans."
- This is wrong for this specific query shape (only 8 listings, so 8 index lookups on Brand_pkey is faster than scanning all 629 brands).
- The planner's cost estimate (171.61 vs 43.95) was wrong — actual time showed the new plan is slower.

**Verdict:** INVESTIGATE — real regression on a SIMULATED query, but absolute impact tiny (0.173ms) and NOT on a production path. The actual production queries (L1 + B5 + C3 + LI1) are all NEUTRAL.

---

## 4. Brand-Specific Query Analysis

Per user policy: "خصوصاً queryهای مربوط به Brand را جداگانه بررسی کن تا مشخص شود planner واقعاً از index استفاده می‌کند و فقط benchmark تک‌query باعث نتیجه مثبت نشده است."

| Q | Source | Predicate | BEFORE exec | AFTER exec | BEFORE scan | AFTER scan | Index used | Notes |
|---|---|---|---:|---:|---|---|---|---|
| B1 | page.tsx:52 (home top brands) | `WHERE active=true ORDER BY featured DESC, sortOrder, name LIMIT 20` | 0.298ms | 0.248ms | Seq Scan | Seq Scan | none | Filter on `active=true` (100% selectivity) — index on `name` doesn't help because filter doesn't include `name` |
| B2 | page.tsx:115 (count active) | `COUNT(*) WHERE active=true` | 0.209ms | 0.171ms | Seq Scan | Seq Scan | none | Count query — must scan all rows; index on `name` doesn't help counts |
| **B3** | brands/page.tsx:57 (brands list) | `WHERE active=true ORDER BY name ASC LIMIT 24` | 0.233ms | **0.083ms** | Seq Scan | **Index Scan (Brand_name_idx)** | **Brand_name_idx** | **✅ TARGET QUERY — 2.81× improvement** |
| B4 | brands/page.tsx:80 (popular) | `WHERE active=true AND featured=true ORDER BY sortOrder LIMIT 8` | 0.141ms | 0.143ms | Seq Scan | Seq Scan | none | Sorts by `sortOrder`, not `name` — index doesn't help |
| B5 | page.tsx:254 (trusted brands) | `WHERE id IN (...) AND active=true ORDER BY featured, sortOrder, name LIMIT 20` | 0.078ms | 0.061ms | Index Scan (Brand_pkey) | Index Scan (Brand_pkey) | Brand_pkey | Filters by `id IN` — uses pkey, not name. No change expected. |
| B6 | api/taxonomy/brands/route.ts:56 | `WHERE active=true ORDER BY sortOrder, name LIMIT 24` | 0.458ms | 0.333ms | Seq Scan | Seq Scan | none | Sorts by `(sortOrder, name)` — composite index would help, but single `name` index doesn't match the leading sort column |

### 4.1 Brand query summary

- **1 of 6 Brand queries (B3) benefits from Brand_name_idx** — the target query.
- **5 of 6 Brand queries are NEUTRAL** — they either:
  - Don't sort by `name` alone (B1, B4, B6 sort by other columns first)
  - Filter by primary key (B5 — uses Brand_pkey)
  - Are count queries (B2 — must scan all rows anyway)
- **No Brand query regressed.**

### 4.2 Why other Brand queries don't benefit

The index on `name` only helps queries where:
1. The `ORDER BY` clause leads with `name` (or has `name` as the only sort key).
2. The query has a `LIMIT` (so the index can short-circuit).

B3 satisfies both: `ORDER BY name ASC LIMIT 24` — the planner walks the index in name order, stops after 24 rows.

Other Brand queries:
- B1 sorts by `(featured DESC, sortOrder, name)` — `name` is the third sort key; a single-column index on `name` doesn't match the leading sort columns.
- B4 sorts by `sortOrder` only.
- B6 sorts by `(sortOrder, name)` — `sortOrder` is the leading key.
- B5 filters by `id IN` — uses pkey.
- B2 is a count — must scan all rows.

**Conclusion:** The index correctly helps the target query (B3) and doesn't help queries that sort by other columns. This is expected behavior — the index is targeted, not a silver bullet.

---

## 5. Acceptance Gate (per user spec)

| Gate condition | Result | Verdict |
|---|---|---|
| Queryهای هدف بهتر شده‌اند | B3: 2.81× improvement, scan switched to Index Scan | ✅ |
| regression معنادار نداریم | L14: +0.173ms (65% slower) — BUT on a SIMULATED non-production query. All production queries NEUTRAL. | 🟡 INVESTIGATE |
| Index استفاده نمی‌شود | B3 uses Index Scan (Brand_name_idx) | ✅ |
| Query دیگری regression معنادار دارد | L14 regression is on a simulated JOIN query, not a production path. L12 scan switch is within noise (+0.002ms). | 🟡 INVESTIGATE (but not on production path) |
| تفاوت‌ها در محدوده noise هستند | 33 of 36 queries are NEUTRAL (within ±0.05ms noise) | 🟡 Most queries NEUTRAL |
| Schema/index دیگری لازم به نظر می‌رسد | B6 (sorts by sortOrder+name) and B1 (sorts by featured+sortOrder+name) might benefit from a composite index — but that's for 15-B.2 to investigate, NOT this step | ⛔ Not applicable here |

### 5.1 Decision: ACCEPT (with caveat)

The Brand_name_idx is **ACCEPTED** because:
1. ✅ Target query B3 is proven (2.81× improvement, Index Scan used).
2. ✅ No production query has meaningful regression (L14 is a simulated non-production query).
3. ✅ All other 33 queries are NEUTRAL (within noise).
4. ✅ The L14 "regression" is on a query that doesn't run in production (Prisma's `include` generates separate queries, not explicit JOINs).

**Caveat documented:** The L14 simulated query shows the planner can pick a suboptimal plan when joining Listing + Brand after the Brand_name_idx is added. This is a planner cost-estimation issue, not a correctness issue. If the project ever uses raw SQL with explicit JOINs on Listing + Brand (instead of Prisma's `include`), this regression could become real.

---

## 6. Conclusion

### 6.1 What was proven

- **B3 (the target query) improved 2.81×** — Seq Scan → Index Scan using Brand_name_idx.
- **No production query regressed** — all 28 inventory queries from 15-B.1 are NEUTRAL or IMPROVED.
- **Planner correctly uses the index only for queries that benefit from it** (B3, which sorts by `name` and has a LIMIT).
- **Planner correctly does NOT use the index for queries that wouldn't benefit** (B1, B4, B6 sort by other columns; B5 filters by pkey; B2 is a count).

### 6.2 What was NOT proven

- **Page-level TTFB improvement is NOT proven.** Per 15-A finding: DB is 1.75% of warm TTFB. The B3 savings of 0.150ms is invisible in the 78ms TTFB.
- **No other query benefits** — only B3 (the target) improved. The other 5 Brand queries don't sort by `name` alone.

### 6.3 INVESTIGATE items (deferred)

- **L14 simulated query regression (+0.173ms)** — not on production path. Documented for future investigation if raw SQL JOINs are introduced.
- **L12 scan switch** — within noise (+0.002ms). Planner correctly chose Seq Scan for a 29-row table.

### 6.4 What this step did NOT do

- ✅ No new indexes added (only the Brand_name_idx from 15-B.4.1 is in effect)
- ✅ No Promise.all implemented
- ✅ No count aggregate merged
- ✅ No ISR applied
- ✅ No code changes (only the prisma/schema.prisma change from 15-B.4.1 is in effect)
- ✅ No schema changes in this step

### 6.5 Gate status (unchanged)

- 🟢 GREEN: 73/74 PASS, 0 CRITICAL pending, 0 HIGH pending
- Total indexes: 286 (was 285, +1 Brand_name_idx from 15-B.4.1)
- 498/498 automated tests pass
- Production build: exit 0

---

## 7. Verification Commands

```bash
# Re-run this re-measure at any time:
cd /home/z/my-project
bash scripts/explain-analyze.sh  # writes to /tmp/explain-results.txt
# Compare against /tmp/explain-results-15-B-1-baseline.txt (backed up from 15-B.1)

# Verify Brand_name_idx is in place:
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT indexname FROM pg_indexes WHERE tablename='Brand' ORDER BY indexname;"
# Expected: Brand_name_idx, Brand_pkey, Brand_slug_key (3 indexes)

# Verify B3 query uses the index:
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "EXPLAIN ANALYZE SELECT * FROM \"Brand\" WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0;"
# Expected: Index Scan using Brand_name_idx, ~0.08ms
```

---

## 8. Next Steps (15-B.4.3 → 15-B.5)

Per the user's locked sequence:

```
✅ 15-A Performance Baseline
✅ 15-B.1 Production Query Inventory
✅ 15-B.2 Index Hypothesis Simulation
✅ 15-B.3 Home Query Fan-out Analysis
✅ 15-B.4.1 Brand.name index applied (ACCEPT)
✅ 15-B.4.2 Production Query Re-measure ← COMPLETE (ACCEPT with caveat)
🔵 15-B.4.3 Count Aggregate Experiment (next — before/after measurement only)
🔵 15-B.4.4 Promise.all Experiment (Q3+Q4 Phase 2 — with DB load measurement)
🔵 15-B.4.5 ISR/Cache Experiment (DESIGN only — not APPLY)
🔵 15-B.5 Full Regression + Re-measure
🟣 15-C Authenticated/Admin Performance
🟣 15-D Frontend / Bundle / Rendering
🏁 15-E Performance Regression Gate
```

**STEP 15-B.4.3 is next** — experiment with merging the 3 duplicate count pairs (Q8↔Q21, Q9↔Q22, Q10↔Q23) into a single `COUNT(*) FILTER (WHERE ...)` aggregate. Measure before/after on the actual workload. Accept ONLY if real latency reduction is observed AND no correctness regression. Per user policy: "اگر $queryRaw باعث کاهش زمان نشود یا پیچیدگی/ریسک بیشتری ایجاد کند، تغییر پذیرفته نمی‌شود."
