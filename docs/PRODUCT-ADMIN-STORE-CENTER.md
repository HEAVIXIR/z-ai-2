# HEAVIX — Product: Admin Store Center

> **Status:** PROPOSED — Product Architecture Specification (not implemented).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes.
> **Related:** `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md`, `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md`, `docs/STORE-MARKETPLACE-CONTROL-PLANE.md`

---

## 1. Purpose

Transform the existing `/admin/store/` dashboard from a fragmented collection of
16 CRUD pages into a single, role-aware **Store Management Center** — the unified
workspace where sellers, store operators, and platform admins manage catalog,
inventory, leads, trust, financing referrals, and analytics for industrial
machinery commerce.

This document is a **product design** document. It does not specify table
migrations or component code; it specifies the experience, sections, permissions,
data ownership, and acceptance criteria that any later implementation must satisfy.

---

## 2. Current State Analysis (EXISTING)

The following assets already exist in the codebase and are the foundation for the
Store Center redesign. Nothing in this section is proposed — it is the inventory of
reusable infrastructure.

### 2.1 Admin Store Pages — 16 EXISTING

Located at `src/app/admin/store/`:

| # | Page | Purpose |
|---|------|---------|
| 1 | `page.tsx` (dashboard) | Store KPI overview |
| 2 | `categories/` | Store catalog categories |
| 3 | `orders/` | Order management |
| 4 | `currency/` | Currency rates & settings |
| 5 | `car-models/` | Car/machine model registry |
| 6 | `mechanics/` | Mechanic directory |
| 7 | `ai-scraper/` | AI scraper console |
| 8 | `suppliers/` | Supplier directory |
| 9 | `returns/` | Return processing |
| 10 | `shipments/` | Shipment tracking |
| 11 | `payments/` | Payment records |
| 12 | `parts/` | Parts catalog |
| 13 | `inventory/` | Inventory balances |
| 14 | `warehouses/` | Warehouse directory |
| 15 | `customers/` | Customer directory |
| 16 | `brands/` | Brand directory |

### 2.2 Store API Surface — 20+ Routes EXISTING

Located at `src/app/api/admin/store/`: `ai-scraper`, `brands`, `car-models`,
`categories`, `currency`, `customers`, `health`, `inventory`, `logistics`,
`mechanics`, `orders`, `parts`, `payments`, `procurement`, `rentals`, `returns`,
`services`, `shipments`, `stats`, `suppliers`, `warehouses`.

### 2.3 Store Schema — 33 Models EXISTING

Defined in `prisma/store-schema.prisma`. Confirmed models include: `AdminUser`,
`Customer`, `Mechanic`, `CarModel`, `Category`, `Brand`, `Part`, `Order`,
`OrderItem`, `Payment`, `Shipment`, `CurrencyRate`, `CurrencySetting`, `Setting`,
`Review`, `Wishlist`, `Coupon`, `WalletTransaction`, `Notification`, `Supplier`,
`StockMovement`, `Warehouse`, `InventoryBalance`, `Return`, `ReturnItem`,
`ProcurementRequest`, `PurchaseOrder`, `PurchaseOrderItem`, `ShipmentTracking`,
`RentalListing`, `RentalBooking`, `ServiceProvider`, `ServiceRequest`.

### 2.4 Seller Surfaces EXISTING

- `src/app/seller/dashboard/` — seller dashboard
- `src/app/seller/leads/` — lead management
- `src/app/admin/sellers/page.tsx` — platform admin seller directory
- `src/app/admin/sellers/[id]/page.tsx` + `SellerDetailActions.tsx` — seller detail
- `src/app/sellers/[id]/page.tsx` — public seller profile

### 2.5 Main Schema Reusable Assets EXISTING

- `Lead` model — `leadType`, `status`, etc. (foundation for CRM section)
- `Company` + `CompanyVerification`, `CompanyDocument`, `CompanyClaim` — trust data
- `MachinePassport` model — already defined (foundation for Verified Machine Passport)
- `Inspection` model — existing inspection records
- `AIGatewayLog` / `AITaskPolicy` with `taskType` enum including
  `SEARCH | LISTING_BUILDER | PRICE_ANALYSIS | MARKET_ANALYST | SELLER_ASSISTANT |
  SCRAPER | MODERATION` — foundation for Heavix Business Assistant

### 2.6 Universal Resource Engine EXISTING

`src/lib/admin/resource-index.ts` registers **36 resources** today. Each resource
config declares `database: 'store'` or `database: 'main'`, plus `permissions`,
`columns`, `fields`, `actions`, `bulkActions`, `audit`, `detailTabs`, `relations`.
Field Policy (READ/WRITE/EXPORT) and Action Engine (preconditions, transactional
audit, atomic conditional updates) are already implemented.

---

## 3. Proposed Architecture — 8 Sections

The Store Management Center is organized into 8 sections, each with its own
permission scope, data ownership, and Definition of Done.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  HEAVIX Store Management Center                     │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│ 1. Overview  │ 2. Identity  │ 3. Inventory │ 4. Virtual Showroom   │
│    Dashboard │    & Branding│    & Catalog │    (VIP link)         │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ 5. Leads /   │ 6. Trust &   │ 7. Financing │ 8. Analytics & VIP    │
│    CRM /     │    Verif.    │    & Invest. │    Performance        │
│    Sales Team│              │    Referrals │                       │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
```

### 3.1 Section 1 — Overview Dashboard

- KPI cards: active inventory, open leads (this week), verification status,
  showroom views, financing applications in progress.
- Activity feed: recent orders, returns, inspections, AI assistant suggestions.
- Section deep-links; each card respects the user's RBAC scope.

### 3.2 Section 2 — Identity & Branding

- Seller/company profile fields (name, logo, banner, description, contact).
- Brand association (link to existing `Brand` model).
- Branch/location management (existing `CompanyBranch`).
- Public profile preview (mirrors `/sellers/[id]`).

### 3.3 Section 3 — Inventory & Catalog

- Catalog table (machines, parts) reusing Universal Resource Engine.
- **Smart Inventory Score** badge per item (see §7).
- **Verified Machine Passport** link per machine (see §8).
- Bulk actions: list, delist, transfer warehouse, export.
- Procurement & purchase order access (existing models).

### 3.4 Section 4 — Virtual Showroom (link to VIP)

- Shortcut into the VIP Virtual Showroom builder (see
  `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md`).
- Visibility into showroom views, contacts, conversion.
- VIP tier indicator and quota usage.

### 3.5 Section 5 — Leads / CRM / Sales Team

- Lead inbox reusing the existing `Lead` model.
- Lead assignment to internal sales team members.
- Lead status pipeline (new → contacted → qualified → negotiation → won/lost).
- Sales team directory (reuse `Mechanic` + new sales-staff concept).
- Conversion analytics (lead → deal).

### 3.6 Section 6 — Trust & Verification

- Company verification status (reuse `CompanyVerification`).
- Document upload & review (reuse `CompanyDocument`).
- Per-machine verification status (links to Machine Passport).
- Inspection scheduling (reuse `Inspection` model).
- Badges: identity verified, machine inspected, documents complete.

### 3.7 Section 7 — Financing & Investment Referrals

- **HEAVIX is NOT a lender.** This section surfaces *referrals* to bank/leasing
  partners and investment opportunities (see
  `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` and
  `docs/PRODUCT-MACHINERY-INVESTMENT.md`).
- Buyer financing application status (read-only mirror of partner decisions).
- Investment opportunity participation summary (capital pool status).
- All fund movement is handled by partners / escrow — never by HEAVIX.

### 3.8 Section 8 — Analytics & VIP Performance

- Sales performance, lead conversion, showroom engagement.
- Smart Inventory Score distribution.
- VIP subscription status & tier benefits.
- Custom report export (respecting field-level EXPORT policy).

---

## 4. User Journeys

### 4.1 Seller Onboarding

1. Seller signs up; `Company` record created (unverified).
2. Heavix Business Assistant (§9) guides identity & branding completion.
3. Seller uploads ownership documents → §6 verification queue.
4. Seller adds first inventory → §3 catalog; Smart Score computed.
5. Verification approved → showroom unlock (VIP subscription required for §4).
6. Assistant suggests inspection booking for high-value machines.

### 4.2 Inventory Management

1. Seller opens §3 Inventory & Catalog.
2. Adds a machine via Universal Resource Engine form (existing `machineConfig`).
3. Smart Inventory Score appears immediately (no sales claim attached).
4. Seller triggers a Verification request → Machine Passport draft created.
5. Inspection booked → Passport section "Inspection" populated.
6. On approval, "Verified" badge displays on `/sellers/[id]` and showroom.

### 4.3 Lead Conversion

1. Buyer submits a Lead (existing `Lead` model) on a listing.
2. Lead lands in §5 inbox; assigned automatically by territory/category rules.
3. Sales team member contacts the buyer; status updated.
4. Lead qualified → negotiation → Deal created (existing marketplace flow).
5. If buyer needs financing, seller refers to §7 (partner decision, not HEAVIX).

### 4.4 Showroom Setup

1. Seller upgrades to VIP subscription (§4 unlocks).
2. Showroom builder opens (config-driven, see
   `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md`).
3. Seller picks template (dealer / manufacturer / used equipment).
4. Branding applied (logo, banner, colors) — reuse §2 identity.
5. Featured machines selected (within VIP quota).
6. Public URL generated (e.g. `/showroom/[dealer-slug]`).
7. Visit analytics appear in §8.

---

## 5. Permissions (RBAC)

All permissions are enforced server-side via the Universal Resource Engine Field
Policy and Action Engine. UI hiding alone is prohibited.

| Permission Key | Scope | Typical Role |
|----------------|-------|--------------|
| `store.read` | Read any Store Center section | Store operator, seller |
| `store.manage` | Write catalog, inventory, orders | Store operator |
| `store.crm` | Manage leads & sales team | Sales lead |
| `store.trust` | Manage verification & documents | Trust reviewer |
| `store.financing.read` | View financing referral status | Seller, operator |
| `store.financing.manage` | Submit referrals to partners | Operator |
| `store.analytics` | View analytics & exports | Store manager |
| `store.vip.manage` | Manage own showroom | VIP seller |
| `store.admin` | Platform-level store administration | Platform admin |

Permissions are additive and scoped per `Company` (seller-scoped) unless the role
is platform-wide (`store.admin`). The existing `seed-permission-matrix.ts` and
`seed-rbac.ts` scripts are the canonical seeding mechanism for new keys.

---

## 6. Data Ownership

| Concept | Schema | Owner Model | Notes |
|---------|--------|-------------|-------|
| Store catalog (parts, orders, payments) | store | `Part`, `Order`, `Payment` | Existing |
| Inventory balances & warehouses | store | `InventoryBalance`, `Warehouse` | Existing |
| Sellers, companies, verification | main | `Company`, `CompanyVerification` | Existing |
| Listings & machines | main | `Listing`, `MachinePassport` | Existing |
| Leads & CRM | main | `Lead` | Existing; CRM extends status |
| Inspections | main | `Inspection` | Existing |
| Investment opportunities | main | `InvestmentOpportunity` (PROPOSED) | See investment doc |
| Financing applications | main | `FinancingApplication` (PROPOSED) | See financing doc |

The boundary is enforced today by the `database: 'store' | 'main'` flag on each
Universal Resource Engine config. Any new section that mixes schemas must declare
both resource configs and join at the service layer, never via raw cross-database
SQL.

---

## 7. Smart Inventory Score

### 7.1 Definition

A **relative, informational** score (0–100) that reflects how complete and
credible a machine listing appears on the platform. It is **not** a guarantee of
sale, demand, or price. It is a seller-facing optimization hint.

### 7.2 Input Factors

| Factor | Weight (conceptual) | Source |
|--------|---------------------|--------|
| Completeness of specs | 25% | Listing attributes filled |
| Media coverage (photos, video) | 15% | `ListingImage` count + types |
| Verification status | 20% | `CompanyVerification` + Machine Passport |
| Inspection freshness | 15% | `Inspection` recency |
| Documentation completeness | 15% | Ownership documents present |
| Engagement signal | 10% | Views, saves, inquiries (last 30d) |

### 7.3 Calculation Approach

- Computed by a periodic job (reuses AI Gateway `MARKET_ANALYST` infrastructure
  conceptually, but the score itself is deterministic, not LLM-generated).
- Stored as a denormalized field on the Listing (PROPOSED) for fast read.
- Recomputed on: attribute change, inspection completion, document upload,
  verification change, and nightly batch.
- **Prohibited:** the score must never be displayed as a sales guarantee, a price
  predictor, or a financing qualifier. UI copy must say "completeness indicator"
  or similar neutral language.

### 7.4 Acceptance Criteria

- Score visible only to listing owner and platform admins, not public buyers
  (public buyers see the "Verified" badge instead, which is a binary credential).
- Score updates within 24h of any input change.
- No UI element implies guaranteed sale or revenue.

---

## 8. Verified Machine Passport

### 8.1 Concept

A digital record per machine that consolidates specs, history, inspection, and
documents — surfaced to buyers as a single, trustworthy artifact. The
`MachinePassport` model already EXISTS in the main schema; this section specifies
its product behavior.

### 8.2 Passport Sections

| Section | Content | Source Model |
|---------|---------|--------------|
| Specs | Manufacturer, model, year, hours, configuration | `Listing` attributes + `ProductModel` |
| Ownership & history | Current owner, prior transactions, location | `Company`, `Listing` |
| Inspection | Latest inspection report, inspector, date, findings | `Inspection` |
| Documents | Title, registration, maintenance records | `CompanyDocument` (extended) |
| Verification status | Per-section verification flags | `CompanyVerification` + new per-section flags |

### 8.3 Verification Status Per Section

Each section carries an independent status: `unverified | pending | verified |
rejected`. A machine earns the public "Verified" badge only when **all material
sections** are `verified`. Partial verification is shown to the seller only, not
to public buyers.

### 8.4 Acceptance Criteria

- One Passport per machine, immutable audit log of status transitions.
- Passport data is read-only to buyers; editable only by seller + trust reviewer.
- Passport export (PDF) available to the seller and to financing partners
  (subject to `store.financing.manage` permission).

---

## 9. Heavix Business Assistant

### 9.1 Concept

An AI-guided assistant that helps sellers complete onboarding, optimize listings,
and understand Store Center features. Built on the EXISTING AI Gateway
`SELLER_ASSISTANT` task type (already in `AIGatewayLog.taskType` enum).

### 9.2 Capabilities

- Onboarding checklist guidance ("next step: upload ownership document").
- Listing optimization hints based on Smart Inventory Score factors.
- Suggested inspection timing for high-value machines.
- FAQ-style help ("how do I respond to a lead?").
- **Boundaries:** the assistant never makes credit decisions, never promises
  sales, never submits financing applications on the seller's behalf. It guides
  only; humans act.

### 9.3 Rollout Phasing

- **Phase 1:** Static checklist + contextual help text (no LLM call).
- **Phase 2:** Rule-based suggestions (deterministic, no LLM).
- **Phase 3:** LLM-powered conversational assistant via AI Gateway
  `SELLER_ASSISTANT` task type, subject to `AITaskPolicy` budget and moderation.

---

## 10. Reuse Opportunities

| Existing Asset | Reused For |
|----------------|------------|
| Universal Resource Engine (36 configs) | All catalog/inventory/CRM tables |
| Field Policy (READ/WRITE/EXPORT) | Per-section RBAC enforcement |
| Action Engine (preconditions, audit) | All mutating actions in Store Center |
| `Lead` model (main) | §5 CRM section |
| `Company` + `CompanyVerification` | §6 Trust section |
| `MachinePassport` model | §8 Verified Machine Passport |
| `Inspection` model | §6 inspection scheduling |
| `seller/dashboard`, `seller/leads` | Migrate into §1, §5 |
| `/sellers/[id]` public profile | §2 identity preview |
| AI Gateway `SELLER_ASSISTANT` | §9 Heavix Business Assistant |
| `seed-rbac.ts`, `seed-permission-matrix.ts` | New permission keys seeding |

---

## 11. Acceptance Criteria (Definition of Done)

### Section-level DoD

- [ ] §1 Overview: KPI cards render per-RBAC; empty states for non-permitted sections.
- [ ] §2 Identity: company profile editable; preview matches `/sellers/[id]`.
- [ ] §3 Inventory: Smart Inventory Score displays; Passport link active.
- [ ] §4 Showroom: deep-link to VIP builder works; analytics surface in §8.
- [ ] §5 CRM: leads flow from existing `Lead` model; assignment works.
- [ ] §6 Trust: verification status per section; badge only on full verification.
- [ ] §7 Financing: referrals surface partner status; no fund movement in HEAVIX.
- [ ] §8 Analytics: exports respect EXPORT field policy.

### Cross-cutting DoD

- [ ] Every section has a documented permission key enforced server-side.
- [ ] No section implies guaranteed sale, guaranteed return, or credit approval.
- [ ] Every mutating action is audited via Action Engine.
- [ ] All schema-spanning reads declare both resource configs explicitly.

---

## 12. Dependencies

- **Universal Resource Engine completion** (STEP 11.x control-plane hardening,
  PR #5 branch `feature/control-plane-hardening`) — must remain stable.
- **Field Policy** enforcement for READ/WRITE/EXPORT — already implemented.
- **Audit transactionality** (ADR-003) — already implemented.
- **AI Gateway** `SELLER_ASSISTANT` policy & budget — already configured.
- **VIP Virtual Showroom** (`docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md`) — §4 depends
  on showroom builder availability.
- **Financing & Investment docs** — §7 depends on those frameworks being
  designed (this initiative delivers the design; implementation is gated).

---

## 13. Phased Delivery

| Phase | Scope | Gate |
|-------|-------|------|
| P1 — Consolidation | Merge 16 pages into 8 sections; reuse existing resources | All existing CRUD paths still green |
| P2 — Identity & Trust | §2 + §6 with Machine Passport UI | Passport status transitions audited |
| P3 — Inventory intelligence | §3 Smart Inventory Score (deterministic) | Score recomputes within 24h |
| P4 — CRM & Assistant | §5 leads pipeline + §9 Phase 1–2 assistant | Lead status machine works; no LLM yet |
| P5 — Analytics & VIP integration | §8 + §4 deep-link + §9 Phase 3 LLM | AI budget respected; exports enforced |

Each phase is independently shippable. No phase introduces fund movement, credit
decisions, or guaranteed-return language.

---

## 14. Out of Scope

- Source code changes (this is a product design document).
- migrations to `prisma/store-schema.prisma` or `prisma/schema.prisma`.
- AI prompt engineering details for the assistant (deferred to Phase 5 design).
- Marketing copy and brand voice (owned by marketing, not this doc).
- Anything in PR #5 (`feature/control-plane-hardening`) scope.

---

## 15. Prohibitions

- ❌ No UI element may imply guaranteed sale or guaranteed revenue.
- ❌ No section may collect, hold, or move investor/buyer funds.
- ❌ No section may render a credit decision; only partners do.
- ❌ No permission may be enforced by UI hiding alone.
- ❌ No cross-schema join may bypass the resource config boundary.

---

**End of document.**
