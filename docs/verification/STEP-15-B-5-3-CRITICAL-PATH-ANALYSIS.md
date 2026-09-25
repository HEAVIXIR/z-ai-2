# HEAVIX — STEP 15-B.5.3: Homepage Critical-Path Analysis

> **Purpose:** Extract the complete dependency DAG of `src/app/page.tsx`, calculate the current critical path, identify the theoretical minimum, and determine whether any safe parallelization candidates exist that would reduce the critical path. **This is ANALYSIS ONLY** — no code changes are made in this step.
>
> **Per user policy:**
> - "نباید بپرسیم: «کدام queryها را می‌توان Promise.all کرد؟» بلکه باید بپرسیم: «حداقل زمان لازم برای عبور از dependency graph فعلی چیست؟»"
> - "اگر تغییر فقط سطح اول را بهبود دهد ولی در TTFB قابل مشاهده نباشد، باید دقیقاً با همین عنوان ثبت شود"
>
> **Status:** FROZEN at git commit `b90e26d` (STEP 15-B.5.2 head — Promise.all Q3+Q4 applied).

---

## 1. Method

1. **Freeze** current `page.tsx` (post-15-B.5.2 state).
2. **Extract** all 27 Prisma operations with line numbers.
3. **Map** variable dependencies: which query results feed into which subsequent queries.
4. **Map** consumers: where each query result is used (component props, fallback logic).
5. **Construct** dependency DAG.
6. **Calculate** current critical path (longest dependency chain).
7. **Find** independent query waves.
8. **Identify** minimum safe Promise.all candidates.
9. **Benchmark** candidates.
10. **Decision**: implement OR close as "Analysis Only / No Safe Change Found."

---

## 2. All Homepage Prisma Operations (post-15-B.5.2 state)

| ID | Line | Prisma operation | Table | Executed in |
|---|---:|---|---|---|
| Q1 | 52 | `db.brand.findMany({ active, take 20, include _count.listings })` | Brand | Phase 1 Promise.all |
| Q2 | 58 | `db.category.findMany({ active, CATALOG, include _count.listings })` | Category | Phase 1 Promise.all |
| Q3 | 78 | `db.homeCategoryConfig.findUnique({ id: "main" })` | HomeCategoryConfig | Phase 2 Promise.all |
| Q4 | 79 | `db.siteSettings.findUnique({ id: "main" })` | SiteSettings | Phase 2 Promise.all |
| Q5 | 93 | `db.listing.findMany({ PUBLISHED, featured, take 8 })` | Listing | Phase 3 Promise.all |
| Q6 | 99 | `db.listing.findMany({ verifiedOnlyFlag ? verified : PUBLISHED, take 8 })` | Listing | Phase 3 Promise.all |
| Q7 | 107 | `db.listing.findMany({ PUBLISHED, showInLatest, take 10 })` | Listing | Phase 3 Promise.all |
| Q8 | 119 | `db.listing.count({ PUBLISHED })` | Listing | Phase 4 Promise.all |
| Q9 | 120 | `db.brand.count({ active })` | Brand | Phase 4 Promise.all |
| Q10 | 121 | `db.category.count({ active, parentId null, CATALOG })` | Category | Phase 4 Promise.all |
| Q11 | 122 | `db.listing.count({ PUBLISHED, featured })` | Listing | Phase 4 Promise.all |
| Q12 | 123 | `db.listing.count({ PUBLISHED, verified })` | Listing | Phase 4 Promise.all |
| Q13 | 124 | `db.buyRequest.findMany({ ACTIVE, take 6 })` | BuyRequest | Phase 4 Promise.all |
| Q14 | 129 | `db.article.findMany({ PUBLISHED, take 4 })` | Article | Phase 4 Promise.all |
| Q15 | 135 | `db.hotSearch.findMany({ active, take 9 })` | HotSearch | Phase 4 Promise.all |
| Q16 | 141 | `db.homePageSection.findMany({ active })` (IIFE) | HomePageSection | Phase 4 Promise.all |
| Q17 | 203 | `db.heroConfig.findUnique({ id: "main" })` | HeroConfig | Phase 4 Promise.all |
| Q18 | 211 | `db.category.findFirst({ slug: "machinery", active })` | Category | Phase 5 sequential IIFE |
| Q19 | 223 | `db.category.findMany({ parentId: machinery.id OR config.parentId })` | Category | Phase 5 sequential IIFE |
| Q20a | 245 | `db.brandDisplay.findMany({ showOnHomepage })` | BrandDisplay | Phase 6 IIFE (internal Promise.all) |
| Q20b | 249 | `db.brand.findMany({ featured, active, select id })` | Brand | Phase 6 IIFE (internal Promise.all) |
| Q20c | 259 | `db.brand.findMany({ id IN [...], active, take 20 })` | Brand | Phase 6 IIFE (sequential after Q20a+Q20b) |
| Q23 | (site-stats.ts:37) | `db.category.count({ parentId null, active })` | Category | Phase 7 getActiveStats |
| Q24 | (site-stats.ts:44) | `db.province.count()` | Province | Phase 7 getActiveStats |
| Q27 | 407 | `db.listing.findMany({ id IN heroCardIds, PUBLISHED })` (conditional) | Listing | Phase 8 conditional |

**Total: 25 queries** (Q21 and Q22 eliminated in 15-B.5.1; Q25/Q26 conditional skipped; Q27 conditional skipped)

---

## 3. Variable Dependency Map

| Query | Variable produced | Depends on (data) | Consumed by |
|---|---|---|---|
| Q1 | `allBrands` | nothing | tickerBrands mapping (line 287) |
| Q2 | `allCategories` | nothing | categories mapping (line 275) |
| Q3 | `homeCategoryConfigRow` → `homeCategoryConfig` | nothing | Phase 5 `where` clause (line 220) |
| Q4 | `siteSettings` | nothing | `verifiedOnlyFlag` (line 90), Phase 3 Q6 predicate |
| Q5 | `featuredRows` | nothing (but Q6 depends on verifiedOnlyFlag from Q4) | featuredListings mapping |
| Q6 | `verifiedRows` | **verifiedOnlyFlag (from Q4)** | verifiedListings mapping |
| Q7 | `latestRows` | nothing | latestAds mapping |
| Q8 | `activeListings` | nothing | liveCount (line 380), fallback stats (line 374), **getActiveStats precomputed (line 369)** |
| Q9 | `brandCount` | nothing | BrandsSection (lines 598, 606), fallback stats, **getActiveStats precomputed (line 370)** |
| Q10 | `categoryCount` | nothing | fallback stats only (not used when activeStats > 0) |
| Q11 | `featuredCount` | nothing | fallback stats only |
| Q12 | `verifiedCount` | nothing | **DEAD CODE** (never used) |
| Q13 | `requestRows` | nothing | activeRequests mapping |
| Q14 | `articleRows` | nothing | knowledgeCards mapping |
| Q15 | `hotSearchRows` | nothing | hotSearches mapping |
| Q16 | `homeSections` | nothing | homeSections iteration |
| Q17 | `heroConfig` | nothing | hero card listing IDs (line 404) |
| Q18 | `machinery` | nothing | Phase 5 `where` clause for Q19 |
| Q19 | `rows` (L1 children) | **machinery.id (from Q18)**, **homeCategoryConfig (from Q3)** | machineCategoryCards mapping |
| Q20a | `displayBrands` | nothing | Phase 6 `ids` Set |
| Q20b | `featuredBrands` | nothing | Phase 6 `ids` Set |
| Q20c | `rows` (trusted brands) | **ids Set (from Q20a + Q20b)** | trustedBrands mapping |
| Q23 | categories count | **siteStat rows (from Phase 7 siteStat.findMany)** | activeStats values |
| Q24 | provinces count | **siteStat rows** | activeStats values |
| Q27 | heroCardListingRows | **heroConfig.cardIds (from Q17)** | hero card mapping |

---

## 4. Dependency DAG

```
                    ┌── Phase 1 [Q1, Q2]              (independent — no deps)
                    │
                    ├── Phase 2 [Q3, Q4]              (independent of Phase 1)
                    │       │
                    │       ├── Phase 2.5 → Phase 3 [Q5, Q6*, Q7]
                    │       │                    (* Q6 needs verifiedOnlyFlag from Q4)
                    │       │
                    │       └── Phase 5 [Q18 → Q19]
                    │                           (Q19 needs machinery.id from Q18
                    │                            AND homeCategoryConfig from Q3)
                    │
                    ├── Phase 4 [Q8–Q17]              (independent of Phase 1/2/3!)
                    │       │
                    │       ├── Phase 7 (getActiveStats)
                    │       │     (needs Q8 + Q9 from Phase 4)
                    │       │
                    │       └── Phase 8 (Q27, conditional)
                    │             (needs Q17/heroConfig from Phase 4)
                    │
                    └── Phase 6 [Q20a, Q20b → Q20c]
                          (independent of EVERYTHING — self-contained IIFE)
```

### 4.1 Key finding: Many phases are TRULY independent

| Phase | Currently sequential after | Actually depends on | Could start in parallel with |
|---|---|---|---|
| Phase 1 | (first) | nothing | — |
| Phase 2 | Phase  | nothing | Phase 1 |
| Phase 3 | Phase 2 | Q4 (via verifiedOnlyFlag) | Phase 1, Phase 4, Phase 6 |
| Phase 4 | Phase 3 | nothing | Phase 1, Phase 2, Phase 3 |
| Phase 5 | Phase 4 | Q3 (homeCategoryConfig) | Phase 3, Phase 4, Phase 6 |
| Phase 6 | Phase 5 | nothing | Phase 1, Phase 2, Phase 3, Phase 4, Phase 5 |
| Phase 7 | Phase 6 (after mapping) | Q8 + Q9 (from Phase 4) | Phase 5, Phase 6 |
| Phase 8 | Phase 7 | Q17 (from Phase 4) | Phase 5, Phase 6, Phase 7 |

---

## 5. Critical Path Calculation

### 5.1 Measured latencies (from 15-B.1 + 15-B.4.2, median of 5 runs)

| Phase | Pattern | Wall-clock (ms) |
|---|---|---:|
| Phase 1 | Promise.all max | 0.298 |
| Phase 2 | Promise.all max | 0.037 |
| Phase 2.5 | local computation | 0.000 |
| Phase 3 | Promise.all max | 0.083 |
| Phase 4 | Promise.all max | 0.186 |
| Phase 5 | sequential sum | 0.126 |
| Phase 6 | Promise.all + sequential | 0.183 |
| Phase 7 | sequential + Promise.all | 0.157 |
| Phase 8 | conditional (skipped) | 0.000 |

### 5.2 Current critical path (ALL phases sequential)

```
Phase 1 (0.298) → Phase 2 (0.037) → Phase 2.5 (0) → Phase 3 (0.083)
→ Phase 4 (0.186) → Phase 5 (0.126) → Phase 6 (0.183) → Phase 7 (0.157) → Phase 8 (0)
= 1.070ms
```

### 5.3 Critical path chains (longest dependency chain per branch)

| Chain | Path | Latency |
|---|---|---:|
| 1 | Phase 2 → Phase 2.5 → Phase 3 | 0.037 + 0 + 0.083 = 0.120ms |
| 2 | Phase 2 → Phase 5 (Q18→Q19) | 0.037 + 0.035 + 0.091 = 0.163ms |
| 3 | **Phase 4 → Phase 7** | **0.186 + 0.157 = 0.343ms** ← LONGEST |
| 4 | Phase 4 → Phase 8 (skipped) | 0.186 + 0 = 0.186ms |

### 5.4 Theoretical minimum (if all independent phases parallelized into 3 waves)

```
Wave 1: max(Phase 1 [0.298], Phase 2 [0.037], Phase 4 [0.186], Phase 6 [0.183]) = 0.298ms
Wave 2: max(Phase 3 [0.083], Phase 5 [0.126]) = 0.126ms
Wave 3: max(Phase 7 [0.157], Phase 8 [0]) = 0.157ms
Minimum = 0.298 + 0.126 + 0.157 = 0.581ms
```

### 5.5 Potential savings

| Metric | Current | Theoretical minimum | Savings |
|---|---:|---:|---:|
| DB critical path | 1.070ms | 0.581ms | **0.489ms (45.7%)** |
| Warm TTFB | ~67ms | ~67ms | **0ms (invisible)** |
| DB % of TTFB | 1.75% | 0.87% | — |

**The 0.489ms DB-level savings is invisible at TTFB level** (0.73% of 67ms TTFB).

---

## 6. Safe Parallelization Candidates

### 6.1 Candidate analysis

| Candidate | What it does | Dependency-safe? | Semantic-safe? | Measurable TTFB? |
|---|---|:---:|:---:|:---:|
| Merge Phase 1 + Phase 2 into one Promise.all | Q1,Q2,Q3,Q4 in parallel | ✅ (no data dep) | ✅ | ❌ (0.037ms saved, invisible) |
| Merge Phase 4 into Wave 1 (parallel with Phase 1/2) | Phase 4 fires alongside Phase 1/2 | ✅ (no data dep) | ✅ | ❌ (0.186ms saved, invisible) |
| Merge Phase 6 into Wave 1 (parallel with everything) | Phase 6 fires alongside all | ✅ (no data dep) | ✅ | ❌ (0.183ms saved, invisible) |
| Move Phase 7 earlier (right after Phase 4) | getActiveStats fires after Phase 4, parallel with Phase 5/6 | ✅ (only needs Q8+Q9) | ✅ | ❌ (0.157ms saved, invisible) |
| Move Phase 5 earlier (parallel with Phase 3) | Phase 5 fires alongside Phase 3 (both depend on Phase 2) | ✅ (only needs Q3) | ✅ | ❌ (0.083ms saved, invisible) |

### 6.2 All candidates pass dependency-safe + semantic-safe, BUT none pass measurable TTFB

Every candidate:
- ✅ Is dependency-safe (no data dependency violated)
- ✅ Is semantic-safe (same queries, same results, same code logic)
- ❌ Is NOT measurable at TTFB level (savings of 0.04-0.19ms each, all invisible in 67ms TTFB)

### 6.3 Risk assessment

The code restructure required to achieve the theoretical minimum would involve:

1. **Restructure all Promise.all blocks** into 3 waves (Wave 1, 2, 3)
2. **Move IIFE blocks** (Phase 5, Phase 6) to fire earlier
3. **Move getActiveStats call** from line 368 to right after Phase 4
4. **Restructure variable scoping** — many variables currently declared in sequence would need to be destructured from nested Promise.all results

This is a **major code restructure** — not a micro-optimization. Risks:
- Variable scoping errors (affects page rendering — could break the home page)
- IIFE restructuring errors (Phase 5/6 are complex async IIFEs)
- Promise.all nesting complexity (harder to read, harder to maintain)
- No measurable TTFB benefit to justify the risk

---

## 7. Decision: Analysis Only / No Safe Change Found

### 7.1 Conclusion

The critical-path analysis reveals:

1. **Current DB critical path:** 1.070ms (all 9 phases sequential)
2. **Theoretical minimum:** 0.581ms (3 parallel waves)
3. **Potential savings:** 0.489ms (45.7% at DB level)
4. **TTFB impact:** 0ms (invisible — DB is 1.75% of TTFB)
5. **Risk:** HIGH (major code restructure for invisible benefit)

**Per user policy:**
- "اگر تغییر فقط سطح اول را بهبود دهد ولی در TTFB قابل مشاهده نباشد، باید دقیقاً با همین عنوان ثبت شود و از ادعای «بهبود محسوس عملکرد صفحه» اجتناب شود"
- The 0.489ms DB-level savings is NOT measurable at TTFB level
- The code restructure risk outweighs the invisible benefit

### 7.2 Decision: NO IMPLEMENTATION

**STEP 15-B.5.3 = Analysis Only / No Safe Change Found**

No code changes made. No Promise.all restructure applied. The dependency DAG and critical path are documented for future reference, but the optimization is NOT pursued because:

1. The DB-level savings (0.489ms) is invisible at TTFB level
2. The code restructure required is major (not a micro-optimization)
3. Per user policy, optimization must be measurable at the PAGE level, not just DB level

### 7.3 What this means for STEP 15-B

The Performance Engineering track (15-B) has now completed:
- ✅ 15-B.5.1: Count aggregation — 2 duplicate queries eliminated (0.257ms DB saved)
- ✅ 15-B.5.2: Promise.all Q3+Q4 — sequential → parallel (0.4ms Prisma overhead saved)
- ✅ 15-B.5.3: Critical-path analysis — **No Safe Change Found** (0.489ms theoretical, invisible at TTFB)

**The DB-level optimizations are exhausted.** Further performance improvement requires addressing the 98.25% non-DB overhead (JS render + HTML serialization + network), which is the domain of **STEP 15-D (Frontend / Bundle / Rendering)**.

---

## 8. What This Step Did NOT Do

- ✅ No code changes made (analysis only)
- ✅ No Promise.all restructure applied
- ✅ No schema changes
- ✅ No index additions
- ✅ No ISR/cache applied
- ✅ No $queryRaw introduced
- ✅ No semantic changes
- ✅ Baseline preserved (Brand_name_idx + count dedup + Promise.all Q3+Q4 from 15-B.5.1/5.2)

---

## 9. Verification

```bash
# Verify no code changes were made:
cd /home/z/my-project
git diff --stat HEAD
# Expected: only this doc file added

# Verify page.tsx is unchanged from 15-B.5.2:
git diff HEAD~1 -- src/app/page.tsx
# Expected: no changes (15-B.5.2 was the last code change)
```

---

## 10. Next Steps

```
✅ 15-B.5.1 Count Aggregation (applied — 2 queries eliminated)
✅ 15-B.5.2 Promise.all Q3+Q4 (applied — sequential → parallel)
✅ 15-B.5.3 Critical-Path Analysis ← COMPLETE (Analysis Only / No Safe Change Found)
🔵 15-B.5.4 ISR/Cache (design from 15-B.4.5 — evaluate with page-level TTFB measurement)
🟣 15-C Authenticated/Admin Performance
🟣 15-D Frontend / Bundle / Rendering ← THE BOTTLENECK (98.25% of TTFB)
🏁 15-E Performance Regression Gate
```

**STEP 15-B.5.4 is next** — evaluate the ISR/cache design from 15-B.4.5. This is the ONLY remaining optimization that could produce a MEASURABLE TTFB improvement, because ISR eliminates the entire server-side render for cached requests (not just DB queries). Per 15-B.4.5 design: requires 12 invalidation hooks + 3-tier cache strategy + correctness verification.
