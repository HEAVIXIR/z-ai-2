# HEAVIX — STEP 15-B.5.4-B: Homepage Cache Contract v1.0

> **Status:** ✅ GREEN (as Design/Contract — NOT Implementation)
>
> **Law:** In B, NO code changes are made. This is a contract document only.
>
> **Frozen at:** git commit `98750f1` (STEP 15-B.5.4-A head)

---

## 1. Architecture Principle

The Homepage is NOT treated as a single cache with a single TTL.

Data is divided into three tiers by mutability:

| Tier | Nature | Policy |
|---|---|---|
| T1 | Nearly constant | Long TTL + tag invalidation |
| T2 | Semi-dynamic | Medium TTL + tag invalidation |
| T3 | Freshness-sensitive | NO premature full-page ISR dependency |

**Critical Next.js limitation:** ISR caches the ENTIRE page output. You cannot set `revalidate: 10s` for Q5 and `revalidate: 3600s` for Q14 using only the page's `revalidate` value.

**Contract decision:** T3 (Listings) is EXCLUDED from full-page ISR until freshness requirement is proven safe. This protects listing freshness — we will NOT sacrifice it for a pretty TTFB number.

---

## 2. T1 — Stable Data

| Data | TTL | Tag |
|---|---:|---|
| SiteSettings | 3600s (1h) | `home:settings` |
| HomePageSection | 3600s | `home:sections` |
| HeroConfig | 3600s | `home:hero` |
| HomeCategoryConfig | 3600s | `home:cat-config` |
| Articles | 3600s | `home:articles` |
| HotSearches | 3600s | `home:hot-searches` |

**Behavior:**
```
mutation → revalidateTag("home:xxx") → next request → fresh data
```

TTL is the safety net. Tag invalidation is the primary mechanism. If invalidation fires correctly, the next request sees fresh data BEFORE the TTL expires.

---

## 3. T2 — Semi-Dynamic Data

| Data | TTL | Tag |
|---|---:|---|
| Brands | 300s (5min) | `home:brands` |
| Categories | 300s | `home:categories` |
| BuyRequests | 300s | `home:requests` |
| Stats (counts) | 300s | `home:stats` |

**Behavior:**
```
Brand mutation → revalidateTag("home:brands") → next request → fresh data
Category mutation → revalidateTag("home:categories") → next request → fresh data
```

TTL = 300s means: if invalidation fails, data is stale for at most 5 minutes. Tag invalidation should fire immediately on mutation, making the next request fresh BEFORE TTL expires.

---

## 4. T3 — Listings (Freshness-Sensitive)

| Data | TTL | Tag | Status |
|---|---:|---|---|
| Q5 (featured listings) | — | `home:listings` | **NO premature full-page ISR** |
| Q6 (verified listings) | — | `home:listings` | **NO premature full-page ISR** |
| Q7 (latest listings) | — | `home:listings` | **NO premature full-page ISR** |
| Q8 (listing count) | — | `home:listings` | T2 if decoupled |
| Q11 (featured count) | — | `home:listings` | T2 if decoupled |
| Q12 (verified count) | — | `home:listings` | T2 if decoupled (DEAD CODE) |
| Q27 (hero card listings) | — | `home:listings` | Conditional |

**Contract decision:** T3 is EXCLUDED from full-page ISR.

### 4.1 Why excluded

Three implementation approaches were evaluated:

| Option | Description | Risk | Verdict |
|---|---|:---:|---|
| A | `revalidate: 0` + `unstable_cache` per query | HIGH — complexity, must prove cache behavior in exact Next.js version | NOT IMPLEMENTED |
| B | `revalidate: 60` on page | MEDIUM — Homepage may show stale listings for up to 60s | NOT ACCEPTED (freshness violation) |
| C | Listings fetched client-side | HIGH — changes architecture, large scope | NOT IMPLEMENTED |

**None of the three options is implemented in this contract.** T3 listings remain server-rendered fresh on every request until:
1. Business confirms acceptable staleness window for listings (e.g., "60s stale is OK for featured section")
2. OR `unstable_cache` per-query approach is proven in this exact Next.js version
3. OR client-side fetching is designed as a separate feature (not part of ISR track)

**This means the homepage will NOT get full-page ISR in 15-B.5.4-C.** Instead:
- T1 queries (6 data types, ~7 queries) may be cached via `unstable_cache` per-query
- T2 queries (4 data types, ~12 queries) may be cached via `unstable_cache` per-query
- T3 queries (3 listing queries) remain server-rendered fresh

This is a PARTIAL cache strategy, not full-page ISR. The TTFB improvement will be smaller than full ISR, but correctness is preserved.

---

## 5. Global Home Tag

| Tag | Usage |
|---|---|
| `home` | Emergency / broad invalidation ONLY |

**Usage examples:**
```
Page Builder Publish → revalidateTag("home")
Page Builder Rollback → revalidateTag("home")
```

The `home` tag is the nuclear option. It invalidates ALL homepage cache entries at once. Used only when a single mutation affects multiple data categories simultaneously (e.g., Page Builder publish can change hero + sections + categories at once).

---

## 6. Complete Tag Taxonomy (13 tags)

```
home                  — emergency/broad invalidation
home:listings         — Q5, Q6, Q7, Q8, Q11, Q12, Q27 (T3 — NO premature cache)
home:brands           — Q1, Q9, Q20a, Q20b, Q20c (T2)
home:categories       — Q2, Q10, Q18, Q19, Q23 (T2)
home:settings         — Q4 (T1)
home:sections          — Q16 (T1)
home:hero             — Q17, Q27 (T1)
home:cat-config       — Q3 (T1)
home:requests         — Q13 (T2)
home:articles         — Q14 (T1)
home:hot-searches      — Q15 (T1)
home:stats            — Q20d, Q23, Q24, Q26 (T2)
```

**Count:** 12 granular tags + 1 global = 13 tags total.

---

## 7. Mutation → Invalidation Matrix

| Mutation Domain | Tag(s) to invalidate | Affected Homepage queries |
|---|---|---|
| Listing create/update/publish/unpublish/delete | `home:listings` | Q5, Q6, Q7, Q8, Q11, Q12, Q27 |
| Listing featured/verified change | `home:listings` | Q5, Q6, Q11, Q12 |
| Brand create/update/activate/deactivate | `home:brands` | Q1, Q9, Q20b, Q20c |
| BrandDisplay mutation (trusted brands) | `home:brands` | Q20a |
| Category create/update/activate/deactivate | `home:categories` | Q2, Q10, Q18, Q19, Q23 |
| SiteSettings mutation | `home:settings` | Q4 |
| HomePageSection mutation (layout/ordering) | `home:sections` | Q16 |
| HeroConfig mutation | `home:hero` | Q17, Q27 |
| HomeCategoryConfig mutation | `home:cat-config` | Q3 |
| BuyRequest/Request mutation | `home:requests` | Q13 |
| Article/content mutation | `home:articles` | Q14 |
| HotSearch/search trend mutation | `home:hot-searches` | Q15 |
| SiteStat mutation | `home:stats` | Q20d, Q23, Q24 |
| Province mutation | `home:stats` | Q24 |
| **Page Builder Publish** | `home` (nuclear) | ALL |
| **Page Builder Rollback** | `home` (nuclear) | ALL |

---

## 8. Universal Resource API — Central Mapping Requirement

### 8.1 The gap

The Universal Resource API (`/api/admin/resources/[resource]`) handles mutations for ALL 18 registered resources in a single route handler. It currently has ZERO `revalidateTag`/`revalidatePath` calls.

### 8.2 Required mapping (for 15-B.5.4-C.1)

A central mapping must be created:

```
resource key      → affectedCacheTags[]
─────────────────────────────────────
listing           → ["home:listings"]
brand             → ["home:brands"]
category          → ["home:categories"]
user              → [] (no homepage impact)
product           → [] (no homepage impact)
part              → [] (no homepage impact)
order             → [] (no homepage impact)
payment           → [] (no homepage impact)
company           → [] (no homepage impact)
machine           → [] (no homepage impact)
review            → [] (no homepage impact)
deal              → [] (no homepage impact)
rfq               → [] (no homepage impact)
offer             → [] (no homepage impact)
auction           → [] (no homepage impact)
inspection        → [] (no homepage impact)
transportRequest  → [] (no homepage impact)
dispute           → [] (no homepage impact)
buyRequest        → ["home:requests"]
```

**Only 4 of 18 resources affect the Homepage.** The mapping is small and explicit.

### 8.3 Implementation approach (for C)

In the Universal Resource API mutation handlers (POST, PATCH, DELETE), after the DB mutation succeeds:

```typescript
// Pseudocode — NOT implemented in B
const HOMEPAGE_CACHE_TAGS: Record<string, string[]> = {
  listing: ["home:listings"],
  brand: ["home:brands"],
  category: ["home:categories"],
  buyRequest: ["home:requests"],
};

const tags = HOMEPAGE_CACHE_TAGS[resourceKey] || [];
for (const tag of tags) {
  revalidateTag(tag);
}
```

This central mapping prevents scattered `revalidateTag` calls across 40 routes. The Universal API becomes the single invalidation point for resource mutations.

---

## 9. Freshness Verification Test Plan (for 15-B.5.4-D)

### 9.1 Test format

```
1. Baseline: GET / → capture Q5 result (featured listings = [A, B, ...])
2. Mutate: POST /api/admin/resources/listing → create/publish listing C (featured=true)
3. Invalidate: mutation route calls revalidateTag("home:listings")
4. Request: GET / → capture Q5 result
5. Verify: Q5 result should include listing C
   - PASS: new listing visible
   - FAIL: stale data (invalidation didn't fire or TTL too long)
```

### 9.2 Required test scenarios

| # | Scenario | Mutation | Tag | Expected result |
|---|---|---|---|---|
| 1 | Create listing | POST listing (featured) | `home:listings` | New listing visible on next GET / |
| 2 | Update listing | PATCH listing (change title) | `home:listings` | Updated title visible |
| 3 | Publish listing | PATCH listing (status→PUBLISHED) | `home:listings` | Listing appears in featured/latest |
| 4 | Unpublish listing | PATCH listing (status→DRAFT) | `home:listings` | Listing disappears from featured/latest |
| 5 | Delete listing | DELETE listing | `home:listings` | Listing disappears |
| 6 | Feature/unfeature | PATCH listing (featured=true/false) | `home:listings` | Listing appears/disappears in featured section |
| 7 | Brand update | PATCH brand (change name) | `home:brands` | New brand name visible |
| 8 | Category update | PATCH category (change name) | `home:categories` | New category name visible |
| 9 | Settings update | PATCH site-settings | `home:settings` | New settings visible |
| 10 | Page Builder publish | POST /api/admin/pages/[id]/publish | `home` | Entire homepage cache invalidated |

### 9.3 Negative test

| # | Scenario | Expected result |
|---|---|---|
| N1 | Brand mutation, verify listings NOT invalidated | Listings cache should be untouched (only `home:brands` invalidated) |
| N2 | Category mutation, verify brands NOT invalidated | Brands cache should be untouched (only `home:categories` invalidated) |

---

## 10. Performance Gate (for 15-B.5.4-E)

### 10.1 Three measurement scenarios

| Scenario | Description |
|---|---|
| A — Cold / uncached | First request after deploy (no cache) |
| B — Warm ISR/cache | Second+ request (cache hit) |
| C — Post-mutation | Request immediately after `revalidateTag` (cache miss, re-fetch) |

### 10.2 Metrics to capture

| Metric | A (cold) | B (warm) | C (post-mutation) |
|---|---|---|---|
| TTFB p50 | measure | measure | measure |
| TTFB p95 | measure | measure | measure |
| Freshness latency | n/a | n/a | measure (time from mutation to fresh render) |
| Error rate | measure | measure | measure |
| DB query count | ~25 | expected: <15 (T1+T2 cached) | ~25 (full re-fetch) |

### 10.3 Acceptance thresholds

| Metric | Target | Must NOT exceed |
|---|---|---|
| TTFB p50 warm (cached) | < 50% of uncached | — |
| Freshness latency | < 1s | 5s |
| Error rate | 0% | 0.1% |
| DB query count (warm) | < 15 | 25 (same as uncached = no benefit) |

**Note:** Since T3 listings are NOT cached (per §4), the TTFB improvement will be PARTIAL — T1+T2 queries are cached, T3 still fires fresh. The actual TTFB improvement depends on what fraction of the 67ms TTFB is T1+T2 DB time vs T3 + render + network.

---

## 11. Failure Policy

If invalidation fails (e.g., `revalidateTag` throws):

| Aspect | Policy |
|---|---|
| Max stale window | TTL (3600s for T1, 300s for T2) |
| Is stale content allowed? | Yes for T1+T2 (TTL is safety net). NO for T3 (not cached). |
| Error handling | Mutation must NOT silently succeed. Must: error log + audit event + observability signal |
| Audit | Record invalidation failure in AuditLog |
| Observability | Emit metric `cache.invalidation.failure{tag="home:xxx"}` |

**Per user policy:** "نباید mutation را silent-success اعلام کنیم"

---

## 12. What Is Prohibited in 15-B.5.4-C (until Gate passes)

- ❌ Redis
- ❌ CDN migration
- ❌ Materialized View
- ❌ DB schema change
- ❌ `$queryRaw`
- ❌ Query semantics change
- ❌ UI change
- ❌ Moving Listings to client-side
- ❌ API contract change
- ❌ Broad refactor

**Goal only:** Cache + Invalidation + Verification

---

## 13. Acceptance Criteria for 15-B.5.4-C (Implementation)

### Functional

| Check | Required |
|---|---|
| T1 cache (unstable_cache or revalidate) | PASS |
| T2 cache (unstable_cache or revalidate) | PASS |
| Listing freshness (T3 NOT cached) | PASS |
| Tag invalidation (revalidateTag fires on mutation) | PASS |
| Universal API invalidation (central mapping) | PASS |
| Page Builder invalidation (revalidateTag("home")) | PASS |
| Rollback invalidation | PASS |

### Safety

| Check | Required |
|---|---|
| No stale data after mutation | PASS |
| No semantic query change | PASS |
| No auth regression | PASS |
| No audit regression | PASS |

### Engineering

| Check | Required |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint src/` | 0 errors |
| `vitest run tests/contract/` | 498/498 PASS |
| `next build` | exit 0 |
| Runtime GET / | HTTP 200 |
| Runtime GET /store | HTTP 200 |

---

## 14. Decision for 15-B.5.4-B

**GREEN — Cache Contract approved as Design/Contract.**

| Tier | TTL | Tag invalidation | Full-page ISR |
|---|---:|---|---|
| T1 Stable | 3600s | Yes | NO (per-query unstable_cache) |
| T2 Semi-dynamic | 300s | Yes | NO (per-query unstable_cache) |
| T3 Listings | — | Yes (tag exists for mutation) | **NO premature ISR** |
| Global | — | Emergency only | — |

**Key decision:** T3 listings are EXCLUDED from full-page ISR. The homepage will use per-query `unstable_cache` for T1+T2 data only. T3 listings remain server-rendered fresh.

This means:
- TTFB improvement will be PARTIAL (T1+T2 cached, T3 still fires)
- Correctness is preserved (listings always fresh)
- Business must approve before T3 is added to cache

---

## 15. Next Steps (locked sequence)

```
✅ 15-B.5.4-A Evidence Freeze
✅ 15-B.5.4-B Cache Contract ← COMPLETE (this document, GREEN as Design)
🔵 15-B.5.4-C.1 Mutation → Cache Tag Mapping (NEXT — extract and freeze the resource→tag mapping)
🔵 15-B.5.4-C.2 ISR/Cache Implementation (per-query unstable_cache for T1+T2, revalidateTag on mutations)
🔵 15-B.5.4-D Freshness/Invalidation Tests (10 scenarios + 2 negative tests)
🔵 15-B.5.4-E TTFB Performance Gate (cold/warm/post-mutation measurement)
🔵 15-B.5.4-F GREEN/YELLOW/RED Final Decision
```

### 15.1 15-B.5.4-C.1 — what it must produce (before any code change)

A frozen mapping document:

```
Resource key → affectedCacheTags[]
Mutation type (create/update/delete) → same tags
```

This mapping will be implemented as a central constant in the Universal Resource API during 15-B.5.4-C.2.

### 15.2 No new features until 15-B.5.4-F

Per user policy: "تا پایان 15-B.5.4-F هیچ Feature جدیدی را موازی با این مسیر باز نکنید"

---

## 16. What This Step Did NOT Do

- ✅ No code changes made (contract document only)
- ✅ No `revalidate` added to any page
- ✅ No `revalidateTag` calls added to any route
- ✅ No `unstable_cache` wrappers added
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved

---

## 17. Verification

```bash
cd /home/z/my-project
git diff --stat HEAD
# Expected: only this doc file added

git diff HEAD~1 -- src/app/page.tsx src/lib/site-stats.ts
# Expected: no changes (last code change was 15-B.5.2)
```
