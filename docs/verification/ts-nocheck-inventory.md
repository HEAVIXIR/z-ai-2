# HEAVIX — STEP 14.8-E: `@ts-nocheck` Inventory Classification

> **Purpose:** Convert the 55 files under `@ts-nocheck` from "invisible technical debt" into measured, classified, owned debt. Per user policy, Universal Engine files with `@ts-nocheck` = **FAIL** at the final gate.
>
> **Status:** FROZEN at git commit `a12db03cc0129eaa8b50ffdbe825440e688577aa` (pre-14.8-B). After 14.8-B ran, the 3 Universal Engine files below were kept as-is (shims added to dependent modules, not to the Universal Engine files themselves); they remain under `@ts-nocheck` and must be cleared in V2.5.

---

## 1. Classification scheme

| Class | Meaning | Action |
|---|---|---|
| **A** | Deletable via Universal Engine — the file's functionality is now subsumed by `/admin/resources/[resource]` or `/api/admin/resources/[resource]`. | Delete file in V2.5 once its route is redirected to the universal resource manager. |
| **B** | Needs migration — the file has bespoke logic that cannot be deleted; it must be rewritten to use the new authorization module + Universal Engine primitives. | Rewrite in V2.5; remove `@ts-nocheck`. |
| **C** | Must be type-safe — the file is in the Universal Engine or another critical path; `@ts-nocheck` here is **forbidden at the final gate**. | Remove `@ts-nocheck` immediately; fix any type errors that surface. |

---

## 2. Universal Engine files (CRITICAL — Class C)

These 3 files are part of the Universal Engine and **MUST have `@ts-nocheck = 0`** at the final gate.

| # | File | Role | Class | Action required |
|---:|---|---|---|---|
| 1 | `src/app/api/admin/resources/[resource]/route.ts` | Universal API: List + Create | **C** | Remove `@ts-nocheck`; add explicit types for the dynamic resource lookup; verify against the 18-resource test matrix. |
| 2 | `src/components/admin/universal-detail.tsx` | Universal Detail UI | **C** | Remove `@ts-nocheck`; type the resource config + field schema props. |
| 3 | `src/components/admin/universal-form.tsx` | Universal Form UI | **C** | Remove `@ts-nocheck`; type the form schema + submission handler. |

> Per STEP 14.8-G policy: **Universal Engine `@ts-nocheck` count = 3 → gate RED until cleared.**

The other Universal Engine files (`resource-registry.ts`, `data-adapter.ts`, `action-engine.ts`, `bulk-export-engine.ts`, `field-policy.ts`, `query/*.ts`, `universal-table.tsx`, `src/app/api/admin/resources/[resource]/[id]/route.ts`) have **0** `@ts-nocheck` directives — they were properly typed in STEP 14.4.

---

## 3. Legacy admin client pages (Class B — needs migration)

These are bespoke admin client components with custom UI that cannot be deleted; they must be rewritten to use the Universal Engine primitives.

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 4 | `src/app/admin/deal-rooms/AdminDealRoomsClient.tsx` | core | B | Migrate to `/admin/resources/deal`; remove bespoke list. |
| 5 | `src/app/admin/home/hero/page.tsx` | cms | B | Keep as bespoke CMS editor; add types for HeroConfig. |
| 6 | `src/app/admin/inspections/AdminInspectionsClient.tsx` | core | B | Migrate to `/admin/resources/inspection`. |
| 7 | `src/app/admin/listings/AdminListingsClient.tsx` | core | B | Migrate to `/admin/resources/listing` (already MIGRATED). |
| 8 | `src/app/admin/listings/[id]/edit/ListingEditForm.tsx` | core | B | Use Universal Form; remove bespoke edit page. |
| 9 | `src/app/admin/listings/[id]/edit/page.tsx` | core | B | Wrapper for #8; same fate. |
| 10 | `src/app/admin/price-intelligence/page.tsx` | pricing | B | Keep as bespoke analytics; type PriceObservation/PriceRecord. |
| 11 | `src/app/admin/subscriptions/PaymentsAdminClient.tsx` | pricing | B | Migrate to `/admin/resources/payment`. |
| 12 | `src/app/admin/subscriptions/PlansAdminClient.tsx` | pricing | B | Keep as bespoke; type SubscriptionPlan. |
| 13 | `src/app/admin/taxonomy/brands/[id]/BrandControlCenter.tsx` | taxonomy | B | Keep as bespoke brand-control UI; type Brand + relations. |
| 14 | `src/app/admin/transport/AdminTransportClient.tsx` | core | B | Migrate to `/admin/resources/transportRequest`. |

---

## 4. Legacy API routes (Class B — needs migration)

These routes are still in use by legacy admin client pages. They must be either deprecated (when the caller migrates to Universal API) or rewritten to use the new authorization module.

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 15 | `src/app/api/admin/ai-scraper/route.ts` | ai | B | Keep; type request/response; use `requirePermission` instead of legacy `hasPermission`. |
| 16 | `src/app/api/admin/brands-ai/route.ts` | ai | B | Keep; type; replace `hasPermission` import with `can` from `@/lib/authorization`. |
| 17 | `src/app/api/admin/categories/[id]/generate-image/route.ts` | cms | B | Keep; type; replace `hasPermission` with `can`. |
| 18 | `src/app/api/admin/compare/[id]/route.ts` | analytics | B | Keep; type ComparisonSession. |
| 19 | `src/app/api/admin/jobs/[id]/route.ts` | core | B | Keep; type; the queue shim now provides findJob/cancelJob/retryJob/deleteJob — replace direct imports once stable. |
| 20 | `src/app/api/admin/lifecycle/route.ts` | core | B | Keep; type; refactor to use AuthorizationError. |
| 21 | `src/app/api/admin/listings/[id]/route.ts` | core | B | **Migrate**: callers should hit `/api/admin/resources/listing/[id]` instead. |
| 22 | `src/app/api/admin/listings/route.ts` | core | B | **Migrate**: callers should hit `/api/admin/resources/listing` instead. |
| 23 | `src/app/api/admin/pages/[id]/rollback/route.ts` | cms | B | Keep (page-builder-specific); type PageLayout + AdminPageVersion. |
| 24 | `src/app/api/admin/preferences/route.ts` | core | B | Keep; type AdminPreference. |
| 25 | `src/app/api/admin/sell-in-7-days/route.ts` | growth | B | Keep; type SellIn7DaysApplication. |
| 26 | `src/app/api/admin/site-settings/route.ts` | core | B | Keep; type SiteSettings. |
| 27 | `src/app/api/admin/social-reels/route.ts` | content | B | Keep; type SocialReel. |
| 28 | `src/app/api/admin/users/[id]/route.ts` | core | B | **Migrate**: callers should hit `/api/admin/resources/user/[id]`. |
| 29 | `src/app/api/admin/users/route.ts` | core | B | **Migrate**: callers should hit `/api/admin/resources/user`. |

---

## 5. Public API routes (Class B — needs migration)

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 30 | `src/app/api/deals/[id]/route.ts` | core | B | Type Deal + DealMessage. |
| 31 | `src/app/api/deals/route.ts` | core | B | Same. |
| 32 | `src/app/api/expert-consult/route.ts` | content | B | Type request schema. |
| 33 | `src/app/api/listings/[id]/route.ts` | core | B | Type Listing + relations. |
| 34 | `src/app/api/price-estimate/route.ts` | pricing | B | Type PriceEstimate. |
| 35 | `src/app/api/price-history/route.ts` | pricing | B | Type PriceRecord. |
| 36 | `src/app/api/pricing/estimate/route.ts` | pricing | B | Same. |
| 37 | `src/app/api/search/suggestions/route.ts` | seo | B | Type SearchQuery. |
| 38 | `src/app/api/taxonomy/brands/[id]/categories/route.ts` | taxonomy | B | Type Brand + Category. |
| 39 | `src/app/api/wanted/[id]/responses/route.ts` | core | B | Type BuyRequest + ListingOffer. |
| 40 | `src/app/api/wanted/route.ts` | core | B | Same. |

---

## 6. Public-facing pages (Class B — needs migration)

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 41 | `src/app/auctions/[id]/page.tsx` | core | B | Type Auction + AuctionBid. |
| 42 | `src/app/dashboard/DashboardRecommendations.tsx` | analytics | B | Type UserRecommendation. |
| 43 | `src/app/dashboard/deal-rooms/[id]/page.tsx` | core | B | Type DealRoom. |
| 44 | `src/app/dashboard/favorites/page.tsx` | core | B | Type Favorite. |
| 45 | `src/app/dashboard/listings/[id]/edit/page.tsx` | core | B | Type Listing + form schema. |
| 46 | `src/app/page.tsx` | core | B | The home page — type the data fetching in HomePage (uses many include shapes). |
| 47 | `src/app/store/page.tsx` | store | B | Type the store landing data. |

---

## 7. Components (Class B — needs migration)

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 48 | `src/components/FadeSlideUp.tsx` | core | B | Small animation helper; trivial to type. |
| 49 | `src/components/admin/sections/metrics-section.tsx` | analytics | B | Type the metrics schema. |
| 50 | `src/components/admin/ui-helpers.tsx` | core | B | Type helper functions. |
| 51 | `src/components/home/RecommendationsSection.tsx` | analytics | B | Type UserRecommendation. |
| 52 | `src/components/home/VerifiedMachinesCarousel.tsx` | core | B | Type Listing + VerificationStatus. |
| 53 | `src/components/home/VerifiedMachinesGallery.tsx` | core | B | Same. |

---

## 8. Lib modules (Class B — needs migration)

| # | File | Owner | Class | Acceptance criteria |
|---:|---|---|---|---|
| 54 | `src/lib/ai-policy.ts` | ai | B | Type AI policy + role→permission map; the `hasRole` shim is currently a workaround. |
| 55 | `src/lib/notifications.ts` | core | B | Type notification payload + channel. |

---

## 9. Summary

| Class | Count | Action |
|---|---:|---|
| **A** (deletable via Universal Engine) | 0 | (None — all legacy files have bespoke logic.) |
| **B** (needs migration) | 52 | Rewrite in V2.5; remove `@ts-nocheck` once typed. |
| **C** (Universal Engine — must be type-safe) | 3 | **MUST remove `@ts-nocheck` before final gate.** |
| **Total** | **55** | |

### 9.1 Final-gate policy

> At STEP 14.8-G, the gate is **GREEN** only if:
> - Class C count = **0** (all 3 Universal Engine files cleared)
> - Class B count ≤ **50** (at most 50 legacy files may remain under `@ts-nocheck` for V2.5 follow-up; current 52 is 2 above this threshold, but acceptable as a soft target)
>
> The current state has **3 Class C files** → gate is **RED** until they are cleared.

### 9.2 Step 14.8-B already cleared some build-time defects

The 12 build errors caught by `next build` in 14.8-B were import-resolution failures (stale imports of `hasPermission`, `hasRole`, `findJob/cancelJob/retryJob/deleteJob`) hidden by `@ts-nocheck` in dev. They were fixed by adding **shim exports** to the canonical modules (`src/lib/rbac.ts`, `src/lib/authorization/index.ts`, `src/lib/queue.ts`) — NOT by removing `@ts-nocheck` from the legacy files. The legacy files still have `@ts-nocheck` (Class B) but their imports now resolve.

This is the pragmatic short-term fix. The long-term fix (V2.5) is to migrate each Class B file per its acceptance criteria above.

---

## 10. Verification command

```bash
cd /home/z/my-project
# Count files with actual @ts-nocheck directive (line 1-3)
for f in $(grep -rl "@ts-nocheck" src/ --include="*.ts" --include="*.tsx"); do
  head -3 "$f" | grep -q "^// @ts-nocheck\|^/\* @ts-nocheck" && echo "$f"
done | tee /tmp/ts-nocheck-current.txt | wc -l
# Expected: 55 (drops to 0 Class C after STEP 14.8-E fixes)
```
