# HEAVIX — Product: Financing & Leasing Partnerships

> **Status:** PROPOSED — Product Architecture Specification (not implemented).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes.
> **Related:** `docs/PRODUCT-MACHINERY-INVESTMENT.md`,
> `docs/PRODUCT-ADMIN-STORE-CENTER.md`

---

## 1. Purpose

Define how HEAVIX partners with banks and leasing companies to offer financing
and leasing options to machinery buyers — while keeping HEAVIX strictly in the
role of **platform facilitator**, never lender. Credit decisions are made by
partners, not by HEAVIX. This document specifies the partnership model,
information exchange, application flow, permissions, and the disclaimers that
must accompany every financing touchpoint.

> ⚠️ **HEAVIX is NOT a lender.** Nothing in this document authorizes HEAVIX to
> extend credit, set interest rates, or approve financing. HEAVIX prepares and
> transmits information; partners decide.

---

## 2. Design Principles

1. **Facilitator, not lender.** HEAVIX assembles a dossier; partners decide.
2. **Information transparency.** Buyers know what data HEAVIX shares and with
   whom.
3. **Server-side enforcement.** VIP/financing access is enforced at the API,
   never by UI hiding alone.
4. **No credit guarantees.** A HEAVIX inspection is **not** a credit approval.
5. **Partner autonomy.** Partners may approve, reject, or counter-offer on their
   own criteria without HEAVIX interference.
6. **Auditability.** Every application state transition is logged (reuses Action
   Engine audit, ADR-003).

---

## 3. Partnership Model

### 3.1 Roles

| Role | Actor | Responsibility |
|------|-------|----------------|
| Platform facilitator | HEAVIX | Prepare dossier, transmit application, mirror partner status |
| Financing partner | Bank / leasing company | Credit decision, contract, disbursement, servicing |
| Buyer | End customer | Applies for financing, signs contract with partner |
| Seller | HEAVIX seller | Provides machine information, may refer buyer |

### 3.2 HEAVIX Does NOT

- ❌ Set interest rates, tenors, or fees.
- ❌ Approve or reject applications.
- ❌ Hold buyer funds (except escrow for purchase, separately governed).
- ❌ Guarantee partner decisions.
- ❌ Represent that a buyer will be approved.

### 3.3 HEAVIX DOES

- ✅ Assemble a **Machine Dossier** (§4) from platform data.
- ✅ Assemble a **Buyer Assessment Packet** (§5) from platform history.
- ✅ Transmit the dossier + packet to a partner via the application flow (§6).
- ✅ Mirror the partner's status on the buyer's dashboard.
- ✅ Provide a single audit trail across the application lifecycle.

---

## 4. Machine Dossier

The dossier is the asset-side information package HEAVIX prepares for the partner.
It is generated from existing platform data plus the seller's contributions.

### 4.1 Dossier Contents

| Section | Content | Source Model (EXISTING unless noted) |
|---------|---------|--------------------------------------|
| Asset identification | Make, model, year, serial, configuration | `Listing` attributes + `ProductModel` |
| Ownership & title | Current owner, prior transactions | `Company`, `Listing` |
| Inspection report | Latest inspection findings, inspector, date | `Inspection` |
| Market valuation | Price analysis + comparable sales | AI Gateway `PRICE_ANALYSIS` task type |
| Condition assessment | Hours, wear, refurbishment history | `MachinePassport` |
| Documents | Title, registration, maintenance records | `CompanyDocument` |
| Media | Photos, video | `ListingImage` |

### 4.2 Dossier Generation

- Triggered by the buyer (or seller on buyer's behalf) when applying for
  financing.
- Compiled by the platform automatically from existing models — no manual data
  entry by the buyer.
- Reviewed by the seller for completeness before submission.
- Exported to the partner via the application flow (§6) in an agreed format
  (PROPOSED: signed PDF + structured JSON payload).

### 4.3 Disclaimer (mandatory)

Every dossier carries the disclaimer: *"This dossier is prepared by HEAVIX from
platform data. It is informational only and does not constitute a credit
recommendation, an appraisal, or a guarantee of asset condition. The financing
partner makes an independent credit and valuation decision."*

---

## 5. Buyer Assessment

HEAVIX provides platform-side buyer data to the partner. The partner makes the
credit decision independently using that data **plus** their own checks (credit
bureau, income verification, etc.).

### 5.1 What HEAVIX Shares (with buyer consent)

| Data | Source | Shared With Partner |
|------|--------|---------------------|
| Buyer identity (KYC basics) | `User` / `Company` | Yes, on application |
| Platform transaction history | `Order`, `Lead`, `ListingOffer` | Yes, summary |
| Platform reputation signals | `Review`, dispute history | Yes, summary |
| Saved/favorited machines | `Favorite`, `SavedSearch` | No (irrelevant) |
| Buyer-stated income/financials | Not collected by HEAVIX | N/A — partner collects directly |

### 5.2 What the Partner Decides Independently

- Credit score / bureau check.
- Income and affordability verification.
- Risk-based pricing (rate, tenor, down payment).
- Collateral acceptance (the machine itself or additional).
- Final approval, rejection, or counter-offer.

### 5.3 Buyer Consent

- Buyer must explicitly consent before dossier + assessment packet are
  transmitted. Consent is recorded with a timestamp and audit log entry.
- Buyer may withdraw consent pre-decision; after decision, the audit record
  remains but no further data is shared.

---

## 6. Application Flow

```
[Partner Registration] → [Application Submission] → [Partner Review]
   → [Approval / Rejection / Counter] → [Contract] → [Disbursement]
```

### 6.1 Partner Registration

- Partner is onboarded by HEAVIX platform admin (`financing.partner` perm).
- Partner profile stores: legal name, jurisdiction, API endpoint or contact
  channel, supported financing products, accepted asset categories.
- PROPOSED model: `FinancingPartner` (main schema, design-only).

### 6.2 Application Submission

- Buyer selects a machine and "Apply for financing".
- HEAVIX assembles the dossier (§4) and buyer assessment packet (§5).
- Buyer reviews and consents.
- Application is transmitted to the chosen partner.
- PROPOSED model: `FinancingApplication` (main schema, design-only).

### 6.3 Partner Review

- Partner reviews dossier + packet, runs their own credit checks.
- Partner submits decision back to HEAVIX via the partner channel.
- HEAVIX mirrors the decision on the buyer's dashboard and notifies the buyer.

### 6.4 Decision Outcomes

| Outcome | HEAVIX Action |
|---------|---------------|
| Approved | Mirror status; surface partner contract channel |
| Rejected | Mirror status; suggest alternative partners (no guarantee) |
| Counter-offer | Mirror terms; buyer negotiates directly with partner |
| Withdrawn by buyer | Mark withdrawn; retain audit record |

### 6.5 Contract & Disbursement

- Contract is between buyer and partner. HEAVIX is **not** a party.
- Disbursement flows from partner to seller (or escrow) per the contract.
- HEAVIX records the disbursement event for audit only; it does not move funds.

---

## 7. Information Exchange Summary

| Information | HEAVIX → Partner | Partner → HEAVIX |
|-------------|------------------|------------------|
| Machine dossier | Yes (on application) | No |
| Buyer assessment packet | Yes (with consent) | No |
| Application status | No | Yes |
| Credit decision | No | Yes |
| Contract terms | No | Yes (for display only) |
| Disbursement event | No | Yes (for audit) |
| Servicing status | No | Yes (status mirror) |

HEAVIX never receives the partner's internal credit-scoring rationale, only the
outcome. This protects both partner IP and buyer privacy.

---

## 8. Permissions

All permissions are enforced server-side via Field Policy (READ/WRITE/EXPORT)
and Action Engine. UI hiding alone is prohibited.

| Permission Key | Scope | Typical Role |
|----------------|-------|--------------|
| `financing.read` | View own applications | Buyer |
| `financing.apply` | Submit a new application | KYC-verified buyer |
| `financing.manage` | Manage applications for own sellers | Seller / operator |
| `financing.partner` | Partner-facing API & status updates | Financing partner |
| `financing.admin` | Partner onboarding + oversight | Platform admin |

### 8.1 Server-side Enforcement Requirements

- The `financing.apply` endpoint must verify KYC status before accepting a
  submission.
- The `financing.partner` endpoint must verify partner credentials per request.
- VIP-only financing products must check VIP subscription server-side, not in the
  UI.
- Every status transition is audit-logged with the actor identity.

---

## 9. Disclaimers

The following disclaimers are mandatory product copy, not legal advice.

1. **Inspection ≠ credit approval.** A HEAVIX inspection report is a condition
   assessment; it does not influence the partner's credit decision except as the
   partner independently chooses to weigh it.
2. **Platform ≠ lender.** HEAVIX does not extend credit; financing is provided
   by the named partner.
3. **No approval guarantee.** Submission of an application does not guarantee
   approval; partners decide on their own criteria.
4. **Data accuracy.** HEAVIX transmits platform data in good faith; the partner
   is responsible for independent verification where required.
5. **Privacy.** Buyer data is shared only with the chosen partner and only after
   consent.

---

## 10. Data Model Proposal (PROPOSED — not in schema today)

These models are proposed for the main schema. They are design-only at this
stage; implementation is gated on partner integration agreements.

### 10.1 `FinancingPartner`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| legalName | String | |
| jurisdiction | String | |
| contactChannel | String | API endpoint or email |
| supportedProducts | JSON | Array of product types |
| acceptedCategories | JSON | Array of category IDs |
| status | Enum | active | suspended | inactive |
| onboardedBy | String | FK to AdminUser |

### 10.2 `FinancingApplication`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| buyerId | String | FK to User/Company |
| partnerId | String | FK to FinancingPartner |
| listingId | String | FK to Listing |
| dossierRef | String | Pointer to compiled dossier artifact |
| status | Enum | draft | submitted | under_review | approved | rejected | counter | withdrawn | contracted | disbursed |
| partnerDecisionAt | DateTime | Nullable |
| partnerDecisionReason | String | Nullable; partner-supplied summary only |
| consentAt | DateTime | Buyer consent timestamp |
| createdAt / updatedAt | DateTime | |

> **Note on Prisma constraints:** `supportedProducts` and `acceptedCategories`
> are stored as JSON (allowed). A normalized child model may replace them at
> implementation time.

---

## 11. Reuse from Existing Infrastructure

| Existing Asset | Reused For |
|----------------|------------|
| `Inspection` model | Dossier inspection section |
| `MachinePassport` model | Dossier condition assessment |
| `Listing` + `ListingImage` | Dossier asset identification + media |
| `Company` + `CompanyDocument` | Dossier ownership + documents |
| AI Gateway `PRICE_ANALYSIS` task | Dossier market valuation |
| `Order`, `Lead`, `ListingOffer` | Buyer assessment packet summary |
| `Review` + dispute history | Buyer reputation signal |
| Action Engine audit | Application lifecycle immutability |
| Field Policy | Per-role visibility of application fields |

---

## 12. Acceptance Criteria (Definition of Done — Design)

- [ ] Partnership model documents HEAVIX as facilitator only.
- [ ] Machine Dossier sections enumerated with source models.
- [ ] Buyer assessment packet distinguishes HEAVIX-shared vs partner-decided.
- [ ] Application flow covers all 6 stages with audit logging.
- [ ] Information-exchange matrix is symmetric and complete.
- [ ] Permissions documented with server-side enforcement requirements.
- [ ] Disclaimers present, including "inspection ≠ credit approval".
- [ ] Data model proposed with consent and decision timestamps.
- [ ] No UI element implies approval guarantee.
- [ ] No fund movement is performed by HEAVIX.

---

## 13. Phased Delivery

| Phase | Scope | Gate |
|-------|-------|------|
| P1 — Design only | This document + data model proposal | No partner signed |
| P2 — Dossier builder | Generate dossier from existing data (read-only export) | No submissions yet |
| P3 — Partner onboarding | `FinancingPartner` admin surface | First partner MOU signed |
| P4 — Application submission | Buyer flow with consent + audit | Partner API contract agreed |
| P5 — Status mirror | Partner decisions reflected on buyer dashboard | End-to-end integration test |

P1–P2 are safe to ship without partner contracts. P3+ require a partner
memorandum of understanding.

---

## 14. Prohibitions

- ❌ HEAVIX must not extend credit or set financing terms.
- ❌ HEAVIX must not represent that inspection guarantees approval.
- ❌ HEAVIX must not share buyer data without consent.
- ❌ HEAVIX must not move buyer funds outside governed escrow.
- ❌ HEAVIX must not enforce financing permissions by UI hiding alone.
- ❌ HEAVIX must not display partner-internal credit rationale to buyers.

---

## 15. Out of Scope

- Source code changes (this is a product design document).
- Schema migrations (data model is proposed, not implemented here).
- Partner-specific API contracts (per-partner integration design).
- Interest-rate models or risk-based pricing (partner responsibility).
- Tax or accounting treatment of financing (partner + buyer responsibility).

---

**End of document.**
