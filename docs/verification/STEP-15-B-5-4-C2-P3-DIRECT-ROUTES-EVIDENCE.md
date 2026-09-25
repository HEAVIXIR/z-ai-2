# HEAVIX — STEP 15-B.5.4-C.2-P3: Direct API Routes Evidence Freeze

> **Status:** Evidence Freeze Only — NO code changes, NO commit, NO push.
>
> **Per user policy:** "فعلاً هیچ کدی تغییر نده... مسیرهایی که به یک service/engine مشترک delegate می‌کنند را جداگانه deduplicate کن"
>
> **Frozen at:** git commit `b042282` (STEP 15-B.5.4-C.2-P2 head)

---

## 1. Method

For each direct mutation route:
1. Extract HTTP method(s) from actual source
2. Identify Prisma mutation(s) — is it `db.*` (main DB) or `storeDb.*` (store DB)?
3. Check for shared service delegation (createResource/updateResource/deleteResource/auditMutation/executeAction)
4. Determine Homepage impact (which Q1-Q27 queries affected)
5. Map to cache tag
6. Check existing revalidation
7. Identify exact insertion point (after successful mutation, before return)
8. Classify: SAFE / GAP / AMBIGUOUS / NOT-HOMEPAGE-AFFECTING

---

## 2. LISTING Direct Routes (5 routes, 7 mutation operations)

| # | Route | Method | Prisma mutation | Homepage queries | Tag | Revalidation | @ts-nocheck | Status |
|---|---|---|---|---|---|---|---|---|
| L1 | `api/listings/route.ts` | POST | `db.listing.create` + `db.listingImage.createMany` (line 325, 328) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | NO | **GAP** |
| L2 | `api/listings/[id]/route.ts` | PATCH | `db.listing.update` (line 200, 210) + `db.listingImage.*` (lines 219-247) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | YES | **GAP** |
| L2 | `api/listings/[id]/route.ts` | DELETE | `db.listing.delete` (line 323) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | YES | **GAP** |
| L3 | `api/admin/listings/route.ts` | POST (bulk) | `db.listing.deleteMany` + `db.listing.updateMany` (line 149, 155) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | YES | **GAP** |
| L4 | `api/admin/listings/[id]/route.ts` | PATCH | `db.listing.create` (duplicate, line 193) + `db.listing.update` (line 236, 246) + `db.listingImage.*` (lines 223-283) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | YES | **GAP** |
| L4 | `api/admin/listings/[id]/route.ts` | DELETE | `db.listing.delete` (line 378) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | NONE | YES | **GAP** |
| L5 | `api/admin/listings/[id]/reject/route.ts` | POST | `db.listing.update` (status→REJECTED, line 46) | Q5-Q7 (removes from display) | `home:listings` | NONE | NO | **GAP** |

### 2.1 Listing call graph analysis

**ALL 5 listing routes perform direct Prisma mutations.** None delegate to:
- ❌ `createResource`/`updateResource`/`deleteResource` (data-adapter)
- ❌ `auditMutation`/`auditCreate`/`auditDelete` (audit-foundation)
- ❌ `executeAction` (action-engine)

Each route is an **independent insertion point** — no shared service to deduplicate.

### 2.2 Insertion point

For each route: after the successful Prisma mutation(s), before `return NextResponse.json(...)`.

Pattern:
```typescript
// After successful mutation, before return:
import { revalidateTag } from 'next/cache';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';
// ...
const tags = getHomepageCacheTags('listings'); // → ['home:listings']
for (const tag of tags) {
  try { revalidateTag(tag, 'default'); } catch (e) { console.error(...); }
}
```

**But:** `homepage-cache-tags.ts` currently only maps `listings` → `['home:listings']`. This mapping IS correct for listing routes. No change needed to the mapping file for listing routes.

---

## 3. BRAND Direct Routes (5 routes, 6 mutation operations)

| # | Route | Method | Prisma mutation | Homepage queries | Tag | Revalidation | @ts-nocheck | Status |
|---|---|---|---|---|---|---|---|---|
| B1 | `api/taxonomy/brands/route.ts` | POST | `db.brand.create` (line 95) | Q1, Q9, Q20b, Q20c | `home:brands` | NONE | NO | **GAP** |
| B2 | `api/taxonomy/brands/[id]/route.ts` | PATCH | `db.brand.update` (line 105) + `db.brandAlias.deleteMany` (line 209) | Q1, Q9, Q20b, Q20c | `home:brands` | NONE | NO | **GAP** |
| B2 | `api/taxonomy/brands/[id]/route.ts` | DELETE | `db.brand.delete` (line 258) | Q1, Q9, Q20b, Q20c | `home:brands` | NONE | NO | **GAP** |
| B3 | `api/admin/brands-ai/route.ts` | POST | `db.brand.create` (line 225) + `db.brand.update` (line 258) | Q1, Q9 | `home:brands` | NONE | YES | **GAP** |
| B4 | `api/admin/brands/[id]/logo/route.ts` | PUT | `db.brand.update` (line 44) | Q1 (logoUrl) | `home:brands` | NONE | NO | **GAP** |
| B5 | `api/admin/home/trusted-brands/route.ts` | PUT | `db.brandDisplay.updateMany` (line 141) | Q20a (BrandDisplay) | `home:brands` | NONE | NO | **GAP** |

### 3.1 Brand call graph analysis

**ALL 5 brand routes perform direct Prisma mutations.** None delegate to shared services.

### 3.2 Mapping verification

`homepage-cache-tags.ts` has `brands → ['home:brands']`. This is correct for brand routes. No change needed.

---

## 4. CATEGORY Direct Routes (4 routes, 5 mutation operations) — INDEPENDENT from Universal API

| # | Route | Method | Prisma mutation | Homepage queries | Tag | Revalidation | @ts-nocheck | Status |
|---|---|---|---|---|---|---|---|---|
| C1 | `api/taxonomy/categories/route.ts` | POST | `db.category.create` (line 105) | Q2, Q10, Q18, Q19, Q23 | `home:categories` | NONE | NO | **GAP** |
| C2 | `api/taxonomy/categories/[id]/route.ts` | PUT | `db.category.update` (line 100) + `db.category.updateMany` (line 187) | Q2, Q10, Q18, Q19, Q23 | `home:categories` | NONE | NO | **GAP** |
| C2 | `api/taxonomy/categories/[id]/route.ts` | DELETE | `db.category.delete` (line 191) | Q2, Q10, Q18, Q19, Q23 | `home:categories` | NONE | NO | **GAP** |
| C3 | `api/admin/home/categories/route.ts` | PUT | `db.homeCategoryConfig.create` (line 21) | Q3 (HomeCategoryConfig) | `home:cat-config` | NONE | NO | **GAP** |

### 4.1 Category call graph analysis

**ALL 4 category routes perform direct Prisma mutations.** None delegate to Universal API (categories is NOT registered in Universal API — confirmed in C.1).

### 4.2 CRITICAL: homepage-cache-tags.ts is INCOMPLETE for categories

`homepage-cache-tags.ts` currently maps:
```typescript
listings: ['home:listings'],
brands: ['home:brands'],
'buy-requests': ['home:requests'],
```

It does NOT have:
- `categories → ['home:categories']` — needed for C1, C2
- `cat-config → ['home:cat-config']` — needed for C3

**This is NOT a mapping error — it's an INTENTIONAL gap from P1.** P1 only mapped resources that go through the Universal API. Categories don't go through the Universal API, so they weren't mapped in P1.

**For P3 implementation, `homepage-cache-tags.ts` MUST be extended** to include:
```typescript
categories: ['home:categories'],
'cat-config': ['home:cat-config'],
```

Plus additional mappings for other Homepage-affecting direct routes (see §7 below).

Per user policy: "❌ تغییر homepage-cache-tags.ts مگر اینکه شواهد کد نشان دهد mapping فعلی ناقص است" — the evidence DOES show the mapping is incomplete. This is a finding, not a code change (P3 is Evidence Freeze only).

---

## 5. BUYREQUEST Direct Routes (5 routes, 7 mutation operations)

| # | Route | Method | Prisma mutation | Homepage queries | Tag | Revalidation | @ts-nocheck | Status |
|---|---|---|---|---|---|---|---|---|
| BR1 | `api/requests/route.ts` | POST | `db.buyRequest.create` (line 91) | Q13 | `home:requests` | NONE | NO | **GAP** |
| BR2 | `api/admin/requests/route.ts` | POST (bulk) | `db.buyRequest.deleteMany` + `db.buyRequest.updateMany` (line 95, 101) | Q13 | `home:requests` | NONE | NO | **GAP** |
| BR3 | `api/admin/requests/[id]/route.ts` | PATCH | `db.buyRequest.update` (line 52) | Q13 | `home:requests` | NONE | NO | **GAP** |
| BR3 | `api/admin/requests/[id]/route.ts` | DELETE | `db.buyRequest.delete` (line 69) | Q13 | `home:requests` | NONE | NO | **GAP** |
| BR4 | `api/wanted/route.ts` | POST | `db.buyRequest.create` (line 77) | Q13 | `home:requests` | NONE | YES | **GAP** |
| BR5 | `api/wanted/[id]/route.ts` | PATCH | `db.buyRequest.update` (line 62, 80 — includes soft-delete to CANCELLED) | Q13 | `home:requests` | NONE | NO | **GAP** |
| BR5 | `api/wanted/[id]/route.ts` | DELETE | (soft delete — `db.buyRequest.update` to CANCELLED, no hard delete found) | Q13 | `home:requests` | NONE | NO | **GAP** |

### 5.1 BuyRequest call graph analysis

**ALL 5 routes perform direct Prisma mutations.** None delegate to shared services.

### 5.2 Mapping verification

`homepage-cache-tags.ts` has `'buy-requests' → ['home:requests']`. But the direct routes don't use the resource key `'buy-requests'` — they're direct API routes, not Universal API routes. The mapping key is only used when `getHomepageCacheTags(resourceKey)` is called with the resource key.

For direct routes, the tag must be hardcoded or the mapping must use a different key. Options:
1. Hardcode `revalidateTag('home:requests', 'default')` in each direct route
2. Extend `homepage-cache-tags.ts` with a function like `getHomepageCacheTagsForModel('buyRequest')` that maps Prisma model names to tags
3. Add direct tag strings to each route

**This is a design decision for P3 implementation (not Evidence Freeze).**

---

## 6. STORE Routes (4 routes) — NOT HOMEPAGE-AFFECTING

| # | Route | Method | Prisma mutation | DB client | Homepage impact | Status |
|---|---|---|---|---|---|---|
| S1 | `api/admin/store/brands/route.ts` | POST | `storeDb.brand.create` | **storeDb** (store DB) | ❌ NONE — store DB ≠ main DB | **NOT-HOMEPAGE-AFFECTING** |
| S2 | `api/admin/store/brands/[id]/route.ts` | PATCH | `storeDb.brand.update` | **storeDb** | ❌ NONE | **NOT-HOMEPAGE-AFFECTING** |
| S2 | `api/admin/store/brands/[id]/route.ts` | DELETE | (likely `storeDb.brand.delete`) | **storeDb** | ❌ NONE | **NOT-HOMEPAGE-AFFECTING** |
| S3 | `api/admin/store/categories/route.ts` | POST | `storeDb.category.create` | **storeDb** | ❌ NONE | **NOT-HOMEPAGE-AFFECTING** |
| S4 | `api/admin/store/categories/[id]/route.ts` | PATCH | `storeDb.category.update` | **storeDb** | ❌ NONE | **NOT-HOMEPAGE-AFFECTING** |
| S4 | `api/admin/store/categories/[id]/route.ts` | DELETE | (likely `storeDb.category.delete`) | **storeDb** | ❌ NONE | **NOT-HOMEPAGE-AFFECTING** |

### 6.1 Key finding: Store routes use `storeDb`, not `db`

The store routes use `storeDb` (the store Prisma client from `prisma/store-schema.prisma`), NOT `db` (the main HEAVIX Prisma client from `prisma/schema.prisma`). Store brands/categories are in a **completely different database** from the Homepage data.

**This resolves the 5 AMBIGUOUS routes from C.1.** They're not AMBIGUOUS — they're **NOT-HOMEPAGE-AFFECTING** because they operate on a different database. No revalidation needed.

### 6.2 Also: `api/brands/featured/route.ts` — read-only

| Route | Method | Prisma mutation | Status |
|---|---|---|---|
| `api/brands/featured/route.ts` | GET only | None (read-only) | **SAFE** (no mutation) |

---

## 7. OTHER Homepage-Affecting Direct Routes (7 routes, 12 mutation operations)

| # | Route | Method | Prisma mutation | Homepage queries | Tag needed | Revalidation | @ts-nocheck | Status |
|---|---|---|---|---|---|---|---|---|
| S1 | `api/admin/site-settings/route.ts` | PUT | `db.siteSettings.create/update` (line 17) | Q4 | `home:settings` | NONE | YES | **GAP** |
| S2 | `api/admin/homepage-sections/route.ts` | POST | `db.homePageSection.create` (line 98) | Q16 | `home:sections` | NONE | NO | **GAP** |
| S2 | `api/admin/homepage-sections/route.ts` | PUT | `db.homePageSection.update` (line 49) | Q16 | `home:sections` | NONE | NO | **GAP** |
| S3 | `api/admin/hero/route.ts` | PUT | `db.heroConfig.create/update` (line 16) | Q17, Q27 | `home:hero` | NONE | NO | **GAP** |
| A1 | `api/admin/articles/route.ts` | POST | `db.article.create` (line 85) + bulk ops (lines 65, 70) | Q14 | `home:articles` | NONE | NO | **GAP** |
| A2 | `api/admin/articles/[id]/route.ts` | PATCH | `db.article.update` (line 42) | Q14 | `home:articles` | NONE | NO | **GAP** |
| A2 | `api/admin/articles/[id]/route.ts` | DELETE | `db.article.delete` (line 59) | Q14 | `home:articles` | NONE | NO | **GAP** |
| H1 | `api/admin/hot-searches/route.ts` | POST | `db.hotSearch.create` (line 57) + bulk ops (lines 39, 46) | Q15 | `home:hot-searches` | NONE | NO | **GAP** |
| H2 | `api/admin/hot-searches/[id]/route.ts` | PATCH | `db.hotSearch.update` (line 30) | Q15 | `home:hot-searches` | NONE | NO | **GAP** |
| H2 | `api/admin/hot-searches/[id]/route.ts` | DELETE | `db.hotSearch.delete` (line 47) | Q15 | `home:hot-searches` | NONE | NO | **GAP** |

### 7.1 All direct mutations — no shared service delegation

**ALL 7 routes perform direct Prisma mutations.** None delegate to shared services. Each is an independent insertion point.

### 7.2 Tags NOT in homepage-cache-tags.ts

The following tags are needed for these routes but are NOT in the current `homepage-cache-tags.ts`:
- `home:settings` (for site-settings)
- `home:sections` (for homepage-sections)
- `home:hero` (for hero)
- `home:cat-config` (for home/categories — already noted in §4.2)
- `home:articles` (for articles)
- `home:hot-searches` (for hot-searches)
- `home:categories` (for taxonomy/categories — already noted in §4.2)

**The mapping file needs 7 additional entries for P3 implementation.**

---

## 8. Summary

### 8.1 Status counts

| Status | Routes | Mutation operations |
|---|---:|---:|
| **GAP** | 21 | 32 |
| **NOT-HOMEPAGE-AFFECTING** | 4 (store routes) | 6 |
| **SAFE** | 1 (brands/featured read-only) | 0 |
| **TOTAL** | 26 | 38 |

### 8.2 By data category

| Tag needed | GAP routes | In homepage-cache-tags.ts? |
|---|---:|---|
| `home:listings` | 5 | ✅ Yes |
| `home:brands` | 5 | ✅ Yes |
| `home:categories` | 2 | ❌ No — needs to be added |
| `home:cat-config` | 1 | ❌ No — needs to be added |
| `home:requests` | 5 | ✅ Yes (as `buy-requests`) |
| `home:settings` | 1 | ❌ No — needs to be added |
| `home:sections` | 1 (2 methods) | ❌ No — needs to be added |
| `home:hero` | 1 | ❌ No — needs to be added |
| `home:articles` | 2 | ❌ No — needs to be added |
| `home:hot-searches` | 2 | ❌ No — needs to be added |

### 8.3 Call graph analysis — NO shared service deduplication possible

**CRITICAL finding:** ALL 21 GAP routes perform direct Prisma mutations. None delegate to:
- ❌ `createResource`/`updateResource`/`deleteResource` (data-adapter)
- ❌ `auditMutation`/`auditCreate`/`auditDelete` (audit-foundation)
- ❌ `executeAction` (action-engine)

This means there is **NO shared service to deduplicate**. Each route is an independent insertion point. P3 implementation will need to add `revalidateTag` to each of the 21 routes individually.

### 8.4 homepage-cache-tags.ts needs 7 additional entries

Current mapping (from P1):
```typescript
listings: ['home:listings'],
brands: ['home:brands'],
'buy-requests': ['home:requests'],
```

Needed additions for P3:
```typescript
categories: ['home:categories'],
'cat-config': ['home:cat-config'],
settings: ['home:settings'],
sections: ['home:sections'],
hero: ['home:hero'],
articles: ['home:articles'],
'hot-searches': ['home:hot-searches'],
```

**But per user policy, NO code changes in this step.** This is a finding for P3 implementation.

### 8.5 Design decision needed for P3 implementation

Direct routes don't have a `resourceKey` — they're not Universal API routes. The `getHomepageCacheTags(resourceKey)` function expects a resource key, but direct routes don't have one.

Options:
1. **Hardcode tags in each route** — simplest, but doesn't use the central mapping
2. **Add model-name-based lookup to homepage-cache-tags.ts** — `getHomepageCacheTagsForModel('brand')` maps Prisma model names to tags
3. **Add direct tag constants** — export individual tag constants (`HOMEPAGE_TAG_LISTINGS = 'home:listings'` etc.) and import them in each route

This is a design decision for P3 implementation (not Evidence Freeze).

---

## 9. Cumulative Coverage P1 + P2 + P3 (projected)

| Priority | What | Routes | Mutation paths |
|---|---|---:|---:|
| P1 (done) | Universal Resource API | 2 | 9 (3 resources × 3 ops) |
| P2 (done) | Action Engine | 1 (executeAction) | 24 potential (8 handlers × 3 resources) |
| P3 (Evidence Freeze) | Direct API routes | 21 | 32 |
| P4 (pending) | Bulk Export Engine | 1 | TBD |
| P5 (resolved) | Store routes | 4 | 0 (NOT-HOMEPAGE-AFFECTING) |

**P1 + P2 + P3 projected: 9 + 24 + 32 = 65 mutation paths covered.**

But this number includes potential paths (P2's 24) that may not all fire in practice. The ACTUAL unique coverage depends on which actions are defined per resource and which routes are actually used.

### 9.1 Remaining after P3

| What | Status |
|---|---|
| P4 (Bulk Export Engine) | Pending — `executeBulkAction` in `bulk-export-engine.ts` |
| P5 (Store routes) | **RESOLVED** — NOT-HOMEPAGE-AFFECTING (use `storeDb`, not `db`) |
| `api/brands/featured/route.ts` | SAFE — read-only, no mutation |

**Only P4 remains after P3.** P5 is resolved (not Homepage-affecting).

---

## 10. What This Step Did NOT Do

- ✅ No code changes made
- ✅ No `revalidateTag` calls added to any route
- ✅ No `homepage-cache-tags.ts` modified
- ✅ No commit, no push
- ✅ Baseline preserved

---

## 11. Next Steps

```
✅ C.2-P1 Universal Resource API (9 paths covered)
✅ C.2-P2 Action Engine (24 potential paths covered)
✅ C.2-P3 Direct API Evidence Freeze ← COMPLETE (21 GAP routes, 32 mutation ops)
🔵 C.2-P3 Implementation (add revalidateTag to 21 routes + extend homepage-cache-tags.ts)
🔵 C.2-P4 Bulk Export Engine (executeBulkAction)
🔵 C.2-P5 RESOLVED — store routes are NOT-HOMEPAGE-AFFECTING
🔵 C.2 Re-audit (final coverage count)
🔵 D Freshness/Invalidation Tests
🔵 E TTFB Performance Gate
🔵 F GREEN/YELLOW/RED
```

### 11.1 P3 implementation scope (for next step)

1. **Extend `homepage-cache-tags.ts`** — add 7 new entries (categories, cat-config, settings, sections, hero, articles, hot-searches)
2. **Add `revalidateTag` to 21 direct routes** — each needs the try/catch pattern after successful mutation
3. **Design decision:** how to reference tags in direct routes (hardcode vs model-name lookup vs direct constants)
4. **No shared service deduplication possible** — all routes are independent insertion points

### 11.2 P4 scope (after P3)

`src/lib/admin/bulk-export-engine.ts` — `executeBulkAction` performs `deleteMany`/`updateMany` in batches of 50. Needs `revalidateTag` after batch completes.

### 11.3 P5 resolution

Store routes (`api/admin/store/brands/*`, `api/admin/store/categories/*`) use `storeDb` (store database), NOT `db` (main HEAVIX database). Store data is in a separate Prisma schema. **Homepage queries the main database, not the store database.** Therefore store route mutations do NOT affect Homepage data.

**P5 is RESOLVED as NOT-HOMEPAGE-AFFECTING. No revalidation needed.**
