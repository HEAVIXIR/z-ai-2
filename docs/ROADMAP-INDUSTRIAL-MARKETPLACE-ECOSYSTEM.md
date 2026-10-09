# HEAVIX — Roadmap: Industrial Marketplace Ecosystem

> **Status:** PROPOSED — Integrated Product Roadmap (design only).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes. No fund collection.
> **Related:** All `docs/PRODUCT-*.md` documents in this initiative.

---

## 1. Vision

HEAVIX is an **integrated industrial machinery marketplace** that combines
commercial infrastructure (catalog, inventory, CRM, showroom) with financial
services facilitation (financing partnerships, investment framework) and a
distinctive brand experience (HEAVIX & MEKANIX mascot, AI assistant).

The platform's commercial and financial layers are **coordinated** but
**strictly separated** in responsibility: HEAVIX facilitates commerce and
information; partners and licensed operators handle credit decisions and fund
movement. HEAVIX never extends credit, never guarantees returns, and never
collects investor funds without legal compliance.

---

## 2. Strategic Principles

1. **Facilitator, not lender.** HEAVIX coordinates; partners decide credit.
2. **Design before funds.** Investment framework is design-only until legal
   gates pass.
3. **Reuse first.** The Universal Resource Engine, AI Gateway, and existing
   models are the foundation — new product layers configure, not rebuild.
4. **Server-side enforcement.** VIP, financing, and investment access are
   enforced at the API, never by UI hiding alone.
5. **Auditable by default.** Every state transition in commerce, financing, or
   investment is logged via the Action Engine (ADR-003).
6. **Brand coherence.** One mascot, two roles; one platform, eight Store Center
   sections; one roadmap, five phases.

---

## 3. Five-Phase Roadmap

The roadmap is sequenced from the owner's directive. Each phase has explicit
dependencies and a Definition-of-Done gate.

```
Phase 1: Documentation & Discovery  (CURRENT)
   │
   ▼
Phase 2: Store Management Center redesign
   │
   ▼
Phase 3: Machine credibility & financing (dossier, inspection, leasing)
   │
   ▼
Phase 4: Investment framework (design, legal gates, no real funds)
   │
   ▼
Phase 5: Smart brand experience (mascot, AI assistant, showroom campaigns)
```

### 3.1 Phase 1 — Documentation & Discovery (CURRENT)

- **Goal:** Establish the product architecture for the ecosystem.
- **Deliverables:** The six documents in this initiative (this file plus five
  `PRODUCT-*.md` files).
- **Gate:** All six documents reviewed and merged to `main`.

### 3.2 Phase 2 — Store Management Center Redesign

- **Goal:** Transform the 16 existing admin/store pages into 8 cohesive sections.
- **Deliverables:** See `docs/PRODUCT-ADMIN-STORE-CENTER.md`.
- **Gate:** All section-level and cross-cutting DoD met; existing CRUD paths
  remain green.

### 3.3 Phase 3 — Machine Credibility & Financing

- **Goal:** Machine Dossier + inspection workflow + financing partner
  integrations.
- **Deliverables:** See `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`.
- **Gate:** Dossier builder ships; first partner MOU signed before application
  submission goes live.

### 3.4 Phase 4 — Investment Framework

- **Goal:** Product design and legal gates for investment models A–D.
- **Deliverables:** See `docs/PRODUCT-MACHINERY-INVESTMENT.md`.
- **Gate:** Legal gate G1–G6 documented and signed before any capital pooling
  feature is enabled. **No real funds until compliance verified.**

### 3.5 Phase 5 — Smart Brand Experience

- **Goal:** Mascot integration, AI assistant, showroom campaigns.
- **Deliverables:** See `docs/PRODUCT-HEAVIX-MECHANICS-MASCOT.md` and
  `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md`.
- **Gate:** Mascot boundaries enforced; AI assistant respects `AITaskPolicy`
  budget; showroom campaigns audit-logged.

---

## 4. Dependencies

| From | To | Dependency Type |
|------|----|-----------------|
| Universal Resource Engine (PR #5 branch) | Phase 2 | Hard — Store Center reuses engine |
| Phase 2 (Store Center) | Phase 3 (Financing) | Soft — dossier uses Store Center data |
| Phase 3 (Financing) | Phase 4 (Investment) | Soft — investment reuses dossier concepts |
| Phase 2 (Store Center) | Phase 5 (Showroom) | Hard — showroom is Store Center §4 |
| AI Gateway (EXISTING) | Phase 5 (Assistant) | Hard — assistant uses `SELLER_ASSISTANT` |
| Legal review (external) | Phase 4 gate | Hard — no funds without sign-off |

The Universal Resource Engine is the **single hardest dependency**. Phases 2–5
all configure resources, fields, and actions through it. PR #5
(`feature/control-plane-hardening`) must remain stable for this roadmap to
proceed.

---

## 5. Existing Infrastructure (Reuse Inventory)

These assets are EXISTING in the codebase today and are the foundation for every
phase. New product layers must reuse, not rebuild.

### 5.1 Universal Resource Engine

- `src/lib/admin/resource-index.ts` — 36 resources registered.
- Each config declares `database: 'store' | 'main'`, permissions, columns,
  fields, actions, bulk actions, audit, detail tabs, relations.
- Field Policy (READ/WRITE/EXPORT) is backend-enforced.
- Action Engine supports preconditions, transactional audit, atomic conditional
  updates.

### 5.2 AI Gateway

- `AIGatewayLog.taskType` enum: `SEARCH | LISTING_BUILDER | PRICE_ANALYSIS |
  MARKET_ANALYST | SELLER_ASSISTANT | SCRAPER | MODERATION`.
- `AITaskPolicy` + `AIBudget` govern cost and rate.
- Reused by: Store Center §9 (assistant), Financing dossier (valuation),
  Investment evaluation (`MARKET_ANALYST`).

### 5.3 Main-Schema Models

- `Lead` — CRM foundation (Store Center §5).
- `Company`, `CompanyVerification`, `CompanyDocument`, `CompanyClaim`,
  `CompanyBranch` — trust & identity (Store Center §2, §6).
- `MachinePassport` — Verified Machine Passport (Store Center §8).
- `Inspection` — inspection records (Financing dossier, Store Center §6).
- `Listing`, `ListingImage`, `ListingOffer` — marketplace core.
- `PremiumSubscription`, `SubscriptionPlan` — VIP tier resolution (Showroom).

### 5.4 Store-Schema Models

- 33 models in `prisma/store-schema.prisma` including `Part`, `Order`,
  `Payment`, `Shipment`, `InventoryBalance`, `Warehouse`, `Supplier`,
  `RentalListing`, `RentalBooking`, `ServiceProvider`, `ServiceRequest`.
- Reused by: Store Center §3 (inventory), §7 (financing referral mirror),
  Investment Model D (rental income).

### 5.5 Existing Surfaces

- `/admin/store/` (16 pages) → consolidated into Store Center (Phase 2).
- `/seller/dashboard`, `/seller/leads` → migrated into Store Center §1, §5.
- `/admin/sellers/[id]` + `SellerDetailActions.tsx` → retained for platform
  admin seller oversight.
- `/sellers/[id]` → public seller profile; Showroom
  (`/showroom/[dealer-slug]`) is the VIP counterpart (Phase 5).

### 5.6 Audit & Governance

- ADR-001 (database strategy), ADR-002 (resource architecture), ADR-003
  (audit transactionality), ADR-004 (STEP 11.6 hardening).
- `seed-rbac.ts`, `seed-permission-matrix.ts` — canonical permission seeding.
- Action Engine audit — every state transition is immutable.

---

## 6. Phase Gate Criteria (Definition of Done)

### 6.1 Phase 1 Gate

- [ ] Six product documents created and reviewed.
- [ ] Dependencies on Universal Resource Engine documented.
- [ ] Legal-gate concept introduced for investment framework.
- [ ] No source code changes; no schema migrations.

### 6.2 Phase 2 Gate — Store Center

- [ ] 8 sections shipped with server-side RBAC.
- [ ] Smart Inventory Score (deterministic) live.
- [ ] Verified Machine Passport UI live.
- [ ] Heavix Business Assistant Phase 1–2 (static + deterministic) live.
- [ ] All 16 existing admin/store CRUD paths still functional.

### 6.3 Phase 3 Gate — Financing

- [ ] Machine Dossier builder ships.
- [ ] First financing partner MOU signed.
- [ ] Application submission flow live with partner.
- [ ] Buyer consent flow audit-logged.
- [ ] "Inspection ≠ credit approval" disclaimer present everywhere.

### 6.4 Phase 4 Gate — Investment

- [ ] Legal gate G1–G6 documented and signed.
- [ ] Escrow/custodian contract executed.
- [ ] KYC flow implemented and tested.
- [ ] `legalReviewStatus` gate field enforced server-side.
- [ ] **No real funds collected until all gates pass.**

### 6.5 Phase 5 Gate — Brand Experience

- [ ] Mascot assets shipped for Phase 1 surfaces.
- [ ] AI assistant (Phase 3) live within `AITaskPolicy` budget.
- [ ] VIP Virtual Showroom live with server-side enforcement.
- [ ] Campaigns audit-logged.
- [ ] Mascot boundaries enforced (no decisions, no diagnoses).

---

## 7. Risk Register

### 7.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Universal Resource Engine regression in PR #5 | Medium | High | Freeze engine contract before Phase 2 |
| Cross-schema join performance | Medium | Medium | Declare both resource configs; join at service layer |
| AI Gateway cost overrun in Phase 5 | Medium | Medium | `AITaskPolicy` + `AIBudget` enforced per task type |
| Showroom public-route load under traffic | Low | Medium | Server-side VIP check is cheap; cache inactive-page |

### 7.2 Legal Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unauthorized fund solicitation | Low | Critical | Hard legal gate; `legalReviewStatus` field enforced |
| Guaranteed-return claims in copy | Medium | High | Copy review against prohibited-claims list |
| Cross-border investor restrictions | Medium | High | G1 jurisdiction documentation; per-market gating |
| Buyer-data sharing without consent | Low | High | Consent timestamp audit-logged; partner auth per request |

### 7.3 Financial Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Commingling platform & investor funds | Low | Critical | Escrow mandatory; HEAVIX accounts never receive investor funds |
| Inventory carrying loss (Model A) | Medium | High | Risk disclosure mandatory; no guaranteed-return copy |
| Buyer default (Model B) | Medium | Medium | Partner-owned receivable; HEAVIX not exposed |
| Rental vacancy (Model D) | Medium | Medium | Operator-owned; HEAVIX mirrors status only |

### 7.4 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mascot trivializes serious risk | Medium | High | Boundary rules in mascot doc; copy review |
| Partner SLA gaps | Medium | Medium | Partner status mirror; HEAVIX not liable for partner delays |
| VIP expiry mid-deal | Low | Medium | 7-day grace; 90-day config retention |
| Showroom policy violation | Low | Medium | `showroom.admin` suspend; immediate takedown |

---

## 8. Prohibited Actions (Platform-Wide)

These prohibitions apply across all phases and override any per-document
allowance.

- ❌ **No guaranteed returns.** No UI, copy, or AI output may promise a return on
  any investment model.
- ❌ **No direct fund collection without legal compliance.** Capital pooling
  features stay inert until the legal gate (G1–G6) passes.
- ❌ **No credit decisions by the platform.** HEAVIX does not approve, reject,
  or price financing — only partners do.
- ❌ **No UI-only access control.** VIP, financing, and investment permissions
  are enforced server-side.
- ❌ **No mascot near decisions.** The mascot never appears on credit,
  investment, inspection-result, or risk-disclosure screens.
- ❌ **No commingled funds.** Platform operational accounts never receive
  investor capital.
- ❌ **No cross-schema bypass.** Cross-database reads must declare both
  resource configs; no raw cross-database SQL.
- ❌ **No scope bleed into PR #5.** This initiative is on
  `docs/product-architecture-initiative` and does not modify
  `feature/control-plane-hardening`.

---

## 9. Document Index (This Initiative)

| Document | Scope |
|----------|-------|
| `docs/PRODUCT-ADMIN-STORE-CENTER.md` | Store Management Center (8 sections) |
| `docs/PRODUCT-MACHINERY-INVESTMENT.md` | Investment framework (Models A–D) |
| `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` | Bank/leasing partner model |
| `docs/PRODUCT-VIP-VIRTUAL-SHOWROOM.md` | VIP showroom product |
| `docs/PRODUCT-HEAVIX-MECHANICS-MASCOT.md` | Mascot identity & boundaries |
| `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md` | This document |

---

## 10. Relationship to Prior Work

This roadmap builds on the existing HEAVIX documentation set, including:

- `docs/HEAVIX-PROJECT-PRINCIPLES.md` — governing principles (authoritative).
- `docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md` — execution architecture reference.
- `docs/HEAVIX-SECURITY-BASELINE-V1.md` — non-negotiable security principles.
- `docs/HEAVIX-DATA-GOVERNANCE-V1.md` — data canonicality & lifecycle.
- `docs/STORE-MARKETPLACE-CONTROL-PLANE.md` — control-plane status.
- `docs/ADR-001` through `docs/ADR-004` — architecture decisions.

In case of conflict, the authority order in `HEAVIX-PROJECT-PRINCIPLES.md`
governs. This roadmap is **subordinate** to those documents and introduces no
principle that contradicts them.

---

## 11. Acceptance Criteria (Definition of Done — Roadmap)

- [ ] Five phases sequenced with dependencies.
- [ ] Reuse inventory references real file paths and model names.
- [ ] Phase gates have explicit, testable criteria.
- [ ] Risk register covers technical, legal, financial, operational.
- [ ] Prohibited-actions list is platform-wide and overrides per-doc allowances.
- [ ] Document index links every product document in this initiative.
- [ ] Relationship to prior work is subordinate, not contradictory.
- [ ] No source code changes; no schema migrations; no fund collection.

---

## 12. Out of Scope

- Source code changes (this is a product roadmap, not an implementation plan).
- Schema migrations (data models are proposed in their respective documents).
- Specific vendor selection (escrow, custodian, financing partners).
- Marketing launch sequencing (owned by marketing).
- Localization beyond English in this phase (owned by localization when added).
- Anything in PR #5 (`feature/control-plane-hardening`) scope.

---

**End of document.**
