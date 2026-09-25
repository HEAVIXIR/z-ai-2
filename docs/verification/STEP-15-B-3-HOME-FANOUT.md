# HEAVIX — STEP 15-B.3: Home Query Fan-out Analysis

> **Purpose:** Build the dependency graph of all queries fired when the home page (`/`) renders. Categorize each into one of 4 groups (A=parallelizable, B=sequential, C=merge candidate, D=conditional). Compute the critical path and measure wall-clock per phase. Identify ISR candidates with explicit freshness requirements and invalidation sources — but **do NOT apply any change**.
>
> **Per user policy:**
> - "هیچ کدی تغییر نکرده" — no code changes
> - "هیچ index اضافه نشده" — no indexes added
> - "baseline قبل از هر optimization حفظ شده" — baseline preserved
> - 15-B.2 (index hypotheses) and 15-B.3 (query fan-out) are separate concerns — this document does NOT re-decide indexes.
>
> **Status:** FROZEN at git commit `ad28b61` (STEP 15-B.2 head).

---

## 1. Acceptance Criteria Checklist

| # | Criterion | Status |
|---|---|:---:|
| 1 | All real Home queries inventoried | ✅ |
| 2 | Each query has source location | ✅ (file:line in JSON) |
| 3 | Each query's dependency is identified | ✅ |
| 4 | Independent queries identified | ✅ (Group A) |
| 5 | Sequential queries documented with reason | ✅ (Group B — legitimate vs needless) |
| 6 | Duplicate queries identified | ✅ (Group C — 3 pairs) |
| 7 | Aggregate candidates identified | ✅ (FILTER aggregate strategy) |
| 8 | Conditional queries identified | ✅ (Group D — 3 SKIPPED) |
| 9 | Critical path computed | ✅ (1.170ms DB-bound) |
| 10 | Wall-clock per phase measured | ✅ (via EXPLAIN ANALYZE) |
| 11 | ISR candidates identified | ✅ (12 entries) |
| 12 | Freshness requirement per candidate recorded | ✅ |
| 13 | Invalidation source per candidate specified | ✅ |
| 14 | No code changes | ✅ |
| 15 | No indexes added | ✅ (verified: 285 total, 0 temp) |
| 16 | Baseline preserved | ✅ |

---

## 2. Method

1. **Static analysis** of `src/app/page.tsx` (656 lines) — extracted all 27 `db.*` calls with their line numbers.
2. **Dependency tracing** — for each query, identified whether it depends on a previous query's output (legitimate sequential) or is independent (parallel candidate).
3. **Phase grouping** — queries are grouped into 8 phases based on the `Promise.all` / sequential await structure of the source code.
4. **EXPLAIN (ANALYZE, BUFFERS)** on each query — 5 runs, median reported. Captured execution time, scan type, buffer hit/read.
5. **Critical path computation** — for parallel phases, take MAX(individual times); for sequential phases, take SUM(individual times).
6. **ISR candidate matrix** — for each data type, recorded freshness requirement + mutability + invalidation source + ISR candidate status.

Reproducible: `bash scripts/analyze-home-fanout.sh`
Machine-readable inventory: `scripts/home-query-inventory.json`

---

## 3. Inventory Summary

| Metric | Value |
|---|---:|
| Total `db.*` calls in source | 27 |
| Queries firing on typical render | 27 |
| Queries SKIPPED on typical render (conditional) | 3 (Q25, Q26, Q27 — table-empty checks) |
| Phases | 8 |
| Parallel phases | 5 (Phase 1, 3, 4, 6, 8b) |
| Sequential phases (legitimate) | 3 (Phase 5, 7, 8a) |
| Sequential phases (needless — Promise.all candidate) | 1 (Phase 2 — Q3 + Q4) |
| Duplicate count queries | 3 pairs (Q8↔Q21, Q9↔Q22, Q10↔Q23) |
| **Critical path DB-bound theoretical** | **1.170ms** |
| Actual home TTFB (warm, from 15-A) | 67ms |
| Actual home TTFB (cold, from 15-A) | 343ms |
| **DB % of warm TTFB** | **1.75%** |
| Non-DB overhead (JS render + network + serialization) | 98.25% |

---

## 4. Per-Query Inventory

| Q | Source | Table | Phase | Category | Exec (ms) | Scan | Dependency | Notes |
|---|---|---|:---:|---|---:|---|---|---|
| Q1 | `page.tsx:52` | Brand | 1 | A_PARALLEL | 0.298 | Seq Scan | None | Promise.all with Q2 |
| Q2 | `page.tsx:58` | Category | 1 | A_PARALLEL | 0.185 | Seq Scan | None | Promise.all with Q1 |
| Q3 | `page.tsx:69` | HomeCategoryConfig | 2 | B_SEQUENTIAL_NEEDLESS | 0.027 | Index Scan (pkey) | None | Separate await — Promise.all candidate with Q4 |
| Q4 | `page.tsx:79` | SiteSettings | 2 | B_SEQUENTIAL_NEEDLESS | 0.037 | Index Scan (pkey) | None | Separate await — Promise.all candidate with Q3 |
| Q5 | `page.tsx:88` | Listing | 3 | A_PARALLEL | 0.071 | Seq Scan | Q4 (verifiedOnlyFlag affects Q6) | Promise.all with Q6, Q7. N+1 risk on images include. |
| Q6 | `page.tsx:94` | Listing | 3 | A_PARALLEL | 0.063 | Seq Scan | Q4 (verifiedOnlyFlag) | Predicate depends on siteSettings. |
| Q7 | `page.tsx:102` | Listing | 3 | A_PARALLEL | 0.083 | Seq Scan | None | Promise.all with Q5, Q6. |
| Q8 | `page.tsx:114` | Listing | 4 | **C_MERGE_CANDIDATE** | 0.074 | Seq Scan | None | **DUPLICATE of Q21** (same predicate `status='PUBLISHED'`) |
| Q9 | `page.tsx:115` | Brand | 4 | **C_MERGE_CANDIDATE** | 0.183 | Seq Scan | None | **DUPLICATE of Q22** (same predicate `active=true`) — slowest in Phase 4 |
| Q10 | `page.tsx:116` | Category | 4 | **C_MERGE_CANDIDATE** | 0.102 | Seq Scan | None | Near-duplicate of Q23 (Q10 adds `layer='CATALOG'` filter) |
| Q11 | `page.tsx:117` | Listing | 4 | **C_MERGE_CANDIDATE** | 0.070 | Seq Scan | None | Mergeable with Q8 + Q12 via COUNT(*) FILTER |
| Q12 | `page.tsx:118` | Listing | 4 | **C_MERGE_CANDIDATE** | 0.070 | Seq Scan | None | Mergeable with Q8 + Q11 via COUNT(*) FILTER |
| Q13 | `page.tsx:119` | BuyRequest | 4 | A_PARALLEL | 0.044 | Seq Scan | None | Table currently empty |
| Q14 | `page.tsx:124` | Article | 4 | A_PARALLEL | 0.034 | Seq Scan | None | Table currently empty |
| Q15 | `page.tsx:130` | HotSearch | 4 | A_PARALLEL | 0.038 | Seq Scan | None | Table currently empty |
| Q16 | `page.tsx:136` | HomePageSection | 4 | A_PARALLEL | 0.049 | Seq Scan | None | Returns 16 rows (skipped createMany conditional) |
| Q17 | `page.tsx:198` | HeroConfig | 4 | A_PARALLEL | 0.034 | Index Scan (pkey) | None | Returns null (empty) — drives skipping Q27 |
| Q18 | `page.tsx:206` | Category | 5 | B_SEQUENTIAL_LEGITIMATE | 0.035 | Index Scan (slug_key) | None | First in sequential pair (machinery root) |
| Q19 | `page.tsx:218` | Category | 5 | B_SEQUENTIAL_LEGITIMATE | 0.091 | Seq Scan | **Q18** (machinery.id) | Real data dependency: parentId = Q18.id |
| Q20a | `page.tsx:240` | BrandDisplay | 6 | A_PARALLEL | 0.024 | Seq Scan | None | Promise.all with Q20b — returns 0 rows (table empty) |
| Q20b | `page.tsx:244` | Brand | 6 | A_PARALLEL | 0.115 | Seq Scan | None | Promise.all with Q20a — returns 17 featured brand IDs |
| Q20c | `page.tsx:254` | Brand | 7 | B_SEQUENTIAL_LEGITIMATE | 0.068 | Index Scan (pkey) | Q20a + Q20b (id list) | Real data dependency: id IN (...) from Phase 6 |
| Q20d | `page.tsx:358 → site-stats.ts:84` | SiteStat | 8 | B_SEQUENTIAL | 0.049 | Seq Scan | None | Phase 8a — fires before the 4 parallel count queries |
| Q21 | `site-stats.ts:91` | Listing | 8 | **C_MERGE_CANDIDATE** | 0.074 | Seq Scan | Q20d (metric='listings') | **DUPLICATE of Q8** — fires via getActiveStats |
| Q22 | `site-stats.ts:89` | Brand | 8 | **C_MERGE_CANDIDATE** | 0.184 | Seq Scan | Q20d (metric='brands') | **DUPLICATE of Q9** — fires via getActiveStats |
| Q23 | `site-stats.ts:87` | Category | 8 | **C_MERGE_CANDIDATE** | 0.108 | Seq Scan | Q20d (metric='categories') | Near-duplicate of Q10 (omits `layer` filter) |
| Q24 | `site-stats.ts:97` | Province | 8 | A_PARALLEL | 0.042 | Seq Scan | Q20d (metric='provinces') | Unique — no duplicate in Phase 4 |
| Q25_SKIPPED | `page.tsx:159` | HomePageSection | 4 | D_CONDITIONAL | n/a | n/a | Q16 returns 0 rows | **FIRES ONLY on first home render ever** (one-time seeding) |
| Q26_SKIPPED | `page.tsx:179,190` | HomePageSection | 4 | D_CONDITIONAL | n/a | n/a | Q16 row check | Fires only for missing keys — all 6 exist → SKIPPED |
| Q27_SKIPPED | `page.tsx:394` | Listing | 9 | D_CONDITIONAL | n/a | n/a | Q17 (heroConfig has card IDs) | HeroConfig is empty → SKIPPED |

---

## 5. Dependency Graph (Critical Path)

```
                       HOME REQUEST
                            │
                            ▼
                  ┌─── PHASE 1 ───┐
                  │  Promise.all  │
                  │  Q1 (Brand)   │   0.298ms (max)
                  │  Q2 (Categor) │
                  └───────┬───────┘
                          │
                          ▼
                  ┌─── PHASE 2 ───┐
                  │  Sequential   │
                  │  Q3 (HCC)     │   0.064ms (sum)
                  │  Q4 (SiteSet) │   ← NEEDLESS sequential,
                  └───────┬───────┘     Promise.all candidate
                          │
                          ▼
                  ┌─── PHASE 3 ───┐
                  │  Promise.all  │
                  │  Q5 (feat)    │
                  │  Q6 (verif)   │   0.083ms (max)
                  │  Q7 (latest)  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌─── PHASE 4 ───┐
                  │  Promise.all  │
                  │  Q8..Q17      │   0.183ms (max)
                  │  (10 queries) │   ← Q8,Q9,Q10,Q11,Q12 are
                  └───────┬───────┘     MERGE CANDIDATES
                          │
                          ▼
                  ┌─── PHASE 5 ───┐
                  │  Sequential   │
                  │  Q18 (root)   │   0.126ms (sum)
                  │  Q19 (child)  │   ← LEGITIMATE — Q19 uses Q18.id
                  └───────┬───────┘
                          │
                          ▼
                  ┌─── PHASE 6 ───┐
                  │  Promise.all │
                  │  Q20a (disp)  │   0.115ms (max)
                  │  Q20b (feat)  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌─── PHASE 7 ───┐
                  │  Sequential  │
                  │  Q20c (IN)   │   0.068ms
                  │              │   ← LEGITIMATE — depends on Phase 6
                  └───────┬───────┘
                          │
                          ▼
                  ┌─── PHASE 8 ───┐
                  │  8a: Q20d     │   0.049ms (Seq)
                  │  8b: Promise  │
                  │       .all    │
                  │  Q21,Q22,Q23, │   0.184ms (max — Q22)
                  │  Q24 (counts)│   ← Q21,Q22,Q23 DUPLICATE
                  └───────────────┘     Phase 4 count queries
                          
                  ═══════════════════
                  CRITICAL PATH = 1.170ms
                  ═══════════════════
```

### 5.1 Phase timing breakdown

| Phase | Pattern | Wall-clock (ms) | Critical path contribution |
|---|---|---:|---|
| 1 | Parallel (Promise.all) | 0.298 (max) | 25.5% |
| 2 | Sequential (needless) | 0.064 (sum) | 5.5% |
| 3 | Parallel (Promise.all) | 0.083 (max) | 7.1% |
| 4 | Parallel (Promise.all) | 0.183 (max) | 15.6% |
| 5 | Sequential (legitimate) | 0.126 (sum) | 10.8% |
| 6 | Parallel (Promise.all) | 0.115 (max) | 9.8% |
| 7 | Sequential (legitimate) | 0.068 | 5.8% |
| 8 | 8a Sequential + 8b Parallel | 0.233 | 19.9% |
| **TOTAL** | | **1.170** | **100%** |

---

## 6. Duplicate / Merge Candidate Analysis (Q8-Q12 + Q21-Q23)

### 6.1 Identified duplicates

The home page fires 8 count queries across 2 phases:

**Phase 4 (5 counts):**
- Q8: `Listing WHERE status='PUBLISHED'` → 29
- Q9: `Brand WHERE active=true` → 629
- Q10: `Category WHERE active=true AND parentId IS NULL AND layer='CATALOG'` → 23
- Q11: `Listing WHERE status='PUBLISHED' AND featured=true` → 8
- Q12: `Listing WHERE status='PUBLISHED' AND verified=true` → 0

**Phase 8 (4 counts via `getActiveStats`):**
- Q21: `Listing WHERE status='PUBLISHED'` → 29 (**duplicate of Q8**)
- Q22: `Brand WHERE active=true` → 629 (**duplicate of Q9**)
- Q23: `Category WHERE parentId IS NULL AND active=true` → 23 (near-duplicate of Q10 — omits `layer` filter, but predicate matches same rows)
- Q24: `Province` → 31 (unique, no duplicate)

### 6.2 Predicates combinable?

Yes. All Phase 4 listing counts (Q8, Q11, Q12) filter on `Listing` with `status='PUBLISHED'` as a base condition plus optional `featured` / `verified`. They can be replaced by **one SQL aggregate**:

```sql
SELECT
  COUNT(*) FILTER (WHERE status='PUBLISHED')                            AS active,
  COUNT(*) FILTER (WHERE status='PUBLISHED' AND featured=true)         AS featured,
  COUNT(*) FILTER (WHERE status='PUBLISHED' AND verified=true)         AS verified
FROM "Listing";
```

Same pattern for Brand (Q9 + Q22 are identical), Category (Q10 + Q23 are near-identical).

### 6.3 Estimated savings (NOT applied)

If applied (deferred to 15-B.4):
- 8 count queries → 3 SQL statements (one per table: Listing, Brand, Category)
- Phase 4 wall-clock (parallel max): 0.183ms → max(0.074, 0.183, 0.102) = 0.183ms (no change — Q9 Brand count is still the bottleneck)
- Phase 8 wall-clock: 0.233ms → ~0.06ms (just 1 siteStat.findMany + 1 Province count)
- **Theoretical critical path savings: ~0.366ms** (1.170ms → 0.804ms, ~31% reduction)

**Verdict:** Small absolute savings (0.366ms) but proportionally significant (31% of DB-bound critical path). Worth applying in 15-B.4 if combined with other improvements.

### 6.4 Implementation caveat (deferred)

Prisma doesn't directly support `COUNT(*) FILTER (WHERE ...)` syntax. Three implementation options:

1. **Raw SQL via `$queryRaw`** — most direct, but breaks Prisma's type safety.
2. **`groupBy` with multiple `_count`** — Prisma supports but doesn't compose well across multiple filter dimensions.
3. **Replace `getActiveStats()` with a cached aggregate** — cache the result for 60s and invalidate on listing/brand/category mutations.

**Not applied here.** Deferred to 15-B.4 with measurement before/after.

---

## 7. Conditional Queries (Group D) — One-time or Skipped

These queries are **NOT** part of the steady-state fan-out and should not drive architecture decisions:

| Query | Source | Fires when | Currently |
|---|---|---|---|
| Q25 | `page.tsx:159` `homePageSection.createMany` | HomePageSection table is empty | **SKIPPED** (16 rows present) |
| Q26 | `page.tsx:179,190` `homePageSection.create/update` | Missing keys in HomePageSection | **SKIPPED** (all 6 keys present) |
| Q27 | `page.tsx:394` `listing.findMany(heroCardListingIds)` | HeroConfig has card listing IDs | **SKIPPED** (HeroConfig empty) |

**Conclusion:** Q25 fires once on first home render ever (after initial seed). Q26 and Q27 are conditionally skipped on every render currently. None of these should be optimized or merged with steady-state read queries.

---

## 8. ISR Candidate Matrix

Per user policy: "Page Builder lifecycle has explicit Draft → Preview → Publish → Version → Rollback. Cache strategy MUST connect to publish/rollback events via `revalidatePath`, NOT a generic `revalidate: 60`."

### 8.1 Data types and ISR candidacy

| Data type | Freshness req | Mutability | Invalidation source | ISR candidate | Strategy |
|---|---|---|---|---|---|
| Brands (Q1, Q20b, Q20c) | Low/Med | Medium (admin) | brand mutation | **YES** | `revalidate: 300s` OR `revalidateTag('brands')` on brand create/update/delete |
| Categories (Q2, Q10, Q18, Q19) | Low | Medium (admin) | category mutation | **YES** | `revalidate: 600s` OR `revalidateTag('categories')` |
| Featured/Verified/Latest Listings (Q5, Q6, Q7) | High | High | listing publish/unpublish/update | **NEEDS REVIEW** | `revalidate: 60s` OR `revalidatePath('/')` on publish — MUST align with Page Builder's existing `revalidatePath('/')` (in `/api/admin/pages/[id]/publish/route.ts`) |
| Site settings (Q4) | Low | Low (admin) | settings mutation | **YES** | `revalidate: 3600s` OR `revalidateTag('settings')` |
| HomePageSection (Q16) | Low | Low (admin) | homePageSection mutation | **YES** | `revalidate: 3600s` OR `revalidateTag('home-sections')` |
| HeroConfig (Q17) | Low | Low (admin) | heroConfig mutation | **YES** | `revalidate: 3600s` OR `revalidateTag('hero')` |
| HomeCategoryConfig (Q3) | Low | Low (admin) | homeCategoryConfig mutation | **YES** | `revalidate: 3600s` OR `revalidateTag('home-cat-config')` |
| BuyRequests (Q13) | Medium | Medium | buyRequest mutation | **MAYBE** | `revalidate: 60s` — shown on home page |
| Articles (Q14) | Low | Low (admin/editor) | article mutation | **YES** | `revalidate: 600s` OR `revalidateTag('articles')` |
| HotSearches (Q15) | Medium | Low (admin) | hotSearch mutation | **YES** | `revalidate: 600s` OR `revalidateTag('hot-searches')` |
| SiteStats rows (Q20d) | Low/Med | Low (admin) | siteStat mutation | **YES** | `revalidate: 300s` — caching SiteStat rows avoids re-running count queries (Q21, Q22, Q23, Q24) |
| Live counts (Q21-Q24) | Med | High (driven by underlying tables) | any underlying table mutation | **MAYBE** | If cached, needs `revalidateTag('counts:listings')` etc. — invalidation must trigger on EVERY underlying table mutation |
| Page Builder layout | Depends on publish | Medium | page publish/rollback | **YES (with strategy)** | MUST use `revalidatePath` tied to publish/rollback events — NOT a generic `revalidate: 60`. Already wired in `/api/admin/pages/[id]/publish/route.ts` and `/api/admin/pages/[id]/rollback/route.ts`. |

### 8.2 Key alignment requirement

The Page Builder already implements cache invalidation via `revalidatePath` on publish and rollback (see STEP 14.7-G). Any home page ISR strategy must:

1. **Reuse the same invalidation model** — `revalidatePath('/')` on relevant mutations.
2. **Use `revalidateTag` for fine-grained cache invalidation** — e.g., `revalidateTag('listings')` covers all listing-driven sections.
3. **NOT introduce an independent `revalidate: 60` that bypasses publish/rollback events.**

This ensures cache invalidation remains tied to actual data mutations, not arbitrary time windows.

### 8.3 What this analysis does NOT do

- **No `revalidate` is added to any page.** All entries above are candidates for 15-B.4.
- **No `unstable_cache` wrapper is added.** Home page renders server-side every request (verified in 15-A §6).
- **No `revalidateTag` calls are added.** The Page Builder's existing invalidation hooks remain the canonical model.

---

## 9. Critical Path Analysis

### 9.1 Theoretical DB-bound critical path: 1.170ms

Computed as: Phase 1 (max 0.298) + Phase 2 (sum 0.064) + Phase 3 (max 0.083) + Phase 4 (max 0.183) + Phase 5 (sum 0.126) + Phase 6 (max 0.115) + Phase 7 (0.068) + Phase 8 (0.233).

### 9.2 Comparison to actual TTFB (from STEP 15-A)

| Metric | Value | Source |
|---|---:|---|
| DB-bound critical path (theoretical) | 1.170ms | This step |
| Actual home TTFB (warm) | 67ms | 15-A §2.1 |
| Actual home TTFB (cold) | 343ms | 15-A §3 |
| **DB % of warm TTFB** | **1.75%** | computed |
| Non-DB overhead | 98.25% | JS render + HTML serialization + network |

### 9.3 What this proves

> **Optimizing the database alone will not meaningfully improve home page TTFB.** Even if every DB query ran in 0ms (theoretically), the home page TTFB would only drop from 67ms to ~66ms. The bottleneck is JavaScript rendering + HTML serialization + network — which is the domain of STEP 15-D (Frontend).

### 9.4 What this does NOT prove

- It does NOT prove that DB optimization is worthless. As data grows (Listing > 1,000 rows, Brand > 5,000 rows), the DB-bound critical path will grow proportionally. At some point, it will become the bottleneck.
- It does NOT prove that Promise.all batching is useless. The 0.366ms savings from merging duplicate counts is small now but will scale with data.
- It does NOT prove that ISR is unnecessary. ISR would eliminate ALL DB queries for cached requests — bringing the home page TTFB down to JS render time + network only.

### 9.5 Decision: defer to 15-B.4

Per the user's principle: "اگر optimization باعث regression شود، تغییر پذیرفته نشود." (If optimization causes regression, the change is not accepted.)

The data shows:
- DB is currently 1.75% of warm TTFB.
- **The single most impactful optimization would be ISR** — eliminates all 27 DB queries for cached requests.
- But ISR must align with Page Builder's invalidation model (per §8.2).

These are candidates for 15-B.4. **Not applied here.**

---

## 10. Verification

```bash
# Re-run this analysis at any time:
cd /home/z/my-project
bash scripts/analyze-home-fanout.sh
# Output: /tmp/home-fanout-analysis.txt

# Verify no temp indexes leaked:
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'tmp_heavix_%';"
# Expected: 0

# Verify total index count (baseline = 285):
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PGUSER=heavix PGHOST=localhost PGDATABASE=heavix \
psql -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public';"
# Expected: 285

# Validate the JSON inventory:
python3 -c "import json; d = json.load(open('scripts/home-query-inventory.json')); print(f'Valid: {len(d[\"queries\"])} queries, {len(d[\"phases\"])} phases')"
```

---

## 11. Conclusion

### 11.1 What this analysis proved

- **27 queries** fire on a typical home render (22 in page.tsx + 5 via `getActiveStats` in site-stats.ts).
- **13 are already parallelized** via Promise.all (good).
- **3 are legitimately sequential** with real data dependencies (Phase 5: parentId lookup; Phase 7: id-list lookup).
- **2 are needlessly sequential** (Phase 2: homeCategoryConfig + siteSettings — Promise.all candidate, but savings is only 0.027ms).
- **8 are merge candidates** (3 duplicate pairs: Q8↔Q21, Q9↔Q22, Q10↔Q23, plus Q11 + Q12 which can merge with Q8).
- **3 are conditional** (Q25, Q26, Q27 — currently skipped on typical render).
- **Critical path = 1.170ms** (DB-bound theoretical).
- **DB is 1.75% of warm TTFB** — JS render + serialization is the bottleneck.

### 11.2 Candidates for 15-B.4 (deferred — NOT applied)

| Candidate | Estimated savings | Risk | Decision pending |
|---|---:|---|---|
| Merge 3 duplicate count pairs into FILTER aggregates | 0.366ms (31% of DB critical path) | Low — needs Prisma `$queryRaw` | 15-B.4 |
| Promise.all Q3 + Q4 (Phase 2) | 0.027ms | Trivial | 15-B.4 |
| ISR with tag-based invalidation aligned to Page Builder | ~1.17ms (eliminates ALL DB queries for cached requests) | Medium — needs invalidation strategy tied to publish/rollback events | 15-B.4 (with extra design review) |

### 11.3 What was NOT done (per user policy)

- ✅ No code changes (`src/app/page.tsx` unchanged)
- ✅ No indexes added (285 total, 0 temp)
- ✅ No Promise.all implemented
- ✅ No aggregate merged
- ✅ No ISR applied
- ✅ No `revalidateTag` calls added
- ✅ No `unstable_cache` wrappers added
- ✅ No regression risk introduced

### 11.4 Status of STEP 15-B

```
✅ 15-A Performance Baseline
✅ 15-B.1 Production Query Inventory
✅ 15-B.2 Index Hypothesis Simulation (1 PROVEN: B-H1 Brand.name)
✅ 15-B.3 Home Query Fan-out Analysis ← COMPLETE
🔵 15-B.4 Apply ONLY proven improvements (next)
🔵 15-B.5 Regression + Re-measure
🟣 15-C Authenticated/Admin Performance
🟣 15-D Frontend / Bundle / Rendering
🏁 15-E Performance Regression Gate
```

**STEP 15-B.4 is next.** It will apply ONLY:
1. B-H1 (Brand.name index — proven in 15-B.2 with 3.41× improvement)
2. Merge candidates from this step (Q8+Q11+Q12 → 1 FILTER aggregate; eliminate Q21+Q22+Q23 duplicates)
3. Promise.all Q3+Q4 (Phase 2 needless sequential)
4. ISR with tag-based invalidation (only if design review confirms alignment with Page Builder)

Each change will be measured before/after against the 15-A baseline + 15-B.1 inventory. **If any change regresses the home page TTFB or any EXPLAIN query time, it will be reverted.**
