# HEAVIX — Admin Store Center Specification (ASC)

> **Status:** SPECIFICATION — product + engineering contract. No code, schema, or migration changes.
> **Branch:** `docs/store-center-spec` (from `main` `7d6e9e3`)
> **Scope:** Specification only. References real models, routes, permissions verified in the codebase as of this branch.
> **Companion docs:**
> - `docs/PRODUCT-ADMIN-STORE-CENTER.md` (prior product design — 8 sections, proposed)
> - `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md` (showroom product design — proposed)
> - `docs/STORE-MARKETPLACE-CONTROL-PLANE.md` (control-plane architecture)
> - `docs/STORE-RESOURCE-MATRIX.md` (per-resource RBAC matrix)
>
> **Status legend:** `EXISTING` (in code today) · `REUSABLE` (existing, fit for reuse) · `NEEDS DEVELOPMENT` (proposed) · `NEEDS DECISION` (open question for owner).
> **Priority legend:** `P0` (blocker) · `P1` (must-have for v1) · `P2` (follow-on).

---

## 1. Product Goals & User Roles

The Store Center unifies 16 fragmented admin store pages (`src/app/admin/store/*`) and the seller surfaces (`/seller/dashboard`, `/seller/leads`, `/admin/sellers/[id]`, `/sellers/[id]`) into one role-aware workspace. It targets three personas; **none** of them may move funds or render credit decisions (see §6, §15).

### 1.1 Personas

| Persona | Auth path | Primary permission keys | Goals |
|---|---|---|---|
| **Seller** | User session (RBAC, `SELLER` role) | `listing.*`, `order.read`, `deal.*`, `review.read`, `rfq.*`, `analytics.read`, `price.read` (per `ROLE_PERMISSIONS.SELLER` in `src/lib/authorization/permissions.ts`) | Publish inventory, respond to leads, manage own showroom, view own analytics |
| **VIP Dealer** | Seller + active `PremiumSubscription` (`companyPage=true` tier flag on `SubscriptionPlan`) | above + (proposed) `showroom.manage`, `showroom.read.analytics` | Operate a public Virtual Showroom with higher quotas and analytics |
| **Platform Admin** | User session (RBAC, `ADMIN` role) | all 127 keys via `ROLE_PERMISSIONS.ADMIN` | Oversee all stores, verify companies, moderate, enforce policy |

### 1.2 Capability: Persona mapping

- **ASC-001** — Persona model (P0, EXISTING): `ROLE_PERMISSIONS` in `src/lib/authorization/permissions.ts` defines SELLER/BUYER/MODERATOR/SUPPORT/ADMIN. Dependencies: none. Expected: every Store Center route resolves persona from `getCurrentUser()` + `isAdmin()` / `can()`. Error states: unauthenticated → 401; lacks permission → 403 (no ADMIN bypass — Model B, `src/lib/admin-guard.ts:67-80`). Acceptance: no route trusts client-asserted role.

---

## 2. Information Architecture & Navigation

### 2.1 Page tree (proposed Store Center shell, reusing existing pages)

```
/admin/store/                         (ASC-010 dashboard, EXISTING page.tsx)
  /identity                           (ASC-020 — StoreProfile, NEEDS DEVELOPMENT)
  /catalog                            (ASC-030 — parts + inventory + warehouses hub, REUSABLE)
    /parts        → /admin/store/parts          (EXISTING)
    /inventory    → /admin/store/inventory      (EXISTING)
    /warehouses   → /admin/store/warehouses     (EXISTING)
    /brands       → /admin/store/brands         (EXISTING)
    /categories   → /admin/store/categories     (EXISTING)
    /car-models   → /admin/store/car-models     (EXISTING)
  /commerce                          (ASC-040 hub, REUSABLE)
    /orders       → /admin/store/orders         (EXISTING)
    /payments     → /admin/store/payments       (EXISTING)
    /returns      → /admin/store/returns        (EXISTING)
    /shipments    → /admin/store/shipments      (EXISTING)
    /procurement  → /admin/store/suppliers      (EXISTING) + procurement API
  /crm                               (ASC-050 — Leads + Sales Team, NEEDS DEVELOPMENT)
  /passport                          (ASC-060 — Machine Passport, NEEDS DEVELOPMENT)
  /showroom                          (ASC-070 — VIP Showroom builder, NEEDS DEVELOPMENT)
  /reports                           (ASC-080 — analytics + export, REUSABLE)
  /assistant                         (ASC-100 — Business Assistant, NEEDS DEVELOPMENT)
```

### 2.2 Capabilities

- **ASC-002** — Store Center shell (P1, NEEDS DEVELOPMENT): single `AdminShell` layout with section nav derived from `seed-admin-navigation.ts`. Dep: `admin.navigation.read`. Expected: section visibility = intersection of user permissions and seeded nav. Error: hidden sections must also 403 on direct API hit (UI hiding alone prohibited). Acceptance: nav order stable; breadcrumbs reflect tree above.
- **ASC-003** — Breadcrumbs (P2, NEEDS DEVELOPMENT): `<Breadcrumb>` (`src/components/ui/breadcrumb.tsx`) wired to the tree. Dep: ASC-002. Acceptance: every leaf page has a Home > Store > Section > Leaf trail with correct hrefs.

Seller-facing mirrors live under `/seller/*` (`/seller/dashboard`, `/seller/leads`) and the public profile at `/sellers/[id]`. The spec does **not** move them — it makes the admin shell link into them per persona.

---

## 3. Dashboard & KPIs

The existing `/admin/store/page.tsx` already renders KPI cards (total parts, active parts, low-stock, orders, pending orders, customers, mechanics, pending payments, approved revenue IRR, today's USD rate, margin %, auto-currency status, orders-by-status, payments-by-status) sourced from `/api/admin/store/stats`. This is REUSABLE; the spec extends it with seller-scoped and lead KPIs.

### 3.1 KPI table (each mapped to a real field)

| KPI | Source model / field | Persona | Status |
|---|---|---|---|
| Active inventory count | `Part` (store) where `active=true` | Seller/Admin | EXISTING (`stats.activeParts`) |
| Low-stock count | `InventoryBalance` where `qtyOnHand <= reorderPoint` (existing `/api/admin/store/inventory/low-stock`) | Seller/Admin | EXISTING |
| Open orders | `Order.status` ∈ {PENDING, CONFIRMED, PROCESSING} | Seller/Admin | EXISTING (`stats.pendingOrders`) |
| Approved revenue (IRR) | `Payment.status=APPROVED` sum `amount` × `CurrencyRate` | Admin | EXISTING (`stats.approvedRevenueIrr`) |
| Listing views (30d) | `Listing.viewCount` (main) | Seller | REUSABLE |
| Listing favorites | `Listing.favoriteCount` | Seller | REUSABLE |
| Leads this week | `Lead.createdAt` ≥ now-7d, `Lead.leadType` ∈ {CALL,MESSAGE,CONTACT,OFFER} | Seller | REUSABLE |
| Lead → Deal conversion | `Lead` linked to `Deal` (NEEDS DECISION: join path) | Seller/Admin | NEEDS DEVELOPMENT |
| Showroom views | PROPOSED `ShowroomAnalytics` (ASC-070) | VIP Dealer | NEEDS DEVELOPMENT |
| Verification status | `Company.verified` + `CompanyVerification.status` | Seller/Admin | REUSABLE |
| Pending inspections | `Inspection.status` ∈ {REQUESTED, SCHEDULED} | Seller/Admin | REUSABLE |
| Baseline conversion rate | UNKNOWN (no historical funnel baseline in schema) | — | NEEDS DECISION |

### 3.2 Capabilities

- **ASC-010** — Dashboard KPI cards (P0, REUSABLE): `/admin/store/page.tsx` + `/api/admin/store/stats`. Dep: `store.read`. Expected: cards render per-RBAC; non-permitted metrics return `—`. Error: stats endpoint 5xx → card shows error pill, other cards still render. Acceptance: each card deep-links to its section; refresh button (`RefreshCw`) re-fetches.
- **ASC-011** — Seller-scoped dashboard (P1, NEEDS DEVELOPMENT): `/seller/dashboard` extended with the same KPI set filtered by `Listing.sellerId = user.id`. Dep: ASC-010, `analytics.read`. Expected: seller never sees another seller's counts. Error: cross-seller leak → 403 + audit. Acceptance: a seller with 0 listings sees all-zero state, not an error.
- **ASC-012** — Activity feed (P1, NEEDS DEVELOPMENT): last 20 events (order placed, return opened, inspection completed, AI suggestion raised). Dep: `Notification` model (store schema). Acceptance: feed paginated; each item links to the source record.

---

## 4. Store Identity & Branding

### 4.1 Model decision

`Company` (main schema, `prisma/schema.prisma:1177`) already holds `name, slug, description, logoUrl, coverImage, website, phone, email, address, city, province, verified, premium, status, metaTitle, metaDescription, viewCount`. **This is REUSABLE for identity** — the spec does NOT propose a parallel `StoreProfile` model unless a field is missing.

Audit: missing fields vs. product need = `tagline`, `primaryColor`, `secondaryColor`, `brandBio`, `socialLinks` (JSON), `supportHours`. These are not on `Company`. Two options:

- **Option A (preferred):** extend `Company` additively with nullable columns.
- **Option B:** introduce a 1:1 `StoreProfile` model keyed by `companyId`.

This is **NEEDS DECISION** — owner picks A or B. Until decided, the capability is blocked.

### 4.2 Capabilities

- **ASC-020** — Identity editor (P1, NEEDS DECISION): form bound to `Company` (+ decided extension). Dep: `store.manage`, ASC-013 (data model). Expected: seller edits own `Company`; admin edits any. Write enforced via Action Engine `auditMutationTransactional` (`src/lib/admin/action-engine.ts:391`). Error: race on `slug` uniqueness → 409 with field-level message. Acceptance: changes propagate to `/sellers/[id]` public profile within one revalidate.
- **ASC-021** — Identity preview (P2, REUSABLE): `/sellers/[id]/page.tsx` already renders public profile. Dep: ASC-020. Acceptance: preview button opens the public URL in a new tab; admin preview includes an "admin view" banner.
- **ASC-022** — Brand association (P2, REUSABLE): `Company ↔ Brand` link via existing `storeBrandsConfig` resource. Dep: `brand.read`. Acceptance: a company may associate N brands; association is audited.

---

## 5. Inventory & Catalog Management

### 5.1 Reuse map

| Need | Existing asset | File |
|---|---|---|
| Parts CRUD | `partConfig` resource (store DB) | `src/lib/admin/resources/store-resources.ts` |
| Inventory balances | `inventoryConfig`, `/api/admin/store/inventory/*`, `low-stock`, `reserve`, `release` routes | `src/app/api/admin/store/inventory/` |
| Warehouses | `warehouseConfig` | `src/app/api/admin/store/warehouses/` |
| Categories / Brands / Car-models | `storeCategoriesConfig`, `storeBrandsConfig`, `carModelsConfig` | `src/app/admin/store/{categories,brands,car-models}/` |
| Listing workflow | `listingConfig` (main DB), `listing.publish` permission | `src/lib/admin/resources/listing.ts` |
| Procurement | `procurementConfig`, `ProcurementRequest`/`PurchaseOrder`/`PurchaseOrderItem` | `src/app/api/admin/store/procurement/` |

### 5.2 Smart Inventory Score

A deterministic 0–100 completeness score per `Listing`. **Not** a sales/price/financing guarantee. Inputs (all from existing fields):

| Factor | Weight | Source |
|---|---|---|
| Spec completeness | 25% | `ListingAttribute` fill rate |
| Media coverage | 15% | `ListingImage` count + types |
| Verification | 20% | `Company.verified` + `MachinePassport` presence |
| Inspection freshness | 15% | `Inspection.completedAt` recency, `Inspection.status=COMPLETED` |
| Documentation | 15% | `CompanyDocument` count |
| Engagement (30d) | 10% | `Listing.viewCount` + `Listing.favoriteCount` delta |

### 5.3 Capabilities

- **ASC-030** — Catalog hub (P0, REUSABLE): universal table (`src/components/admin/universal-table.tsx`) over `partConfig`/`listingConfig`. Dep: `store.read` / `listing.read`. Expected: filter/sort/paginate/search via Query Engine (backend-enforced). Error: invalid filter → 400 with field name. Acceptance: page renders under 1.2s p95 for 10k rows.
- **ASC-031** — Listing publish workflow (P0, REUSABLE): `listing.publish` action via Action Engine preconditions + atomic conditional update (`SELECT FOR UPDATE`, `src/lib/admin/data-adapter.ts:175`). Dep: `listing.publish`. Expected: draft → pending → published with audit trail. Error: precondition fail (e.g. missing required attribute) → 422 with reason. Acceptance: no two admins can publish the same listing simultaneously without a serial audit entry.
- **ASC-032** — Smart Inventory Score (P1, NEEDS DEVELOPMENT): score computed by a deterministic job, stored as a denormalized field on `Listing` (NEEDS DECISION: new column vs. `Listing.meta` JSON). Dep: ASC-030, `analytics.read`. Expected: recompute on attribute change, inspection completion, document upload, verification change, nightly batch. Error: input missing → score `null`, UI shows "calculating". Acceptance: score updates within 24h of input change; never displayed to public buyers (public sees binary `Listing.verified` badge only); UI copy says "completeness indicator", never "sales guarantee".
- **ASC-033** — Bulk actions (P1, REUSABLE): list/delist/transfer-warehouse/export via Action Engine `bulkActions`. Dep: `inventory.manage`, `listing.manage`. Error: partial failure → atomic rollback per batch, audit entry per item. Acceptance: export respects EXPORT field policy (`payment.idempotencyKey`, `user.passwordHash` stripped).

---

## 6. Orders, Payments, Returns & Fulfillment

### 6.1 Reuse map (no duplicate systems)

| Domain | Model (store schema) | API route | Permission |
|---|---|---|---|
| Orders | `Order`, `OrderItem` | `/api/admin/store/orders`, `/api/store/orders` | `order.read`, `order.manage` |
| Payments | `Payment` (incl. `idempotencyKey`, `trackingCode`) | `/api/admin/store/payments`, `/api/store/payments/*` | `payment.read`, `payment.manage`, `payment.refund` |
| Returns | `Return`, `ReturnItem` | `/api/admin/store/returns` | `returns.read`, `returns.manage` |
| Shipments | `Shipment`, `ShipmentTracking` | `/api/admin/store/shipments` | `shipping.read`, `shipping.manage` |
| Procurement | `ProcurementRequest`, `PurchaseOrder`, `PurchaseOrderItem`, `Supplier` | `/api/admin/store/procurement`, `/api/admin/store/suppliers` | `procurement.read`, `procurement.manage` |

### 6.2 Capabilities

- **ASC-040** — Commerce hub (P0, REUSABLE): tabbed universal table over Order/Payment/Return/Shipment resources. Dep: `order.read` minimum. Expected: status filters map to model `status` enums (Order: PENDING…RETURNED; Payment: PENDING/APPROVED/REJECTED/REFUNDED; per `src/app/admin/store/page.tsx:42-57`). Error: cross-domain join prohibited (store schema only); joins done at service layer. Acceptance: each tab independent, no full-page reload.
- **ASC-041** — Payment idempotency (P0, EXISTING/REUSABLE): `Payment.idempotencyKey` field; duplicate requests with same key return original result. Dep: `payment.manage`. Error: key collision on different intent → 409. Acceptance: replayed webhook does not double-credit.
- **ASC-042** — Refund flow (P0, REUSABLE): `payment.refund` permission gates refund action; Action Engine precondition `Payment.status=APPROVED`. Dep: `payment.refund`. Error: refund on non-approved → 422. Acceptance: refund creates audit entry + `WalletTransaction` if applicable; amount never exceeds original.
- **ASC-043** — Return → Refund linkage (P1, NEEDS DEVELOPMENT): `Return.status=APPROVED` should auto-suggest a refund action. Dep: ASC-042, `returns.manage`. Error: refund without approved return → blocked. Acceptance: return approval creates a refund task, not an automatic refund.
- **ASC-044** — Fund movement boundary (P0, EXISTING policy): HEAVIX never holds buyer funds; gateway callbacks (`/api/store/payments/gateway/callback`) settle at the partner. Dep: none. Acceptance: no Store Center action moves custodial funds; refunds are accounting entries against partner settlements.

---

## 7. Leads, Customers & Sales Team

### 7.1 Critical gap

The `Lead` model (`prisma/schema.prisma:618`) has **only** `leadType` (CALL|MESSAGE|FAVORITE|CONTACT|VIEW|OFFER) — **no `status` field**. The existing `/api/seller/leads` route comments this out (`route.ts:31`: "Lead doesn't have status field, so we skip status filter for now"). The seller leads page (`/seller/leads/page.tsx`) calls `/api/ai-sales-agent` instead, not the leads API. A CRM pipeline requires a `status` column.

### 7.2 Capabilities

- **ASC-050** — Lead inbox (P0, NEEDS DEVELOPMENT): universal table over `Lead` joined to `Listing` (seller-scoped via `Listing.sellerId`). Dep: `Lead.status` field (ASC-052), `listing.read`. Expected: pipeline new → contacted → qualified → negotiation → won/lost. Error: lead on another seller's listing → 403. Acceptance: 100 leads load in <800ms; group-by-listing toggle.
- **ASC-051** — Sales team directory (P1, NEEDS DEVELOPMENT): PROPOSED `SalesTeamMember` model (name, role, photo, phone, email, `companyId`, active). Dep: `store.manage`. Expected: a company may have N members; showroom can surface them (ASC-070). Error: member without `companyId` → 400. Acceptance: members deletable; soft-delete retained for audit. **NEEDS DECISION:** reuse `Mechanic` (store schema) vs. new `SalesTeamMember` — `Mechanic` is automotive-specific; new model preferred.
- **ASC-052** — Lead `status` field (P0, NEEDS DEVELOPMENT): add `status String @default("NEW")` + `assignedToId String?` + `scoredAt DateTime?` to `Lead`. Dep: migration (§13). Acceptance: backfill existing leads to `NEW`; `/api/seller/leads` PATCH re-enabled.
- **ASC-053** — Lead Intelligence scoring (P2, NEEDS DEVELOPMENT): deterministic score from `leadType` weight (OFFER>CALL>MESSAGE>CONTACT>FAVORITE>VIEW), recency, listing price tier, buyer repeat. PROPOSED `LeadScore` model (or JSON column on `Lead`). Dep: ASC-052. Expected: score 0–100 shown to seller only. Error: insufficient data → score `null`. Acceptance: top-10 high-priority leads surface in dashboard ASC-012. **No LLM in v1** — deterministic only.
- **ASC-054** — Customer directory (P1, REUSABLE): `customersConfig` resource over `Customer` (store schema). Dep: `store.read`. Acceptance: PII fields (phone, nationalCode) gated by `customer.read.pii` (NEEDS DECISION: new permission) or existing `store.read`.

---

## 8. Machine Passport & Inspection Documents

### 8.1 Existing assets

- `MachinePassport` (`prisma/schema.prisma:1149`): `listingId @unique`, `serialNumber`, `inspectionDate`, `inspectionResult`, `events PassportEvent[]`. One passport per listing.
- `PassportEvent` (`schema.prisma:1161`): `eventType, title, description, date, performedBy` — immutable event log.
- `Inspection` (`schema.prisma:1351`): `status` (REQUESTED|SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED), `checklist` (JSON), `score` (0–100), `reportUrl`, `photos` (JSON), `notes`, `price`, `inspectorId`, `requestedBy`.

### 8.2 Capabilities

- **ASC-060** — Passport viewer (P1, REUSABLE): read-only view of `MachinePassport` + `PassportEvent[]` per `Listing`. Dep: `machine.read`. Expected: sections Specs / Ownership / Inspection / Documents / Verification. Error: passport missing → "create passport" CTA. Acceptance: one passport per listing enforced by `@unique`.
- **ASC-061** — Per-section verification status (P1, NEEDS DEVELOPMENT): each section carries `unverified | pending | verified | rejected`. PROPOSED: stored as JSON on `MachinePassport` (e.g. `sectionStatus Json?`) to avoid 5 new columns. Dep: ASC-060. Expected: public "Verified" badge requires all material sections `verified`. Error: partial verification shown to seller only, never public. Acceptance: badge flip audited as a `PassportEvent`.
- **ASC-062** — Inspection scheduling (P1, REUSABLE): `inspectionConfig` resource + `/api/inspections` + `/api/admin/inspections`. Dep: `inspection.manage`. Expected: REQUESTED → SCHEDULED → IN_PROGRESS → COMPLETED with `score` populated. Error: cancel after COMPLETED → 422. Acceptance: completed inspection writes a `PassportEvent` and refreshes ASC-032 score.
- **ASC-063** — Document provenance (P2, NEEDS DEVELOPMENT): each passport field/section records `source` (seller-claimed | inspector-verified | admin-verified | scraped) and `verifiedAt`. Dep: ASC-061. Acceptance: provenance visible to seller/admin, not public; scraper-sourced fields cannot alone flip a section to `verified`.
- **ASC-064** — Passport PDF export (P2, NEEDS DEVELOPMENT): export to financing partners. Dep: `store.financing.manage` (NEEDS DECISION — proposed key, see §14). Acceptance: export redacts buyer PII; audit entry per export.

---

## 9. VIP Subscription & Virtual Showroom

### 9.1 Existing assets

- `PremiumSubscription` (`schema.prisma:1126`): `userId @unique`, `plan`, `status` (default ACTIVE), `startedAt`, `expiresAt`, `featuredCredits`, `analyticsAccess`, `aiAssistantAccess`, `priorityLeads`, `companyPage`, `amount`, `paymentRef`.
- `SubscriptionPlan` (`schema.prisma:1100`): tier flags including `companyPage` (the VIP marker), `maxListings`, `maxImages`, `verifiedBadge`, `featuredCredits`, `analyticsAccess`, `aiAssistantAccess`, `priorityLeads`.

### 9.2 Server-side enforcement (NON-NEGOTIABLE)

Every showroom endpoint must verify the seller's active VIP subscription on each request. UI hiding alone is prohibited (per `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md` §3.2). Enforcement checks `PremiumSubscription.status='ACTIVE'` AND `expiresAt > now()` AND plan has `companyPage=true`.

### 9.3 Capabilities

- **ASC-070** — Showroom model (P0, NEEDS DEVELOPMENT): PROPOSED `Showroom` model (`companyId @unique`, `slug @unique`, `template`, `config Json`, `status`, `publishedAt`, `lastRenewedAt`). Dep: `PremiumSubscription`, `Company`. Expected: 1 showroom per company. Error: non-VIP publish → 403. Acceptance: showroom config validated server-side; client cannot assert tier.
- **ASC-071** — Public route `/showroom/[slug]` (P0, NEEDS DEVELOPMENT): server component, no login. Dep: ASC-070. Expected: VIP check per request; non-VIP → "showroom inactive" page (not 404). Error: subscription lapsed mid-session → graceful inactive page. Acceptance: URL stable across renewals; only goes inactive on expiry/cancel.
- **ASC-072** — Three templates (P1, NEEDS DEVELOPMENT): `dealer`, `manufacturer`, `used-equipment` (per VIP doc §6). Dep: ASC-070, Page Builder (`src/components/page-renderer/`). Expected: template presets are Page Builder configs. Acceptance: templates extensible via registry, not code.
- **ASC-073** — Quota enforcement (P0, NEEDS DEVELOPMENT): tier quotas (showcase machines, featured, sales-team profiles, campaigns, asset size) resolved server-side from `SubscriptionPlan`. Dep: ASC-070. Error: quota-exceeding save → 400 with upgrade CTA. Acceptance: no client-side quota bypass.
- **ASC-074** — Showroom analytics (P1, NEEDS DEVELOPMENT): PROPOSED `ShowroomAnalytics` aggregate (views, card clicks, contact actions, lead conversions). Dep: ASC-071, `showroom.read.analytics` (proposed). Expected: aggregated, no buyer PII to dealer. Error: cross-dealer analytics query → 403. Acceptance: raw retention 90d, aggregates 24mo.
- **ASC-075** — Expiry/grace/inactive flow (P1, NEEDS DEVELOPMENT): `currentPeriodEnd` → 7-day grace → inactive → 90-day config retention → archive. Dep: ASC-070. Acceptance: admin suspension (`showroom.admin`) bypasses grace immediately and audits.

---

## 10. Reports, Analytics & Export

### 10.1 Reuse map

- Universal Engine export (`src/lib/admin/bulk-export-engine.ts`) already enforces field-level EXPORT policy (`src/lib/admin/field-policy.ts:293` strips `payment.idempotencyKey`, `payment.trackingCode`, `user.passwordHash`).
- `analyticsConfig` resource registered (Phase 3 Batch 1).
- Existing analytics libs: `src/lib/analytics.ts`, `src/lib/bi-service.ts`, `src/lib/site-stats.ts`.

### 10.2 Capabilities

- **ASC-080** — Analytics dashboard (P1, REUSABLE): `/admin/analytics` + `analyticsConfig`. Dep: `analytics.read`. Expected: time-range selector (`src/app/admin/analytics/TimeRangeSelector.tsx`); metrics from existing data. Error: range > 12mo → 400. Acceptance: seller-scoped variant filters by `sellerId`.
- **ASC-081** — Custom report export (P1, REUSABLE): CSV/JSON via bulk-export-engine. Dep: `analytics.read` + per-field EXPORT permission. Expected: export columns = intersection of read + export permissions. Error: export of redacted field → silently stripped (not error). Acceptance: export audit entry per run; max 50k rows per export.
- **ASC-082** — Smart Inventory Score distribution report (P2, NEEDS DEVELOPMENT): histogram of scores across seller's listings. Dep: ASC-032. Acceptance: never implies sales guarantee in copy.
- **ASC-083** — Lead conversion funnel (P2, NEEDS DEVELOPMENT): Lead → Deal → closed. Dep: ASC-052, `Lead.status`. **NEEDS DECISION:** Deal-lead join key (no FK today).

---

## 11. Notifications, Tasks & Alerts

### 11.1 Existing assets

- `Notification` model (store schema) + `/api/notifications/*` (list, unread-count, read, read-all) + `src/components/notifications/NotificationBell.tsx`.
- Low-stock alerting: `/api/admin/store/inventory/low-stock` route + `src/lib/admin/store-monitoring-registry.ts`.
- Alert matching: `src/lib/alert-matcher.ts`.

### 11.2 Capabilities

- **ASC-090** — Notification center (P0, REUSABLE): `NotificationBell` + dropdown. Dep: authenticated. Expected: unread count badge; mark-read per item and bulk. Error: notification for another user → 403. Acceptance: bell polls every 60s; SSE/WebSocket optional (P2).
- **ASC-091** — Operational alerts (P1, REUSABLE): low-stock, payment-pending-stale, inspection-overdue. Dep: `store-monitoring-registry`. Expected: alerts generated by registry, surfaced as `Notification` rows. Error: registry misconfigured → alert skipped, logged. Acceptance: alert thresholds configurable per warehouse.
- **ASC-092** — Task queue (P2, NEEDS DEVELOPMENT): seller-facing task list (respond to lead, upload document, schedule inspection). Dep: `Notification` extended with `taskType` + `dueAt` (NEEDS DECISION: new fields vs. new `Task` model). Acceptance: tasks completable; completion audited.

---

## 12. Business Assistant

### 12.1 Existing assets

- `AIGatewayLog.taskType` includes `SELLER_ASSISTANT` (`schema.prisma:728`).
- `AITaskPolicy` + `AIBudget` (`schema.prisma:752, 775`) enforce per-task policy + budget caps.
- `src/lib/ai-policy.ts` denies tasks without an active policy row (deny-by-default).

### 12.2 Non-negotiable: human-in-the-loop

The assistant **never** mutates data autonomously. It proposes; a human (seller/admin) approves every mutation, which then flows through the normal Action Engine + audit path.

### 12.3 Capabilities

- **ASC-100** — Assistant surface (P1, NEEDS DEVELOPMENT): chat/suggestion panel in Store Center. Dep: `aiAssistantAccess=true` on `PremiumSubscription`, `ai.execute`. Expected: routes through `/api/ai-gateway` with `taskType=SELLER_ASSISTANT`; every call logged in `AIGatewayLog` with cost. Error: budget exhausted → 429 with retry-after; policy missing → 403. Acceptance: no LLM call bypasses `AITaskPolicy`.
- **ASC-101** — Onboarding checklist (P1, NEEDS DEVELOPMENT): static checklist (Phase 1, no LLM). Dep: ASC-100. Expected: tracks Company.verified, first listing, first inspection, showroom setup. Acceptance: checklist state persists per seller.
- **ASC-102** — Listing optimization hints (P2, NEEDS DEVELOPMENT): rule-based suggestions derived from Smart Inventory Score factors (Phase 2, deterministic). Dep: ASC-032. Acceptance: suggestion links to the exact field to edit.
- **ASC-103** — Conversational assistant (P2, NEEDS DEVELOPMENT): Phase 3 LLM via `SELLER_ASSISTANT`. Dep: ASC-100, `ai.policy.manage`. Expected: read-only queries over seller's own data; any proposed mutation rendered as a reviewable action card the user must click. Error: LLM proposes disallowed action (e.g. refund) → suggestion rejected server-side, not surfaced. Acceptance: zero autonomous mutations in audit log attributed to the assistant.
- **ASC-104** — Assistant boundaries (P0, EXISTING policy): no credit decisions, no financing submissions, no sale guarantees. Dep: none. Acceptance: copy review gate before ship; violation = P0 bug.

---

## 13. Data Model, Relations & Migrations

### 13.1 Existing vs proposed

| Concept | Status | Model | Schema | Notes |
|---|---|---|---|---|
| Company identity | EXISTING | `Company` | main | Reusable; needs additive fields (§4) |
| Listings | EXISTING | `Listing` | main | `sellerId`, `viewCount`, `verified`, `featured` |
| Leads | EXISTING (gap) | `Lead` | main | **No `status`** — ASC-052 adds it |
| Machine Passport | EXISTING | `MachinePassport` + `PassportEvent` | main | Needs `sectionStatus` (ASC-061) |
| Inspections | EXISTING | `Inspection` | main | Full status machine |
| Subscriptions | EXISTING | `PremiumSubscription`, `SubscriptionPlan` | main | `companyPage` = VIP flag |
| AI Gateway | EXISTING | `AIGatewayLog`, `AITaskPolicy`, `AIBudget` | main | `SELLER_ASSISTANT` ready |
| Orders/Payments/Returns/Shipments | EXISTING | store schema | store | 8 models, no duplicates |
| Inventory/Warehouses | EXISTING | store schema | store | + `StockMovement` |
| StoreProfile | NEEDS DECISION | — | — | Option A: extend `Company`; Option B: new model (§4) |
| Showroom | NEEDS DEVELOPMENT | `Showroom` | main | 1:1 with `Company` (§9) |
| ShowroomAnalytics | NEEDS DEVELOPMENT | `ShowroomAnalytics` | main | Aggregates only (§9) |
| SalesTeamMember | NEEDS DEVELOPMENT | `SalesTeamMember` | store or main | Prefer new over reusing `Mechanic` (§7) |
| LeadScore | NEEDS DEVELOPMENT | `LeadScore` (or JSON col) | main | Deterministic (§7) |
| Lead `status` | NEEDS DEVELOPMENT | additive column on `Lead` | main | ASC-052 |

### 13.2 Cross-schema boundary

The `database: 'store' | 'main'` flag on each resource config (`src/lib/admin/types.ts`) is the boundary. Cross-schema joins are done at the service layer, never via raw SQL. New sections mixing schemas must declare both resource configs.

### 13.3 Migration approach

- All proposed changes are **additive** (nullable columns or new models) — no breaking migration.
- `Lead.status` backfill: `UPDATE Lead SET status='NEW' WHERE status IS NULL`.
- `Showroom` created lazily on first VIP activation; no backfill needed.
- `SalesTeamMember`: optional; existing sellers continue without one.
- Migration order: ASC-052 (Lead) → ASC-060/061 (Passport) → ASC-070 (Showroom) → ASC-051 (SalesTeamMember) → ASC-053 (LeadScore).
- Each migration ships with a down-script (drop column / drop table) for rollback (§18).

---

## 14. API Contracts & Authorization Matrix

### 14.1 Reuse: Universal Resource API

All 36 registered resources are served by `/api/admin/resources/[resource]` and `/api/admin/resources/[resource]/[id]` (`src/app/api/admin/resources/`). Each call passes through `requireAdmin(permissionKey)` (`src/lib/admin-guard.ts`). Store-domain resources under `/api/admin/store/*` use the same guard with store-specific permission keys.

### 14.2 New endpoints (proposed)

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/api/admin/store/identity` | GET/PATCH | `store.manage` | Read/update own `Company` + profile extension |
| `/api/admin/store/leads` | GET/PATCH | `listing.read` (+ `store.crm` NEEDS DECISION) | Lead inbox with status pipeline |
| `/api/admin/store/passport/[listingId]` | GET | `machine.read` | Passport viewer |
| `/api/admin/store/passport/[listingId]/section-status` | PATCH | `inspection.manage` | Per-section verification |
| `/api/seller/showroom` | GET/PUT | `showroom.manage` + active VIP | Builder config |
| `/api/showroom/[slug]` | GET | public (VIP-checked server-side) | Public showroom |
| `/api/seller/showroom/analytics` | GET | `showroom.read.analytics` | Own analytics only |
| `/api/admin/store/assistant` | POST | `ai.execute` + `aiAssistantAccess` | SELLER_ASSISTANT gateway |

### 14.3 Permission matrix (per role, key resources)

NEEDS DECISION: the prior product doc proposed `store.crm`, `store.trust`, `store.financing.read/manage`, `store.analytics`, `store.vip.manage`, `store.admin`, `showroom.*`. None exist in `src/lib/authorization/permissions.ts` today. They must be added to `PERMISSIONS` + `ROLE_PERMISSIONS` + seeded via `prisma/seed-rbac.ts` + `prisma/seed-permission-matrix.ts` before any §14.2 endpoint ships.

| Resource | SELLER | VIP Dealer | ADMIN | MODERATOR |
|---|---|---|---|---|
| Listing (own) | read/create/update/publish | + showroom manage | all | read/moderate/publish |
| Order (own) | read | read | read/manage | read |
| Payment | — | — | read/manage/refund | read |
| Return (own) | read | read | read/manage | read |
| Inventory (own) | read/manage | read/manage | read/manage | read |
| Lead (own) | read/update (proposed `store.crm`) | + priority | all | read |
| Company (own) | read/update | read/update | read/verify | read |
| MachinePassport | read | read | read + section-status | read |
| Showroom | — | manage (VIP) | `showroom.admin` | — |
| Assistant | `ai.execute` + `aiAssistantAccess` | same | `ai.manage` | — |
| Financing referral | read (proposed) | read | read/manage | — |

### 14.4 Capability

- **ASC-110** — Authorization matrix seeding (P0, NEEDS DEVELOPMENT): add proposed permission keys to `PERMISSIONS` array + `ROLE_PERMISSIONS` + seed scripts. Dep: none. Error: missing key → `can()` returns false → 403 for all (the STEP 16-C gap pattern). Acceptance: every §14.2 endpoint has a seeded key; `tests/security/permissions.test.ts` extended.

---

## 15. Audit, Idempotency, Concurrency & Failure Handling

### 15.1 Existing assets

- `auditMutationTransactional` (`src/lib/admin/action-engine.ts:391`) — atomic audit + mutation.
- `SELECT FOR UPDATE` in `updateResource` (`src/lib/admin/data-adapter.ts:175`) — row-level lock, closes TOCTOU.
- Action Engine preconditions + atomic conditional updates.
- `Payment.idempotencyKey` — deduplicates payment requests.
- ADR-003 (`docs/ADR-003-audit-transactionality.md`) — audit transactionality contract.

### 15.2 Capabilities

- **ASC-120** — Audit every mutation (P0, REUSABLE): every Store Center write goes through Action Engine → `auditMutationTransactional`. Dep: none. Expected: audit entry co-committed with mutation. Error: audit write fail → entire transaction rolls back (no silent mutation). Acceptance: `tests/integration/audit-transaction-real.ts` green; no Store Center route calls raw `db.*.update` outside the engine.
- **ASC-121** — Idempotency on payments (P0, REUSABLE): `Payment.idempotencyKey` enforced. Dep: ASC-041. Error: replayed request returns cached result. Acceptance: `tests/integration/payment-concurrency-real.ts` green.
- **ASC-122** — Optimistic concurrency on updates (P0, REUSABLE): `SELECT FOR UPDATE` in `updateResource`. Dep: none. Error: lock timeout → 409 with retry hint. Acceptance: `tests/integration/readonly-when-concurrency-real.ts` green.
- **ASC-123** — Error states (P0, NEEDS DEVELOPMENT): standardized error envelope `{ error, code, field?, retryAfter? }`. Dep: none. Expected: 400 validation, 401 unauth, 403 forbidden (no bypass), 404 not-found, 409 conflict, 422 precondition, 429 rate-limit/budget, 500 unexpected. Acceptance: no route returns bare 500; all errors log to `error-tracking.ts`.
- **ASC-124** — Rate limiting (P1, REUSABLE): `src/lib/rate-limit.ts` + presets. Dep: none. Expected: assistant + export routes rate-limited per user. Acceptance: 429 returns `Retry-After`.

---

## 16. Accessibility, Responsive UX, SEO & Performance

### 16.1 Capabilities

- **ASC-130** — WCAG 2.1 AA (P1, NEEDS DEVELOPMENT): semantic `main/header/nav/section/article`; ARIA on universal-table actions; `sr-only` labels on icon-only buttons; keyboard nav for universal-table (Tab/Enter/Esc). Dep: none. Error: axe-core violation = P1 bug. Acceptance: zero critical axe violations on Store Center pages.
- **ASC-131** — Mobile-first responsive (P1, NEEDS DEVELOPMENT): all tables collapse to card list < `sm`; 44px touch targets; sticky footer pattern (`min-h-screen flex flex-col` + `mt-auto` footer). Dep: none. Acceptance: usable at 360px width.
- **ASC-132** — Showroom SEO (P1, NEEDS DEVELOPMENT): canonical URL per `/showroom/[slug]`; `sitemap.ts` entry; JSON-LD `Organization` + `ItemList` structured data; `metaTitle`/`metaDescription` from `Company`. Dep: ASC-071. Acceptance: Google Rich Results test passes for a sample showroom.
- **ASC-133** — Core Web Vitals (P1, NEEDS DEVELOPMENT): LCP < 2.5s, INP < 200ms, CLS < 0.1 on showroom + dashboard. Dep: ASC-071, ASC-010. Expected: showroom server-rendered, images `next/image` with priority on LCP. Acceptance: Lighthouse perf ≥ 90 on showroom.
- **ASC-134** — Dark mode (P2, REUSABLE): `next-themes` + `src/components/admin/theme-provider.tsx`. Acceptance: all Store Center pages respect theme.

---

## 17. Testing Strategy

### 17.1 Existing test infra

- Vitest configs: `vitest.config.ts`, `vitest.security.config.ts`, `vitest.e2e.config.ts`.
- Security suite: `tests/security/{permissions,field-policy,field-export-policy,preconditions,audit-transactionality,readonly-when-bypass,bulk-authorization,form-engine}.test.ts`.
- Contract suite: `tests/contract/*-contract.test.ts` (per-resource).
- Integration: `tests/integration/{audit-transaction-real,payment-concurrency-real,readonly-when-concurrency-real,auth}.test.ts`.

### 17.2 Capabilities

- **ASC-140** — Unit tests (P0, NEEDS DEVELOPMENT): resource config validation (fields, permissions, actions declared); Smart Inventory Score calculation pure function; Lead Intelligence scoring pure function. Dep: ASC-032, ASC-053. Acceptance: 100% of pure scoring functions covered.
- **ASC-141** — Integration tests (P0, NEEDS DEVELOPMENT): every §14.2 endpoint with DB; idempotency replay; `SELECT FOR UPDATE` contention; audit co-commit rollback. Dep: ASC-120/121/122. Acceptance: `tests/integration/store-center-*.test.ts` green.
- **ASC-142** — Security tests (P0, NEEDS DEVELOPMENT): authorization matrix per role per resource; field-policy READ/WRITE/EXPORT enforcement; VIP enforcement (non-VIP cannot publish showroom, cannot read others' analytics); assistant cannot mutate autonomously. Dep: ASC-110. Acceptance: extend `tests/security/permissions.test.ts` + new `tests/security/vip-enforcement.test.ts` + `tests/security/assistant-no-autonomous-mutation.test.ts`.
- **ASC-143** — Contract tests (P1, NEEDS DEVELOPMENT): per-resource contract (`tests/contract/store-center-*.test.ts`) for Lead, Showroom, Passport. Dep: ASC-110. Acceptance: contracts run in CI.
- **ASC-144** — E2E tests (P1, NEEDS DEVELOPMENT): seller onboarding → listing → lead → showroom publish flow via `vitest.e2e.config.ts`. Dep: all P0 capabilities. Acceptance: e2e green in CI.

---

## 18. Migration, Rollout, Rollback & Observability

### 18.1 Phased rollout

| Phase | Scope | Gate | Rollback |
|---|---|---|---|
| P1 — Foundation | ASC-110 (perm seeding) + ASC-052 (Lead.status) + ASC-120/121/122 (audit/idempotency/concurrency already REUSABLE) | Existing 36 resources still green; `tests/security/permissions.test.ts` green | Revert perm seed; drop `Lead.status` column |
| P2 — Identity & CRM | ASC-020 (identity) + ASC-050/051/052 (leads + sales team) | Seller can edit profile; lead pipeline works | Hide CRM section; leads read-only |
| P3 — Passport & Inspection | ASC-060/061/062 | Passport viewer live; section-status audited | Revert to read-only passport (no section status) |
| P4 — Smart Inventory Score | ASC-032 | Score recomputes < 24h | Hide score badge; job disabled |
| P5 — Showroom (VIP) | ASC-070/071/072/073/074/075 | VIP enforcement verified; 3 templates | Public route returns inactive page; builder hidden |
| P6 — Assistant | ASC-100/101/102/103/104 | Zero autonomous mutations in audit | Disable assistant panel; `AITaskPolicy` for SELLER_ASSISTANT set inactive |

### 18.2 Data migration for existing sellers

- Backfill `Lead.status = 'NEW'` (ASC-052).
- Create `Showroom` row lazily on first VIP activation (no bulk backfill).
- Existing `Company` rows: identity extension fields default null (Option A) or `StoreProfile` created on first edit (Option B).
- Existing `PremiumSubscription` rows: VIP eligibility re-evaluated from `SubscriptionPlan.companyPage`; no status change.

### 18.3 Rollback plan

- Every migration has a down-script (drop column / drop table).
- Feature flags (`src/app/admin/feature-flags/page.tsx`) gate each section; rollback = flag off.
- Showroom rollback: public route checks flag → returns inactive page (no 404).
- Assistant rollback: `AITaskPolicy.active=false` for `SELLER_ASSISTANT` → deny-by-default.

### 18.4 Observability

- **ASC-150** — Audit log (P0, REUSABLE): `/admin/audit-log` + `audit.read`. Every Store Center mutation appears. Dep: ASC-120. Acceptance: audit log searchable by user, resource, action, time.
- **ASC-151** — Error tracking (P0, REUSABLE): `src/lib/error-tracking.ts` + `src/lib/event-taxonomy.ts`. Dep: ASC-123. Expected: all 5xx logged with stack; 4xx sampled. Acceptance: no P0 error escapes tracking.
- **ASC-152** — Metrics (P1, REUSABLE): `/api/metrics` + `src/lib/metrics.ts` + `src/lib/performance-monitor.ts`. Expected: p50/p95 latency per endpoint; AI cost per task; export row count. Acceptance: dashboard surfaces p95 < 1.2s.
- **ASC-153** — AI budget monitoring (P0, REUSABLE): `AIBudget` daily/monthly caps; alert at 80%. Dep: ASC-100. Acceptance: budget exhaustion → 429 + alert, never overspend.
- **ASC-154** — Store monitoring registry (P1, REUSABLE): `src/lib/admin/store-monitoring-registry.ts` + `src/lib/admin/marketplace-monitoring-registry.ts`. Expected: low-stock, stale-payment, overdue-inspection alerts. Acceptance: alerts fire within 1h of threshold breach.

---

## Appendix A — Prohibitions (carried from prior product doc)

- ❌ No UI element may imply guaranteed sale, revenue, or return.
- ❌ No section may collect, hold, or move buyer/investor funds (HEAVIX is not a lender/escrow).
- ❌ No section may render a credit decision; only partners do (financing referrals gated, §6.7 of companion doc).
- ❌ No permission may be enforced by UI hiding alone.
- ❌ No cross-schema join may bypass the resource config `database` flag.
- ❌ No assistant mutation may execute without a human approval click.
- ❌ No showroom may publish without server-side VIP verification.
- ❌ No verification badge may display without backing model status.

## Appendix B — Open Decisions (owner must resolve)

1. StoreProfile: extend `Company` (Option A) vs. new `StoreProfile` model (Option B) — §4.
2. New permission keys (`store.crm`, `store.trust`, `store.financing.*`, `store.analytics`, `store.vip.manage`, `store.admin`, `showroom.*`) — confirm naming before seeding — §14.
3. `SalesTeamMember` vs. reuse `Mechanic` — §7 (recommend new model).
4. `LeadScore` as new model vs. JSON column on `Lead` — §7.
5. Smart Inventory Score storage: new `Listing` column vs. `meta` JSON — §5.
6. Lead → Deal join key (no FK today) — §10.
7. Task model: extend `Notification` vs. new `Task` model — §11.
8. Customer PII permission: new `customer.read.pii` vs. existing `store.read` — §7.
9. Passport export permission key (`store.financing.manage`) — §8.
10. Financing/investment features remain GATED pending legal review (per companion docs) — §6, §12.

---

**End of specification.**
