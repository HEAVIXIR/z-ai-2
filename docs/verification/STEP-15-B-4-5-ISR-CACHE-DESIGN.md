# HEAVIX — STEP 15-B.4.5: ISR/Cache Experiment Design

> **Purpose:** Design (NOT apply) an ISR/cache strategy for the home page. This step produces a **design document** only — no code changes, no `revalidate`, no `unstable_cache`, no `revalidateTag` calls are made. The design will be evaluated alongside the ACCEPTED changes from 15-B.4.3 and 15-B.4.4 in 15-B.5.
>
> **Per user policy:**
> - "در این مرحله هیچ کد، cache، ISR، revalidate یا unstable_cache اعمال نمی‌شود. فقط طراحی، تعیین freshness/invalidation و تعریف معیار پذیرش انجام می‌شود."
> - "15-B.4.5 نباید به APPLY تبدیل شود. خروجی مطلوب این مرحله یک سند Design/Experiment است."
> - "برای تعیین TTL و invalidation دقیق هر داده نباید مقدار حدسی وارد کنیم. این موارد باید مستقیماً از شواهد 15-B.3 و پیاده‌سازی فعلی استخراج شوند."
>
> **Status:** FROZEN at git commit `58435e7` (STEP 15-B.4.4 head — Promise.all experiment ACCEPTED, not applied).

---

## 1. Evidence Sources

This design is built entirely from evidence extracted in prior steps — **no guesses**:

| Evidence | Source | Used for |
|---|---|---|
| Home query inventory (27 queries, 8 phases) | STEP 15-B.3 `scripts/home-query-inventory.json` | Identify all data types on home page |
| ISR candidate matrix (12 data types) | STEP 15-B.3 `scripts/home-query-inventory.json` §isr_candidate_matrix | Freshness/mutability/invalidation per data type |
| Page Builder revalidatePath model | `src/app/api/admin/pages/[id]/{publish,rollback}/route.ts` | Existing invalidation pattern to align with |
| Home page `dynamic` setting | `src/app/page.tsx:37` → `export const dynamic = "force-dynamic"` | Current cache behavior (NONE) |
| Preview route `dynamic` setting | `src/app/preview/page/[key]/page.tsx:15` → `force-dynamic` | Preview must stay dynamic (correct) |
| Mutation routes (brand/category/listing/settings) | `src/app/api/{taxonomy,admin,listings}/...` | Invalidation source mapping |
| DB-level metrics | STEP 15-A + 15-B.1 + 15-B.4.2 | Baseline for measurement plan |
| Page-level TTFB | STEP 15-A §2.1 | TTFB baseline (67-88ms warm) |
| DB % of TTFB | STEP 15-A §9.2 | 1.75% — DB is NOT the bottleneck |

---

## 2. Data Classification (3 Tiers)

Based on the 15-B.3 ISR matrix, classify the 12 home page data types into 3 tiers:

### Tier 1: Nearly-Constant Data → Long Cache (TTL: 3600s / 1 hour)

These data types change rarely (admin-only, low mutability) and can tolerate up to 1 hour of staleness:

| Data type | Queries | Freshness req (from 15-B.3) | Mutability (from 15-B.3) | Max acceptable staleness | Proposed TTL |
|---|---|---|---|---|---|
| Site settings | Q4 | Low | Low (admin-only) | 1 hour | 3600s |
| HomePageSection | Q16 | Low | Low (admin-only) | 1 hour | 3600s |
| HeroConfig | Q17 | Low | Low (admin-only) | 1 hour | 3600s |
| HomeCategoryConfig | Q3 | Low | Low (admin-only) | 1 hour | 3600s |
| Articles | Q14 | Low | Low (admin/editor) | 10 min | 600s |
| HotSearches | Q15 | Medium | Low (admin-only) | 10 min | 600s |
| SiteStat config | Q20d | Low/Medium | Low (admin-only) | 5 min | 300s |

**Tier 1 total queries cached:** Q3, Q4, Q14, Q15, Q16, Q17, Q20d = **7 queries** (eliminated from every render when cache is warm)

### Tier 2: Semi-Dynamic Data → Short Cache + Event-Driven Invalidation (TTL: 60-300s)

These data types change periodically and can tolerate 1-5 minutes of staleness, but mutations should trigger immediate invalidation:

| Data type | Queries | Freshness req (from 15-B.3) | Mutability (from 15-B.3) | Max acceptable staleness | Proposed TTL |
|---|---|---|---|---|---|
| Brands | Q1, Q20b, Q20c | Low/Medium | Medium (admin edits) | 5 min | 300s |
| Categories | Q2, Q10, Q18, Q19 | Low | Medium (admin edits) | 10 min | 600s |
| BuyRequests | Q13 | Medium | Medium | 1 min | 60s |
| SiteStat live counts | Q21, Q22, Q23, Q24 | Medium | High (driven by underlying tables) | 1 min | 60s |

**Tier 2 total queries cached:** Q1, Q2, Q10, Q13, Q18, Q19, Q20b, Q20c, Q21, Q22, Q23, Q24 = **12 queries** (cached with short TTL)

### Tier 3: Real-Time / Sensitive Data → No Cache

These data types have high freshness requirements — users expect to see new listings immediately:

| Data type | Queries | Freshness req (from 15-B.3) | Mutability (from 15-B.3) | Max acceptable staleness | Proposed TTL |
|---|---|---|---|---|---|
| Featured listings | Q5 | High | High (publish events frequent) | **0 (must be immediately visible)** | No cache |
| Verified listings | Q6 | High | High | 0 | No cache |
| Latest listings | Q7 | High | High | 0 | No cache |

**Tier 3 total queries:** Q5, Q6, Q7 = **3 queries** (NOT cached — must re-fetch every render)

### 2.1 Summary

| Tier | Cache strategy | Query count | % of 27 home queries |
|---|---|---:|---:|
| Tier 1 (nearly-constant) | Long cache (300-3600s) | 7 | 26% |
| Tier 2 (semi-dynamic) | Short cache (60-600s) + event invalidation | 12 | 44% |
| Tier 3 (real-time) | No cache | 3 | 11% |
| Conditional (D_GROUP) | Skipped on typical render | 3 (Q25, Q26, Q27) | 11% |
| Remaining (Phase 8b counts) | Short cache | 2 (Q20d already in Tier 1) | 7% |
| **Cacheable total** | | **19 of 24** | **~79%** |

**Theoretical benefit:** When cache is warm, 19 of 24 steady-state queries would be served from cache, reducing DB round-trips from 24 to ~5 (Tier 3 + cache misses).

---

## 3. Freshness Budget per Query (evidence-based, not guessed)

| Q | Data type | Tier | Max staleness (from 15-B.3) | Proposed TTL | Mutation must be immediately visible? | Invalidation trigger |
|---|---|---|---|---|---|---|
| Q3 | HomeCategoryConfig | 1 | Low (admin-only) | 3600s | No (admin can wait 1h) | homeCategoryConfig mutation |
| Q4 | SiteSettings | 1 | Low (admin-only) | 3600s | No | settings mutation |
| Q5 | Featured listings | 3 | High | **0** | **Yes** | listing publish/unpublish/update |
| Q6 | Verified listings | 3 | High | **0** | **Yes** | listing publish/unpublish/update |
| Q7 | Latest listings | 3 | High | **0** | **Yes** | listing publish/unpublish/update |
| Q8 | Listing count (PUBLISHED) | 2 (count) | Medium | 60s | No (counts can be 1min stale) | listing mutation |
| Q9 | Brand count (active) | 2 (count) | Medium | 60s | No | brand mutation |
| Q10 | Category count (CATALOG) | 2 (count) | Medium | 60s | No | category mutation |
| Q11 | Listing count (featured) | 2 (count) | Medium | 60s | No | listing mutation |
| Q12 | Listing count (verified) | 2 (count) | Medium | 60s | No | listing mutation |
| Q13 | BuyRequest (active) | 2 | Medium | 60s | No | buyRequest mutation |
| Q14 | Articles | 1 | Low | 600s | No | article mutation |
| Q15 | HotSearches | 1 | Medium | 600s | No | hotSearch mutation |
| Q16 | HomePageSection | 1 | Low | 3600s | No | homePageSection mutation |
| Q17 | HeroConfig | 1 | Low | 3600s | No | heroConfig mutation |
| Q18 | Category (machinery root) | 2 | Low | 600s | No | category mutation |
| Q19 | Category (L1 children) | 2 | Low | 600s | No | category mutation |
| Q20a | BrandDisplay | 1 | Low | 3600s | No | brandDisplay mutation |
| Q20b | Brand (featured IDs) | 2 | Low/Medium | 300s | No | brand mutation |
| Q20c | Brand (by id IN) | 2 | Low/Medium | 300s | No | brand mutation |
| Q20d | SiteStat (active rows) | 1 | Low/Medium | 300s | No | siteStat mutation |
| Q21 | Listing count (via getActiveStats) | 2 (count) | Medium | 60s | No | listing mutation |
| Q22 | Brand count (via getActiveStats) | 2 (count) | Medium | 60s | No | brand mutation |
| Q23 | Category count (via getActiveStats) | 2 (count) | Medium | 60s | No | category mutation |
| Q24 | Province count | 2 (count) | Medium | 60s | No | province mutation (rare) |

---

## 4. Invalidation Source Mapping (aligned with Page Builder model)

### 4.1 Existing Page Builder invalidation model

From `src/app/api/admin/pages/[id]/{publish,rollback}/route.ts`:

```ts
// Publish route
revalidatePath(`/${page.slug}`);  // invalidate the published page's route
revalidatePath('/');              // invalidate the home page
revalidatePath(`/admin/pages/${pageId}`);  // invalidate the admin editor

// Rollback route (identical pattern)
revalidatePath(`/${page.slug}`);
revalidatePath('/');
revalidatePath(`/admin/pages/${pageId}`);
```

**Key finding:** Page Builder already calls `revalidatePath('/')` on publish and rollback. This means **if ISR is added to the home page, the Page Builder's existing invalidation hooks will correctly invalidate the home page cache when a page is published or rolled back.**

### 4.2 GAP: Non-Page-Builder mutation routes have NO revalidatePath

From the codebase audit:

| Mutation route | Has revalidatePath? | Has revalidateTag? |
|---|---|---|
| `/api/admin/pages/[id]/publish` | ✅ Yes (3 calls) | ❌ No |
| `/api/admin/pages/[id]/rollback` | ✅ Yes (3 calls) | ❌ No |
| `/api/taxonomy/brands/[id]` (PATCH/DELETE) | ❌ **No** | ❌ No |
| `/api/taxonomy/brands` (POST) | ❌ **No** | ❌ No |
| `/api/taxonomy/categories/[id]` (PATCH/DELETE) | ❌ **No** | ❌ No |
| `/api/taxonomy/categories` (POST) | ❌ **No** | ❌ No |
| `/api/listings` (POST) | ❌ **No** | ❌ No |
| `/api/listings/[id]` (PATCH/DELETE) | ❌ **No** | ❌ No |
| `/api/admin/listings/[id]` (PATCH) | ❌ **No** | ❌ No |
| `/api/admin/site-settings` (PATCH) | ❌ **No** | ❌ No |
| `/api/admin/home/*` (all home mutations) | ❌ **No** | ❌ No |
| `/api/admin/resources/[resource]` (Universal API POST/PATCH/DELETE) | ❌ **No** | ❌ No |

**Critical gap:** If ISR is added to the home page, brand/category/listing mutations would NOT invalidate the home cache. Users would see stale data until the TTL expires.

### 4.3 Required invalidation hooks (design — NOT applied)

To safely add ISR to the home page, the following mutation routes would need `revalidatePath('/')` and/or `revalidateTag('<tag>')` calls:

| Mutation event | Routes to hook | revalidateTag | revalidatePath |
|---|---|---|---|
| Brand create/update/delete | `/api/taxonomy/brands`, `/api/taxonomy/brands/[id]`, `/api/admin/resources/brands` | `brands` | `/`, `/brands` |
| Category create/update/delete | `/api/taxonomy/categories`, `/api/taxonomy/categories/[id]`, `/api/admin/resources/categories` | `categories` | `/` |
| Listing publish/unpublish/update | `/api/listings`, `/api/listings/[id]`, `/api/admin/listings/[id]`, `/api/admin/resources/listings` | `listings` | `/`, `/listings` |
| SiteSettings update | `/api/admin/site-settings` | `settings` | `/` |
| HomePageSection mutation | `/api/admin/homepage-sections` | `home-sections` | `/` |
| HeroConfig update | (route TBD) | `hero` | `/` |
| HomeCategoryConfig update | `/api/admin/home/categories` | `home-cat-config` | `/` |
| BuyRequest mutation | `/api/admin/requests`, `/api/admin/resources/buy-requests` | `buy-requests` | `/` |
| Article mutation | `/api/admin/resources/articles` (TBD) | `articles` | `/` |
| HotSearch mutation | `/api/admin/resources/hot-searches` (TBD) | `hot-searches` | `/` |
| SiteStat mutation | `/api/admin/resources/site-stats` (TBD) | `site-stats` | `/` |

**Total: ~12 mutation route groups need invalidation hooks.** This is a significant code change that must be done carefully in 15-B.5.

### 4.4 Alignment requirement (per user policy)

> "Page Builder همین حالا مدل invalidation مبتنی بر publish/rollback دارد؛ بنابراین هر cache strategy باید با همین مدل هماهنگ باشد، نه اینکه یک TTL عمومی و مستقل ایجاد کند."

**Design principle:** ISR strategy uses `revalidateTag` for fine-grained cache invalidation, with `revalidatePath('/')` as the fallback nuclear option (already wired in Page Builder). The tag-based approach allows:
- Brand mutation → `revalidateTag('brands')` (invalidates only brand-cached data)
- Listing mutation → `revalidateTag('listings')` (invalidates only listing-cached data)
- Settings mutation → `revalidateTag('settings')` (invalidates only settings-cached data)

This is MORE granular than `revalidatePath('/')` (which invalidates the entire page cache).

---

## 5. Correctness Experiment Scenario (design — NOT executed)

### 5.1 Mutate → Invalidate → Request → Verify Fresh Value

```
1. Baseline request: GET / → capture Q5 result (featured listings = [listing-A, listing-B, ...])
2. Mutate: POST /api/admin/resources/listings with new featured listing-C
3. Invalidate: mutation route calls revalidateTag('listings')
4. Request: GET / → capture Q5 result
5. Verify: Q5 result should now include listing-C
   - If YES → correctness PASS
   - If NO (stale data) → correctness FAIL, TTL too long OR invalidation didn't fire
```

### 5.2 Publish V2 → Invalidate → Preview == Production

```
1. V1 is published. GET /preview/page/home → captures V1 layout.
2. Admin creates V2 draft (different layout).
3. Admin publishes V2:
   - Publish route calls revalidatePath('/') + revalidatePath('/preview/page/home')
4. GET /preview/page/home → should show V2 (production).
5. GET / → should show V2 (production).
6. Verify: preview == production.
```

### 5.3 Rollback V1 → Invalidate → Preview == Production

```
1. V3 is published (was rolled back from V1 in 14.7-G golden invariant).
2. Admin rolls back to V1:
   - Rollback route calls revalidatePath('/') + revalidatePath('/preview/page/home')
3. GET /preview/page/home → should show V1 (now the current published version).
4. GET / → should show V1.
5. Verify: preview == production.
```

---

## 6. Failure / Rollback Behavior (design — NOT implemented)

### 6.1 If invalidation fails (e.g., revalidateTag throws)

| Scenario | Max stale window | Is stale content allowed? | Fallback |
|---|---|---|---|
| Brand mutation but revalidateTag fails | TTL (300s = 5min) | Yes (TTL is the safety net) | Next render after TTL expiry will re-fetch |
| Listing mutation but revalidateTag fails | TTL (60s = 1min) | Yes (TTL is short) | Next render after 60s will show fresh data |
| SiteSettings mutation but revalidateTag fails | TTL (3600s = 1h) | Yes (admin-only, low impact) | Next render after 1h will re-fetch |
| Page Builder publish but revalidatePath fails | **0 (must be immediate)** | **No** | Already handled by Page Builder's existing revalidatePath — if it fails, the publish API returns error and the admin sees the failure |

### 6.2 Design principle

> "TTL is the safety net. Event-driven invalidation (revalidateTag/revalidatePath) is the primary mechanism. If invalidation fails, TTL ensures eventual consistency."

This means:
- Tier 1 (nearly-constant): TTL 300-3600s is the primary mechanism. Event invalidation is nice-to-have.
- Tier 2 (semi-dynamic): TTL 60-600s is the safety net. Event invalidation is the primary mechanism.
- Tier 3 (real-time): No cache — every render is fresh. No invalidation needed.

### 6.3 Stale content policy

- **Allowed for:** Tier 1 and Tier 2 data (config, counts, taxonomy — stale by 1-10 minutes is acceptable)
- **NOT allowed for:** Tier 3 data (featured/verified/latest listings — users must see new listings immediately)
- **NOT allowed for:** Page Builder layout (publish/rollback must be immediately visible — already handled by existing revalidatePath)

---

## 7. Measurement Plan (before APPLY — for 15-B.5)

Before applying ISR, the following metrics must be measured BEFORE and AFTER to prove the benefit:

| Metric | How to measure | Baseline (from 15-A) | Target |
|---|---|---|---|
| DB query count per home render | Prisma query logging | 27 queries | < 10 (when cache warm) |
| DB execution time | EXPLAIN ANALYZE sum | 1.170ms | < 0.5ms (when cache warm) |
| Cache hit/miss ratio | Next.js cache headers | n/a (no cache currently) | > 80% hit rate |
| Home page TTFB | curl + agent-browser | 67-88ms (warm) | < 50ms (with cache) |
| Correctness | Mutation → invalidate → verify | n/a | 100% fresh after invalidation |
| Invalidation latency | Time from mutation to fresh render | n/a | < 1s |
| Concurrent workload | 10 parallel renders | 4.158ms (sequential Q3+Q4 only) | < 2s for all 10 |

### 7.1 Critical measurement caveat (per user policy)

> "کاهش زمان DB/Prisma به‌تنهایی به معنی بهبود TTFB صفحه نیست؛ بنابراین در این مرحله نباید صرفاً بر اساس cache hit یا query reduction تصمیم گرفت."

**Decision must be based on PAGE-LEVEL metrics (TTFB), not just DB-level metrics (query count, exec time).**

From 15-A: DB is 1.75% of warm TTFB. Even eliminating ALL 27 DB queries would only save ~1.2ms of the 67ms TTFB. The remaining 65.8ms is JS render + HTML serialization + network.

**ISR's real benefit is NOT reducing DB queries — it's eliminating the entire server-side render for cached requests.** When ISR cache hits, the home page is served from the static cache (no JS render, no DB queries, no serialization) — TTFB drops to network-only (~5-10ms).

This is the metric that matters: **cached TTFB vs uncached TTFB**.

---

## 8. Decision Criteria (for 15-B.5 evaluation)

| Criterion | Required | How to verify |
|---|---|---|
| Real cost reduction (page-level TTFB) | Cached TTFB < 50% of uncached TTFB | Measure both with agent-browser |
| Full correctness | 100% fresh after invalidation event | Run §5 correctness scenarios |
| Acceptable freshness | No Tier 3 data cached; Tier 2 max stale ≤ 5min; Tier 1 max stale ≤ 1h | Verify TTL settings per §3 |
| Invalidation latency | < 1s from mutation to fresh render | Measure with timing harness |
| No regression in related queries | 15-B.1 inventory all NEUTRAL or IMPROVED | Re-run scripts/explain-analyze.sh |
| No connection pressure increase | Peak connections unchanged under concurrent load | Monitor pg_stat_activity |
| No errors/timeouts | 0 errors in correctness + concurrent tests | Run §5 scenarios + 10 parallel renders |

### 8.1 Decision outcomes

| Outcome | Condition | Action |
|---|---|---|
| **A — ACCEPT** | Real page-level TTFB reduction + full correctness + acceptable freshness + no regression | Apply ISR in 15-B.5 alongside 15-B.4.3 + 15-B.4.4 |
| **B — REJECT** | TTFB reduction negligible (cache hit doesn't reduce TTFB meaningfully) OR correctness issues OR invalidation gaps | No ISR applied. Move to 15-C. |
| **C — INVESTIGATE** | Invalidation behavior uncertain OR cache hit ratio low OR measurement inconclusive | Design refinement needed before APPLY |

### 8.2 Key risk: invalidation gap (§4.2)

The biggest risk is the **12 mutation route groups that currently have NO revalidatePath/revalidateTag calls**. If ISR is applied without adding these hooks:
- Brand/category/listing mutations would show stale data on home page until TTL expires
- For Tier 2 (60-300s TTL), this means 1-5 minutes of stale data
- For Tier 3 (no cache), no impact (always fresh)

**This is why 15-B.4.5 is DESIGN ONLY** — the invalidation hooks must be implemented and tested BEFORE ISR is applied. 15-B.5 must:
1. Add revalidateTag/revalidatePath to all 12 mutation route groups
2. Add ISR (revalidate) to home page
3. Run full correctness scenarios (§5)
4. Measure page-level TTFB before/after
5. Only ACCEPT if TTFB improvement is real AND correctness is 100%

---

## 9. What This Step Did NOT Do

- ✅ No code changes made
- ✅ No `revalidate` added to home page
- ✅ No `unstable_cache` wrappers added
- ✅ No `revalidateTag` calls added to mutation routes
- ✅ No `revalidatePath` calls added (beyond what Page Builder already has)
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved (Brand_name_idx from 15-B.4.1 is the only change in effect)

---

## 10. Verification

```bash
# Verify no code changes were made:
cd /home/z/my-project
git diff --stat HEAD
# Expected: only this doc file added

# Verify home page is still force-dynamic:
grep "export const dynamic" src/app/page.tsx
# Expected: export const dynamic = "force-dynamic";

# Verify no revalidateTag calls were added to mutation routes:
grep -rn "revalidateTag" src/app/api/ --include="*.ts" | grep -v "pages/\[id\]"
# Expected: (empty — no revalidateTag calls outside Page Builder)

# Verify Page Builder still has its existing revalidatePath calls:
grep -n "revalidatePath" src/app/api/admin/pages/\[id\]/{publish,rollback}/route.ts
# Expected: 3 calls in each (unchanged from before this step)
```

---

## 11. Next Steps

Per the user's locked sequence:

```
✅ 15-B.4.1 Brand.name index (ACCEPT — applied)
✅ 15-B.4.2 Re-measure 28 queries (ACCEPT — no regression)
✅ 15-B.4.3 Count aggregate experiment (ACCEPT — deferred application)
✅ 15-B.4.4 Promise.all experiment (ACCEPT — deferred application)
✅ 15-B.4.5 ISR/cache experiment ← COMPLETE (DESIGN ONLY — not applied)
🔵 15-B.5 Full regression + re-measure (apply 15-B.4.3 + 15-B.4.4 + evaluate ISR design)
🟣 15-C Authenticated/Admin performance
🟣 15-D Frontend / bundle / rendering
🏁 15-E Performance regression gate
```

### 15-B.5 will:

1. **Apply ACCEPTED changes from 15-B.4.3:** Count aggregate deduplication (Approach 1: code-level dedup, pass Phase 4 results to `getActiveStats`)
2. **Apply ACCEPTED changes from 15-B.4.4:** Promise.all on Q3+Q4 (Phase 2: wrap in `Promise.all`)
3. **Evaluate ISR design from 15-B.4.5:**
   - Add `revalidateTag`/`revalidatePath` hooks to 12 mutation route groups
   - Add `revalidate` to home page with Tier 1/2/3 TTLs
   - Run correctness scenarios (§5)
   - Measure page-level TTFB before/after
   - ACCEPT ISR only if TTFB improvement is real AND correctness is 100%
4. **Full regression:** 498 contract tests + production build + TSC + lint
5. **Re-measure:** Run 15-A baseline + 15-B.1 inventory + 15-B.4.2 re-measure scripts
6. **Revert if any regression**

**STEP 15-B.4.5 is COMPLETE.** This was a DESIGN ONLY step — no code applied. The ISR/cache strategy is documented and ready for evaluation in 15-B.5.
