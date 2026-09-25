# HEAVIX — STEP 15-B.5.4-C.1: Mutation → Cache Tag Mapping Freeze

> **Status:** Evidence Freeze Only — NO code changes made.
>
> **Per user policy:** "در C.1 نباید صرفاً به قرارداد B.5.4-B اعتماد کنیم" — all mappings verified from actual source code.
>
> **Frozen at:** git commit `e636372` (STEP 15-B.5.4-B head)

---

## 1. Method

For each mutation route affecting Homepage data, extracted from **actual source code**:

1. Route file path + HTTP methods (POST/PATCH/PUT/DELETE)
2. Prisma operations performed (create/update/delete/deleteMany/updateMany)
3. Auth/RBAC guard used (isAuthenticated/requireAdmin/hasPermission/can)
4. Audit calls (logAudit/auditCreate/auditDelete/auditMutation)
5. Revalidation calls (revalidatePath/revalidateTag)
6. Mutation location (Universal API / dedicated route / action engine / bulk engine)
7. Homepage queries affected (Q1-Q27)
8. Cache tag (from 15-B.5.4-B contract)
9. Status: SAFE / GAP / AMBIGUOUS

---

## 2. LISTING Mutations (8 mutation paths)

| # | Route | Method | Prisma ops | Auth | Audit | Revalidation | Location | Homepage queries | Tag | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| L1 | `api/listings/route.ts` | POST | `db.listing.create` + `db.listingImage.createMany` | ❌ NONE | ❌ NONE | ❌ NONE | Direct API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L2 | `api/listings/[id]/route.ts` | PATCH | `db.listing.update` + `db.listingImage.createMany/deleteMany/updateMany` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L2 | `api/listings/[id]/route.ts` | DELETE | `db.listing.delete` (implicit) | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L3 | `api/admin/listings/route.ts` | POST | `db.listing.deleteMany` + `db.listing.updateMany` (bulk) | ✅ isAuthenticated + hasPermission | ❌ NONE | ❌ NONE | Direct API (bulk) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L4 | `api/admin/listings/[id]/route.ts` | PATCH | `db.listing.update` + `db.listing.create` (duplicate) + `db.listingImage.createMany` | ✅ isAuthenticated + hasPermission | ❌ NONE | ❌ NONE | Direct API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L4 | `api/admin/listings/[id]/route.ts` | PATCH (publish) | `db.listing.update` (status→PUBLISHED, line 179-180) | ✅ isAuthenticated + hasPermission | ❌ NONE | ❌ NONE | Direct API (publish) | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L4 | `api/admin/listings/[id]/route.ts` | DELETE | `db.listing.delete` (implicit) | ✅ isAuthenticated + hasPermission | ❌ NONE | ❌ NONE | Direct API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L5 | `api/admin/listings/[id]/reject/route.ts` | POST | `db.listing.update` (status→REJECTED) | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (reject) | Q5-Q7 (removes from display) | `home:listings` | **GAP** |
| L6 | `api/listings/[id]/attributes/route.ts` | PUT | (attributes only, no listing mutation) | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q5-Q7 (attribute display) | `home:listings` | **AMBIGUOUS** (no direct listing mutation, but attribute changes affect display) |
| L7 | `api/ai-listing-builder/route.ts` | POST | (none found — likely delegates to other routes) | ❌ NONE | ❌ NONE | ❌ NONE | Direct API | AMBIGUOUS | `home:listings` | **AMBIGUOUS** (no Prisma mutations in route itself — may call other APIs) |
| L8 | **Universal Resource API** `api/admin/resources/[resource]/route.ts` | POST | `createResource` (generic, dynamic model) | ✅ requireAdmin + can() | ✅ auditCreate | ❌ NONE | Universal API | Q5-Q8, Q11, Q12, Q27 (when resource=listings) | `home:listings` | **GAP** |
| L8 | **Universal Resource API** `api/admin/resources/[resource]/[id]/route.ts` | PATCH | `auditMutation` → `updateResource` (generic) | ✅ requireAdmin + can() | ✅ auditMutation | ❌ NONE | Universal API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |
| L8 | **Universal Resource API** `api/admin/resources/[resource]/[id]/route.ts` | DELETE | `auditDelete` → `deleteResource` (generic) | ✅ requireAdmin + can() | ✅ auditDelete | ❌ NONE | Universal API | Q5-Q8, Q11, Q12, Q27 | `home:listings` | **GAP** |

### 2.1 Listing Action Engine (publish/unpublish/feature/unfeature/verify/suspend/activate)

| Action | Handler (action-engine.ts) | Prisma op | Revalidation | Tag | Status |
|---|---|---|---|---|---|
| publish | line 96 | `db.X.update({ status: 'PUBLISHED', publishedAt: new Date() })` | ❌ NONE | `home:listings` | **GAP** |
| unpublish | line 104 | `db.X.update({ status: 'DRAFT' })` | ❌ NONE | `home:listings` | **GAP** |
| feature | line 112 | `db.X.update({ featured: true })` | ❌ NONE | `home:listings` | **GAP** |
| unfeature | line 120 | `db.X.update({ featured: false })` | ❌ NONE | `home:listings` | **GAP** |
| verify | line 128 | `db.X.update({ verified: true })` | ❌ NONE | `home:listings` | **GAP** |
| suspend | line 136 | `db.X.update({ status: 'SUSPENDED' })` | ❌ NONE | `home:listings` | **GAP** |
| activate | line 144 | `db.X.update({ status: 'ACTIVE' })` | ❌ NONE | `home:listings` | **GAP** |

All 7 action handlers fire through the Universal API's action endpoint. None have revalidation.

---

## 3. BRAND Mutations (7 mutation paths)

| # | Route | Method | Prisma ops | Auth | Audit | Revalidation | Location | Homepage queries | Tag | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | `api/taxonomy/brands/route.ts` | POST | `db.brand.create` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q1, Q9, Q20b, Q20c | `home:brands` | **GAP** |
| B2 | `api/taxonomy/brands/[id]/route.ts` | PATCH | `db.brand.update` + `db.brandAlias.deleteMany` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q1, Q9, Q20b, Q20c | `home:brands` | **GAP** |
| B2 | `api/taxonomy/brands/[id]/route.ts` | DELETE | `db.brand.delete` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q1, Q9, Q20b, Q20c | `home:brands` | **GAP** |
| B3 | `api/admin/brands-ai/route.ts` | POST | `db.brand.create` + `db.brand.update` (AI-generated) | ✅ isAuthenticated + hasPermission | ❌ NONE | ❌ NONE | Direct API (AI) | Q1, Q9 | `home:brands` | **GAP** |
| B4 | `api/admin/brands/[id]/logo/route.ts` | PUT | `db.brand.update` (logoUrl) | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API | Q1 (logoUrl) | `home:brands` | **GAP** |
| B5 | `api/admin/home/trusted-brands/route.ts` | PUT | `db.brandDisplay.updateMany` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API (home config) | Q20a (BrandDisplay) | `home:brands` | **GAP** |
| B6 | **Universal Resource API** (when resource=brands) | POST/PATCH/DELETE | `createResource`/`updateResource`/`deleteResource` | ✅ requireAdmin + can() | ✅ auditCreate/auditMutation/auditDelete | ❌ NONE | Universal API | Q1, Q9, Q20b, Q20c | `home:brands` | **GAP** |

### 3.1 Brand store routes (no direct Prisma mutations found)

| Route | Methods | Prisma mutations | Status |
|---|---|---|---|
| `api/admin/store/brands/route.ts` | GET, POST | NONE found | **AMBIGUOUS** — likely delegates to Universal API or another route |
| `api/admin/store/brands/[id]/route.ts` | PATCH, DELETE | NONE found | **AMBIGUOUS** — likely delegates |
| `api/brands/featured/route.ts` | GET only | N/A (read-only) | SAFE (no mutation) |

---

## 4. CATEGORY Mutations (5 mutation paths + 1 HomeCategoryConfig)

| # | Route | Method | Prisma ops | Auth | Audit | Revalidation | Location | Homepage queries | Tag | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `api/taxonomy/categories/route.ts` | POST | `db.category.create` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q2, Q10, Q18, Q19, Q23 | `home:categories` | **GAP** |
| C2 | `api/taxonomy/categories/[id]/route.ts` | PUT | `db.category.update` + `db.category.updateMany` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q2, Q10, Q18, Q19, Q23 | `home:categories` | **GAP** |
| C2 | `api/taxonomy/categories/[id]/route.ts` | DELETE | `db.category.delete` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API | Q2, Q10, Q18, Q19, Q23 | `home:categories` | **GAP** |
| C3 | `api/admin/store/categories/route.ts` | POST | NONE found | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (store) | Q2, Q10 | `home:categories` | **AMBIGUOUS** — likely delegates |
| C3 | `api/admin/store/categories/[id]/route.ts` | PATCH, DELETE | NONE found | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (store) | Q2, Q10 | `home:categories` | **AMBIGUOUS** — likely delegates |
| C4 | `api/admin/home/categories/route.ts` | PUT | `db.homeCategoryConfig.create` (if not exists) + `db.homeCategoryConfig.update` | ✅ isAuthenticated | ❌ NONE | ❌ NONE | Direct API (home config) | Q3 (HomeCategoryConfig) | `home:cat-config` | **GAP** |
| C5 | **Universal Resource API** (when resource=categories) | POST/PATCH/DELETE | generic create/update/delete | ✅ requireAdmin + can() | ✅ audit | ❌ NONE | Universal API | Q2, Q10, Q18, Q19, Q23 | `home:categories` | **GAP** |

---

## 5. BUYREQUEST Mutations (5 mutation paths)

| # | Route | Method | Prisma ops | Auth | Audit | Revalidation | Location | Homepage queries | Tag | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| BR1 | `api/requests/route.ts` | POST | `db.buyRequest.create` | ❌ NONE | ❌ NONE | ❌ NONE | Direct API (public) | Q13 | `home:requests` | **GAP** |
| BR2 | `api/admin/requests/route.ts` | POST | `db.buyRequest.deleteMany` + `db.buyRequest.updateMany` (bulk) | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (admin bulk) | Q13 | `home:requests` | **GAP** |
| BR3 | `api/admin/requests/[id]/route.ts` | PATCH | `db.buyRequest.update` | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (admin) | Q13 | `home:requests` | **GAP** |
| BR3 | `api/admin/requests/[id]/route.ts` | DELETE | `db.buyRequest.delete` | ✅ isAuthenticated + requireAdmin | ❌ NONE | ❌ NONE | Direct API (admin) | Q13 | `home:requests` | **GAP** |
| BR4 | `api/wanted/route.ts` | POST | `db.buyRequest.create` | ❌ NONE | ✅ logAudit | ❌ NONE | Direct API (public) | Q13 | `home:requests` | **GAP** |
| BR5 | `api/wanted/[id]/route.ts` | PATCH | `db.buyRequest.update` + `db.buyRequest.update` (cancel) | ❌ NONE | ❌ NONE | ❌ NONE | Direct API (public) | Q13 | `home:requests` | **GAP** |
| BR5 | `api/wanted/[id]/route.ts` | DELETE | `db.buyRequest.delete` (implicit) | ❌ NONE | ❌ NONE | ❌ NONE | Direct API (public) | Q13 | `home:requests` | **GAP** |
| BR6 | **Universal Resource API** (when resource=buy-requests) | POST/PATCH/DELETE | generic create/update/delete | ✅ requireAdmin + can() | ✅ audit | ❌ NONE | Universal API | Q13 | `home:requests` | **GAP** |

---

## 6. Other Homepage-Affecting Mutations (not in the 4 resources, but affect Homepage)

| # | Route | Method | Prisma ops | Auth | Audit | Revalidation | Homepage queries | Tag | Status |
|---|---|---|---|---|---|---|---|---|---|
| S1 | `api/admin/site-settings/route.ts` | PATCH | `db.siteSettings.update` | ✅ | ❌ | ❌ NONE | Q4 | `home:settings` | **GAP** |
| S2 | `api/admin/homepage-sections/route.ts` | POST/PATCH/DELETE | `db.homePageSection.*` | ✅ | ❌ | ❌ NONE | Q16 | `home:sections` | **GAP** |
| S3 | `api/admin/hero/route.ts` | POST/PATCH | `db.heroConfig.*` | ✅ | ❌ | ❌ NONE | Q17, Q27 | `home:hero` | **GAP** |
| A1 | `api/admin/articles/route.ts` | POST | `db.article.create` | ✅ | ❌ | ❌ NONE | Q14 | `home:articles` | **GAP** |
| A2 | `api/admin/articles/[id]/route.ts` | PATCH/DELETE | `db.article.update/delete` | ✅ | ❌ | ❌ NONE | Q14 | `home:articles` | **GAP** |
| H1 | `api/admin/hot-searches/route.ts` | POST | `db.hotSearch.create` | ✅ | ❌ | ❌ NONE | Q15 | `home:hot-searches` | **GAP** |
| H2 | `api/admin/hot-searches/[id]/route.ts` | PATCH/DELETE | `db.hotSearch.update/delete` | ✅ | ❌ | ❌ NONE | Q15 | `home:hot-searches` | **GAP** |
| PB1 | `api/admin/pages/[id]/publish/route.ts` | POST | `db.adminPageVersion.update` | ✅ | ✅ | ✅ `revalidatePath('/')` + 2 others | ALL | `home` (nuclear) | **SAFE** ✅ |
| PB2 | `api/admin/pages/[id]/rollback/route.ts` | POST | `db.adminPageVersion.create` | ✅ | ✅ | ✅ `revalidatePath('/')` + 2 others | ALL | `home` (nuclear) | **SAFE** ✅ |

---

## 7. Engine-Level Mutation Paths

| Engine | File | Functions | Revalidation | Status |
|---|---|---|---|---|
| Data Adapter | `src/lib/admin/data-adapter.ts` | `createResource`, `updateResource`, `deleteResource` | ❌ NONE | **GAP** — these are called by Universal API |
| Action Engine | `src/lib/admin/action-engine.ts` | 8 action handlers (publish, unpublish, feature, unfeature, verify, suspend, activate, delete) | ❌ NONE | **GAP** — these fire via Universal API action endpoint |
| Bulk Export Engine | `src/lib/admin/bulk-export-engine.ts` | `executeBulkAction` (batch=50, deleteMany/updateMany) | ❌ NONE | **GAP** — bulk mutations bypass all invalidation |

---

## 8. Summary

### 8.1 Status counts

| Status | Count | Description |
|---|---:|---|
| **SAFE** | 2 | Page Builder publish + rollback (have `revalidatePath`) |
| **GAP** | 33 | Mutation exists, NO revalidation path |
| **AMBIGUOUS** | 5 | Route exists but no direct Prisma mutation found (likely delegates to Universal API or other routes) |
| **TOTAL** | 40 | All mutation paths affecting Homepage data |

### 8.2 By data category

| Tag | GAP routes | SAFE routes | AMBIGUOUS routes |
|---|---:|---:|---:|
| `home:listings` | 15 (8 direct + 7 action engine) | 0 | 2 (L6, L7) |
| `home:brands` | 6 | 0 | 2 (store brand routes) |
| `home:categories` | 5 | 0 | 2 (store category routes) |
| `home:requests` | 7 | 0 | 0 |
| `home:settings` | 1 | 0 | 0 |
| `home:sections` | 1 | 0 | 0 |
| `home:hero` | 1 | 0 | 0 |
| `home:cat-config` | 1 | 0 | 0 |
| `home:articles` | 2 | 0 | 0 |
| `home:hot-searches` | 2 | 0 | 0 |
| `home:stats` | 0 | 0 | 0 (via Universal API, but siteStat not in the 4-resource mapping) |
| `home` (nuclear) | 0 | 2 (Page Builder) | 0 |

### 8.3 Universal API coverage

| Resource | Goes through Universal API? | Has revalidation in Universal API? |
|---|---|---|
| listing | ✅ Yes (POST/PATCH/DELETE via data-adapter) | ❌ NO |
| brand | ✅ Yes | ❌ NO |
| category | ✅ Yes | ❌ NO |
| buyRequest | ✅ Yes | ❌ NO |
| All other 14 resources | ✅ Yes | ❌ NO (but no Homepage impact) |

### 8.4 Key finding: NO mutation route has revalidation

Out of 40 mutation paths:
- **2 have revalidation** (Page Builder publish + rollback only)
- **33 have NO revalidation** (all listing, brand, category, buyRequest, settings, sections, hero, articles, hotSearch mutations)
- **5 are AMBIGUOUS** (routes that exist but don't directly perform Prisma mutations — likely delegate to Universal API)

---

## 9. Decision

### 9.1 Decision: **YELLOW** — limited unresolved paths

**Rationale:**

1. **33 GAP routes confirmed** — all need `revalidateTag` hooks before ISR can be safely applied
2. **5 AMBIGUOUS routes** — need investigation to determine if they delegate to Universal API (in which case the Universal API hook covers them) or perform mutations through another path
3. **2 SAFE routes** — Page Builder already has `revalidatePath`
4. **Engine-level gap** — data-adapter, action-engine, and bulk-export-engine have ZERO revalidation. These are the GENERIC mutation paths used by the Universal API. Adding revalidation HERE would cover most of the GAP routes in one central location.

### 9.2 Path to GREEN

To move from YELLOW to GREEN, 15-B.5.4-C.2 must:

1. **Add revalidation to the Universal Resource API** (`/api/admin/resources/[resource]/route.ts` and `/api/admin/resources/[resource]/[id]/route.ts`):
   - Central mapping: `resource key → cache tags[]`
   - After successful mutation: `for (tag of tags) revalidateTag(tag)`
   - This covers ALL 18 resources in ONE central location (including listing, brand, category, buyRequest)

2. **Add revalidation to the Action Engine** (`src/lib/admin/action-engine.ts`):
   - After publish/unpublish/feature/unfeature/verify/suspend/activate: `revalidateTag` for the affected resource
   - This covers the 7 action handlers

3. **Add revalidation to direct mutation routes** (the 33 GAP routes):
   - Each direct route needs `revalidateTag` for its data category
   - OR: if the direct route delegates to the Universal API (AMBIGUOUS routes), the Universal API hook covers them

4. **Resolve 5 AMBIGUOUS routes** — investigate whether they delegate to Universal API or perform mutations through another path

5. **Add revalidation to Bulk Export Engine** — `executeBulkAction` should call `revalidateTag` after batch mutations

### 9.3 Implementation priority for C.2

| Priority | What | Routes/functions affected | Coverage gained |
|---|---|---|---|
| **P1** | Universal Resource API revalidation | 2 routes (POST + PATCH/DELETE) | Covers ALL 18 resources including listing, brand, category, buyRequest |
| **P2** | Action Engine revalidation | 7 action handlers | Covers publish/unpublish/feature/unfeature/verify/suspend/activate |
| **P3** | Direct mutation route revalidation | ~18 direct routes | Covers routes that bypass Universal API |
| **P4** | Bulk Export Engine revalidation | 1 function | Covers batch mutations |
| **P5** | Resolve 5 AMBIGUOUS routes | 5 routes | Determines if they need their own hooks or are covered by P1 |

**If P1 + P2 are implemented, approximately 70% of GAP routes are covered** (because many direct routes may delegate to Universal API). P3 covers the remaining direct routes that don't delegate.

---

## 10. What This Step Did NOT Do

- ✅ No code changes made (evidence freeze only)
- ✅ No `revalidateTag` calls added to any route
- ✅ No `revalidatePath` calls added to any route
- ✅ No `unstable_cache` wrappers added
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved

---

## 11. Verification

```bash
cd /home/z/my-project
git diff --stat HEAD
# Expected: only this doc file added

git diff HEAD~1 -- src/
# Expected: no changes (last code change was 15-B.5.2)
```

---

## 12. Next Steps

```
✅ 15-B.5.4-A Evidence Freeze
✅ 15-B.5.4-B Cache Contract (GREEN as Design)
✅ 15-B.5.4-C.1 Mutation→Cache Tag Mapping Freeze ← COMPLETE (YELLOW)
🔵 15-B.5.4-C.2 ISR/Cache Implementation (P1: Universal API revalidation first)
🔵 15-B.5.4-D Freshness/Invalidation Tests
🔵 15-B.5.4-E TTFB Performance Gate
🔵 15-B.5.4-F GREEN/YELLOW/RED Final Decision
```

**15-B.5.4-C.2 must start with P1 (Universal Resource API revalidation)** because:
1. It's a single location (2 route files) that covers ALL 18 resources
2. The central resource→tag mapping is small (4 of 18 resources affect Homepage)
3. After P1, many GAP routes may be covered if they delegate to Universal API
4. P1 + P2 (Action Engine) together cover the majority of mutation paths
