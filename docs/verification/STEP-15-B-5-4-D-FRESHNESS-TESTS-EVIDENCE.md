# HEAVIX — STEP 15-B.5.4-D: Freshness/Invalidation Tests Evidence Freeze

> **Status:** Evidence Freeze — D CANNOT be meaningfully verified yet.
>
> **Per user policy:** "تست نباید صرفاً بررسی کند که revalidateTag() اجرا شده است. باید اثر واقعی آن روی داده قابل مشاهده صفحه را ثابت کند"
>
> **Frozen at:** git commit `e7257d4` (STEP 15-B.5.4-C.2-P4 head)

---

## 1. Architecture Reality Check

### 1.1 Current homepage cache state

| Aspect | Current state | Evidence |
|---|---|---|
| Page-level cache | `force-dynamic` (NO cache) | `src/app/page.tsx:37: export const dynamic = "force-dynamic"` |
| Per-query cache (`unstable_cache`) | NONE | `grep -rn "unstable_cache" src/app/page.tsx src/lib/site-stats.ts` → empty |
| `revalidateTag` infrastructure | WIRED (55 calls in 28 files) | P1 + P2 + P3 + P3-Fix implementation |
| Actual cache to invalidate | NONE | force-dynamic = every request re-renders from DB |

### 1.2 What this means for D

The invalidation infrastructure (revalidateTag calls) is **wired but has no cache to act upon**.

```
Current request flow:
  Request → force-dynamic → DB queries (25) → render → response
  (No cache lookup, no cache store, no cache hit/miss)

With cache (future, not implemented):
  Request → cache lookup → HIT (cached) → response (stale possible)
                  ↓ MISS
              DB queries → render → cache store → response (fresh)
              
Mutation path:
  Mutation → DB changes → revalidateTag(tag) → cache invalidated
  (But if no cache exists, revalidateTag is a no-op)
```

### 1.3 The D verification gap

Per user's D gate criteria:

| D Gate | What it requires | Can be verified now? | Why |
|---|---|---|---|
| D1 | Listing mutation → fresh data visible | ⚠️ TRIVIALLY PASS | force-dynamic = always fresh (no stale state) |
| D2 | Brand mutation → fresh data visible | ⚠️ TRIVIALLY PASS | same |
| D3 | Buy-request mutation → fresh data visible | ⚠️ TRIVIALLY PASS | same |
| D4 | Universal API path tested | ✅ Can verify route responds | But can't test invalidation effect |
| D5 | Action Engine path tested | ✅ Can verify route responds | But can't test invalidation effect |
| D6 | Direct API route tested | ✅ Can verify route responds | But can't test invalidation effect |
| D7 | Mutation failure → no false invalidation | ✅ Can verify | But no cache = no effect either way |
| D8 | Invalidation failure → mutation not blocked | ✅ Can verify | try/catch pattern works |
| D9 | Tests deterministic | ⚠️ | Trivially deterministic (always fresh) |
| D10 | tsc/lint/tests/build green | ✅ Already verified in P3 | |

**The core problem:** D1-D3 ask "does the next request see fresh data?" — but with `force-dynamic`, the answer is ALWAYS yes, regardless of whether `revalidateTag` fired or not. The test would pass even if we removed all `revalidateTag` calls.

**This is a false positive.** D cannot distinguish between:
- "revalidateTag worked correctly and invalidated the cache" (the intended behavior)
- "there was no cache to begin with, so everything is always fresh" (the actual state)

---

## 2. What CAN Be Verified Now (trivially)

### 2.1 Mutation correctness (data changes in DB)

| Resource | Mutation | Can verify? | Method |
|---|---|---|---|
| Listing | Create/Update/Delete | ✅ | Direct DB query before/after |
| Brand | Create/Update/Delete | ✅ | Direct DB query before/after |
| Buy-request | Create/Update | ✅ | Direct DB query before/after |

### 2.2 revalidateTag infrastructure (code exists)

| Aspect | Verified? | Evidence |
|---|---|---|
| Universal API calls revalidateTag | ✅ | P1 implementation (3 insertion points) |
| Action Engine calls revalidateTag | ✅ | P2 implementation (1 insertion point) |
| Direct routes call revalidateTag | ✅ | P3+P3-Fix implementation (47 insertion points) |
| revalidateTag wrapped in try/catch | ✅ | All insertion points use same pattern |
| Correct tags mapped | ✅ | HOMEPAGE_CACHE_TAGS const (10 tags) |
| Non-Homepage resources skipped | ✅ | getHomepageCacheTags returns [] for non-Homepage |

### 2.3 Build/runtime health

| Check | Verified? | Result |
|---|---|---|
| tsc --noEmit | ✅ | 0 errors |
| eslint src/ | ✅ | 0 errors |
| 498 contract tests | ✅ | 498/498 PASS |
| next build | ✅ | exit 0 |
| GET / | ✅ | HTTP 200 |
| GET /store | ✅ | HTTP 200 |

---

## 3. What CANNOT Be Verified Yet

### 3.1 Stale → invalidate → fresh transition

The D test plan requires:
```
T0: homepage → OLD_VALUE
T1: mutation → NEW_VALUE
T2: revalidateTag()
T3: homepage → NEW_VALUE
```

But with `force-dynamic`:
- T0: homepage → FRESH (always, no cache)
- T1: mutation → NEW_VALUE in DB
- T2: revalidateTag() → no-op (no cache to invalidate)
- T3: homepage → FRESH (always, reads from DB)

There is no OLD_VALUE at T0 because there's no cache. The test passes trivially.

### 3.2 Negative test (wrong tag not invalidated)

The D test plan requires proving that a brand mutation does NOT invalidate `home:listings`.

But with no cache:
- Brand mutation → revalidateTag('home:brands') → no-op
- home:listings cache → doesn't exist → can't be "not invalidated"
- The test is meaningless — there's nothing to "not invalidate"

### 3.3 Cache hit/miss ratio

Cannot be measured — there's no cache.

### 3.4 TTFB improvement from cache

Cannot be measured — there's no cache to serve from.

---

## 4. Root Cause: Missing Step C.3 (Cache Implementation)

The correct sequence should be:

```
C.1 Mapping Freeze ✅
C.2 Invalidation Implementation ✅ (revalidateTag calls wired)
C.3 Cache Implementation 🔵 (unstable_cache for T1/T2) ← MISSING
D Freshness Tests 🔵 (can only be meaningful AFTER C.3)
E TTFB Gate 🔵 (can only be meaningful AFTER C.3)
F Final Decision 🔵
```

**D was scheduled before C.3 in the original plan.** But the Cache Contract (15-B.5.4-B) explicitly stated:
- T3 listings: NO premature full-page ISR
- T1/T2 data: per-query `unstable_cache` (NOT YET IMPLEMENTED)

Without `unstable_cache`, there's no cache for `revalidateTag` to invalidate.

---

## 5. Decision: D is PREMATURE — Requires C.3 First

### 5.1 D Status: CANNOT BE MEANINGFULLY VERIFIED

| D Criterion | Status | Reason |
|---|---|---|
| D1-D3 (fresh data visible) | ⚠️ TRIVIALLY PASS | force-dynamic = always fresh, test meaningless |
| D4-D6 (mutation paths) | ✅ PASS | Routes respond correctly |
| D7 (no false invalidation) | ⚠️ TRIVIALLY PASS | No cache = nothing to falsely invalidate |
| D8 (invalidation failure isolation) | ✅ PASS | try/catch pattern works |
| D9 (deterministic) | ⚠️ TRIVIALLY PASS | Always fresh = always deterministic |
| D10 (engineering gates) | ✅ PASS | tsc/lint/tests/build green |

**Overall D status: ⚠️ CANNOT DISTINGUISH PASS FROM NO-OP**

The D tests would pass even if ALL revalidateTag calls were removed, because force-dynamic makes everything fresh regardless. This is a false positive.

### 5.2 Correct path forward

```
Current state:
  C.2 (invalidation wired) → ✅
  C.3 (cache implementation) → 🔵 NOT STARTED
  D (freshness tests) → ⚠️ PREMATURE (no cache to test against)

Required sequence:
  C.3 (implement unstable_cache for T1/T2 queries)
    ↓
  D (verify: stale cache → mutation → revalidateTag → fresh cache)
    ↓
  E (measure TTFB: uncached vs cached vs post-mutation)
    ↓
  F (GREEN/YELLOW/RED)
```

### 5.3 What C.3 must implement before D is meaningful

Per Cache Contract (15-B.5.4-B):
1. Add `unstable_cache` wrapper to T1 queries (settings, sections, hero, cat-config, articles, hot-searches) — TTL=3600s
2. Add `unstable_cache` wrapper to T2 queries (brands, categories, requests, stats) — TTL=300s
3. Tag each cached query with the corresponding `HOMEPAGE_CACHE_TAGS` value
4. T3 queries (Q5/Q6/Q7 listings) remain uncached (fresh on every request)

After C.3:
- D can verify: "cached T1/T2 data is stale → mutation → revalidateTag → next request sees fresh data"
- D can verify: "T3 data is always fresh (not cached)"
- D can verify: "wrong tag not invalidated (negative test)"
- E can measure: "TTFB with cache hits < TTFB without cache"

---

## 6. Proposed Test Plan for D (after C.3 is implemented)

### 6.1 Listing freshness (D1)

```
1. Start production server with unstable_cache enabled
2. GET / → capture Q5 result (featured listings) → LISTING_A
3. Cache is now warm (T1/T2 cached, T3 fresh)
4. Create new featured listing via Universal API
5. revalidateTag('home:listings', 'default') fires
6. GET / → capture Q5 result → should include NEW_LISTING
7. Verify: NEW_LISTING visible ✅
```

Note: Q5 (featured listings) is T3 (not cached), so it's always fresh. The test verifies that the MUTATION works, not that cache invalidation works for Q5. For cache invalidation, we need to test T1/T2 queries (e.g., Q9 brand count, Q4 site settings).

### 6.2 Brand cache invalidation (D2)

```
1. GET / → capture Q9 result (brand count = 629)
2. Wait for cache to be warm (T2 TTL=300s)
3. GET / again → Q9 served from cache (still 629)
4. Create new brand via Universal API
5. revalidateTag('home:brands', 'default') fires
6. GET / → Q9 should show 630 (re-fetched, not cached)
7. Verify: brand count updated ✅
```

### 6.3 Buy-request cache invalidation (D3)

```
1. GET / → capture Q13 result (active requests = 0)
2. Wait for cache to be warm
3. Create buy-request via /api/requests
4. revalidateTag('home:requests', 'default') fires
5. GET / → Q13 should show new request
6. Verify: request visible ✅
```

### 6.4 Negative test (D — brand mutation does NOT invalidate listings)

```
1. GET / → capture Q5 result (featured listings) + Q9 (brand count)
2. Create new brand
3. revalidateTag('home:brands') fires (NOT 'home:listings')
4. GET / → Q9 should show new brand count, Q5 should be UNCHANGED
5. Verify: brand count updated, listings NOT re-fetched ✅
```

### 6.5 Mutation failure (D7)

```
1. Attempt mutation that fails (e.g., create brand with duplicate slug)
2. Mutation returns error
3. revalidateTag should NOT fire (it's after success return)
4. GET / → data should be UNCHANGED
5. Verify: no stale data issue ✅
```

### 6.6 Invalidation failure isolation (D8)

```
1. Temporarily break revalidateTag (e.g., mock to throw)
2. Execute successful mutation
3. Mutation should still succeed (try/catch catches the error)
4. GET / → data reflects mutation (force-dynamic for T3, or TTL expiry for T1/T2)
5. Verify: mutation not blocked by invalidation failure ✅
```

---

## 7. Summary

### 7.1 What we have now

- ✅ Invalidation infrastructure is WIRED (55 revalidateTag calls in 28 files)
- ✅ All engineering gates pass (tsc/lint/tests/build/runtime)
- ✅ Mutations work correctly (data changes in DB)
- ✅ Homepage renders correctly (force-dynamic = always fresh)
- ⚠️ NO CACHE EXISTS to invalidate — revalidateTag is a no-op

### 7.2 What D requires

- ❌ Cache (unstable_cache for T1/T2) must be implemented FIRST (C.3)
- ❌ Without cache, D tests are trivially passing (false positive)
- ❌ TTFB improvement cannot be measured (E also blocked)

### 7.3 Recommendation

**D is PREMATURE.** The correct next step is **C.3 (Cache Implementation)**:
1. Add `unstable_cache` to T1 queries (TTL=3600s, tagged with HOMEPAGE_CACHE_TAGS)
2. Add `unstable_cache` to T2 queries (TTL=300s, tagged with HOMEPAGE_CACHE_TAGS)
3. Keep T3 queries (Q5/Q6/Q7) uncached (force-dynamic freshness)
4. THEN run D (freshness tests — verify stale → invalidate → fresh)
5. THEN run E (TTFB gate — measure cached vs uncached)

### 7.4 Updated status

```
✅ A Evidence Freeze
✅ B Cache Contract (GREEN as Design)
✅ C.1 Mapping Freeze
✅ C.2 Invalidation Implementation (P1+P2+P3+P3-Fix+P4 — all mutation paths covered)
🔵 C.3 Cache Implementation (MISSING — unstable_cache for T1/T2)
⚠️ D Freshness Tests — PREMATURE (requires C.3 first)
🔵 E TTFB Performance Gate (requires C.3 + D)
🔵 F Final Decision
```

**D cannot proceed until C.3 is implemented.** The invalidation infrastructure is in place, but without a cache, there's nothing to invalidate.

---

## 8. What This Step Did NOT Do

- ✅ No code changes made
- ✅ No cache implementation
- ✅ No unstable_cache added
- ✅ No ISR enabled
- ✅ No schema changes
- ✅ Baseline preserved

---

## 9. Verification

```bash
cd /home/z/my-project
git diff --stat HEAD
# Expected: only this doc file added

# Verify no cache exists:
grep -rn "unstable_cache" src/app/page.tsx src/lib/site-stats.ts
# Expected: empty (no cache implementation)

# Verify force-dynamic still active:
grep "export const dynamic" src/app/page.tsx
# Expected: export const dynamic = "force-dynamic";

# Verify revalidateTag infrastructure exists:
grep -rn "revalidateTag(" src/app/api/ src/lib/admin/ --include="*.ts" | wc -l
# Expected: 55 (wired but no cache to act upon)
```
