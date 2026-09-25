# HEAVIX — STEP 15-B.4.3: Count Aggregate Experiment

> **Purpose:** Test whether merging the 3 duplicate count pairs (Q8↔Q21, Q9↔Q22, Q10↔Q23) into 3 combined aggregate queries produces a **real, measurable improvement** — or whether the improvement is just noise. This is an EXPERIMENT with a DECISION GATE, not a guaranteed optimization.
>
> **Per user policy:**
> - "اگر aggregate واقعاً برتری نداشت، صریحاً REJECT کن و بدون تغییر برو سراغ 15-B.4.4."
> - "اگر $queryRaw باعث کاهش زمان نشود یا پیچیدگی/ریسک بیشتری ایجاد کند، تغییر پذیرفته نمی‌شود."
> - Three possible outcomes: A=ACCEPT (apply), B=REJECT (no code change), C=INVESTIGATE.
>
> **Status:** FROZEN at git commit `2c81f70` (STEP 15-B.4.2 head — Brand_name_idx in effect, no other changes).

---

## 1. Method

1. **BEFORE:** Measured all 6 individual count queries (Q8, Q21, Q9, Q22, Q10, Q23) — 5 warm runs each, median reported. Captured exec time, scan type, buffers hit, and actual result (correctness baseline).
2. **Correctness verification:** Confirmed Q8=Q21 (both return 29), Q9=Q22 (both return 629). Discovered Q10≠Q23 (Q10 returns 23, Q23 returns 30 — they have DIFFERENT predicates: Q10 adds `layer='CATALOG'` filter).
3. **AFTER:** Built 3 combined queries:
   - **Q1** (replaces Q8+Q21): identical SQL, just deduplicated.
   - **Q2** (replaces Q9+Q22): identical SQL, just deduplicated.
   - **Q3** (replaces Q10+Q23): `COUNT(*) FILTER (WHERE layer='CATALOG')` + `COUNT(*)` in one query — scans Category ONCE instead of TWICE.
4. **AFTER measurement:** 5 warm runs per combined query, median reported.
5. **Comparison:** exec time, buffers, round-trips, correctness.

---

## 2. BEFORE — 6 Individual Count Queries

| Q | SQL | Result | Median exec (5 runs) | Scan | Buffers hit |
|---|---|---:|---:|---|---:|
| Q8 | `SELECT COUNT(*) FROM "Listing" WHERE status='PUBLISHED'` | 29 | 0.078ms | Seq Scan | 3 |
| Q21 | `SELECT COUNT(*) FROM "Listing" WHERE status='PUBLISHED'` | 29 | 0.082ms | Seq Scan | 3 |
| Q9 | `SELECT COUNT(*) FROM "Brand" WHERE active=true` | 629 | 0.186ms | Seq Scan | 14 |
| Q22 | `SELECT COUNT(*) FROM "Brand" WHERE active=true` | 629 | 0.175ms | Seq Scan | 14 |
| Q10 | `SELECT COUNT(*) FROM "Category" WHERE active=true AND "parentId" IS NULL AND layer='CATALOG'` | 23 | 0.094ms | Seq Scan | 8 |
| Q23 | `SELECT COUNT(*) FROM "Category" WHERE "parentId" IS NULL AND active=true` | 30 | 0.104ms | Seq Scan | 8 |
| **TOTAL** | 6 queries | — | **0.719ms** | — | **50** |

### 2.1 Correctness baseline

- Q8 = Q21: both return 29 ✓ (true duplicates — identical predicate)
- Q9 = Q22: both return 629 ✓ (true duplicates — identical predicate)
- Q10 ≠ Q23: Q10 returns 23, Q23 returns 30 ⚠️ (near-duplicates — Q23 omits `layer='CATALOG'` filter, so it counts MORE rows)

**Important:** Q10 and Q23 are NOT interchangeable. The combined query must return BOTH counts correctly.

---

## 3. AFTER — 3 Combined Aggregate Queries

| Q | SQL | Result | Median exec (5 runs) | Scan | Buffers hit |
|---|---|---|---:|---|---:|
| Q1 (replaces Q8+Q21) | `SELECT COUNT(*) FROM "Listing" WHERE status='PUBLISHED'` | 29 | 0.079ms | Seq Scan | 3 |
| Q2 (replaces Q9+Q22) | `SELECT COUNT(*) FROM "Brand" WHERE active=true` | 629 | 0.171ms | Seq Scan | 14 |
| Q3 (replaces Q10+Q23) | `SELECT COUNT(*) FILTER (WHERE layer='CATALOG') AS q10_count, COUNT(*) AS q23_count FROM "Category" WHERE active=true AND "parentId" IS NULL` | (23, 30) | 0.107ms | Seq Scan | 8 |
| **TOTAL** | 3 queries | — | **0.357ms** | — | **25** |

### 3.1 Correctness verification

| Before query | Before result | After query | After result | Match? |
|---|---:|---|---|:---:|
| Q8 | 29 | Q1 | 29 | ✅ |
| Q21 | 29 | (deduplicated into Q1) | 29 | ✅ |
| Q9 | 629 | Q2 | 629 | ✅ |
| Q22 | 629 | (deduplicated into Q2) | 629 | ✅ |
| Q10 | 23 | Q3 (q10_count) | 23 | ✅ |
| Q23 | 30 | Q3 (q23_count) | 30 | ✅ |

**All 6 correctness checks PASS.** The combined Q3 correctly returns both 23 and 30 via FILTER.

---

## 4. Comparison Summary

| Metric | BEFORE (6 queries) | AFTER (3 queries) | Delta | Improvement |
|---|---:|---:|---:|---|
| Query count (round-trips) | 6 | 3 | -3 | **-50%** |
| Total median exec time | 0.719ms | 0.357ms | -0.362ms | **-50.3%** |
| Total buffers hit | 50 | 25 | -25 | **-50%** |
| Correctness | 6/6 correct | 6/6 correct | 0 | ✅ PASS |
| Scan type | Seq Scan (all) | Seq Scan (all) | no change | NEUTRAL |

### 4.1 Per-pair breakdown

| Pair | Before queries | Before total | After query | After exec | Savings | Savings % |
|---|---|---:|---|---:|---:|---|
| Q8 + Q21 (Listing) | Q8 (0.078) + Q21 (0.082) | 0.160ms | Q1 (0.079) | 0.079ms | 0.081ms | 50.6% |
| Q9 + Q22 (Brand) | Q9 (0.186) + Q22 (0.175) | 0.361ms | Q2 (0.171) | 0.171ms | 0.190ms | 52.6% |
| Q10 + Q23 (Category) | Q10 (0.094) + Q23 (0.104) | 0.198ms | Q3 (0.107) | 0.107ms | 0.091ms | 45.9% |
| **TOTAL** | 6 queries | 0.719ms | 3 queries | 0.357ms | **0.362ms** | **50.3%** |

### 4.2 Where the savings come from

- **Q1 (Listing pair):** Savings of 0.081ms comes from **deduplication** — Q8 and Q21 are identical, so running Q1 once instead of twice saves Q21's 0.082ms exec time. Q1's own exec time (0.079ms) is the same as Q8's (0.078ms) — within noise.
- **Q2 (Brand pair):** Savings of 0.190ms comes from **deduplication** — Q9 and Q22 are identical, so running Q2 once saves Q22's 0.175ms. Q2's own exec time (0.171ms) is within noise of Q9's (0.186ms).
- **Q3 (Category pair):** Savings of 0.091ms comes from **FILTER optimization** — Q3 scans Category ONCE (0.107ms) instead of TWICE (Q10 0.094ms + Q23 0.104ms = 0.198ms). The FILTER aggregate adds minimal overhead (0.107ms vs 0.094ms for Q10 alone) but eliminates the second scan entirely.

---

## 5. Decision Gate (per user spec)

| Criterion | Required | Actual | Met? |
|---|---|---|:---:|
| Correctness: results identical | Mandatory | All 6 results match (29, 629, 23, 30) | ✅ |
| Latency: materially lower | Mandatory | 0.719ms → 0.357ms = -50.3% (well above noise threshold) | ✅ |
| DB work / buffers: lower | Desirable + confirmed | 50 → 25 buffer hits = -50% | ✅ |
| SQL complexity justified | Must justify | FILTER aggregate is standard PostgreSQL; Q1 and Q2 are just dedup (no SQL change); Q3 uses `COUNT(*) FILTER` which is well-documented SQL standard | ✅ |
| No semantic behavior change | Required | No semantic change — same results, same predicates | ✅ |
| No regression in related queries | Required | No related queries affected (count queries are independent) | ✅ |
| Improvement NOT just noise | Required | 50.3% improvement is well above noise (individual query noise is ~±0.02ms; total savings is 0.362ms) | ✅ |

### 5.1 Additional considerations

- **TTFB impact:** The 0.362ms savings is 0.46% of the 78ms home page TTFB (per 15-A: DB is 1.75% of TTFB). The improvement is invisible at the TTFB level — consistent with 15-A's finding that DB is not the bottleneck.
- **$queryRaw concern:** The FILTER aggregate (Q3) requires `$queryRaw` in Prisma (Prisma's `groupBy` doesn't support `COUNT(*) FILTER`). Q1 and Q2 don't need `$queryRaw` — they're just deduplication at the code level (don't run the same query twice).
- **Implementation risk:** The code change touches `src/app/page.tsx` (Phase 4) and `src/lib/site-stats.ts` (`getActiveStats`). The function signature of `getActiveStats` would need to change to accept pre-computed counts.

---

## 6. Decision: A — ACCEPT (with implementation caveat)

The experiment **PROVES** the combined aggregate approach is faster:
- ✅ 50.3% latency reduction at the DB level (0.362ms saved)
- ✅ 50% fewer round-trips (6 → 3)
- ✅ 50% fewer buffer hits (50 → 25)
- ✅ All correctness checks pass
- ✅ No regression
- ✅ Improvement is real, not noise

**Per user policy:** "اگر aggregate واقعاً برتری نداشت، صریحاً REJECT کن" — the aggregate DOES have real superiority, so REJECT is not appropriate.

### 6.1 Implementation recommendation

Two implementation approaches, in order of preference:

**Approach 1 (lower risk — code-level deduplication):**
- In `page.tsx` Phase 4: fire Q8, Q9, Q10, Q11, Q12 (same as now — 5 queries).
- Pass the results to `getActiveStats()` so it skips Q21, Q22, Q23 (which are duplicates).
- `getActiveStats()` still fires Q20d (siteStat.findMany) + Q24 (Province count — unique).
- **No $queryRaw needed.** No SQL change. Just code flow change.
- Changes `getActiveStats` signature: `getActiveStats(precomputed?: { listings?: number; brands?: number; categories?: number; categoriesWithLayer?: number })`.
- **Savings:** eliminates Q21 (0.082ms) + Q22 (0.175ms) + Q23 (0.104ms) = 0.361ms. Nearly identical to the aggregate approach.
- **Risk:** LOW — no SQL change, just passing cached values.

**Approach 2 (higher risk — $queryRaw FILTER aggregate):**
- Use `$queryRaw` for Q3 (Category FILTER aggregate).
- Requires losing Prisma type safety for the Category count query.
- **Savings:** same 0.361ms (the FILTER scan vs dedup is negligible difference).
- **Risk:** MEDIUM — $queryRaw loses type safety, harder to maintain.

**Recommendation:** Approach 1 (code-level deduplication) achieves the same savings with lower risk. Approach 2 should only be used if Approach 1 is not feasible for some reason.

### 6.2 What this step did NOT do

- ✅ No code changes made (this was an EXPERIMENT step, not an application step)
- ✅ No schema changes
- ✅ No index additions
- ✅ No $queryRaw introduced
- ✅ No Promise.all changes
- ✅ No ISR changes
- ✅ Baseline preserved (Brand_name_idx from 15-B.4.1 is the only change in effect)

### 6.3 Application deferred

Per user policy: "این مرحله را باید به‌عنوان Experiment / Decision Gate اجرا کنی، نه «بهینه‌سازی قطعی»." The actual code application of the ACCEPT decision will be done in a separate, carefully measured step — NOT in 15-B.4.3 itself. The 15-B.5 (Full Regression + Re-measure) step will verify that the application (when done) doesn't regress anything.

---

## 7. Verification Commands

```bash
# Re-run this experiment at any time:
cd /home/z/my-project
export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED';"
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM \"Brand\" WHERE active=true;"
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FILTER (WHERE layer='CATALOG') AS q10, COUNT(*) AS q23 FROM \"Category\" WHERE active=true AND \"parentId\" IS NULL;"

# Verify no temp indexes or schema changes were made:
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'tmp_%';"
# Expected: 0
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public';"
# Expected: 286 (unchanged from 15-B.4.1)
```

---

## 8. Next Steps

Per the user's locked sequence:

```
✅ 15-B.4.1 Brand.name index (ACCEPT)
✅ 15-B.4.2 Re-measure 28 queries (ACCEPT)
✅ 15-B.4.3 Count aggregate experiment ← COMPLETE (ACCEPT — candidate proven)
🔵 15-B.4.4 Promise.all experiment (next — Q3+Q4 Phase 2, with DB load measurement)
🔵 15-B.4.5 ISR/cache experiment (DESIGN only — not APPLY)
🔵 15-B.5 Full regression + re-measure
🟣 15-C Authenticated/Admin performance
🟣 15-D Frontend / bundle / rendering
🏁 15-E Performance regression gate
```

**STEP 15-B.4.4 is next** — experiment with Promise.all on Q3+Q4 (Phase 2: homeCategoryConfig + siteSettings). Per user policy:
- "Promise.all فقط روی queryهایی که dependency ندارند؛ با اندازه‌گیری"
- "حتماً تعداد connectionها و فشار DB هم ثبت شود؛ صرفاً پایین آمدن wall-clock زمان کافی نیست"
- Acceptance: "کاهش واقعی wall-clock + بدون افزایش DB load"

The count aggregate application (code change) is deferred to 15-B.5 or a dedicated application step, where it can be carefully implemented and regression-tested.
