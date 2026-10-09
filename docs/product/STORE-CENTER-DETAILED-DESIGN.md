# HEAVIX Store Center — Detailed Design Spec

- **Status:** IMPLEMENTATION-READY — for owner sign-off before PR-SC-01..09
- **Date:** 2026-10-09
- **Author:** /detailed agent (STEP 11.29-D, Task ID 10)
- **Baseline:** `main` (HEAD per worklog = `4566efd` post PR #8 merge; local working tree at `710df93` — see Reconciliation Row R0)
- **Related:** `docs/ADR-005-store-center-architecture.md`, `docs/product/ux/STORE-CENTER-UX-PROTOTYPE.md`, `docs/product/STORE-CENTER-IMPLEMENTATION-PLAN.md`, `docs/product/PRODUCT-ADMIN-STORE-CENTER-SPEC.md`
- **Scope:** Implementation-ready design for the 7 mandatory Store Center pages, convertible 1:1 to GitHub issues / PR descriptions.

---

## 0. How To Read This Document

- **Existing** = verified to exist in `prisma/schema.prisma`, `prisma/store-schema.prisma`, or `src/**` on the baseline commit. Each claim cites the file + line range.
- **NEW** = does NOT exist on baseline; resolving PR is named (PR-SC-0X). No proposed route/model is presented as existing.
- **Migration required** = additive `ALTER TABLE` / `CREATE TABLE` is a hard prerequisite before the page can ship.
- **BLOCKER** = a gap that prevents the page from being implementable end-to-end until the resolving PR lands.
- **Permission keys**: every key in `monospace` is one of:
  - a real key from `src/lib/authorization/permissions.ts` (cited), OR
  - a NEW key marked `NEW — added in PR-SC-0X` that does NOT exist on baseline.
- **AI is advisory-only** everywhere (ADR-005 §8). No AI route may mutate DB state. Every AI surface has a human-confirmation gate.
- **VIP enforcement** is server-side on every publish + receive path (ADR-005 §2). No client-only gating.

### 0.1 Hard Rules (carry forward from task brief)

1. Audit existing code/models/APIs FIRST. Reconcile docs with implementation.
2. No route/model presented as "existing" without verification.
3. AI is advisory-only (ADR-005 §8). No autonomous mutations.
4. VIP enforcement is server-side on EVERY publish + receive path (ADR-005 §2).
5. Documentation only — no code, schema, or PR changes by this task.

---

## 1. Verified Schema & Code Baseline (grounding facts)

These facts were checked by reading the actual files at baseline. They are the authoritative reference for every page spec below; any page spec that conflicts with these facts is a documentation bug and must be fixed before implementation.

### 1.1 Main DB (`prisma/schema.prisma`, 2612 lines)

| # | Model | Relevant fields (verified) | File ref |
|---|---|---|---|
| M1 | `Company` | `id, name, slug @unique, description?, logoUrl?, coverImage?, website?, phone?, email?, address?, city?, province?, verified, premium, status, metaTitle?, metaDescription?, viewCount, avgRating?, reviewCount, createdAt, updatedAt` | `schema.prisma:1177-1215` |
| M2 | `User` | `id, firstName, lastName, email @unique, mobile @unique, role (ADMIN\|SELLER\|BUYER), status, companyName?, companyId?, ...` (no `storeSlug`, no `brandColor`) | `schema.prisma:1547-1603` |
| M3 | `Listing` | `id, slug @unique, title, description?, price? BigInt, priceType, listingType, condition?, province?, city?, year?, workingHours?, status, featured, verified, showInLatest, viewCount, favoriteCount, publishedAt?, expiresAt?, soldAt?, sellerPhone?, sellerName?, brandId?, categoryId?, modelId?, sellerId?, companyId?, ...` | `schema.prisma:444-533` |
| M4 | `Lead` | `id, listingId, leadType, viewerPhone?, viewerName?, note?, createdAt` — **NO `status`, NO `sellerId`, NO `companyId`** | `schema.prisma:618-627` |
| M5 | `ListingOffer` | `id, listingId, offerAmount BigInt, message?, status (default PENDING), counterAmount?, buyerName?, buyerPhone, buyerEmail?, buyerId?, sellerNote?, respondedAt?, createdAt, updatedAt` | `schema.prisma:997-1019` |
| M6 | `MachinePassport` | `id, listingId @unique, serialNumber?, inspectionDate?, inspectionResult?, events [], createdAt, updatedAt` — **NO `source`, NO `verification`, NO per-section verifiedAt/verifiedBy fields** (ADR-005 §6 claim is FALSE — see Reconciliation Row R5) | `schema.prisma:1149-1159` |
| M7 | `PassportEvent` | `id, passportId, eventType, title, description?, date, performedBy?, createdAt` | `schema.prisma:1161-1171` |
| M8 | `Inspection` | `id, listingId, dealRoomId?, requestedBy, inspectorId?, status (default REQUESTED), scheduledDate?, completedAt?, checklist? (JSON), score? Float, reportUrl?, photos? (JSON), notes?, price? BigInt, createdAt, updatedAt` | `schema.prisma:1351-1376` |
| M9 | `PremiumSubscription` | `id, userId @unique, user, plan (default BASIC), status (default ACTIVE), startedAt, expiresAt?, featuredCredits, analyticsAccess, aiAssistantAccess, priorityLeads, companyPage, amount? BigInt, paymentRef?, createdAt, updatedAt` — **per-USER, NOT per-Company** | `schema.prisma:1126-1143` |
| M10 | `SubscriptionPlan` | `id, code @unique, nameFa, nameEn?, description?, priceMonthly BigInt, priceYearly?, currency, featuredCredits, analyticsAccess, aiAssistantAccess, priorityLeads, companyPage, maxListings, maxImages, verifiedBadge, supportLevel?, sortOrder, active, popular, featuresJson?, createdAt, updatedAt` | `schema.prisma:1100-1124` |
| M11 | `DealRoom` | `id, listingId, buyerId?, sellerId?, buyerPhone, sellerPhone?, status (default OPEN), ...` | `schema.prisma:1299-1320` |
| M12 | `AIGatewayLog` | `id, taskType (SEARCH\|LISTING_BUILDER\|PRICE_ANALYSIS\|MARKET_ANALYST\|SELLER_ASSISTANT\|SCRAPER\|MODERATION\|SEMANTIC_SEARCH), model, input?, output?, latencyMs?, tokensUsed?, cost?, success, error?, userId?, createdAt` | `schema.prisma:726-741` |
| M13 | `AIBudget` (singleton `id="main"`) | `dailyLimitUsd 10, monthlyLimitUsd 200, dailySpendUsd, monthlySpendUsd, dailyResetAt?, monthlyResetAt?, active` | `schema.prisma:752-765` |
| M14 | `AITaskPolicy` | `id, taskType @unique, allowedRoles (csv), hourlyLimit 30, dailyLimit 100, maxInputChars 5000, maxOutputTokens 2000, model, timeoutMs 30000, costCeilingUsd 0.05, active` — **deny-by-default; tasks without an active policy row are rejected** | `schema.prisma:775-789` |
| M15 | `KnowledgeEntry` | `id, entityType, entityId, title, key, value, unit?, source (MANUFACTURER\|SELLER\|HEAVIX\|USER\|AI\|EXTERNAL), sourceUrl?, sourceRef?, verified, verifiedBy?, verifiedAt?, aiSuggested, createdAt, updatedAt` | `schema.prisma:697-719` |
| M16 | `AdminPreference` | `id, userId @unique, theme, density, locale, timezone, sidebarCollapsed, pinnedItems? Json, hiddenItems? Json, dashboardLayout? Json, defaultPageSize, createdAt, updatedAt` | `schema.prisma:2510-2530` |
| M17 | `AuditLog` | `actorId?, actorType (USER\|ADMIN\|SYSTEM\|AI), action, entityType, entityId?, beforeJson?, afterJson?, ip?, userAgent?, requestId?, reason?` | `schema.prisma:1677+` |

### 1.2 Store DB (`prisma/store-schema.prisma`, 781 lines, separate PostgreSQL DB)

| # | Model | Relevant fields (verified) | File ref |
|---|---|---|---|
| S1 | `Part` | `id, name, nameFa?, sku @unique, categoryId, brandId?, description?, priceUsd Float, oldPriceUsd?, contactForPrice, stock, lowStockThreshold (default 5), images (JSON "[]"), compatibleCars (JSON "[]"), carModels [], sourceUrl?, active, featured, views, soldCount, createdAt, updatedAt` — **NO `inventoryScore`, NO `inventoryScoreVersion`, NO `partNumber`, NO `oemNumber`, NO `documents`** (Part is in STORE DB, not main) | `store-schema.prisma:123-165` |
| S2 | `Order` | `id, orderNumber @unique, customerId, userId?, mechanicId?, status (default PENDING), subtotalUsd, shippingUsd, discountIrr, totalUsd, totalIrr, currencyRateAtOrder, marginPercentAtOrder, couponCode?, shippingAddress?, notes?, paymentStatus (default UNPAID), createdAt, updatedAt` | `store-schema.prisma:170-202` |
| S3 | `InventoryBalance` | `id, partId, warehouseId, quantity, reserved, lowStockThreshold, ...` (per-warehouse) | `store-schema.prisma:469-492` |
| S4 | `StockMovement` | `id, partId, type (RECEIVE\|SALE\|RETURN\|TRANSFER\|ADJUSTMENT\|DAMAGE), quantity, balanceAfter, reason?, reference?, createdBy?, warehouseId?, createdAt` | `store-schema.prisma:416-443` |
| S5 | `Warehouse` | `id, name, code, address?, ...` | `store-schema.prisma:444-468` |

### 1.3 Permission matrix (`src/lib/authorization/permissions.ts`)

- Real, existing keys relevant to Store Center (verified present in `PERMISSIONS` array, lines 34-232):
  `admin.dashboard.read`, `listing.read`, `listing.create`, `listing.update`, `listing.publish`, `listing.moderate`, `company.read`, `company.update`, `store.read`, `store.manage`, `inventory.read`, `inventory.manage`, `analytics.read`, `media.upload`, `audit.read`, `ai.execute`.
- SELLER role (lines 240-263) currently grants: `admin.dashboard.read, listing.{read,create,update,publish}, brand.read, category.read, product.read, part.read, machine.read, company.{read,update}, order.read, deal.{read,manage}, review.read, rfq.{read,manage}, offer.{read,update}, auction.read, request.read, dispute.read, inspection.read, transport.read, media.upload, analytics.read, price.read`.
- **NEW keys required by ADR-005 §7 — NONE of these exist on baseline** (verified: `grep` of permissions.ts for `store.profile`, `store.crm`, `showroom`, `passport`, `store.reports`, `store.analytics` returns 0 matches):
  - `store.profile.read`, `store.profile.manage` — NEW — PR-SC-04
  - `showroom.read`, `showroom.manage`, `showroom.admin` — NEW — PR-SC-02 (seed) + PR-SC-08 (enforce)
  - `passport.read`, `passport.manage` — NEW — PR-SC-03 (seed) + PR-SC-07 (enforce)
  - `store.crm.read`, `store.crm.manage` — NEW — PR-SC-06
  - `store.reports.read`, `store.analytics.read` — NEW — PR-SC-09
- The seller-facing routes today (`/seller/dashboard`, `/seller/leads`) use **ownership scoping** (filter `Listing.sellerId = user.id`) and do NOT call `requirePermission`. The admin-facing routes (`/admin/store/*`) use `requirePermission(user.id, 'store.read')` via `admin-guard.ts` / `requirePermission`. Both patterns coexist; this design keeps both.

### 1.4 Routes verified on baseline

- `/seller` — hub page (server component, public, no auth gate). File: `src/app/seller/page.tsx` (70 lines).
- `/seller/dashboard` — server component, `getCurrentUser()` → redirect on miss; queries `db.listing.findMany({ where: { sellerId: user.id } })`. **No RBAC permission check.** File: `src/app/seller/dashboard/page.tsx` (305 lines).
- `/seller/leads` — client component, calls `GET /api/ai-sales-agent`. **No RBAC permission check.** File: `src/app/seller/leads/page.tsx` (155 lines).
- `/admin/store/inventory` — server component, `requirePermission(user.id, 'store.read')`, queries `storeDb.stockMovement.findMany`. File: `src/app/admin/store/inventory/page.tsx` (380 lines).
- `/api/seller/leads` — `GET` only; returns leads for current user's listings; comment on line 31: "Note: Lead doesn't have status field, so we skip status filter for now". File: `src/app/api/seller/leads/route.ts` (73 lines).
- `/api/ai-sales-agent` — `GET`, calls ZAI LLM with hardcoded system prompt, returns `{success, stats, classification}`. **Does NOT enforce `ai.execute` permission and does NOT consult AITaskPolicy.** File: `src/app/api/ai-sales-agent/route.ts` (103 lines).
- `/api/ai-seller-assistant` — `GET ?listingId=`, returns listing improvement suggestions (deterministic issues + LLM suggestions). File: `src/app/api/ai-seller-assistant/route.ts` (111 lines).
- `/api/admin/store/stats` — `GET`, requires `store.read`, returns aggregate store KPIs. File: `src/app/api/admin/store/stats/route.ts`.
- `/showroom/[slug]` — **does NOT exist** on baseline. (R6 in reconciliation table.)
- `/seller/identity`, `/seller/reports`, `/seller/showroom`, `/admin/store/passport/[listingId]` — **do NOT exist** on baseline. (R3, R7, R8, R9.)
- No seller layout (`src/app/seller/layout.tsx`) exists — each page renders its own `<Header>` / `<Footer>`.

### 1.5 Cross-DB constraint (ADR-003)

- Main DB and Store DB are separate PostgreSQL databases accessed through two Prisma clients (`db` from `@/lib/db`, `storeDb` from `@/lib/store-db`).
- **Cross-DB transactions are NOT supported.** Any feature that mutates both DBs MUST use the non-transactional compensating-action pattern (write main → write store → on store failure, log + best-effort rollback of main).
- Audit logs for store actions are written to the **MAIN** DB AuditLog table (see `src/lib/admin/audit.ts` header comment). Store-schema AuditLog was removed as dead code.

---

## 2. Cross-Cutting Design Decisions

### 2.1 Authorization model for seller-scoped routes

Existing seller pages use ownership scoping only. ADR-005 §7 mandates canonical RBAC for every new surface. This design adopts the **dual-gate pattern** for every new seller route:

```
1. getCurrentUser() → 401 if null
2. requirePermission(user.id, '<perm.key>') → 403 if missing
3. Ownership scope: only rows where Listing.sellerId = user.id
   OR Listing.companyId = user.companyId (if seller is a company member)
   are visible/mutable
4. Audit every mutation via logAudit()
```

The NEW permission keys are added to the SELLER role in `prisma/seed-rbac.ts` so existing sellers do NOT regress.

### 2.2 Company-scoped vs User-scoped ownership

- A seller may operate as an individual (`User.companyId IS NULL`, listings reference `sellerId = user.id`) or as a company member (`User.companyId` set, listings reference `companyId = user.companyId`).
- Every seller-scoped query in this design uses the predicate:
  ```ts
  const sellerScope = user.companyId
    ? { OR: [{ sellerId: user.id }, { companyId: user.companyId }] }
    : { sellerId: user.id };
  ```
  This is the same pattern the existing `/seller/dashboard` uses implicitly via `sellerId`; we extend it to also cover `companyId`.

### 2.3 AI enforcement contract (ADR-005 §8 — advisory-only)

Every AI surface in this design MUST satisfy ALL of:

| # | Requirement | Enforcement |
|---|---|---|
| A1 | AI returns text/JSON only — NO function calls, NO DB writes | AI Gateway SELLER_ASSISTANT task type returns string content; route handler parses + returns to UI; no `db.*.create/update/delete` in AI path |
| A2 | Every AI response logged to `AIGatewayLog` with cost, latency, tokens, success/error | AI Gateway wrapper writes the row (existing pattern in `/api/ai-gateway/route.ts`) |
| A3 | AITaskPolicy deny-by-default — no policy row → 403 | AI Gateway checks `AITaskPolicy` before invoking LLM |
| A4 | AIBudget enforced — daily + monthly caps | AI Gateway checks `AIBudget` before invoking LLM; returns 429 if exceeded |
| A5 | Each suggestion includes a link to the relevant page (no autonomous navigation) | UI contract: every suggestion object has `{ message, ctaHref, ctaLabel, severity, dismissible }` |
| A6 | User must manually perform the action via the normal authenticated/authorized/audited path | UI: CTA is a `<Link href={ctaHref}>` (no fetch on click) |
| A7 | No PII crosses to the LLM | Input sanitization strips `viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName`, `paymentRef` before LLM call |
| A8 | No other-seller data crosses to the LLM | Seller-scoped query (§2.2) runs BEFORE the LLM input is assembled |

### 2.4 VIP enforcement contract (ADR-005 §2 — server-side, every path)

| Path | Enforcement | Failure response |
|---|---|---|
| `GET /showroom/[slug]` (public) | `Showroom.isActive === true` AND `companyHasActivePremium(companyId) === true` | `notFound()` (404) — DO NOT leak existence |
| `GET /api/showroom/[slug]` (public) | Same as above | `404` JSON |
| `GET /seller/showroom` (management) | `getCurrentUser()` + `user.companyId` set + `companyHasActivePremium(user.companyId) === true` + `requirePermission(user.id, 'showroom.manage')` | `403` Forbidden UI |
| `PATCH /api/seller/showroom` | Same as management page; server re-validates BEFORE write | `403` |
| `POST /api/seller/showroom/feature` (add featured machine) | Server re-validates VIP + ownership of the listing being featured | `403` |
| `POST /api/seller/showroom/publish` (set `isActive=true`) | Server re-validates VIP + `featuredListingIds.length >= 1` | `403` (VIP lapsed) / `409` (empty showroom) |

`companyHasActivePremium(companyId)` resolution (no migration required for MVP):
```ts
// H1 gap: PremiumSubscription is per-USER. MVP resolution:
// "A Company is VIP iff at least one User linked to that Company
//  holds an ACTIVE PremiumSubscription that has not expired."
async function companyHasActivePremium(companyId: string): Promise<boolean> {
  const sub = await db.premiumSubscription.findFirst({
    where: {
      user: { companyId },
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return Boolean(sub);
}
```
This resolution is documented in Reconciliation Row R4 and is a known fragility (depends on the subscribing user remaining in the company). Long-term fix (out of scope): migrate PremiumSubscription to `companyId @unique` or add a CompanySubscription join table — to be proposed in a separate ADR.

### 2.5 Audit contract for every mutation

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Update Company branding | `store.profile.update` | `Company` | `company.id` |
| Update Lead status | `store.lead.status_update` | `Lead` | `lead.id` |
| Verify Passport section | `passport.section.verify` | `MachinePassport` | `passport.id` |
| Update Showroom layout | `showroom.layout.update` | `Showroom` | `showroom.id` |
| Publish Showroom | `showroom.publish` | `Showroom` | `showroom.id` |
| Add featured machine | `showroom.featured.add` | `Showroom` | `showroom.id` |
| Remove featured machine | `showroom.featured.remove` | `Showroom` | `showroom.id` |
| Dismiss AI suggestion | `ai.suggestion.dismiss` | `AdminPreference` | `preference.id` |

All audit writes are best-effort (`logAudit` never throws — see `src/lib/admin/audit.ts:46-75`).

### 2.6 Responsive breakpoints & touch-target contract

- **Mobile**: 375px width baseline. Single-column. Drawer navigation. All interactive elements ≥ 44×44px touch target. Forms stack vertically.
- **Tablet**: 768px. Two-column where appropriate. Sidebar collapses to icon rail.
- **Desktop**: ≥1024px. Three-column where appropriate. Persistent sidebar.
- Every page defines mobile + tablet + desktop layouts in its spec.

### 2.7 Accessibility contract (every page)

- Semantic HTML: `<header>`, `<main>`, `<nav>`, `<section aria-labelledby="...">`, `<table>` with `<thead>/<tbody>`, `<form>` with `<fieldset>/<legend>`.
- ARIA: every interactive icon-only button has `aria-label`; every live region (loading, toasts) has `aria-live="polite"`; every error has `role="alert"`; every modal has `role="dialog" aria-modal="true"` with focus trap.
- Keyboard: Tab order follows visual order; all actions reachable via keyboard; Escape closes modals; Enter/Space activates buttons; Arrow keys navigate tablists.
- `sr-only` class on every visual-only indicator (icons, status dots).
- Color is never the sole status indicator (always paired with icon + text).
- Persian RTL: `dir="rtl"` on `<html>` (already set globally). All layouts mirror correctly.

---

## 3. Page 1 — Seller Dashboard (enhance existing)

### 3.1 Route & navigation
- **Route**: `/seller/dashboard` (existing — enhance). Server component, `dynamic = "force-dynamic"`.
- **Nav entry**: from `/seller` hub "ابزارهای فروشنده" card "تحلیل و آمار" (already links here). Add sidebar nav once `/seller/layout.tsx` exists (NEW — PR-SC-05). Mobile: top hamburger menu; the sidebar collapses to a bottom tab bar (Dashboard / Identity / Leads / Reports).
- **Responsive**: mobile 375px — 2×2 KPI card grid → tablet 768px — 4×1 KPI row + 1×2 panels → desktop ≥1024px — 4×1 KPI row + 2-column panels (Recent Leads | Inventory Alerts).

### 3.2 Roles & permission keys
- SELLER (own dashboard), ADMIN (any seller's dashboard — query param `?sellerId=`).
- Permission keys:
  - `admin.dashboard.read` — EXISTS (`permissions.ts:36`) — already granted to SELLER.
  - `store.reports.read` — NEW — added in PR-SC-09 (used for the AI Business Assistant widget embed on dashboard; if missing, the widget is hidden, not an error).
- Ownership scope: §2.2 predicate.

### 3.3 KPI data sources (all real, no fabrication)

| KPI | Prisma model | Field / aggregation | DB | Migration? |
|---|---|---|---|---|
| Active listings | `Listing` | `count({ where: { ...sellerScope, status: 'PUBLISHED' } })` | MAIN | No |
| New leads (7d) | `Lead` | `count({ where: { listing: sellerScope, createdAt: { gt: now-7d } } })` | MAIN | No (note: no `status` field — "new" defined by recency, not status) |
| Open offers | `ListingOffer` | `count({ where: { listing: sellerScope, status: 'PENDING' } })` | MAIN | No |
| Total views (30d) | `Listing` | `aggregate({ where: { ...sellerScope }, _sum: { viewCount } })` | MAIN | No (note: `viewCount` is lifetime, not 30d — see Reconciliation Row R10) |
| Low-stock parts | `InventoryBalance` (store) | `count({ where: { quantity: { lte: lowStockThreshold } } })` | STORE (cross-DB) | No |
| Open store orders | `Order` (store) | `count({ where: { status: 'PENDING' } })` | STORE (cross-DB) | No (note: `Order.userId` is nullable; for sellers without a Company we cannot scope — show "—" for individual sellers, real count for company members) |
| Conversion rate | derived | `openOffers / activeListings` (display `—` if denominator 0) | derived | No |

**Cross-DB flag**: the dashboard issues 2 parallel `Promise.all` branches — one `db.*` (main) and one `storeDb.*` (store). Store DB queries are best-effort: if Store DB is unreachable, the dashboard still renders main-DB KPIs and shows "—" for store KPIs with a small retry button (NOT a full-page error).

### 3.4 API contract

#### `GET /api/seller/dashboard`  (NEW — PR-SC-05)
- **Auth**: `getCurrentUser()` → 401 if null. Ownership scope applied.
- **Query params**: `?range=7d|30d|90d` (default 30d). `?sellerId=<id>` (ADMIN only — 403 for SELLER role).
- **Response 200**:
  ```json
  {
    "success": true,
    "range": "30d",
    "kpis": {
      "activeListings": 12,
      "newLeads": 5,
      "openOffers": 3,
      "totalViews": 1234,
      "lowStockParts": 7,
      "openStoreOrders": 2,
      "conversionRate": 0.25
    },
    "recentLeads": [ { "id": "...", "leadType": "CONTACT", "listingTitle": "...", "createdAt": "ISO" } ],
    "inventoryAlerts": [ { "partId": "...", "name": "...", "sku": "...", "warehouse": "...", "quantity": 0, "threshold": 5 } ],
    "storeDbReachable": true
  }
  ```
- **Error codes**:
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER passing `?sellerId=` for another seller, or non-SELLER non-ADMIN user.
  - `500 Internal Server Error` — main DB query failure (store DB failure does NOT 500; sets `storeDbReachable: false`).
- **Rate limit**: 60 req/min per user (standard seller API limit).

### 3.5 States

| State | Mobile (375px) | Desktop (≥1024px) |
|---|---|---|
| **Loading** | Full-page skeleton: 4 KPI card skeletons (gray pulse, 96×120 each) + 2 panel skeletons. `<div role="status" aria-live="polite">در حال بارگذاری…</div>` | Same layout, wider. |
| **Empty (new seller, 0 listings)** | Onboarding CTA card: "هنوز آگهی ثبت نکرده‌اید." + primary button "ثبت اولین آگهی" (`/listings/new`). Secondary: "تکمیل هویت فروشگاه" (`/seller/identity`). | Same, centered in a 640px card. |
| **Error (main DB)** | Full-page error card: "بارگذاری داشبورد ناموفق بود." + retry button (re-fetch). `role="alert"`. | Same. |
| **Error (store DB only)** | Main KPIs render; store KPI cards show "—" with small inline "تلاش مجدد" button. | Same. |
| **Success** | All KPIs render with real numbers; "—" for any unavailable. | Same + Recent Leads / Inventory Alerts panels. |
| **Access-denied (403)** | Centered card: "دسترسی ندارید." + link to `/seller` hub. | Same. |

### 3.6 Mobile behavior & accessibility
- KPI grid: `grid grid-cols-2 gap-3 sm:grid-cols-4` — 2 per row on mobile, 4 on tablet/desktop.
- Each KPI card is a `<section aria-labelledby="kpi-{key}-title">` with `<h3 id="kpi-{key}-title">` and the value as `<p aria-describedby="kpi-{key}-title">`.
- Recent Leads panel: each row is `<li>` inside `<ul>`; each is a `<Link>` with `aria-label="سرنخ برای {listingTitle}، نوع {leadType}"`.
- Inventory Alerts panel: each alert is `<li role="listitem">` with `aria-label` that includes the SKU and "موجودی کم".
- Retry button: `min-h-[44px] min-w-[44px]`, `aria-label="تلاش مجدد"`.
- Loading skeleton has `aria-busy="true"` on the `<main>`.

### 3.7 Acceptance test & Definition of Done

**Acceptance test (Playwright E2E)**:
1. Login as SELLER with 0 listings → assert onboarding CTA visible with `/listings/new` link.
2. Login as SELLER with 3 PUBLISHED listings + 2 PENDING offers + 5 leads in last 7d → assert KPI cards show `3 / 2 / 5`.
3. Login as BUYER → assert 403 card with link to `/seller`.
4. Stop Store DB (mock) → reload dashboard → assert main KPIs still render, store KPIs show `—`, `storeDbReachable: false`.
5. Keyboard-only: Tab from URL bar → first interactive element is the "ثبت آگهی" button; Tab through all KPIs; Enter on a Recent Lead row navigates to `/seller/leads`.

**Definition of Done**:
- [ ] `GET /api/seller/dashboard` returns real counts (no fabricated numbers; `—` when count is 0 and the KPI is rate-based).
- [ ] Dashboard renders under 800ms TTFB on staging with 100 listings + 50 leads + 20 store orders.
- [ ] Store DB outage does NOT break the page (`storeDbReachable: false` path tested).
- [ ] All KPI cards have semantic labels and ARIA.
- [ ] Lighthouse Mobile a11y score ≥ 95.
- [ ] Audit log entry `store.dashboard.view` written best-effort (count once per page load, not per KPI).
- [ ] No PII (viewerPhone, buyerPhone) in the dashboard response payload.

---

## 4. Page 2 — Store Identity & Branding (NEW)

### 4.1 Route & navigation
- **Route**: `/seller/identity` (NEW — PR-SC-04). Server component shell + client form.
- **Nav entry**: from `/seller` hub "ابزارهای فروشنده" card "تنظیمات فروشنده" (currently `href="#"` — change to `/seller/identity`). Sidebar nav entry "هویت فروشگاه".
- **Responsive**: mobile 375px — single-column form (logo preview 96×96 stacked above form fields, all fields full-width). Tablet 768px — 2-column form (logo + brand color side-by-side, description full-width). Desktop ≥1024px — 2-column with live preview pane on the right (sticky, shows the showroom banner mockup with the chosen brandColor).

### 4.2 Roles & permission keys
- SELLER (own company), ADMIN (any company — query param `?companyId=`).
- Permission keys:
  - `store.profile.read` — NEW — added in PR-SC-04 (assigned to SELLER, MODERATOR, ADMIN).
  - `store.profile.manage` — NEW — added in PR-SC-04 (assigned to SELLER for own company, ADMIN for any).
  - `company.update` — EXISTS (`permissions.ts:59`) — already granted to SELLER (used as fallback if `store.profile.manage` not yet seeded).
- Ownership scope: SELLER can only edit the Company referenced by `user.companyId`. If `user.companyId IS NULL`, the page shows an onboarding CTA: "برای مدیریت هویت فروشگاه، ابتدا یک شرکت ثبت کنید" + link to `/seller/identity/create` (out of scope for this PR — flag in reconciliation).

### 4.3 KPI / data sources

The page is a form, not a KPI page. Data source: `Company` row for `user.companyId`.

| Form field | Prisma field | DB | Migration? | Notes |
|---|---|---|---|---|
| Store name | `Company.name` | MAIN | No | Existing |
| Description (general) | `Company.description` | MAIN | No | Existing |
| **Store description (long)** | `Company.storeDescription` | MAIN | **YES — NEW field, PR-SC-01** | Distinct from `description` (allows a longer showroom-only description; UX wants both) |
| Logo | `Company.logoUrl` | MAIN | No | Existing (B1 critic finding: ADR-005 §1 lists `logoUrl` as NEW but it already exists) |
| Banner | `Company.coverImage` | MAIN | No | Existing — **reuse `coverImage` for banner; do NOT add `bannerUrl`** (reconciliation R2) |
| **Brand color** | `Company.brandColor` | MAIN | **YES — NEW field, PR-SC-01** | Hex color `#RRGGBB`, validated |
| Phone | `Company.phone` | MAIN | No | Existing |
| Email | `Company.email` | MAIN | No | Existing |
| Address / City / Province | `Company.address / city / province` | MAIN | No | Existing |
| Website | `Company.website` | MAIN | No | Existing |
| Store slug (showroom URL) | **Reuse `Company.slug`** (existing `@unique`) for `/showroom/[slug]` | MAIN | No — **DO NOT add `storeSlug`** (reconciliation R1) | Avoids duplicate URL namespace; `slug` is already URL-safe and unique |
| Meta title / description (SEO) | `Company.metaTitle / metaDescription` | MAIN | No | Existing |

**Net new fields**: 2 (`brandColor: String?`, `storeDescription: String?`). Both additive, null defaults. No `bannerUrl`, no `storeSlug`. This is a deviation from ADR-005 §1 — see Reconciliation Rows R1, R2.

### 4.4 API contract

#### `GET /api/seller/identity`  (NEW — PR-SC-04)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.profile.read')` → 403.
- **Response 200**:
  ```json
  {
    "success": true,
    "company": {
      "id": "...", "name": "...", "description": "...", "storeDescription": "...",
      "logoUrl": "...", "coverImage": "...", "brandColor": "#F58220",
      "phone": "...", "email": "...", "address": "...", "city": "...", "province": "...",
      "website": "...", "slug": "...", "metaTitle": "...", "metaDescription": "...",
      "verified": false, "premium": false, "viewCount": 0
    },
    "completion": { "percent": 60, "missing": ["brandColor", "storeDescription"] }
  }
  ```
- **404** if `user.companyId IS NULL`.

#### `PATCH /api/seller/identity`  (NEW — PR-SC-04)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.profile.manage')` → 403. Ownership check: `Company.id === user.companyId` (ADMIN bypass via `company.update`).
- **Request body** (all optional, partial update):
  ```json
  {
    "name": "...", "description": "...", "storeDescription": "...",
    "logoUrl": "...", "coverImage": "...", "brandColor": "#F58220",
    "phone": "...", "email": "...", "address": "...",
    "city": "...", "province": "...", "website": "...",
    "metaTitle": "...", "metaDescription": "..."
  }
  ```
- **Validation**:
  - `brandColor`: regex `^#[0-9A-Fa-f]{6}$` → 400 if invalid.
  - `email`: email format → 400 if invalid.
  - `website`: URL format → 400 if invalid.
  - `logoUrl`, `coverImage`: must be a relative path under `/uploads/` or a URL on the CDN allowlist → 400 otherwise.
  - `storeDescription`: max 2000 chars → 400.
  - `name`: 3..100 chars, required → 400.
- **Response 200**: same as GET.
- **Error codes**: `400` (validation), `401`, `403`, `404` (no company), `409` (slug collision — only if slug editable, which it is NOT in MVP), `500`.
- **Audit**: `logAudit({ action: 'store.profile.update', entityType: 'Company', entityId, before, after })`.

### 4.5 States

| State | Mobile | Desktop |
|---|---|---|
| **Loading** | Form skeleton (12 field skeletons). `aria-busy="true"`. | Form skeleton + preview pane skeleton. |
| **Empty (no company)** | Card: "شرکتی ثبت نشده." + link to `/seller/identity/create` (TODO). | Same. |
| **Empty (new company, no branding)** | Form with all fields empty, completion 0%, onboarding hint: "تکمیل هویت فروشگاه باعث اعتماد خریداران می‌شود." | Same + preview pane shows default HEAVIX orange + placeholder logo. |
| **Error (load)** | "بارگذاری هویت ناموفق بود." + retry. | Same. |
| **Error (save, validation)** | Inline field errors with `role="alert"` per field; form scroll to first error. | Same + field highlights. |
| **Error (save, 500)** | Toast: "ذخیره ناموفق بود." + form retains user input. | Same. |
| **Success (save)** | Toast: "تغییرات ذخیره شد." + completion percent updates. | Same + preview pane animates to new brandColor. |
| **Access-denied** | 403 card. | Same. |

### 4.6 Mobile behavior & accessibility
- Form uses `<form>` with `<fieldset>` per group (Basic / Branding / Contact / SEO).
- Each input has `<label htmlFor>` + `aria-describedby` pointing to help text + `aria-invalid="true"` when validation fails.
- Logo upload: `<input type="file" accept="image/*">` with `aria-label="آپلود لوگو"`; preview `<img alt="پیش‌نمایش لوگو">` updates on change.
- Brand color: `<input type="color">` + read-only `<input type="text" pattern="^#[0-9A-Fa-f]{6}$">` showing the hex; both labeled.
- Save button: `min-h-[44px]`, full-width on mobile, auto-width on desktop.
- Preview pane (desktop): `<aside aria-label="پیش‌نمایش فروشگاه">` with a mock banner; updates live as user edits (debounced 200ms).
- Keyboard: Tab through fields in visual order; Ctrl+Enter submits; Escape on a focused field reverts that field to last-saved value.

### 4.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Login as SELLER with `companyId` → navigate to `/seller/identity` → assert form pre-filled with current Company data.
2. Edit `brandColor` to `#FF0000` → click Save → assert 200, assert DB row updated, assert audit log entry `store.profile.update` written with `before/after` JSON.
3. Submit invalid `brandColor: "red"` → assert 400 with field-level error.
4. Login as SELLER A → attempt `PATCH` with body containing `id: companyB.id` → assert 403 (ownership check).
5. Login as BUYER (no `store.profile.read`) → assert 403.
6. Mobile 375px: form renders single-column, no horizontal scroll, all touch targets ≥ 44px.

**DoD**:
- [ ] `Company.brandColor` and `Company.storeDescription` migrations applied (PR-SC-01 dependency).
- [ ] `store.profile.read` + `store.profile.manage` in `PERMISSIONS` array and `seed-rbac.ts` (PR-SC-04).
- [ ] GET returns only the seller's own company (ownership enforced server-side).
- [ ] PATCH writes audit log with before/after diff.
- [ ] Logo upload path is the existing `/api/media/upload` (no new upload route).
- [ ] No PII leaks in error messages.
- [ ] Lighthouse Mobile a11y ≥ 95.

---

## 5. Page 3 — Inventory & Catalog (enhance existing)

### 5.1 Route & navigation
- **Route**: `/admin/store/inventory` (existing — enhance). Server component, `dynamic = "force-dynamic"`.
- **Nav entry**: existing admin sidebar under "فروشگاه" → "موجودی انبار". The Store Center sidebar (NEW) links here for sellers too.
- **Responsive**: mobile 375px — single-column list of part cards (name, SKU, stock badge, score). Tablet 768px — 2-column card grid + filter bar. Desktop ≥1024px — current table view (enhanced with Smart Inventory Score column + low-stock filter).

### 5.2 Roles & permission keys
- SELLER (own store's inventory — only if linked to a Company that owns store parts), ADMIN (all), MODERATOR (read-only).
- Permission keys:
  - `store.read` — EXISTS (`permissions.ts:114`) — page read gate.
  - `inventory.read` — EXISTS (`permissions.ts:118`) — used for the movement ledger.
  - `inventory.manage` — EXISTS (`permissions.ts:119`) — for stock adjustments.
  - `part.read`, `part.update` — EXIST (`permissions.ts:189,190`) — for part detail edits.
  - `store.export` — NEW — PR-SC-03 (currently no canonical export permission; reuse `inventory.read` for MVP, add `store.export` later).

### 5.3 KPI / data sources

| KPI | Prisma model | Field / aggregation | DB | Migration? |
|---|---|---|---|---|
| Total parts | `Part` | `count()` | STORE | No |
| Active parts | `Part` | `count({ where: { active: true } })` | STORE | No |
| Low-stock parts | `InventoryBalance` | `count({ where: { quantity: { lte: lowStockThreshold } } })` | STORE | No |
| Out-of-stock parts | `Part` | `count({ where: { stock: 0 } })` | STORE | No |
| Avg Smart Inventory Score | `Part` | `aggregate({ _avg: { inventoryScore } })` | STORE | **YES — `Part.inventoryScore Int?` NEW field, PR-SC-03** |
| Stale parts (>90d no movement) | `StockMovement` | `count({ where: { part: ..., createdAt: { lt: now-90d } } })` — derived | STORE | No |
| Inventory value (USD) | `Part` | `aggregate({ _sum: { priceUsd * stock } })` — derived (Prisma cannot multiply in aggregate; compute in JS after fetch) | STORE | No |

**Cross-DB flag**: this page is entirely STORE DB. There is no main-DB query. No cross-DB transaction concern.

**Smart Inventory Score (deterministic, v1 — ADR-005 §5)**:
```
Score = has_partNumber(15) + has_oemNumber(10) + has_images(20)
      + has_documents(15) + has_specifications(15)
      + stock_accuracy(10) + recent_movement(15)
```
- **Migration concern**: `Part` currently has NO `partNumber`, NO `oemNumber`, NO `documents`, NO `specifications` fields (verified — `store-schema.prisma:123-165`). The v1 algorithm as written CANNOT be computed from the existing schema. **Reconciliation Row R7**: the algorithm must either (a) be reduced to fields that exist (`images` JSON, `compatibleCars` JSON, `stock` vs `lowStockThreshold`, `views`, `soldCount`, `updatedAt`), or (b) Part must be extended with `partNumber?`, `oemNumber?`, `documentsJson?`, `specificationsJson?` in PR-SC-03.
- **MVP v1-reduced algorithm (recommendation)**:
  ```
  Score = has_images(20) + image_count_3plus(10)
        + has_compatibleCars(15) + has_carModels(10)
        + stock_above_threshold(15) + stock_accuracy(10)
        + recent_movement_30d(10) + has_description_50chars(10)
  ```
  Computed entirely from existing Part fields + last StockMovement. Stored as `Part.inventoryScore Int?` (NEW — PR-SC-03). Versioned via `Part.inventoryScoreVersion String?` (NEW — PR-SC-03).
- Recalculation triggers: Part update, StockMovement create, image upload.

### 5.4 API contract

The existing `/api/admin/store/inventory` route (GET list, POST create movement) is reused. Enhancements:

#### `GET /api/admin/store/inventory` (enhance — PR-SC-03)
- **Existing**: returns stock movements. **Add**: `?view=parts` query param switches to a parts-centric view (one row per Part with its current stock, score, last movement).
- **New query params**: `?view=parts|movements` (default `movements` for backward compat). `?lowStock=true` filters to parts with `stock <= lowStockThreshold`. `?minScore=0&maxScore=100` filters by score.
- **Response 200 (view=parts)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "partId": "...", "name": "...", "nameFa": "...", "sku": "...",
        "stock": 12, "lowStockThreshold": 5,
        "inventoryScore": 75, "inventoryScoreVersion": "v1-reduced",
        "lastMovementAt": "ISO", "lastMovementType": "RECEIVE",
        "warehouses": [ { "warehouseId": "...", "name": "...", "quantity": 12 } ]
      }
    ],
    "kpis": { "total": 100, "lowStock": 7, "avgScore": 72, "staleCount": 3 }
  }
  ```

#### `POST /api/admin/store/inventory` (existing — no change)
- Creates a StockMovement. Existing contract.

#### `GET /api/admin/store/inventory/low-stock` (existing — no change)
- Returns top N low-stock items. Existing contract.

#### `POST /api/admin/store/inventory/recalculate-score`  (NEW — PR-SC-03)
- **Auth**: `inventory.manage`.
- **Body**: `{ partId?: string }` (omit to recalc all — capped at 1000 per call).
- **Response 200**: `{ success: true, recalculated: 150, skipped: 0 }`.
- **Side effect**: updates `Part.inventoryScore` + `inventoryScoreVersion`. Audit: `inventory.score.recalculate`.

### 5.5 States

| State | Mobile | Desktop |
|---|---|---|
| **Loading** | List skeleton (8 card skeletons). | Table skeleton (12 row skeletons). |
| **Empty (no parts)** | Card: "هیچ قطعه‌ای ثبت نشده." + button "افزودن قطعه" (`/admin/store/parts/new`). | Same. |
| **Empty (no movements, view=movements)** | Card: "هیچ حرکت انباری ثبت نشده." | Same. |
| **Error** | "بارگذاری انبار ناموفق بود." + retry. | Same. |
| **Success** | Card list with stock badge + score chip. | Table with all columns + low-stock filter chip. |
| **Access-denied** | 403 card (rare — only if Store DB user lacks `store.read`). | Same. |

### 5.6 Mobile behavior & accessibility
- Mobile card layout: each card is `<article aria-label="قطعه {name}">` with:
  - `<h3>{name}</h3>` (or `nameFa` if present)
  - SKU as `<p class="font-mono">`
  - Stock badge: `<span class="badge" aria-label="موجودی {stock}، آستانه {threshold}">{stock}</span>` — red if `stock <= threshold`, green otherwise.
  - Score chip: `<span class="chip" aria-label="امتیاز موجودی {score} از 100">{score}</span>` — color-coded (≥70 green, 40-69 amber, <40 red).
- Filter bar: `<form>` with `<fieldset><legend>فیلترها</legend>`; each filter is a labeled control; submit button ≥ 44px.
- Sortable columns: `<th aria-sort="ascending|descending|none">` with `<button>` inside (not `<th>` itself) for keyboard access.
- Export button: `aria-label="خروجی CSV"`, opens a confirmation modal (`role="dialog"`) before triggering download.

### 5.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Seed 5 parts (3 with stock > threshold, 2 low-stock). Navigate to `/admin/store/inventory?view=parts` → assert 5 rows, KPI `lowStock: 2`.
2. Click "محاسبه مجدد امتیاز" → assert `recalculated: 5`, scores populated.
3. Filter `?lowStock=true` → assert 2 rows.
4. Mobile 375px: cards render, no horizontal scroll, all touch targets ≥ 44px.
5. Keyboard: Tab to filter `select`, change with arrow keys, Enter submits.

**DoD**:
- [ ] `Part.inventoryScore` + `Part.inventoryScoreVersion` migrations applied (PR-SC-03).
- [ ] Smart Inventory Score v1-reduced algorithm documented in `src/lib/store/inventory-score.ts` with unit tests.
- [ ] Backfill script `scripts/calculate-inventory-score.ts` runs without error on staging (capped at 1000/batch).
- [ ] `?view=parts` endpoint returns real scores (no fabrication).
- [ ] Low-stock alert banner reuses existing `/api/admin/store/inventory/low-stock` route.
- [ ] Lighthouse Mobile a11y ≥ 95.

---

## 6. Page 4 — Leads & CRM (enhance existing)

### 6.1 Route & navigation
- **Route**: `/seller/leads` (existing — enhance). The existing page is a client component calling `/api/ai-sales-agent`. **Refactor** to a server-component shell + client islands; replace the AI call with a deterministic CRM view + an opt-in "Lead Intelligence explanation" AI surface.
- **Nav entry**: from `/seller` hub; sidebar entry "سرنخ‌ها و CRM".
- **Responsive**: mobile 375px — single-column lead list with filter chips (NEW/CONTACTED/QUALIFIED/CLOSED). Tablet 768px — 2-column (lead list | lead detail drawer). Desktop ≥1024px — 4-column Kanban pipeline (NEW | CONTACTED | QUALIFIED | CLOSED) + Lead Intelligence panel on the right.

### 6.2 Roles & permission keys
- SELLER (own leads), ADMIN (all), SUPPORT (read-only).
- Permission keys:
  - `store.crm.read` — NEW — PR-SC-06 (assigned to SELLER, SUPPORT, ADMIN).
  - `store.crm.manage` — NEW — PR-SC-06 (assigned to SELLER for own leads, ADMIN).
  - `deal.read`, `deal.manage` — EXISTING — already granted to SELLER (used for offer/lead accept/reject flows).

### 6.3 KPI / data sources

| KPI | Prisma model | Field / aggregation | DB | Migration? |
|---|---|---|---|---|
| Total leads | `Lead` | `count({ where: { listing: sellerScope } })` | MAIN | No |
| Leads by status | `Lead` | `groupBy({ by: ['status'], _count })` | MAIN | **YES — `Lead.status` NEW field, PR-SC-01/06** |
| New leads (7d) | `Lead` | `count({ where: { listing: sellerScope, status: 'NEW', createdAt: { gt: now-7d } } })` | MAIN | YES (status) |
| Pending offers | `ListingOffer` | `count({ where: { listing: sellerScope, status: 'PENDING' } })` | MAIN | No |
| Conversion rate | derived | `closedLeads / totalLeads` | derived | YES (status) |
| Avg response time | derived | `avg(Lead.firstRespondedAt - Lead.createdAt)` | MAIN | **YES — `Lead.firstRespondedAt` NEW field, PR-SC-06** (optional; if not added, hide this KPI) |
| Lead Intelligence (Hot/Warm/Cold) | derived | deterministic from Lead + ListingOffer counts | derived | No (algorithm only) |

**Lead Intelligence (deterministic — ADR-005 §8 compliant because it is NOT an LLM call)**:
- **Hot**: ≥3 leads from same `viewerPhone` OR `status = QUALIFIED`.
- **Warm**: 1-2 leads, last lead ≤7 days.
- **Cold**: last lead ≥14 days.
- Computed in JS, not via LLM. Displayed as a chip per lead.

**Migration required** (BLOCKER for the Kanban view): `Lead.status String @default("NEW")` — values `NEW | CONTACTED | QUALIFIED | CLOSED | LOST`. Backfill: all existing leads → `status = NEW`. Also optionally `Lead.sellerId String?` (H2 critic finding — current design uses `listing.sellerId` join; `Lead.sellerId` would let us have listing-unattached leads, out of MVP scope). Also optionally `Lead.firstRespondedAt DateTime?` for response-time KPI.

### 6.4 API contract

#### `GET /api/seller/leads` (enhance — PR-SC-06)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.read')` → 403.
- **Query params**: `?status=NEW|CONTACTED|QUALIFIED|CLOSED|LOST` (filter), `?intelligence=hot|warm|cold` (filter), `?page=1&limit=50`.
- **Response 200** (enhanced from current shape):
  ```json
  {
    "success": true,
    "kpis": {
      "total": 45, "byStatus": { "NEW": 5, "CONTACTED": 3, "QUALIFIED": 1, "CLOSED": 2, "LOST": 0 },
      "pendingOffers": 3, "conversionRate": 0.04
    },
    "data": [
      {
        "id": "...", "listingId": "...", "leadType": "CONTACT",
        "viewerName": "...", "viewerPhone": "...", "note": "...",
        "status": "NEW", "intelligence": "hot", "intelligenceReason": "3 سرنخ از این شماره",
        "leadCount": 3, "firstLeadAt": "ISO", "lastLeadAt": "ISO",
        "createdAt": "ISO",
        "listing": { "id": "...", "title": "...", "slug": "..." }
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 45, "totalPages": 1 }
  }
  ```
- **PII note**: `viewerPhone` and `viewerName` are returned to the seller (they own the listing → entitled). NOT sent to any LLM (§2.3 A7).

#### `PATCH /api/seller/leads/[id]`  (NEW — PR-SC-06)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.manage')` → 403. Ownership: `Lead.listing.sellerId === user.id` OR `Lead.listing.companyId === user.companyId` (else 403).
- **Body**: `{ status?: "NEW"|"CONTACTED"|"QUALIFIED"|"CLOSED"|"LOST", note?: string }`.
- **Validation**: `status` must be one of the 5 enum values → 400. `note` max 1000 chars → 400.
- **Response 200**: the updated lead.
- **Error codes**: `400` (invalid status), `401`, `403` (not owner), `404` (lead not found), `500`.
- **Audit**: `logAudit({ action: 'store.lead.status_update', entityType: 'Lead', entityId, before: { status }, after: { status } })`.

#### `POST /api/seller/leads/[id]/intelligence-explain`  (NEW — PR-SC-06, AI route)
- See §10.2 for the AI capability spec.
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.read')` → 403. Ownership check on lead.
- **Body**: `{ leadId: string }`.
- **Response 200**: `{ success: true, explanation: "متن توضیح فارسی", factors: [{ label, value, weight }] }`.
- **Error codes**: `400`, `401`, `403`, `404`, `429` (AI budget exceeded), `500`.

### 6.5 States

| State | Mobile | Desktop |
|---|---|---|
| **Loading** | List skeleton (8 row skeletons). | Kanban column skeletons (4 columns × 3 card skeletons each). |
| **Empty (no leads ever)** | Card: "هنوز سرنخی دریافت نکرده‌اید." + hint: "آگهی‌های خود را منتشر کنید تا سرنخ دریافت کنید." + link to `/listings/new`. | Same. |
| **Empty (filter returns 0)** | "هیچ سرنخی با این فیلتر یافت نشد." + "پاک کردن فیلتر" button. | Same. |
| **Error** | "بارگذاری سرنخ‌ها ناموفق بود." + retry. | Same. |
| **Success** | Lead list with status chips + intelligence chips. | Kanban with drag-and-drop between columns (desktop only; mobile uses a `<select>` to change status). |
| **Access-denied** | 403 card. | Same. |

### 6.6 Mobile behavior & accessibility
- Mobile: no drag-and-drop (touch DnD is fragile). Each lead card has a `<select aria-label="تغییر وضعیت سرنخ">` to move between statuses. On change, fires `PATCH /api/seller/leads/[id]`.
- Kanban columns (desktop): `<section aria-labelledby="col-NEW-title">` with `<h2 id="col-NEW-title">جدید (۵)</h2>`. Each card is `<article draggable="true" aria-grabbed="false" tabindex="0">` with `aria-label="سرنخ {viewerName} برای {listingTitle}"`.
- Keyboard DnD: Space to grab, Arrow keys to move between columns, Space to drop. `aria-roledescription="قابل کشیدن"`.
- Intelligence chip: `<span class="chip" aria-label="اولویت بالا: 3 سرنخ از این شماره">🔴 بالا</span>` — color + text + icon (never color alone).
- Lead detail drawer (tablet+): `<aside role="complementary" aria-label="جزئیات سرنخ">` with focus trap when open; Escape closes.
- "Explain with AI" button: `aria-label="توضیح هوش مصنوعی برای اولویت این سرنخ"`; on click, shows loading spinner with `aria-live="polite"`; result renders in a `<section>` below.

### 6.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Seed 5 leads across 3 statuses. Login as SELLER → navigate to `/seller/leads` → assert Kanban shows correct counts per column.
2. Drag a lead from NEW to CONTACTED (desktop) → assert PATCH fires, audit log written, column counts update.
3. Mobile 375px: use `<select>` to change status → same assertions.
4. Login as SELLER B → attempt `PATCH /api/seller/leads/{sellerA_lead_id}` → assert 403.
5. Click "Explain with AI" on a Hot lead → assert 200, explanation in Persian, no PII in network response (verify `viewerPhone` not in request body to LLM — check server logs).
6. AI budget exhausted → click "Explain with AI" → assert 429 with friendly message.

**DoD**:
- [ ] `Lead.status` migration applied (PR-SC-01 dependency — BLOCKER).
- [ ] Backfill script sets all existing leads to `status = NEW`.
- [ ] `store.crm.read` + `store.crm.manage` in permissions + seed (PR-SC-06).
- [ ] Lead Intelligence algorithm unit-tested (Hot/Warm/Cold edge cases).
- [ ] PATCH endpoint ownership-enforced (Seller A cannot move Seller B's lead).
- [ ] No PII sent to LLM (input sanitization tested with a fixture containing `viewerPhone`).
- [ ] Mobile `<select>` status change works without JS errors.
- [ ] Lighthouse Mobile a11y ≥ 95.

---

## 7. Page 5 — Machine Passport (NEW)

### 7.1 Route & navigation
- **Route**: `/admin/store/passport/[listingId]` (NEW — PR-SC-07). Server component.
  - **Note**: this lives under `/admin/store/` because the existing inventory/passport domain is admin-scoped. A seller-facing mirror at `/seller/passport/[listingId]` is a future enhancement (out of MVP scope — flag in reconciliation R8).
- **Nav entry**: from Listing detail page "مشاهده پاسپورت ماشین" link (NEW — only visible if `listing.sellerId === user.id` OR ADMIN). Sidebar entry under "فروشگاه" → "پاسپورت ماشین" (lists all passports the user can see).
- **Responsive**: mobile 375px — single-column: photo → specs → verification sections (stacked). Tablet 768px — 2-column (photo+specs | verification). Desktop ≥1024px — current UX prototype layout (photo+specs left, verification+score+CTA right).

### 7.2 Roles & permission keys
- SELLER (own listings' passports), ADMIN (all), MODERATOR (read-only).
- Permission keys:
  - `passport.read` — NEW — PR-SC-03 (seed) + PR-SC-07 (enforce).
  - `passport.manage` — NEW — PR-SC-03 (seed) + PR-SC-07 (enforce) — for verifying sections.
  - `listing.read` — EXISTS — fallback read gate.

### 7.3 KPI / data sources

| Section | Prisma model | Field | DB | Migration? |
|---|---|---|---|---|
| Machine photo | `ListingImage` | `url` where `isPrimary = true` | MAIN | No |
| Specs (brand, model, year, hours) | `Listing` + `Brand` + `ProductModel` | `Listing.brandId/modelId/year/workingHours` | MAIN | No |
| Specifications verification | `MachinePassport` | `specsVerifiedAt?, specsVerifiedBy?` | MAIN | **YES — NEW fields, PR-SC-03** |
| Ownership verification | `MachinePassport` | `ownershipVerifiedAt?, ownershipVerifiedBy?` | MAIN | **YES — NEW fields, PR-SC-03** |
| Inspection current | `Inspection` | `status = COMPLETED, completedAt, score, reportUrl` | MAIN | No |
| Inspection verification | `MachinePassport` | `inspectionVerifiedAt?, inspectionVerifiedBy?` | MAIN | **YES — NEW fields, PR-SC-03** |
| Service history | `PassportEvent` | `where: { eventType: 'SERVICE' }` | MAIN | No |
| Service history verification | `MachinePassport` | `serviceHistoryVerifiedAt?, serviceHistoryVerifiedBy?` | MAIN | **YES — NEW fields, PR-SC-03** |
| Documents (manual, inspection report) | `PassportEvent` (with `eventType = DOCUMENT`) OR `CompanyDocument` | `PassportEvent.description?` (URL) | MAIN | No (use PassportEvent; adding a PassportDocument model is out of MVP) |
| Serial number | `MachinePassport.serialNumber` | existing | MAIN | No |
| Passport Score | derived | `specs(25) + ownership(20) + inspection(25) + service(15) + photos(15)` | derived | No (algorithm only) |

**ADR-005 §6 correction** (Reconciliation Row R5): ADR-005 §6 claims "MachinePassport already exists with `source` and `verification` fields". This is FALSE. The actual `MachinePassport` model (`schema.prisma:1149-1159`) has only `id, listingId, serialNumber, inspectionDate, inspectionResult, events, createdAt, updatedAt`. NO `source`, NO `verification`. The per-section verification fields proposed in ADR-005 §6 are all genuinely NEW and require migration in PR-SC-03.

**Passport Score v1 (deterministic — ADR-005 §6)**:
```
Score = specs_verified(25) + ownership_verified(20)
      + inspection_current(25) + service_history(15) + photos_3plus(15)
```
- `specs_verified`: `MachinePassport.specsVerifiedAt != null` → 25
- `ownership_verified`: `MachinePassport.ownershipVerifiedAt != null` → 20
- `inspection_current`: latest `Inspection.status = COMPLETED` AND `completedAt > now - 365d` → 25
- `service_history`: `count(PassportEvent where eventType=SERVICE) >= 1` → 15
- `photos_3plus`: `count(ListingImage where listingId) >= 3` → 15
- Max 100, displayed as `60/100`.

### 7.4 API contract

#### `GET /api/seller/passport/[listingId]`  (NEW — PR-SC-07)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.read')` → 403. Ownership: `Listing.sellerId === user.id` OR `Listing.companyId === user.companyId` OR ADMIN.
- **Response 200**:
  ```json
  {
    "success": true,
    "listing": { "id": "...", "title": "...", "slug": "...", "year": 2021, "workingHours": 3200,
                 "brand": { "name": "Caterpillar" }, "model": { "name": "320 Excavator" } },
    "passport": {
      "id": "...", "serialNumber": "CAT-320-2021-0042",
      "inspectionDate": "ISO", "inspectionResult": "PASSED",
      "createdAt": "ISO", "updatedAt": "ISO",
      "specsVerifiedAt": "ISO", "specsVerifiedBy": "user-id",
      "ownershipVerifiedAt": null, "ownershipVerifiedBy": null,
      "inspectionVerifiedAt": "ISO", "inspectionVerifiedBy": "user-id",
      "serviceHistoryVerifiedAt": null, "serviceHistoryVerifiedBy": null
    },
    "events": [ { "id": "...", "eventType": "SERVICE", "title": "...", "description": "...", "date": "ISO", "performedBy": "..." } ],
    "inspections": [ { "id": "...", "status": "COMPLETED", "completedAt": "ISO", "score": 85, "reportUrl": "..." } ],
    "images": [ { "id": "...", "url": "...", "isPrimary": true, "alt": "..." } ],
    "score": 60,
    "scoreBreakdown": { "specs": 25, "ownership": 0, "inspection": 25, "service": 0, "photos": 15 }
  }
  ```
- **404** if listing or passport not found.
- **403** if not owner and not ADMIN.

#### `PATCH /api/seller/passport/[listingId]`  (NEW — PR-SC-07)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.manage')` → 403. Ownership.
- **Body**: `{ section: "specs"|"ownership"|"inspection"|"serviceHistory", verified: boolean }`.
- **Behavior**: Sets `MachinePassport.{section}VerifiedAt = now` and `MachinePassport.{section}VerifiedBy = user.id` when `verified: true`; sets both to `null` when `verified: false`. Appends a `PassportEvent` with `eventType: 'VERIFICATION'`, `title: "تأیید بخش {section}"`, `date: now`, `performedBy: user.id`.
- **Response 200**: updated passport (same shape as GET).
- **Error codes**: `400` (invalid section), `401`, `403`, `404`, `500`.
- **Audit**: `logAudit({ action: 'passport.section.verify', entityType: 'MachinePassport', entityId, before, after })`.

#### `POST /api/seller/passport/[listingId]/request-inspection`  (NEW — PR-SC-07)
- **Auth**: `passport.manage` + ownership.
- **Body**: `{ notes?: string }`.
- **Behavior**: creates `Inspection` row with `status: 'REQUESTED'`, `requestedBy: user.id`, `listingId`. Appends `PassportEvent` `eventType: 'INSPECTION_REQUESTED'`.
- **Response 201**: `{ success: true, inspectionId: "..." }`.
- **Audit**: `passport.inspection.request`.

### 7.5 States

| State | Mobile | Desktop |
|---|---|---|
| **Loading** | Single-column skeleton. | 2-column skeleton. |
| **Empty (no passport)** | Card: "پاسپورتی برای این آگهی ثبت نشده." + button "ایجاد پاسپورت" (creates a blank `MachinePassport` row for the listing). | Same. |
| **Partial (some sections unverified)** | Sections render with ✅/⚠️/❌ icons; score shown; CTA "درخواست بازرسی" visible. | Same + score gauge. |
| **Error** | "بارگذاری پاسپورت ناموفق بود." + retry. | Same. |
| **Access-denied** | 403 card. | Same. |
| **Success (verify section)** | Section icon animates ⚠️→✅; score increments; toast "بخش {section} تأیید شد." | Same. |

### 7.6 Mobile behavior & accessibility
- Each verification section is `<section aria-labelledby="section-{key}-title">` with `<h3 id>` and a status badge `<span role="img" aria-label="تأیید شده">✅</span>` / `<span role="img" aria-label="در انتظار">⚠️</span>` / `<span role="img" aria-label="تأیید نشده">❌</span>`.
- Verify button: `<button aria-label="تأیید بخش {section}">` with `aria-pressed="true|false"` reflecting current state.
- Score gauge: `<div role="meter" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" aria-label="امتیاز پاسپورت ۶۰ از ۱۰۰">`.
- Photos: `<ul>` of `<li><img alt="تصویر ماشین {index}">`.
- Documents: `<ul>` of `<li><a href={url} rel="noopener">دانلود {title}</a></li>`.
- "Request Inspection" CTA: full-width on mobile, `min-h-[44px]`; opens a confirmation modal (`role="dialog"`) with a notes textarea.

### 7.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Seed a Listing with no Passport. Navigate to `/admin/store/passport/{listingId}` → assert empty state + "ایجاد پاسپورت" button.
2. Click "ایجاد پاسپورت" → assert `MachinePassport` row created, page re-renders with all sections ❌.
3. Click "تأیید بخش specs" → assert `specsVerifiedAt` set, score += 25, audit log written, PassportEvent appended.
4. Add 3 images to the listing → reload → assert `photos` section ✅, score += 15.
5. Click "درخواست بازرسی" → assert `Inspection` row created with `status: REQUESTED`.
6. Login as SELLER B → attempt `GET /api/seller/passport/{sellerA_listing_id}` → assert 403.
7. Mobile 375px: single-column, all touch targets ≥ 44px, score gauge readable.

**DoD**:
- [ ] `MachinePassport` migration adds 8 fields (4× `verifiedAt` + 4× `verifiedBy`) — PR-SC-03 (BLOCKER).
- [ ] `passport.read` + `passport.manage` in permissions + seed — PR-SC-03/07.
- [ ] Passport Score algorithm unit-tested (`src/lib/passport/score.ts`).
- [ ] PATCH endpoint ownership-enforced.
- [ ] Every verify action writes both `MachinePassport` update + `PassportEvent` append + `AuditLog` (best-effort).
- [ ] "Request Inspection" creates a real `Inspection` row (not a TODO).
- [ ] Lighthouse Mobile a11y ≥ 95.

---

## 8. Page 6 — VIP Virtual Showroom (NEW)

### 8.1 Route & navigation
- **Routes**:
  - `/showroom/[slug]` — public showroom. Server component, statically renderable per active showroom (ISR with revalidate=300s).
  - `/seller/showroom` — management UI. Server component shell + client form.
- **Nav entry**:
  - Public: linked from Listing detail pages where `listing.company.showroom.isActive = true` ("مشاهده نمایشگاه فروشگاه"). SEO-indexable only if `Showroom.isActive AND companyHasActivePremium` (per SEO-ARCHITECTURE.md §8).
  - Management: sidebar entry "نمایشگاه VIP" (only visible to VIP sellers — checked server-side).
- **Responsive**:
  - Public mobile 375px: banner (16:9) → dealer info → trust badges → 1-column machine cards → sales team row (horizontal scroll) → CTAs (sticky bottom bar).
  - Public desktop ≥1024px: banner (full-width) → 4-column machine grid → 3-column sales team → CTAs in header.
  - Management mobile: single-column form (template select, featured machines list, layout toggles).
  - Management desktop: 2-column (form left, live preview right).

### 8.2 Roles & permission keys
- Public (anonymous): `showroom.read` — NEW — PR-SC-02. **Note**: anonymous users do NOT have a permission row; the public route does NOT call `requirePermission`. Instead it checks `Showroom.isActive + companyHasActivePremium` server-side and returns 404 otherwise. The `showroom.read` permission is for authenticated admin oversight only.
- SELLER (VIP, own showroom): `showroom.manage` — NEW — PR-SC-02 + PR-SC-08.
- ADMIN (any showroom): `showroom.admin` — NEW — PR-SC-02 + PR-SC-08.

### 8.3 KPI / data sources

| Field | Prisma model | Field | DB | Migration? |
|---|---|---|---|---|
| Showroom row | `Showroom` | `id, companyId, isActive, template, layout Json, featuredListingIds String[], viewCount, createdAt, updatedAt` | MAIN | **YES — `Showroom` model NEW, PR-SC-02** (BLOCKER) |
| Company branding | `Company` | `name, slug, logoUrl, coverImage, brandColor, storeDescription, verified, premium` | MAIN | `brandColor` + `storeDescription` NEW (PR-SC-01) |
| Featured machines | `Listing` | `where: { id: { in: featuredListingIds }, status: 'PUBLISHED' }` | MAIN | No |
| Machine passport score | derived | §7.3 algorithm | MAIN | No |
| Sales team | `SalesTeamMember` | `id, companyId, userId?, name, role, phone?, email?, photoUrl?, isActive` | MAIN | **YES — `SalesTeamMember` model NEW, PR-SC-02** (BLOCKER for sales team section; showroom ships without it if PR-SC-02 partial) |
| Trust: verified | `Company.verified` | existing | MAIN | No |
| Trust: rating | `Company.avgRating, reviewCount` | existing (denormalized from `Review`) | MAIN | No |
| VIP validity | `PremiumSubscription` | `where: { user: { companyId }, status: 'ACTIVE', expiresAt > now OR null }` | MAIN | No (uses H1 resolution §2.4) |
| Views | `Showroom.viewCount` | increment on each public render (debounced) | MAIN | No |

### 8.4 API contract

#### `GET /showroom/[slug]` (public page)  (NEW — PR-SC-08)
- **No auth**. Server component.
- **Logic**:
  1. `const showroom = await db.showroom.findFirst({ where: { company: { slug: params.slug } }, include: { company: true } })`.
  2. If `!showroom` → `notFound()` (404).
  3. If `!showroom.isActive` → `notFound()` (404 — DO NOT leak existence).
  4. If `!(await companyHasActivePremium(showroom.companyId))` → `notFound()` (404).
  5. Increment `showroom.viewCount` (debounced via upstash/redis or skip on every Nth request — TBD infra).
  6. Render with `<meta name="robots" content="index, follow">` (since active + VIP).
- **Headers**: `X-Robots-Tag: index, follow` on 200; `X-Robots-Tag: noindex, nofollow` on 404.

#### `GET /api/showroom/[slug]` (public JSON)  (NEW — PR-SC-08)
- Same logic as page; returns JSON for client-side fetching.
- **Response 200**:
  ```json
  {
    "success": true,
    "showroom": { "id": "...", "template": "dealer", "layout": {...}, "viewCount": 1234 },
    "company": { "name": "...", "slug": "...", "logoUrl": "...", "coverImage": "...", "brandColor": "#F58220", "storeDescription": "...", "verified": true, "avgRating": 4.5, "reviewCount": 23 },
    "featuredMachines": [ { "id": "...", "title": "...", "price": "...", "slug": "...", "primaryImage": "...", "passportScore": 80 } ],
    "salesTeam": [ { "id": "...", "name": "...", "role": "MANAGER", "photoUrl": "..." } ]
  }
  ```
- **404** if not found / inactive / not VIP.

#### `GET /api/seller/showroom` (management)  (NEW — PR-SC-08)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'showroom.manage')` → 403. **Server re-validates VIP**: `companyHasActivePremium(user.companyId)` → 403 if not VIP.
- **Response 200**: same shape as public, plus `layout` editable config + `isVip: true`.
- **403** if not VIP (with message: "نمایشگاه VIP فقط برای فروشندگان ویژه فعال است.").

#### `PATCH /api/seller/showroom`  (NEW — PR-SC-08)
- **Auth**: same as GET management. **Server re-validates VIP before write** (§2.4).
- **Body**: `{ template?: "dealer"|"manufacturer"|"used_equipment", layout?: object, featuredListingIds?: string[], isActive?: boolean }`.
- **Validation**:
  - `featuredListingIds`: each must be a Listing where `companyId === user.companyId` AND `status = PUBLISHED` → 400 otherwise (cannot feature another seller's machine or a draft).
  - `isActive: true` requires `featuredListingIds.length >= 1` → 409 if empty showroom.
  - `layout`: must match the template's schema (validated server-side) → 400.
- **Response 200**: updated showroom.
- **Error codes**: `400` (validation), `401`, `403` (not VIP or not owner), `409` (empty showroom publish), `500`.
- **Audit**: `logAudit({ action: 'showroom.layout.update', entityType: 'Showroom', entityId, before, after })`.
- **VIP lapsed mid-session**: if the user's PremiumSubscription expired between GET and PATCH, the PATCH returns 403 and the UI shows "اشتراک VIP شما منقضی شده است."

#### `POST /api/seller/showroom/feature`  (NEW — PR-SC-08)
- **Auth**: `showroom.manage` + VIP re-validation + ownership of the listing being featured.
- **Body**: `{ listingId: string }`.
- **Behavior**: appends `listingId` to `featuredListingIds` (max 12 — enforced).
- **Response 200**: updated `featuredListingIds`.
- **409** if already featured or max reached.

#### `DELETE /api/seller/showroom/feature/[listingId]`  (NEW — PR-SC-08)
- Removes from `featuredListingIds`. Audit: `showroom.featured.remove`.

### 8.5 States

| State | Mobile (public) | Desktop (public) |
|---|---|---|
| **Loading** | Banner skeleton + 4 card skeletons. | Same, wider. |
| **404 (inactive/not VIP/not found)** | Standard 404 page (no leak). | Same. |
| **Empty (VIP but no featured machines)** | Banner + dealer info + "نمایشگاه خالی است." (visible to public only if `isActive=true` and at least 1 featured — else 404 per §8.4). | Same. |
| **Error** | Standard 500 page. | Same. |
| **Success** | Full render. | Full render. |

| State | Mobile (management) | Desktop (management) |
|---|---|---|
| **Loading** | Form skeleton. | Form + preview skeleton. |
| **Not VIP (403)** | Card: "اشتراک VIP فعال نیست." + link to `/pricing`. | Same. |
| **Empty (VIP, no showroom row)** | Card: "نمایشگاه شما فعال است اما تنظیم نشده." + button "شروع تنظیم نمایشگاه". | Same. |
| **Error** | "بارگذاری ناموفق بود." + retry. | Same. |
| **Success (save)** | Toast "ذخیره شد." + preview updates. | Same. |
| **VIP lapsed mid-session (PATCH 403)** | Modal: "اشتراک VIP منقضی شده است. تغییرات ذخیره نشد." + link to `/pricing`. | Same. |

### 8.6 Mobile behavior & accessibility
- Public showroom: `<article>` wrapper, `<h1>` = company name, `<h2>` for "ماشین‌های ویژه" and "تیم فروش".
- Machine card: `<a href="/listings/{slug}">` wrapping `<img>`, `<h3>`, price, passport score badge (`<span role="img" aria-label="امتیاز پاسپورت {score} از 100">`).
- Sales team horizontal scroll: `<ul role="list" aria-label="تیم فروش">` with `overflow-x-auto`; each `<li>` is a card.
- Sticky CTA bar (mobile): `<div role="region" aria-label="تماس با فروشگاه">` with two buttons ≥ 44px ("تماس" / "درخواست قیمت").
- Management form: same a11y pattern as §4.6.
- Preview pane: `<aside aria-label="پیش‌نمایش نمایشگاه">` live-updates.
- Featured machines list: drag-to-reorder on desktop (`aria-grabbed`), up/down buttons on mobile (`aria-label="بالا" / "پایین"`).

### 8.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Seed Company A with active PremiumSubscription + Showroom `isActive=true` + 3 featured machines. `GET /showroom/{slug}` → assert 200, all 3 machines rendered, `X-Robots-Tag: index, follow`.
2. Set `Showroom.isActive=false` → `GET /showroom/{slug}` → assert 404, `X-Robots-Tag: noindex`.
3. Expire Company A's PremiumSubscription (`expiresAt = past`) → `GET /showroom/{slug}` → assert 404 (VIP lapsed).
4. Login as SELLER A (VIP) → `PATCH /api/seller/showroom` with `featuredListingIds: [otherCompanyListingId]` → assert 400 (ownership).
5. Login as SELLER B (not VIP) → `GET /api/seller/showroom` → assert 403.
6. Login as SELLER A → `PATCH` with `isActive: true, featuredListingIds: []` → assert 409 (empty showroom).
7. Mid-session: expire SELLER A's subscription → `PATCH` → assert 403 with "اشتراک VIP منقضی شده است."
8. Mobile 375px: public showroom renders, sticky CTA bar visible, no horizontal scroll on machine grid (1-column).

**DoD**:
- [ ] `Showroom` model migration applied (PR-SC-02 — BLOCKER).
- [ ] `SalesTeamMember` model migration applied (PR-SC-02 — BLOCKER for sales team section; showroom can ship without it if section is feature-flagged off).
- [ ] `showroom.read`, `showroom.manage`, `showroom.admin` in permissions + seed (PR-SC-02).
- [ ] `companyHasActivePremium(companyId)` helper in `src/lib/showroom-auth.ts` with unit tests.
- [ ] Public route returns 404 (NOT 403) for inactive/lapsed — security test confirms no existence leak.
- [ ] PATCH re-validates VIP server-side before every write (test: VIP lapsed mid-session → 403).
- [ ] Featured listing ownership enforced server-side.
- [ ] `X-Robots-Tag` header correct on 200 vs 404.
- [ ] Lighthouse Mobile a11y ≥ 95 on public showroom.

---

## 9. Page 7 — Reports & Business Assistant (NEW)

### 9.1 Route & navigation
- **Route**: `/seller/reports` (NEW — PR-SC-09). Server component shell + client islands for the AI assistant.
- **Nav entry**: sidebar entry "گزارش‌ها و دستیار فروش". From dashboard "گزارش کامل" link.
- **Responsive**: mobile 375px — single-column: date range selector → performance card → inventory health card → business assistant card (stacked). Tablet 768px — 2-column (performance | inventory) + assistant full-width below. Desktop ≥1024px — 2-column left (performance + inventory stacked) | 1-column right (assistant, sticky).

### 9.2 Roles & permission keys
- SELLER (own), ADMIN (any), SUPPORT (read-only).
- Permission keys:
  - `store.reports.read` — NEW — PR-SC-09.
  - `store.analytics.read` — NEW — PR-SC-09 (granular; if absent, fall back to `analytics.read` which SELLER already has).
  - `ai.execute` — EXISTS (`permissions.ts:158`) — required for the Business Assistant AI calls.

### 9.3 KPI / data sources

| KPI card | Metric | Prisma model | Field / aggregation | DB | Migration? |
|---|---|---|---|---|---|
| **Performance** | Views (30d) | `Listing` | `aggregate({ where: sellerScope, _sum: viewCount })` — **lifetime, not 30d** (R10) | MAIN | No |
| | Leads (30d) | `Lead` | `count({ where: { listing: sellerScope, createdAt: { gt: now-30d } } })` | MAIN | No |
| | Conversion | derived | `leads / views` (or `offers / views`) | derived | No |
| | Revenue (30d) | `Deal` | `aggregate({ where: { listing: sellerScope, status: 'COMPLETED', createdAt: { gt: now-30d } }, _sum: { amount } })` — **verify `Deal.amount` exists before relying** | MAIN | No (if `Deal.amount` absent, show "—") |
| **Inventory Health** | Avg score | `Part` | `aggregate({ _avg: { inventoryScore } })` | STORE | YES (`Part.inventoryScore` — PR-SC-03) |
| | Low stock | `InventoryBalance` | `count({ where: { quantity: { lte: lowStockThreshold } } })` | STORE | No |
| | Stale (>90d) | `StockMovement` | derived | STORE | No |
| **Business Assistant** | AI suggestions | `AIGatewayLog` | last N SELLER_ASSISTANT calls (cost, latency, success) | MAIN | No |
| | Dismissed suggestions | `AdminPreference.hiddenItems` | JSON array of suggestion IDs | MAIN | No (reuse existing field) |

**Cross-DB flag**: Performance card uses MAIN; Inventory Health uses STORE. Same `Promise.all` + best-effort pattern as §3.3.

### 9.4 API contract

#### `GET /api/seller/reports`  (NEW — PR-SC-09)
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'store.reports.read')` → 403. Ownership scope.
- **Query**: `?range=7d|30d|90d` (default 30d).
- **Response 200**:
  ```json
  {
    "success": true,
    "range": "30d",
    "performance": {
      "views": 1234, "leads": 45, "conversion": 0.036,
      "revenue": 2500000000, "revenueCurrency": "IRR",
      "series": { "views": [...30 points...], "leads": [...30 points...] }
    },
    "inventoryHealth": {
      "avgScore": 72, "lowStock": 7, "stale": 3,
      "storeDbReachable": true
    },
    "lastAssistantRun": { "at": "ISO", "costUsd": 0.012, "success": true }
  }
  ```
- **Error codes**: `401`, `403`, `500`.

#### `POST /api/seller/assistant`  (NEW — PR-SC-09, AI route)
- See §10.1 for the AI capability spec.
- **Auth**: `getCurrentUser()` → 401. `requirePermission(user.id, 'ai.execute')` → 403. Ownership scope.
- **Behavior**: assembles a sanitized data snapshot (NO PII, NO other-seller data — §2.3 A7/A8), calls AI Gateway SELLER_ASSISTANT, returns suggestions.
- **Body**: `{ range?: "7d"|"30d"|"90d" }`.
- **Response 200**:
  ```json
  {
    "success": true,
    "suggestions": [
      {
        "id": "sugg-1",
        "severity": "warning"|"info"|"opportunity",
        "message": "۳ آگهی دارای مشخصات ناقص هستند.",
        "ctaHref": "/listings?filter=incomplete",
        "ctaLabel": "بررسی آگهی‌ها",
        "dismissible": true
      }
    ],
    "costUsd": 0.012,
    "model": "default"
  }
  ```
- **Error codes**: `401`, `403`, `429` (AI budget exceeded — AIBudget daily/monthly cap), `500`.

#### `POST /api/seller/assistant/dismiss`  (NEW — PR-SC-09)
- **Auth**: `getCurrentUser()` → 401.
- **Body**: `{ suggestionId: string }`.
- **Behavior**: appends `suggestionId` to `AdminPreference.hiddenItems` JSON array (upsert the preference row).
- **Response 200**: `{ success: true }`.
- **Audit**: `logAudit({ action: 'ai.suggestion.dismiss', entityType: 'AdminPreference', entityId: preference.id })`.

### 9.5 States

| State | Mobile | Desktop |
|---|---|---|
| **Loading (reports)** | Card skeletons. | Card skeletons + chart skeletons. |
| **Loading (assistant)** | Button "تحلیل با دستیار فروش" with spinner + `aria-live="polite"`. | Same. |
| **Empty (no data, <7d activity)** | Card: "گزارشی موجود نیست. گزارش‌ها پس از ۷ روز فعالیت تولید می‌شوند." | Same. |
| **Empty (no suggestions)** | "هیچ پیشنهادی موجود نیست." | Same. |
| **Error (reports)** | "بارگذاری گزارش‌ها ناموفق بود." + retry. | Same. |
| **Error (assistant 429)** | "سقظ هوش مصنوعی روزانه پر شده است. فردا دوباره تلاش کنید." | Same. |
| **Error (assistant 500)** | "تحلیل ناموفق بود." + retry. | Same. |
| **Success (assistant)** | Suggestions list with CTA + dismiss buttons. | Same + sticky panel. |
| **Access-denied** | 403 card. | Same. |

### 9.6 Mobile behavior & accessibility
- Date range selector: `<select aria-label="بازه زمانی">` with 3 options.
- Performance card: `<section aria-labelledby="perf-title">` with `<h2 id="perf-title">`. KPIs as `<dl>` (`<dt>` label, `<dd>` value).
- Chart: `<canvas role="img" aria-label="نمودار بازدید ۳۰ روزه">` with a `<details>` containing the data table for screen readers.
- Business Assistant card: `<section aria-labelledby="assistant-title">`. Each suggestion is `<article role="article" aria-labelledby="sugg-{id}-title">` with `<h3 id>`, message, CTA `<Link>`, dismiss `<button aria-label="رد کردن پیشنهاد">`.
- "Run assistant" button: `min-h-[44px]`, `aria-busy="true"` while pending.
- Dismissed suggestions: removed from DOM with `aria-live="polite"` announcement "پیشنهاد رد شد."

### 9.7 Acceptance test & Definition of Done

**Acceptance test**:
1. Login as SELLER with 30d activity → `GET /api/seller/reports?range=30d` → assert real numbers, no fabrication.
2. Click "تحلیل با دستیار فروش" → assert POST fires, 3+ suggestions returned, each with `ctaHref` + `ctaLabel`.
3. Click dismiss on a suggestion → assert POST dismiss, suggestion removed from DOM, `AdminPreference.hiddenItems` updated.
4. Reload → dismissed suggestions do NOT reappear.
5. Exhaust AI budget (mock `AIBudget.dailySpendUsd > dailyLimitUsd`) → click assistant → assert 429 with friendly message.
6. Verify NO PII in the LLM input (server log inspection): `viewerPhone`, `buyerPhone` stripped before LLM call.
7. Mobile 375px: single-column, charts readable, all touch targets ≥ 44px.

**DoD**:
- [ ] `store.reports.read` + `store.analytics.read` in permissions + seed (PR-SC-09).
- [ ] Reports KPIs computed from real data; `—` when denominator 0.
- [ ] Business Assistant goes through AI Gateway (NOT a direct ZAI call) — uses `AITaskPolicy` + `AIBudget` enforcement.
- [ ] Every AI call logged to `AIGatewayLog` with cost + latency + success.
- [ ] Input sanitization strips PII (unit test with fixture).
- [ ] No autonomous mutations — every CTA is a `<Link>` to an authenticated/authorized page.
- [ ] Dismiss persisted in `AdminPreference.hiddenItems`.
- [ ] Lighthouse Mobile a11y ≥ 95.

---

## 10. AI Capability Section

Per ADR-005 §8, every AI surface is advisory-only. This section specifies each AI feature on the 7 pages: input data, output schema, forbidden data, error handling, cost estimate, quality evaluation, human-confirmation requirement.

### 10.1 Business Assistant (Page 7 — `/seller/reports`)

| Attribute | Spec |
|---|---|
| **Route** | `POST /api/seller/assistant` |
| **AI Gateway task type** | `SELLER_ASSISTANT` (M12) |
| **Auth** | `getCurrentUser()` + `requirePermission(user.id, 'ai.execute')` + ownership scope |
| **Input data (sanitized)** | `{ sellerStats: { activeListings, totalViews, totalLeads, totalOffers, conversionRate, lowStockCount, avgInventoryScore, stalePartsCount }, topListings: [{ title, viewCount, leadCount, offerCount, complete: boolean }], recentMovements: [{ type, daysAgo }] }` — **NO PII** (no `viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName`); **NO other-seller data** (ownership-scoped query before assembly) |
| **Forbidden data** | Any PII field (`Lead.viewerPhone`, `Lead.viewerName`, `ListingOffer.buyerPhone`, `ListingOffer.buyerEmail`, `ListingOffer.buyerName`, `User.mobile`, `User.email`, `Payment.payerCard`, `Payment.payerName`, `Payment.referenceCode`); any listing not owned by the seller; any company's private financials |
| **Output schema** | `{ suggestions: [{ id: string (uuid), severity: "warning"\|"info"\|"opportunity", message: string (Persian, ≤200 chars), ctaHref: string (must match `^/(seller\|admin\|listings)/`), ctaLabel: string (Persian, ≤30 chars), dismissible: boolean }] }` — validated server-side; malformed CTA hrefs are dropped |
| **Error handling** | LLM timeout → return deterministic fallback suggestions (3 generic tips); LLM 500 → return 500 with retry; AITaskPolicy missing → 403; AIBudget exceeded → 429; LLM returns non-JSON → regex-extract JSON, else fallback suggestions |
| **Cost estimate** | ~$0.01–0.02 per call (input ~1500 tokens, output ~500 tokens, default model). Capped by `AITaskPolicy.costCeilingUsd = 0.05` (M14). |
| **Quality evaluation** | (1) Offline: 20-fixture golden set — each fixture's LLM output checked for: schema validity, CTA href validity, Persian language, no PII leak, ≤5 suggestions. (2) Online: `AIGatewayLog.success` + user dismiss rate (high dismiss rate = low quality signal). (3) Periodic: human review of 10 random suggestions per week. |
| **Human-confirmation** | EVERY suggestion is advisory. CTA is a `<Link>` to an authenticated page where the user manually performs the action. NO "AI does X for you" button. NO auto-navigation. NO auto-mutation. |
| **Audit** | `AIGatewayLog` row (taskType=SELLER_ASSISTANT, userId, cost, latency, success). Dismiss actions audited separately via `ai.suggestion.dismiss`. |

### 10.2 Lead Intelligence Explanation (Page 4 — `/seller/leads`)

| Attribute | Spec |
|---|---|
| **Route** | `POST /api/seller/leads/[id]/intelligence-explain` |
| **AI Gateway task type** | `SELLER_ASSISTANT` (reused — same policy row) |
| **Auth** | `getCurrentUser()` + `requirePermission(user.id, 'store.crm.read')` + ownership of the lead |
| **Input data (sanitized)** | `{ leadSummary: { leadType, daysSinceCreated, listingTitle, listingCategory, leadCountFromSamePhone: number (NOT the phone itself), offerCount, lastOfferDaysAgo }, intelligenceLabel: "hot"\|"warm"\|"cold", intelligenceReason: string (deterministic, e.g. "3 سرنخ از این شماره") }` — **NO PII** (`viewerPhone` replaced with a count; `viewerName` omitted entirely) |
| **Forbidden data** | `Lead.viewerPhone`, `Lead.viewerName`, `ListingOffer.buyerPhone`, `ListingOffer.buyerEmail`, `ListingOffer.buyerName`, any other seller's leads |
| **Output schema** | `{ explanation: string (Persian, ≤300 chars, human-readable), factors: [{ label: string, value: string\|number, weight: number (0..1) }] }` — factors MUST sum to 1.0 (validated) |
| **Error handling** | Same as §10.1; on failure, return `{ explanation: intelligenceReason, factors: [] }` (deterministic fallback — the label + reason are already useful) |
| **Cost estimate** | ~$0.005–0.01 per call (smaller input). Capped by same `AITaskPolicy` row. |
| **Quality evaluation** | (1) Offline: 10-fixture golden set — verify explanation references real factors (no hallucinated data). (2) Online: dismiss rate. (3) Deterministic label MUST match the LLM explanation's implied priority (if label=hot but explanation says "low priority" → fail). |
| **Human-confirmation** | Explanations are read-only text. The only action is `<Link>` to the lead detail. NO auto-status-change. |
| **Audit** | `AIGatewayLog` row (taskType=SELLER_ASSISTANT). |

### 10.3 Listing Draft Generation (cross-page — invoked from `/listings/new` and `/seller/dashboard`)

| Attribute | Spec |
|---|---|
| **Route** | `POST /api/ai-gateway` with `taskType: LISTING_BUILDER` (existing AI Gateway task type — M12) |
| **AI Gateway task type** | `LISTING_BUILDER` (M12) — already exists in schema |
| **Auth** | `getCurrentUser()` + `requirePermission(user.id, 'ai.execute')` + `requirePermission(user.id, 'listing.create')` |
| **Input data (sanitized)** | `{ brandName, modelName, year, category, condition, userNotes (≤2000 chars, sanitized), suggestedSpecs: [{ key, value, unit }] }` — **NO PII** (no seller phone, no buyer info); **NO other-seller data** |
| **Forbidden data** | Any user/buyer PII; existing listing content from other sellers (no scraping competitors' listings); price data from other sellers |
| **Output schema** | `{ title: string (≤120 chars), shortDesc: string (≤200 chars), description: string (≤5000 chars, Persian, markdown), suggestedPriceToman: number|null (with confidence band: { low, mid, high }), attributes: [{ key, value, unit }], images: [] (AI does NOT generate images — out of scope), completenessChecklist: [{ item, done: boolean }] }` |
| **Error handling** | Same as §10.1; on failure, return a minimal skeleton `{ title: "", description: "", suggestedPriceToman: null }` so the user can still fill manually |
| **Cost estimate** | ~$0.02–0.04 per call (larger output). Capped by `AITaskPolicy.costCeilingUsd` for LISTING_BUILDER (default 0.05 — may need to raise to 0.10 in the policy row). |
| **Quality evaluation** | (1) Offline: 15-fixture golden set — verify Persian quality, no hallucinated specs (every suggested spec must trace to `KnowledgeEntry` or user input), title ≤120 chars. (2) Online: % of AI-drafted listings that get published without manual edit (low = low quality OR high friction; investigate). (3) Periodic: human review of 5 random drafts per week. |
| **Human-confirmation** | The draft is loaded into the listing form as **pre-filled values**, NOT auto-published. The user MUST review + click "ثبت آگهی" (which goes through the normal `listing.publish` permission + audit path). NO auto-publish. |
| **Audit** | `AIGatewayLog` row (taskType=LISTING_BUILDER). The eventual `listing.publish` is audited separately via the normal listing audit path. |
| **Reconciliation rule** | Per SEO-ARCHITECTURE.md §10: AI claims about price/year/brand/city/workingHours/inspection MUST match real data or be rejected. The draft generation route validates `suggestedSpecs` against `KnowledgeEntry` + `Brand`/`ProductModel` lookup; mismatched specs are dropped (not silently included). |

### 10.4 Cross-cutting AI rules (apply to all 3 features)

| Rule | Enforcement |
|---|---|
| **Advisory-only** | No AI route calls `db.*.create/update/delete`. Verified by integration test: every AI route's handler function has zero write calls (grep + test). |
| **Gateway-mediated** | All AI calls go through `/api/ai-gateway` (or its server-side equivalent) which enforces `AITaskPolicy` (deny-by-default) + `AIBudget` (daily + monthly caps). NO direct `ZAI.create()` in seller-facing routes (the existing `/api/ai-sales-agent` route violates this — Reconciliation Row R11 — must be refactored or removed in PR-SC-09). |
| **PII stripping** | A shared `sanitizeAiInput(payload)` helper in `src/lib/ai-sanitize.ts` strips known PII keys before LLM call. Unit-tested with a fixture containing all forbidden keys. |
| **Cost discipline** | Every AI call logs `cost` to `AIGatewayLog`. Daily cost dashboard (admin) sums by taskType. Alerts at 80% of daily/monthly cap. |
| **Persian-first** | System prompts are in Persian. Output validation: reject responses that are >20% non-Persian characters (excluding numbers, URLs, technical terms). |
| **No-fabrication** | Every numeric claim in AI output MUST trace to a real DB field. The route handler re-validates any number the LLM quotes against the actual data before returning to UI. Mismatches are dropped. |

---

## 11. Reconciliation Table

Every claim in prior HEAVIX docs (`ADR-005`, `STORE-CENTER-UX-PROTOTYPE.md`, `STORE-CENTER-IMPLEMENTATION-PLAN.md`, `PRODUCT-ADMIN-STORE-CENTER-SPEC.md`) that conflicts with the actual code/schema on baseline is recorded here. **No proposed route/model is presented as existing anywhere in this document.**

| # | Document claim | Actual code/schema state | Gap | Resolving PR |
|---|---|---|---|---|
| **R0** | Brief says baseline `main=4566efd` (PR #8 merged). | Worklog Task 6 says local working tree at `710df93`. `git log` not run (documentation-only task). | Baseline SHA discrepancy — owner to confirm. Not a blocker (all schema/code reads done against the working tree). | None (owner action) |
| **R1** | ADR-005 §1 proposes `Company.storeSlug String? @unique` as NEW. | `Company.slug String @unique` ALREADY exists (`schema.prisma:1180`). | `storeSlug` is redundant with existing `slug`. Adding both creates two URL namespaces for the same concept. | **Recommendation**: do NOT add `storeSlug`. Reuse `Company.slug` for `/showroom/[slug]`. If a separate namespace is desired, add `storeSlug` in PR-SC-01 but document the rationale. This design reuses `slug` (§4.3). |
| **R2** | ADR-005 §1 proposes `Company.bannerUrl` as NEW. | `Company.coverImage String?` ALREADY exists (`schema.prisma:1183`). | `bannerUrl` duplicates `coverImage`. | **Recommendation**: do NOT add `bannerUrl`. Reuse `coverImage` for the showroom banner. This design reuses `coverImage` (§4.3). |
| **R3** | ADR-005 §1 lists `Company.logoUrl` as NEW. | `Company.logoUrl String?` ALREADY exists (`schema.prisma:1182`). | B1 critic finding confirmed. `logoUrl` is NOT new — no migration needed for it. | PR-SC-01 adds only `brandColor` + `storeDescription` (the genuinely new fields). `logoUrl`, `coverImage`, `slug` are reused as-is. |
| **R4** | ADR-005 §2: "Check user's Company has active PremiumSubscription." Implies PremiumSubscription is company-scoped. | `PremiumSubscription.userId @unique` — per-USER, NOT per-Company (`schema.prisma:1128`). No `companyId` on PremiumSubscription. | H1 critic finding confirmed. The phrase "Company's PremiumSubscription" is not literally expressible in the current schema. | MVP resolution (§2.4): `companyHasActivePremium(companyId)` queries `PremiumSubscription` where `user.companyId = companyId AND status = ACTIVE AND (expiresAt IS NULL OR expiresAt > now)`. No migration needed. Long-term: separate ADR to migrate to `companyId @unique` or add `CompanySubscription` join table (out of scope). |
| **R5** | ADR-005 §6: "MachinePassport already exists with `source` and `verification` fields." | `MachinePassport` has `id, listingId, serialNumber, inspectionDate, inspectionResult, events, createdAt, updatedAt` (`schema.prisma:1149-1159`). **NO `source`, NO `verification` field.** | B2 critic finding confirmed. ADR-005 §6's premise is FALSE. The per-section verification fields (`specsVerifiedAt/By`, `ownershipVerifiedAt/By`, `inspectionVerifiedAt/By`, `serviceHistoryVerifiedAt/By`) are ALL genuinely NEW. | PR-SC-03 adds all 8 fields. ADR-005 §6 should be amended to remove the false "already exists with source and verification" claim. |
| **R6** | ADR-005 §2 + UX prototype Page 6 describe `Showroom` model and `/showroom/[slug]` route as design. | No `Showroom` model in `schema.prisma` (verified — only `MachinePassport` + `PassportEvent` in the passport domain). No `/showroom/` route in `src/app/`. | Showroom is NEW — model + route + API all greenfield. | PR-SC-02 (schema) + PR-SC-08 (UI + API). BLOCKER for Page 6 until PR-SC-02 lands. |
| **R7** | ADR-005 §5 Smart Inventory Score: `has_partNumber(15) + has_oemNumber(10) + has_documents(15) + has_specifications(15)`. | `Part` (store-schema.prisma:123-165) has NO `partNumber`, NO `oemNumber`, NO `documents`, NO `specifications` fields. Only: `name, nameFa, sku, description, priceUsd, stock, lowStockThreshold, images (JSON), compatibleCars (JSON), carModels, sourceUrl, active, featured, views, soldCount`. | The v1 algorithm as written CANNOT be computed from the existing schema. Either reduce the algorithm to existing fields OR extend `Part` with 4 new fields. | **Recommendation** (this design, §5.3): reduce the algorithm to existing fields (v1-reduced: `images + compatibleCars + carModels + stock + recent_movement + description`). Store as `Part.inventoryScore Int?` + `Part.inventoryScoreVersion String?` (NEW — PR-SC-03). Do NOT add `partNumber/oemNumber/documents/specifications` in MVP. |
| **R8** | Implementation plan PR-SC-07 specifies route `/admin/store/passport/[listingId]` for Machine Passport. | Route does NOT exist on baseline. `MachinePassport` model exists but with minimal fields (R5). | Route is NEW. The `/admin/store/` prefix is consistent with existing store admin routes. A seller-facing mirror `/seller/passport/[listingId]` is NOT in scope for MVP (flag for future). | PR-SC-07. Depends on PR-SC-03 (schema). |
| **R9** | UX prototype Page 2 + Implementation plan PR-SC-04 specify `/seller/identity` route. | Route does NOT exist on baseline. `Company.brandColor` + `Company.storeDescription` do NOT exist. | Route + 2 fields are NEW. | PR-SC-04. Depends on PR-SC-01 (schema). |
| **R10** | UX prototype Page 7 + Implementation plan PR-SC-09 reference "Views (30d)". | `Listing.viewCount` is lifetime, not time-bounded (`schema.prisma:462`). There is no `ListingView` event model with timestamps. | "Views (30d)" cannot be computed from `viewCount`. Options: (a) show lifetime views with a "از ابتدا" label; (b) add an `AnalyticsEvent` rollup (the `AnalyticsEvent` model exists — `schema.prisma:2217` — but may not be populated for views). | **Recommendation**: show lifetime views with explicit label "بازدید کل (از ابتدا)" in MVP. Add time-bounded views in a future PR once `AnalyticsEvent` is instrumented for `LISTING_VIEW`. |
| **R11** | ADR-005 §8: "AI Gateway SELLER_ASSISTANT task type is used for analysis and suggestions only." Implies all AI goes through the Gateway. | `/api/ai-sales-agent/route.ts` calls `ZAI.create()` directly (line 45) — does NOT go through `/api/ai-gateway`, does NOT check `AITaskPolicy`, does NOT check `AIBudget`, does NOT log to `AIGatewayLog`. `/api/ai-seller-assistant/route.ts` same pattern (line 60). | Two existing AI routes bypass the Gateway. This violates ADR-005 §8 enforcement contract (§2.3 A2/A3/A4 of this design). | PR-SC-09: refactor both routes to go through the AI Gateway, OR deprecate them in favor of the new `/api/seller/assistant` route which IS Gateway-mediated. The existing `/seller/leads` page (which calls `/api/ai-sales-agent`) must be updated to call `/api/seller/leads` (deterministic) + `/api/seller/leads/[id]/intelligence-explain` (Gateway-mediated AI) per §6.4. |
| **R12** | ADR-005 §7 lists 11 NEW permission keys. | None of `store.profile.read/manage`, `showroom.read/manage/admin`, `passport.read/manage`, `store.crm.read/manage`, `store.reports.read`, `store.analytics.read` exist in `permissions.ts` (verified — grep returns 0). | All 11 keys are genuinely NEW. Must be added to `PERMISSIONS` array + `ROLE_PERMISSIONS` map + `seed-rbac.ts`. | PR-SC-02 (showroom keys), PR-SC-03 (passport keys), PR-SC-04 (store.profile keys), PR-SC-06 (store.crm keys), PR-SC-09 (store.reports + store.analytics keys). Each PR adds its own keys + seed entries. |
| **R13** | Implementation plan PR-SC-05 KPI: "Open Orders: `storeDb.order.count({ where: { status: 'PENDING' } })`". | `Order` (store-schema.prisma:170-202) has `userId?` (nullable) and `customerId` — NO `sellerId`, NO `companyId`. There is no concept of a "seller's orders" in the store schema; orders belong to customers/mechanics. | The dashboard KPI "Open store orders" for a seller cannot be scoped to that seller without a join (e.g., orders where the parts belong to the seller's warehouse — but `Part` has no `sellerId`/`companyId` either). | **Recommendation**: in MVP, show "Open store orders" only for ADMIN (global count, no seller scoping). For SELLER, show "—" with a tooltip " سفارش‌های فروشگاه به حساب کاربری مشتری متصلند، نه فروشنده." Long-term: add `sellerId`/`companyId` to `Order` + `Part` in a separate ADR (out of scope). |
| **R14** | ADR-005 §4 proposes `SalesTeamMember` model linked to Company. | No `SalesTeamMember` model in `schema.prisma`. `Mechanic` (store-schema) is a different concept (repair technician, not sales). | `SalesTeamMember` is NEW. | PR-SC-02 (schema). Showroom (Page 6) can ship without the sales team section if PR-SC-02 lands `Showroom` but not `SalesTeamMember` (feature-flag the section). |
| **R15** | UX prototype Page 4 "Lead Intelligence (deterministic)" + Implementation plan PR-SC-06 reference `Lead.status`. | `Lead` model (`schema.prisma:618-627`) has NO `status` field. Existing `/api/seller/leads` route comment confirms: "Lead doesn't have status field, so we skip status filter for now" (line 31). | H2 critic finding confirmed. Kanban pipeline view REQUIRES `Lead.status`. | PR-SC-01 (schema migration: add `Lead.status String @default("NEW")` + backfill). BLOCKER for Page 4 Kanban. |
| **R16** | Implementation plan PR-SC-06 mentions "Lead Intelligence scoring" as a unit test. | No `Lead.sellerId` field. Existing `/api/seller/leads` joins via `Listing.sellerId`. | H2 critic finding (partial). Lead Intelligence can be computed without `Lead.sellerId` (via the listing join), so this is NOT a blocker for MVP. Adding `Lead.sellerId` would enable listing-unattached leads (future). | No migration needed for MVP. Document the limitation. Future: add `Lead.sellerId` + `Lead.companyId` for direct ownership. |
| **R17** | UX prototype Page 5 + ADR-005 §6 reference "Service History" as a Passport section with events. | `PassportEvent` model exists (`schema.prisma:1161-1171`) with `eventType` field — can be used for `SERVICE` events. No `PassportDocument` model exists. | Service history CAN be modeled via `PassportEvent` (no migration). Documents (manual, inspection report) have no dedicated model — must be modeled as `PassportEvent` with `eventType: 'DOCUMENT'` and `description` = URL (workaround), OR a new `PassportDocument` model added. | **Recommendation** (this design, §7.3): use `PassportEvent` for both service + documents in MVP. Add `PassportDocument` model in a future PR if document management needs richer metadata. |
| **R18** | ADR-005 §3 proposes `Lead.status` enum with values `NEW, CONTACTED, QUALIFIED, CLOSED, LOST`. UX prototype Page 4 shows pipeline columns `NEW, CONTACTED, QUALIFIED, CLOSED` (no LOST). | Schema has no `status` field. | Minor: pipeline UI shows 4 columns (LOST folded into CLOSED or shown as a sub-state). The enum should still include LOST for data integrity. | PR-SC-01 adds the field; PR-SC-06 UI renders 4 columns (LOST accessible via filter). |
| **R19** | Implementation plan PR-SC-08 lists `src/lib/showroom-auth.ts` (server-side VIP check). | File does NOT exist on baseline. | NEW file. | PR-SC-08 creates it. Contains `companyHasActivePremium(companyId)` + `requireVipSeller(user)` helpers. |
| **R20** | Implementation plan PR-SC-09 lists "User dismiss stored in AdminPreference". | `AdminPreference.hiddenItems Json?` exists (`schema.prisma:2527`). No `dismissedSuggestions` field. | Reuse `hiddenItems` JSON (array of suggestion IDs). No migration. | PR-SC-09 implements dismiss by appending to `hiddenItems` JSON. |
| **R21** | UX prototype Page 1 (Dashboard) sidebar lists 7 nav items (Dashboard, Identity, Inventory, Orders, Leads, Passport, Showroom, Reports). | No `/seller/layout.tsx` exists. Each seller page renders its own `<Header>`/`<Footer>`. No shared sidebar. | Seller sidebar is NEW. | PR-SC-05 creates `src/app/seller/layout.tsx` with shared sidebar + mobile bottom tab bar. All 7 pages adopt it. |
| **R22** | Implementation plan PR-SC-05 KPI "Conversion rate: `openOffers / activeListings`". | `ListingOffer` and `Listing` are both in MAIN DB. Computation is a derived ratio. | No gap — derived field. Just document the formula and the `—` fallback when `activeListings = 0`. | None. |
| **R23** | ADR-005 §2 Showroom model has `featuredListingIds String[]`. | Prisma `String[]` requires PostgreSQL native array support (works on PG). No issue. | No gap. | None. |
| **R24** | UX prototype Page 3 "Export" button. | No canonical `store.export` permission exists. `inventory.read` is used as fallback. | Minor: add `store.export` permission in a future PR; MVP uses `inventory.read`. | None for MVP. Future PR. |
| **R25** | Implementation plan PR-SC-07 "Request Inspection CTA". | `Inspection` model exists (`schema.prisma:1351-1376`) with `status: REQUESTED` default. | No gap — the CTA creates a real `Inspection` row. | None. |
| **R26** | ADR-005 Consequences: "11 new permission keys". | Verified count: `store.profile.read, store.profile.manage, showroom.read, showroom.manage, showroom.admin, passport.read, passport.manage, store.crm.read, store.crm.manage, store.reports.read, store.analytics.read` = 11. | No gap. | PR-SC-02/03/04/06/09 collectively add all 11. |
| **R27** | Store Center spec mentions "Sales Team" as a CRM feature. | `SalesTeamMember` model does NOT exist (R14). `Mechanic` (store) is unrelated. | Sales Team section on Showroom (Page 6) depends on PR-SC-02. | PR-SC-02. |
| **R28** | Implementation plan dependency graph shows PR-SC-09 depends on PR-SC-05 + PR-SC-06. | Verified: reports page aggregates dashboard KPIs (PR-SC-05) + lead KPIs (PR-SC-06). | No gap. | None. |
| **R29** | ADR-005 §8 "Each suggestion includes a link to the relevant page." | Existing `/api/ai-sales-agent` returns `suggestions: string[]` (plain strings, no links). | Existing route's response shape is incompatible with ADR-005 §8. | PR-SC-09: new `/api/seller/assistant` route returns structured suggestions with `ctaHref` + `ctaLabel`. Deprecate `/api/ai-sales-agent`. |
| **R30** | UX prototype Page 6 public showroom "Contact Dealer" / "Request Price" CTAs. | No `DealRoom` creation route from showroom exists. `DealRoom` model exists (`schema.prisma:1299`). | CTAs need a route to create a `DealRoom` or `Lead` from the showroom. | Future PR (out of MVP scope): `POST /api/showroom/[slug]/contact` creates a `Lead` with `leadType: 'CONTACT'`. MVP: CTA is a `tel:` link to `Company.phone` + a mailto to `Company.email`. |

---

## 12. Summary of BLOCKER-level gaps

These gaps MUST be resolved before the corresponding page can ship end-to-end. Non-blockers are documented in the reconciliation table but do not prevent implementation.

| Blocker | Affected page(s) | Resolving PR | Notes |
|---|---|---|---|
| `Lead.status` field missing | Page 4 (Leads & CRM Kanban) | PR-SC-01 | Additive migration + backfill `status = NEW` for all existing leads. |
| `Company.brandColor` + `Company.storeDescription` fields missing | Page 2 (Store Identity) | PR-SC-01 | Additive migration, null defaults. |
| `Showroom` model missing | Page 6 (VIP Showroom — public + management) | PR-SC-02 | New table. Additive. |
| `SalesTeamMember` model missing | Page 6 (Showroom sales team section only) | PR-SC-02 | New table. Showroom can ship without this section (feature-flagged). |
| `MachinePassport` per-section verification fields missing (8 fields) | Page 5 (Machine Passport) | PR-SC-03 | Additive migration, null defaults. ADR-005 §6 false premise corrected (R5). |
| `Part.inventoryScore` + `Part.inventoryVersion` missing | Page 3 (Inventory Smart Score column) | PR-SC-03 | Additive migration in STORE schema. |
| 11 NEW permission keys missing from `permissions.ts` + `seed-rbac.ts` | All 7 pages | PR-SC-02/03/04/06/09 (each adds its own keys) | Without these, `requirePermission` returns 403 for every seller. |
| Existing AI routes bypass AI Gateway (R11) | Page 4 (current `/seller/leads`), Page 7 (if reusing old routes) | PR-SC-09 | Refactor or deprecate `/api/ai-sales-agent` + `/api/ai-seller-assistant`. |
| No `/seller/layout.tsx` shared sidebar (R21) | All seller pages (nav consistency) | PR-SC-05 | Cosmetic blocker — pages can ship with per-page headers, but UX is degraded. |

**No undocumented BLOCKERs found.** All blockers trace to known schema gaps (B1/B2/H1/H2/H3 critic findings + ADR-005 §2/§4/§5/§6 proposed models not yet migrated) and are addressed by the PR-SC-01..09 sequence in `STORE-CENTER-IMPLEMENTATION-PLAN.md`.

---

## 13. Open Questions for Owner

1. **R0 baseline SHA**: confirm whether `main` is `4566efd` (brief) or `710df93` (worklog Task 6). Affects which commits are "already merged" vs "in working tree only."
2. **R1 storeSlug**: reuse `Company.slug` for `/showroom/[slug]` (this design's recommendation) OR add separate `storeSlug`? Reusing avoids duplicate URL namespaces but couples showroom URL to company URL.
3. **R4 PremiumSubscription scope**: accept MVP resolution (any user in the company with active subscription = company is VIP) OR prioritize a migration to `companyId @unique` on PremiumSubscription?
4. **R7 Smart Inventory Score**: accept v1-reduced algorithm (existing fields only) OR extend `Part` with `partNumber/oemNumber/documents/specifications` in PR-SC-03 for the full v1 algorithm?
5. **R10 time-bounded views**: accept lifetime-viewcount with explicit label in MVP OR instrument `AnalyticsEvent` for `LISTING_VIEW` first (delays Page 1 + Page 7)?
6. **R13 seller-scoped store orders**: accept "ADMIN-only" KPI in MVP OR add `sellerId`/`companyId` to `Order` + `Part` (larger migration, separate ADR)?
7. **R17 passport documents**: accept `PassportEvent` workaround for documents in MVP OR add a `PassportDocument` model in PR-SC-03?
8. **R30 showroom contact CTA**: accept `tel:`/`mailto:` in MVP OR build `POST /api/showroom/[slug]/contact` (creates a `Lead`) in PR-SC-08?

---

**End of document.** This spec is implementation-ready: each page section maps 1:1 to a PR description, each API contract maps 1:1 to a route handler, each acceptance test maps 1:1 to a Playwright spec. No code, schema, or PR was modified by this task. All gaps are recorded in §11 and all blockers in §12.
