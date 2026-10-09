# HEAVIX — Product: Machinery Investment Framework

> **Status:** PROPOSED — Product Architecture Specification (not implemented).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes. No fund collection.
> **Related:** `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md`,
> `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`

---

## 1. Purpose

Define the product framework for machinery investment activities on HEAVIX —
how opportunities are created, evaluated, capital-pooled, managed, and exited —
with **explicit legal gates** that prohibit any real fund collection until legal
compliance is verified. This document describes product intent and structure; it
is **not** authorization to operate.

> ⚠️ **GATED.** No model in this document authorizes HEAVIX to solicit, collect,
> hold, or distribute investor funds. All such activity is **gated** behind a
> documented legal review (see §7). Until that gate passes, this framework is
> design-only.

---

## 2. Design Principles

1. **HEAVIX is a coordination platform, not a fund manager** — except where a
   licensed entity is separately engaged and documented.
2. **No guaranteed returns.** Any projected yield is illustrative, not promised.
3. **Legal gate before capital.** Capital pooling features are inert until legal
   sign-off is recorded.
4. **Fund separation.** Platform operational funds are never commingled with
   investor capital.
5. **Transparent disclosure.** Every opportunity discloses risks, fees, and the
   identity of the responsible legal entity.
6. **Auditability.** Every state transition in an opportunity lifecycle is
   immutably logged (reuses Action Engine audit, ADR-003).

---

## 3. Investment Models

Four distinct models, each with its own risk profile, legal posture, and lifecycle.

### 3.1 Model A — Capital Pool for Buy/Sell

- **Concept:** Investors contribute capital to a pool used to acquire machinery
  for resale on the marketplace. Profit (or loss) from resale is distributed pro
  rata after platform fees.
- **HEAVIX role:** Coordinator of the pool and the marketplace listing; the pool
  itself is administered by a legally-identified operator (GATED — see §7).
- **Investor exposure:** Inventory carrying cost, resale price, time-to-sell.

### 3.2 Model B — Installment Financing

- **Concept:** A buyer purchases machinery via installment payments; investors
  fund the receivable and earn a share of installment interest. The receivable is
  originated by a financing partner (see
  `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`).
- **HEAVIX role:** Platform surfaces the opportunity; partner originates and
  services the receivable.
- **Investor exposure:** Buyer default, repossession cost, recovery time.

### 3.3 Model C — Used Machinery Financing

- **Concept:** Capital is used to acquire, refurbish, and re-sell used machinery
  identified via the marketplace. Combines Model A's trade mechanic with a
  refurbishment step.
- **HEAVIX role:** Coordinator + marketplace listing venue.
- **Investor exposure:** Refurbishment cost overrun, demand shift, hidden defects
  discovered post-acquisition.

### 3.4 Model D — Rental Income

- **Concept:** Investors fund the acquisition of machinery placed into rental
  service (reuses existing `RentalListing` / `RentalBooking` store models);
  rental income is distributed to investors.
- **HEAVIX role:** Coordinator; rental operations handled by an identified
  operator (GATED).
- **Investor exposure:** Vacancy, maintenance, damage, operator performance.

---

## 4. Investment Opportunity Lifecycle

Every opportunity, regardless of model, follows the same gated lifecycle.

```
[Creation] → [Evaluation] → [Legal Review] → [Capital Pooling (GATED)]
   → [Acquisition] → [Management] → [Exit] → [Distribution]
```

| Stage | Owner | Gate Condition |
|-------|-------|----------------|
| Creation | Platform operator | Opportunity draft complete |
| Evaluation | Platform + AI `MARKET_ANALYST` | Valuation, risk factors documented |
| Legal Review | External legal counsel | **HARD GATE — no public solicitation before this passes** |
| Capital Pooling (GATED) | Licensed operator | Legal review recorded; investor KYC complete |
| Acquisition | Operator | Funds confirmed; title transfer documented |
| Management | Operator | Operating reports on schedule |
| Exit | Operator | Sale/return/refurbishment complete |
| Distribution | Operator + escrow | Final accounting; pro-rata distribution |

### 4.1 Stage Notes

- **Creation & Evaluation** may operate as design-only features today (no real
  funds).
- **Legal Review** is a **hard gate**: the opportunity object carries a
  `legalReviewStatus` field that must be `approved` before any capital pooling
  UI is enabled.
- **Capital Pooling** is **GATED** platform-wide (not per-opportunity) until §7
  passes.
- **Acquisition → Distribution** are operational stages executed by the licensed
  operator; HEAVIX mirrors their state for transparency only.

---

## 5. Risk Disclosure

Each opportunity must disclose the model-specific risks below. Disclosures are
mandatory product content — not legal advice — and must be acknowledged by the
investor before participation.

### 5.1 Per-Model Risks

| Model | Key Risks |
|-------|-----------|
| A — Capital Pool Buy/Sell | Unsold inventory, price depreciation, storage cost, market liquidity |
| B — Installment Financing | Buyer default, repossession cost, interest-rate shift, recovery time |
| C — Used Machinery Financing | Hidden defects, refurbishment overrun, demand shift, parts availability |
| D — Rental Income | Vacancy, maintenance cost, machine damage, operator performance, insurance gaps |

### 5.2 Cross-Model Risks

- Currency exposure (reuses existing `CurrencyRate` / `CurrencySetting` store
  models for disclosure).
- Regulatory change in the operator's jurisdiction.
- Platform operational risk (HEAVIX is a coordinator; platform outages do not
  suspend investor obligations).
- Liquidity risk — capital may be locked for the opportunity term.

### 5.3 Prohibited Claims

- ❌ "Guaranteed return" or "risk-free" language.
- ❌ Specific yield percentages presented as promises.
- ❌ "Principal protected" claims without legal basis.
- ❌ Comparisons to bank deposits or insured instruments.

---

## 6. Legal Gate

### 6.1 Requirement

Before any **public capital solicitation** feature is enabled platform-wide, the
following must be recorded in a governance document (PROPOSED
`docs/gates/INVESTMENT-LEGAL-GATE.md`):

1. Identification of the licensed legal entity that will solicit, hold, and
   distribute funds.
2. Jurisdiction and applicable regulatory regime.
3. Permitted investor categories (accredited, retail, etc.).
4. Disclosure templates approved by external counsel.
5. Escrow / custodian arrangement documented.
6. Cross-border restrictions, if any.

### 6.2 Prohibition

Until §6.1 is fully recorded and signed off:

- The `InvestmentOpportunity` model may exist as a draft.
- The `CapitalPool` aggregation is **disabled** at the service layer.
- No UI surfaces a "participate" / "contribute" call-to-action.
- No payment endpoint accepts investor funds.

### 6.3 Guaranteed-Return Prohibition

Even after the legal gate passes, HEAVIX **prohibits** guaranteed-return claims
that lack legal basis. Any yield projection must carry a visible disclaimer and
be presented as illustrative.

---

## 7. Rollout Gate

The platform-wide rollout gate is summarized below. It is intentionally
conservative.

| Gate | Criterion | Owner |
|------|-----------|-------|
| G1 | Legal entity & jurisdiction documented | Legal counsel |
| G2 | Disclosure templates approved | Legal counsel |
| G3 | Escrow/custodian contract executed | Operations |
| G4 | Investor KYC flow implemented & tested | Engineering |
| G5 | Audit trail for fund movement verified | Engineering + Audit |
| G6 | Public disclosure page published | Product + Legal |

Until all six gates pass, the investment framework is **design-only**. The
platform may display educational content and opportunity drafts, but must not
accept funds.

---

## 8. Fund Handling

### 8.1 Separation

- Investor funds flow only to the escrow/custodian account identified in G3.
- HEAVIX operational accounts never receive investor funds.
- Platform fees are invoiced by the licensed operator to the escrow, never
  deducted by HEAVIX from investor capital directly.

### 8.2 Accounting

- Every `InvestmentParticipation` records: investor, amount, opportunity,
  timestamp, escrow reference.
- Every `DistributionEvent` records: opportunity, total distributed, per-investor
  share, escrow reference, timestamp.
- These records are immutable and audit-logged (reuses Action Engine).

### 8.3 Refunds & Cancellations

- Pre-acquisition cancellation: investor capital returned by escrow, less
  documented costs.
- Post-acquisition: no unilateral withdrawal; exit follows the lifecycle.

---

## 9. Data Model Proposal (PROPOSED — not in schema today)

These models are proposed for the main schema. They are **not** to be added until
the Legal Gate (§6) passes; their presence in this document is design-only.

### 9.1 `InvestmentOpportunity`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| model | Enum | A | B | C | D |
| title | String | |
| description | String | Includes risk disclosure |
| targetAmount | Decimal | Total capital sought |
| minimumParticipation | Decimal | Per-investor floor |
| status | Enum | draft | evaluating | legal_review | pooling | acquired | managing | exited | distributed | cancelled |
| legalReviewStatus | Enum | pending | approved | rejected — **GATE field** |
| operatorEntityId | String | FK to licensed operator (PROPOSED) |
| createdBy | String | FK to AdminUser |
| createdAt / updatedAt | DateTime | |

### 9.2 `InvestmentParticipation`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| opportunityId | String | FK |
| investorId | String | FK to User/Company |
| amount | Decimal | Committed |
| escrowReference | String | External escrow ID |
| kycStatus | Enum | pending | verified | rejected |
| status | Enum | committed | funded | cancelled | distributed |
| createdAt | DateTime | |

### 9.3 `CapitalPool`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| opportunityId | String | FK |
| totalCommitted | Decimal | Sum of participations |
| totalFunded | Decimal | Confirmed by escrow |
| status | Enum | open | closed | distributed |
| operatorEntityId | String | FK |

### 9.4 `DistributionEvent`

| Field | Type | Notes |
|-------|------|-------|
| id | String | PK |
| opportunityId | String | FK |
| totalDistributed | Decimal | |
| perInvestorShares | JSON | Denormalized; immutable |
| escrowReference | String | |
| distributedAt | DateTime | |

> **Note on Prisma constraints:** the per-investor shares are stored as JSON
> (allowed) rather than as a primitive list (forbidden per project rules). A
> normalized `DistributionShare` child model may be added at implementation time.

---

## 10. Permissions

All permissions are enforced server-side. UI hiding alone is prohibited.

| Permission Key | Scope | Typical Role |
|----------------|-------|--------------|
| `investment.read` | View published opportunity summaries | Authenticated users |
| `investment.read.detail` | View full opportunity disclosures | KYC-verified investors |
| `investment.manage` | Create/manage own opportunities | Licensed operator |
| `investment.admin` | Platform-level oversight | Platform admin |
| `investment.kyc.review` | Review investor KYC | Compliance reviewer |

---

## 11. Reuse from Existing Infrastructure

| Existing Asset | Reused For |
|----------------|------------|
| `AIGatewayLog` task type `MARKET_ANALYST` | Opportunity evaluation inputs |
| `CurrencyRate` / `CurrencySetting` (store) | Multi-currency disclosure |
| `RentalListing` / `RentalBooking` (store) | Model D rental lifecycle |
| `Listing` / `MachinePassport` (main) | Underlying asset identification |
| `Inspection` (main) | Asset condition input for evaluation |
| Action Engine audit (ADR-003) | Lifecycle transition immutability |
| Field Policy | Per-role visibility of opportunity fields |

---

## 12. Acceptance Criteria (Definition of Done — Design)

- [ ] Four models (A, B, C, D) documented with distinct risk disclosures.
- [ ] Lifecycle diagram covers all 8 stages with the Legal Review hard gate.
- [ ] Risk register covers per-model + cross-model risks.
- [ ] Legal gate criteria enumerated; no public solicitation until satisfied.
- [ ] Fund separation rules explicit; escrow mandatory.
- [ ] Data model proposed with the gate field `legalReviewStatus`.
- [ ] Permissions documented; no UI-only enforcement.
- [ ] Rollout gate G1–G6 specified; no real funds until all pass.
- [ ] Prohibited-claims list present and enforced in copy review.

---

## 13. Phased Delivery

| Phase | Scope | Gate |
|-------|-------|------|
| P1 — Design only | This document + data model proposal | Legal review not yet started |
| P2 — Educational surface | Public opportunity summaries (read-only) | No funds, no participation UI |
| P3 — Legal gate | G1–G3 documented and signed | External counsel sign-off |
| P4 — KYC + escrow | G4–G5 implemented and audited | KYC flow tested; escrow live |
| P5 — Capital pooling | Participation UI enabled per opportunity | G6 public disclosure published |

P1–P2 are safe to ship without legal sign-off. P3+ are **gated**.

---

## 14. Prohibitions

- ❌ No guaranteed-return claims without legal basis.
- ❌ No real fund collection before G1–G6 pass.
- ❌ No commingling of platform and investor funds.
- ❌ No credit decisions by HEAVIX (partner-only, see financing doc).
- ❌ No bypass of the `legalReviewStatus` gate field.
- ❌ No UI-only enforcement of investment permissions.

---

## 15. Out of Scope

- Source code changes (this is a product design document).
- Schema migrations (data model is proposed, not implemented here).
- Marketing copy for opportunities (owned by operator + legal).
- Specific escrow/custodian vendor selection (operations decision).
- Tax advice for investors (investor responsibility).

---

**End of document.**
