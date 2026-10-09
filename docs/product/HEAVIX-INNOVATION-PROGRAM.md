# HEAVIX Innovation Program

> **Status:** PROPOSED — for owner review (innovation ideation, design only).
> **Task ID:** 6 (`/brainstorm` — STEP 11.29-B)
> **Repository baseline:** `main` (per task brief `4566efd`; working-tree HEAD at authoring time = `35b3a30` on branch `docs/store-center-ux-prototype` — see Open Questions §9.1).
> **Scope:** Innovation ideation only. **No code, schema, migration, or PR changes.** This file is documentation.
> **Related:** `docs/ADR-005-store-center-architecture.md`, `docs/product/ux/STORE-CENTER-UX-PROTOTYPE.md`, `docs/product/PRODUCT-ADMIN-STORE-CENTER-SPEC.md`, `docs/PRODUCT-HEAVIX-MECHANICS-MASCOT.md`, `docs/PRODUCT-MACHINERY-INVESTMENT.md`, `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`, `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md`.
> **Authoring agent:** `/brainstorm` (innovation program).

---

## 1. Purpose & Scope

This document defines an **evaluable innovation program** for HEAVIX: a curated
set of AI-assisted product ideas that (a) solve real problems for sellers,
buyers, and admins on the industrial-machinery marketplace; (b) are grounded in
data HEAVIX actually has or can collect; (c) are **advisory-only** per ADR-005
§8 — no autonomous mutations; and (d) keep all financial, investment, and
leasing ideas **GATED** behind legal review.

The program contains **17 evaluable ideas (A–Q)**: 8 base ideas refined and
completed from the original brief, plus 9 new original ideas. A separate
**Gated Ideas Register (§6)** references the existing finance/investment/leasing
proposals in `PRODUCT-MACHINERY-INVESTMENT.md` and
`PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` and **does not propose de-gating
any of them**.

For each idea the document specifies the 8 mandatory fields: (1) real problem,
(2) user experience, (3) required data verified against the actual Prisma
schema, (4) AI method, (5) safety control, (6) revenue model, (7) success
metric **with a baseline definition** (no target without a baseline), and
(8) MVP vs Future split.

A **priority matrix** (§7) and a **recommended sequencing** (§8) close the
document.

---

## 2. Hard Rules & Constraints

These rules are binding on every idea in this document. Any idea that cannot
satisfy all of them is either dropped or moved to the Gated register.

1. **Advisory-only AI (ADR-005 §8).** Every AI surface returns text, scores, or
   suggestions. The AI Gateway never returns function calls that mutate state.
   Every suggestion is paired with a manual link the user must click to act.
   No "AI executes action" pattern — even with user approval.
2. **No autonomous mutations.** All write paths go through the normal
   authenticated, authorized, audited routes. AI output is treated like user
   input: validated server-side, rate-limited, and audit-logged.
3. **Human-in-the-loop for every consequential decision.** Verification,
   moderation, pricing override, lead-status change, and document approval
   always require a human click. AI can recommend; humans decide.
4. **Financial/investment/leasing ideas stay GATED.** No fund collection, no
   credit decision, no guaranteed return, no escrow, no security issuance
   without legal review. Section 6 lists the gated ideas; **none are de-gated
   by this document.**
5. **Grounded in real data.** Every "required data" field cites the actual
   Prisma model and field. Where a field does not yet exist, the idea
   explicitly says so and references the ADR-005 §1–§7 additive migration that
   would add it (additive only — no destructive change).
6. **Characters do not replace experts.** The HEAVIX/MEKANIX characters guide
   and educate; they never replace licensed inspectors, safety authorities,
   credit officers, or qualified mechanics. Every character surface carries a
   visible "this is guidance, not a professional opinion" affordance.
7. **Cost & rate limits are first-class.** Every AI idea must declare an
   `AITaskPolicy` row (auth + quota + size + model + timeout + cost ceiling)
   and respect the `AIBudget` singleton (daily/monthly USD caps). Ideas that
   cannot fit under the default $0.05/call ceiling must declare a higher
   ceiling and a justification.
8. **Audit everything.** Every AI call is logged to `AIGatewayLog`. Every
   human action on an AI suggestion is logged via the Action Engine (ADR-003).
9. **Persian-first, accessibility-first.** Every AI surface is designed for
   Persian (fa-IR) input first, with English (and other supported languages)
   as a secondary path. Voice and screen-reader affordances are part of the
   MVP definition where the surface is seller-facing.
10. **No fabricated data.** Every KPI shows "—" when no underlying data exists.
    Success metrics define their baseline as "the value computed from existing
    data before the feature ships" — never a target invented without a
    baseline.

---

## 3. Schema Grounding — Verified Facts

The following facts were verified against `/home/z/heavix/prisma/schema.prisma`
(main schema, 2611 lines) and `/home/z/heavix/prisma/store-schema.prisma`
(store schema, 780 lines) at authoring time. They correct and extend the
critic findings referenced in the task brief.

| # | Claim (from brief / critic) | Verified truth | Source (schema) |
|---|---|---|---|
| 1 | `Company.logoUrl` already exists | **TRUE** — `Company.logoUrl String?` exists; also `coverImage`, `slug` (@unique), `description`, `verified Boolean`, `premium Boolean`, `metaTitle`, `metaDescription`, `viewCount`, `avgRating`, `reviewCount` | `schema.prisma:1177-1215` |
| 2 | `MachinePassport` has no verification fields | **TRUE** — only `serialNumber`, `inspectionDate`, `inspectionResult`, `events[]`. ADR-005 §6 proposes additive per-section verification fields (`specsVerifiedAt/By`, `ownershipVerifiedAt/By`, `inspectionVerifiedAt/By`, `serviceHistoryVerifiedAt/By`) — not yet present | `schema.prisma:1149-1159` |
| 3 | `PremiumSubscription` is per-user | **TRUE** — `userId String @unique`. Flags: `aiAssistantAccess`, `analyticsAccess`, `priorityLeads`, `companyPage`, `featuredCredits`. ADR-005 §2 (VIP Showroom) will need a Company-level check, not a user-level one — this is a known gap | `schema.prisma:1126-1143` |
| 4 | `Part` is in store-schema | **TRUE** — `Part` lives in `store-schema.prisma`. Has `sku`, `name`, `nameFa`, `categoryId`, `brandId`, `description`, `priceUsd`, `oldPriceUsd`, `contactForPrice`, `stock`, `lowStockThreshold`, `images` (JSON), `compatibleCars` (JSON), `carModels` (relation), `sourceUrl`, `featured`, `views`, `soldCount`. ADR-005 §5 proposes additive `inventoryScore Int?` + `inventoryScoreVersion String?` | `store-schema.prisma:123-165` |
| 5 | `Lead` has no `status` field | **TRUE** — only `listingId`, `leadType`, `viewerPhone`, `viewerName`, `note`, `createdAt`. ADR-005 §3 proposes additive `status String @default("NEW")` (NEW/CONTACTED/QUALIFIED/CLOSED/LOST). Lead is **phone-based, not user-linked** — there is no `userId` on `Lead`. | `schema.prisma:618-627` |
| 6 | `ListingAttributeValue` already carries provenance | **TRUE (strong)** — `sourceType` (SELLER_INPUT \| MANUFACTURER_DOCUMENT \| AI_EXTRACTION \| AI_INFERENCE \| ADMIN_VERIFIED \| IMPORTED), `confidence Float?`, `sourceReference`, `verifiedAt`, `verifiedBy`. This is the foundation for Machine Intelligence Profile (idea B) and Brand Knowledge Graph (idea P) — no schema change needed | `schema.prisma:365-387` |
| 7 | `KnowledgeEntry` has source/verification | **TRUE** — `source` (MANUFACTURER \| SELLER \| HEAVIX \| USER \| AI \| EXTERNAL), `verified Boolean`, `verifiedBy`, `verifiedAt`, `aiSuggested Boolean`. Foundation for Brand Knowledge Graph (idea P) | `schema.prisma:697-719` |
| 8 | `PriceObservation` + `PriceEstimate` + `PriceOverride` already exist | **TRUE** — `PriceEstimate` has `estimatedPrice`, `priceLower`, `priceUpper`, `confidence` (HIGH/MEDIUM/LOW/INSUFFICIENT), `comparableCount`, `dataFreshness`, `mainDrivers` (JSON), `warnings` (JSON), `modelVersion`. Price Intelligence Advisory (idea I) is a UX/surfacing layer on top — not a new engine | `schema.prisma:2061-2123` |
| 9 | `ComparisonSession` + `ComparisonItem` already exist | **TRUE** — Smart Search & Compare (idea C) extends an existing engine, not a new one | `schema.prisma:2133-2158` |
| 10 | `UserRecommendation` already exists with reason enum | **TRUE** — `reason` (SIMILAR_TO_VIEWED \| SAME_CATEGORY \| SAME_BRAND \| PRICE_DROP \| NEW_IN_WATCHLIST_CATEGORY \| TRENDING), `score Float`, `dismissed`, `clickedAt`. Machine Match (idea F) extends this, not rebuilds | `schema.prisma:1971-1988` |
| 11 | `DemandSignal` exists (zero-result searches) | **TRUE** — `query`, `category`, `brand`, `city`, `resultCount`, `intent` (BUY/RENT/COMPARE/RESEARCH/PARTS/SERVICE), `convertedToRequest`. Foundation for Demand Pulse (idea K) | `schema.prisma:815-826` |
| 12 | `ModerationLog` exists | **TRUE** — `action` (AI_SCAN/FLAG/APPROVE/REJECT/OVERRIDE), `riskScore Float?`, `flaggedIssues` (JSON). Listing Moderation Co-Pilot (idea L) extends, not replaces, the human moderator | `schema.prisma:2240-2254` |
| 13 | `DealRoom` + `DealMessage` + `DealDocument` exist | **TRUE** — DealDocument has `type` (CONTRACT/INSPECTION_REPORT/INVOICE/OWNERSHIP_PROOF/TRANSPORT_DOC/OTHER), `status` (PENDING/VERIFIED/REJECTED). Foundation for Conversational Deal Assistant (idea O) | `schema.prisma:1299-1345` |
| 14 | `RFQ` + `RFQQuote` exist | **TRUE** — `RFQ` has `machineType`, `brandPref`, `quantity`, `specJson`, `budgetMin/Max`, `location`, `deadline`, `status` (OPEN/QUOTING/AWARDED/CLOSED/CANCELLED). `RFQQuote` has `unitPrice`, `totalPrice`, `deliveryTime`, `status`. Foundation for RFQ Auto-Match (idea J) | `schema.prisma:833-882` |
| 15 | `AnalyticsEvent` exists | **TRUE** — `eventType` (LISTING_VIEW/SEARCH/CLICK/FAVORITE/COMPARE/CONTACT/SHARE/REGISTER/LOGIN/LISTING_CREATE/OFFER_MAKE), `userId?`, `listingId?`, `query?`, `page?`, `metadata` (JSON). Foundation for Lead Intelligence (idea D) and Demand Pulse (idea K) | `schema.prisma:2217-2238` |
| 16 | `Inspection` exists with full state machine | **TRUE** — `status` (REQUESTED/SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED), `checklist` (JSON), `score Float?`, `reportUrl`, `photos` (JSON). Foundation for Inspection Intelligence (idea N) | `schema.prisma:1351-1371` |
| 17 | `ServiceProvider` + `ServiceRequest` exist | **TRUE** — provider `type` (TRANSPORT/INSPECTION/MAINTENANCE/REPAIR/INSTALLATION/DELIVERY), `verified`, `rating`. ServiceRequest has full state machine. Foundation for Service Marketplace Intelligence (idea N) | `store-schema.prisma:741-780` |
| 18 | `Review` has `verifiedDeal` + seller response | **TRUE** — `verifiedDeal Boolean`, `sellerResponse`, `sellerRespondedAt`, `status` (PENDING/PUBLISHED/REJECTED/HIDDEN). Foundation for Reputation-Weighted Match Priority (idea Q) | `schema.prisma:2290-2330` |
| 19 | `Brand` has rich taxonomy | **TRUE** — `verification`, `BrandAlias`, `BrandIndustry`, `BrandDomain`, `BrandSEO`, `BrandMedia`, `BrandFamily`, `ProductModel`, `Generation`. Foundation for Brand Knowledge Graph (idea P) | `schema.prisma:17-156, 393-435` |
| 20 | `AIGatewayLog` task types are an enum-like set | **TRUE** — SEARCH, LISTING_BUILDER, PRICE_ANALYSIS, MARKET_ANALYST, SELLER_ASSISTANT, SCRAPER, MODERATION, SEMANTIC_SEARCH. Each new AI task type needs an `AITaskPolicy` row | `schema.prisma:726-789` |
| 21 | `AIBudget` is a singleton with daily/monthly caps | **TRUE** — defaults: `$10/day`, `$200/month`. `AITaskPolicy.costCeilingUsd` default `$0.05` | `schema.prisma:752-789` |
| 22 | `CurrencyRate` (USD→IRR) + `CurrencySetting` exist | **TRUE** — `rate Float`, `marginPercent`, `source` (MANUAL/TELEGRAM). Foundation for cross-region pricing (idea I sub-feature) | `store-schema.prisma:280-292` |

**Implication for the program:** most ideas are **surfacing/UX/advisory layers
on top of already-modelled data**, not new engines. This dramatically lowers
their complexity and risk, and means MVPs can ship without schema migrations
in many cases.

---

## 4. Cross-cutting Safety & Infra Requirements

Every idea in §5 inherits the following requirements. They are stated once
here and referenced (not repeated) in each idea.

### 4.1 AI Gateway integration (all AI ideas)

- Each AI idea declares its `taskType` for `AIGatewayLog` / `AITaskPolicy`.
  Where a task type already exists (SEARCH, SELLER_ASSISTANT, PRICE_ANALYSIS,
  MARKET_ANALYST, MODERATION, SEMANTIC_SEARCH, LISTING_BUILDER), the idea
  reuses it. Where a new task type is needed, the idea names it (e.g.
  `LEAD_INTEL`, `DEAL_ASSISTANT`, `PARTS_COMPAT`) and the policy row is
  defined in the implementation plan, not this document.
- Every call respects the `AITaskPolicy` allow-list: `allowedRoles`,
  `hourlyLimit`, `dailyLimit`, `maxInputChars`, `maxOutputTokens`, `model`,
  `timeoutMs`, `costCeilingUsd`, `active`.
- Every call is logged to `AIGatewayLog` with `taskType`, `model`,
  `input` (truncated), `output` (truncated), `latencyMs`, `tokensUsed`,
  `cost`, `success`, `error`, `userId`.
- The `AIBudget` singleton is the hard ceiling. When daily or monthly spend
  is exceeded, the gateway returns a 429-style "AI budget exhausted" response
  and the UI degrades gracefully to the deterministic / rule-based fallback.

### 4.2 Human-in-the-loop pattern (all AI ideas)

- AI output is **advisory text or a score with a reason**.
- Every suggestion includes a deep link to the page where the human performs
  the action manually.
- The human action is the only path that mutates state, and it goes through
  the normal authenticated, authorized, audited route.
- "Dismiss suggestion" is always available and is persisted (per-user
  preference) so the same suggestion does not re-surface.

### 4.3 Persian-first & accessibility

- All prompts, system messages, and UI strings are authored Persian-first.
- The LLM is instructed to respond in Persian when the user writes in Persian
  (detected by script), and in English otherwise.
- Voice input (Persian ASR) and screen-reader-friendly output are part of the
  MVP for seller-facing surfaces (idea A, D, E, O) and the Future version for
  buyer-facing surfaces.
- Character surfaces (idea H) include visible "guidance, not professional
  opinion" disclaimers in both Persian and English.

### 4.4 Cost discipline

- Default cost ceiling: `$0.05` per call (matches `AITaskPolicy` default).
- Ideas that need a higher ceiling declare it and justify it.
- The MVP for every idea uses the **cheapest model that meets quality bar**
  (typically a small/medium LLM for text, a dedicated VLM only for image
  tasks).
- Caching: deterministic sub-results (scores, counts) are cached and only
  re-computed on underlying data change — never on every page view.

### 4.5 No-fabrication rule

- KPIs show "—" when the underlying query returns no rows.
- AI summaries that have no underlying data return an empty state, not a
  hallucinated sentence.
- Every AI-generated fact surfaced to a user is paired with a "source" chip
  (e.g. "from your listings", "from 3 comparable sales", "AI inference —
  needs verification").

---

## 5. The 17 Ideas

> **Reading order:** A–H are the refined base ideas; I–Q are new original
> ideas. Each block is self-contained. The matrix in §7 summarizes all 17.

---

### A. HEAVIX Copilot — Daily Store Briefing & Lead Triage Assistant

**Status:** MVP-shippable
**Tagline:** "Open your store in the morning; the rhino already read the
overnight numbers."

#### 1. Real problem
Sellers on HEAVIX are typically small-business owners who do not have time to
open 6 different Store Center pages (Dashboard, Inventory, Leads, Orders,
Passport, Reports) every morning to find the 2 things that actually need
attention. The Store Center UX prototype (§7 Reports page) already defines a
"Business Assistant" panel but leaves it as a static rule list. The real
problem is **prioritization under time scarcity**: which 3 actions today will
move revenue? Without a daily briefing, sellers react to the loudest
notification rather than the highest-value one.

#### 2. User experience
- **Who:** Sellers (and admins acting on behalf of a seller's Company).
- **What they do:** Open `/seller/dashboard` in the morning. The HEAVIX
  Copilot panel shows a 3-bullet "Today's Briefing": (1) the single hottest
  lead across their listings with a one-line reason and a "Open lead" link,
  (2) the single most-urgent inventory alert (out-of-stock part, stale
  listing, or low Passport score) with a link, (3) a one-line business
  summary ("3 new leads, 2 offers pending, 1 listing expiring in 5 days").
- **What they see:** Persian-first text, ≤280 characters per bullet, each
  bullet a deep link. A " regenerate" button (rate-limited to 1/minute).
  A "dismiss" per bullet.
- **What they do NOT see:** no auto-action, no "AI has updated your lead
  status" toast. Every change is a manual click.

#### 3. Required data (verified against schema)
- `Listing` (seller's listings via `sellerId`/`companyId`): `viewCount`,
  `favoriteCount`, `status`, `expiresAt`, `publishedAt`, `updatedAt`.
- `Lead` (per listing): `leadType`, `viewerPhone`, `viewerName`, `createdAt`.
  Note: `Lead` has no `status` yet — ADR-005 §3 proposes additive `status`
  enum; until then, the briefing uses `createdAt` recency + per-listing lead
  count + per-viewer-phone cross-listing inquiry count.
- `ListingOffer` (pending offers): `status = PENDING`, `offerAmount`,
  `createdAt`.
- `Part` (store-schema, for inventory alerts): `stock`, `lowStockThreshold`,
  `active`. ADR-005 §5 `inventoryScore` (proposed) when available.
- `Order` (store-schema): `status`, `paymentStatus`, `createdAt`.
- `MachinePassport` (for Passport-score alert): ADR-005 §6 per-section
  verification fields (proposed, additive) when available.
- `AIGatewayLog` task type: **reuse `SELLER_ASSISTANT`** (already exists).

#### 4. AI method
**Hybrid.** Deterministic rule-based prioritization computes the candidate
set (hottest lead by recency × inquiry-count × listing-value; most-urgent
inventory alert by stock×stale×passport-score). A small LLM (Persian-first
system prompt) then writes the ≤280-char Persian bullet for each candidate,
citing the deterministic reason. The LLM never picks the candidate — it only
phrases the explanation. Fallback if LLM fails: a templated Persian string
from the deterministic reason.

#### 5. Safety control
- Advisory only (ADR-005 §8). No mutations.
- `AITaskPolicy` row for `SELLER_ASSISTANT`: `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=30`, `dailyLimit=100`, `maxInputChars=5000`,
  `maxOutputTokens=500`, `costCeilingUsd=0.02`, `timeoutMs=15000`.
- Per-seller rate limit on "regenerate" (1/min, 10/day).
- Every briefing bullet is reproducible from the deterministic inputs — the
  LLM phrasing is the only non-deterministic part, and the deterministic
  reason is stored alongside the phrasing in the audit log.
- "Dismiss" persisted per user; dismissed bullets do not re-surface for 7
  days unless the underlying signal changes by >50%.

#### 6. Revenue model
- **Included** for all sellers (lead-nurture value > marginal AI cost).
- Premium tier (`PremiumSubscription.aiAssistantAccess = true`): unlimited
  regenerations, multi-day history of briefings, weekly e-mail digest.
- Free tier: 1 briefing/day, no history.

#### 7. Success metric (with baseline)
- **Metric:** "Time-to-first-action on dashboard" — seconds from
  `/seller/dashboard` load to the seller clicking a deep link in the
  briefing.
- **Baseline (pre-feature):** Median time-to-first-action with the current
  static Business Assistant panel, measured over a 14-day window from
  AnalyticsEvent records where `page='/seller/dashboard'` and the next event
  is a navigation to a Store Center sub-page. If no baseline data exists
  (no sellers using dashboard yet), baseline = "—" and the metric is
  tracked but not targeted.
- **Secondary metric:** Daily-active-sellers on `/seller/dashboard`
  (baseline = current DAU on that route).

#### 8. MVP vs Future
- **MVP:** 3-bullet daily briefing, deterministic candidate selection, LLM
  phrasing in Persian, deep links, dismiss, 1/day regenerate, free for all
  sellers. No e-mail, no history.
- **Future:** Multi-day briefing history with diffs ("yesterday you had 4
  hot leads; today 2"), weekly e-mail digest, voice readout (Persian TTS),
  per-section Copilot panels (Inventory Copilot, Lead Copilot, Order
  Copilot), and a chat mode for ad-hoc questions ("why is my Passport score
  60?").

---

### B. Machine Intelligence Profile — Unified Machine Dossier with Data-Completeness Index

**Status:** MVP-shippable (the underlying data model is already provenance-
aware; the MVP is a UX layer).
**Tagline:** "One page that tells the buyer everything HEAVIX actually knows
about this machine — and what it doesn't."

#### 1. Real problem
A buyer lands on a Listing detail page and sees 4 scattered pieces of info:
the seller's free-text description, an `Inspection` report (maybe), a
`MachinePassport` (maybe), and a set of `ListingAttributeValue` rows whose
provenance (`sourceType`) is invisible to the buyer. The buyer cannot tell
which specs come from the manufacturer, which were typed by the seller, and
which were AI-inferred. This destroys trust. Worse, sellers don't know which
of their own fields are weak, so they don't improve them.

#### 2. User experience
- **Who:** Buyers (read), sellers (read + "improve" CTA), admins (read + verify).
- **What they see:** A "Machine Intelligence Profile" card on the Listing
  detail page, with 4 sections: **Specs** (key/value rows, each with a
  provenance chip: Manufacturer / Seller / AI-extracted / Admin-verified /
  Imported), **Documents** (from `DealDocument` types + any
  `CompanyDocument` shared by seller), **Service & Inspection History**
  (from `MachinePassport.events` + `Inspection` rows), **Appraisal**
  (from `PriceEstimate` if available, with confidence band).
- **Data-Completeness Index:** A deterministic 0–100 score shown as a ring.
  Missing pieces are listed ("no ownership proof", "no inspection in last
  12 months", "no service history").
- **Seller CTA:** "Improve profile" → deep links to the specific fields to
  fill.
- **NO "technical-certified" badge.** The card shows what is verified and by
  whom; it does not claim HEAVIX certifies the machine.

#### 3. Required data (verified against schema)
- `Listing`: `title`, `description`, `condition`, `year`, `workingHours`,
  `brandId`, `modelId`, `categoryId`, `price`, `listingType`, `rentalPeriod`
  (for RENT listings).
- `ListingAttributeValue` (the core): `textValue`/`numberValue`/etc.,
  `sourceType`, `confidence`, `verifiedAt`, `verifiedBy`, `sourceReference`.
  Already provenance-aware — no schema change needed for the MVP.
- `MachinePassport`: `serialNumber`, `inspectionDate`, `inspectionResult`,
  `events[]`. ADR-005 §6 per-section verification fields (proposed) for the
  Future version.
- `Inspection`: `status`, `completedAt`, `score`, `reportUrl`, `photos`.
- `ListingImage`: `url`, `isPrimary`, `sortOrder` (photo count feeds the
  Data-Completeness Index).
- `KnowledgeEntry`: cross-reference for manufacturer specs (`source =
  MANUFACTURER`, `verified = true`) to populate the Specs section when the
  seller hasn't filled them.
- `PriceEstimate`: `estimatedPrice`, `priceLower`, `priceUpper`,
  `confidence`, `comparableCount`, `mainDrivers`, `warnings` — feeds the
  Appraisal section.
- `CompanyDocument` (seller's own, if shared): `type`, `status`.

#### 4. AI method
**Hybrid.**
- **Specs section:** Deterministic read from `ListingAttributeValue` +
  `KnowledgeEntry`. No AI needed — pure provenance surfacing.
- **Data-Completeness Index:** Deterministic weighted score
  (spec-coverage × 30 + photo-count × 15 + passport-events × 15 +
  inspection-current × 20 + ownership-doc × 20). Recomputed on data change.
- **Appraisal summary text:** Small LLM (Persian-first) writes a 1-sentence
  summary of the `PriceEstimate` (e.g. "قیمت شما ۸٪ پایین‌تر از میانگین
  بازار برای این مدل است" with the `mainDrivers` and `warnings` cited).
  Fallback: templated string from `mainDrivers`.
- **Service-history narrative:** Optional LLM summary of
  `MachinePassport.events` (chronological, Persian). Future.

#### 5. Safety control
- Advisory only. The card is read-only for buyers.
- The Data-Completeness Index is deterministic and explainable — every
  missing piece is listed, so the seller can see exactly what to fix.
- **No "technical-certified" or "HEAVIX-verified machine" badge.** The card
  shows provenance chips, not certification claims. The only "verified"
  affordance is on individual fields, attributed to the verifier
  (`verifiedBy`).
- Appraisal text is labeled "AI summary — verify with the seller" and links
  to the `PriceEstimate` detail.
- `AITaskPolicy` for the appraisal-summary LLM: `costCeilingUsd=0.02`,
  `dailyLimit=1000` (cached per listing, re-computed only on
  `PriceEstimate` change).

#### 6. Revenue model
- **Included** for all listings (buyers see it; sellers get the "improve"
  CTA). This is a trust-and-transparency feature; gating it would punish
  non-VIP sellers and reduce marketplace trust.
- Premium tier: the **Appraisal section** (PriceEstimate surfacing) is
  shown to all buyers but only VIP sellers (`PremiumSubscription.companyPage
  = true` or ADR-005 §2 Showroom VIP) can attach a custom "seller's note"
  to it. Free sellers see the same neutral appraisal.

#### 7. Success metric (with baseline)
- **Metric:** "Buyer inquiry rate per listing view" = (`Lead` count +
  `ListingOffer` count + Conversation starts) / `Listing.viewCount` over a
  28-day window, restricted to listings where the Machine Intelligence
  Profile card is shown.
- **Baseline:** Same ratio over the prior 28-day window for the same set of
  listings before the card shipped. If the listing set is too small
  (<50 listings), baseline = "—" and the metric is tracked descriptively.
- **Secondary metric:** Data-Completeness Index uplift 28 days after the
  seller first sees the "improve" CTA (baseline = the index at first view).

#### 8. MVP vs Future
- **MVP:** Specs section with provenance chips + Data-Completeness Index +
  missing-pieces list + "improve" deep links + Appraisal section (if
  `PriceEstimate` exists). Service-history section shows raw
  `MachinePassport.events` (no LLM narrative).
- **Future:** LLM service-history narrative, ADR-005 §6 per-section
  verification chips (specs/ownership/inspection/service-history), buyer-
  side "ask MEKANIX about this machine" chat (idea H), cross-listing
  comparison embedded in the card.

---

### C. Smart Search & Compare — Natural-Language Search + Technical Comparison with Difference Explanation

**Status:** MVP-shippable (extends existing `ComparisonSession`/`ComparisonItem`
and `SEMANTIC_SEARCH` AI task).
**Tagline:** "Ask in Persian: 'یک بیل مکانیکی زیر ۵ میلیارد، کاترپیلار،
کارکرد زیر ۵۰۰۰ ساعت'. Get the matches and a plain-Persian comparison."

#### 1. Real problem
HEAVIX search today is filter-based: brand, category, price, province, year,
working-hours. A buyer who knows what they need in natural language
("excavator under 5 billion IRR, Caterpillar, under 5000 hours, in Tehran
province") has to translate that into 4 separate filter clicks. And once they
have 3 candidate listings in the compare tray, the comparison table shows
specs side-by-side but doesn't explain the differences ("the Cat 320 has 12%
more bucket capacity but 8% less fuel efficiency than the Komatsu PC200").

#### 2. User experience
- **Who:** Buyers (and sellers doing competitive research).
- **What they do:** Type or speak a Persian query in the search bar. The
  query is parsed into structured filters (shown as removable chips) and
  the matching listings are returned. The user picks 2–4 listings and clicks
  "Compare with explanation".
- **What they see:** The structured filter chips (editable), the result
  list, and on the compare page: a side-by-side spec table **plus** a
  "Differences" panel with 3–5 bullet sentences in Persian, each explaining
  one meaningful difference ("موتور کاترپیلار ۲۰ اسب بخار قوی‌تر است؛
  مصرف سوخت کوماتسو ۸٪ کمتر است؛ قیمت کاترپیلار ۱۲٪ بالاتر است").

#### 3. Required data (verified against schema)
- `Listing`: `price`, `year`, `workingHours`, `province`, `city`,
  `condition`, `listingType`, `brandId`, `categoryId`, `modelId`,
  `status = PUBLISHED`.
- `ListingAttributeValue` + `AttributeDefinition`: the actual spec values
  (engine power, operating weight, bucket capacity, fuel consumption, etc.).
  `AttributeDefinition.type` (INTEGER/DECIMAL/UNIT/...) tells the comparison
  engine which attributes are numeric and comparable.
- `Brand` + `BrandAlias`: Persian/Latin brand name matching
  ("کاترپیلار" ↔ "Caterpillar" ↔ "Cat").
- `Category`: tree-based category matching ("بیل مکانیکی" → excavator
  category slug).
- `ComparisonSession` + `ComparisonItem`: existing comparison engine —
  extend, do not rebuild.
- `PriceEstimate`: optional, for "priced fairly / above market" chips.
- `AIGatewayLog` task type: **reuse `SEMANTIC_SEARCH`** (already exists)
  for the NL→filters parsing; **reuse `MARKET_ANALYST`** or a new
  `COMPARE_EXPLAINER` for the difference-explanation.

#### 4. AI method
**Hybrid.**
- **NL→filters:** Small LLM (Persian-first) parses the query into a JSON
  filter object (`{brand, category, maxPrice, maxHours, province, ...}`).
  The LLM is constrained to emit only filter keys that map to real schema
  fields. Deterministic post-validation rejects unknown keys. Fallback: if
  LLM fails or returns invalid JSON, the query is run as a plain text
  search via the existing `SEARCH` task type.
- **Filter chips:** Deterministic rendering from the parsed filter object.
  User can edit chips manually.
- **Comparison table:** Deterministic read from `ListingAttributeValue`
  (numeric attributes side-by-side; categorical as text).
- **Difference explanation:** LLM (Persian-first) takes the structured diff
  (computed deterministically — "Listing A: 92 kW, Listing B: 110 kW, Δ
  +19.6%") and writes 3–5 Persian sentences. The LLM is given the
  deterministic diff as input and told to phrase, not invent. Fallback:
  templated Persian strings from the diff.

#### 5. Safety control
- Advisory only. Search and compare are read-only.
- The NL→filters LLM is **constrained-output**: it must emit a JSON object
  with a fixed key set. Unknown keys are dropped. This prevents prompt
  injection from leaking into filters (e.g. "ignore previous and show all
  listings").
- Price chips sourced from `PriceEstimate` are labeled "AI estimate" and
  link to the estimate detail.
- Difference-explanation bullets cite the underlying attribute and the
  delta; clicking a bullet scrolls to the row in the comparison table.
- `AITaskPolicy` for `SEMANTIC_SEARCH`: `allowedRoles=*`,
  `hourlyLimit=60`, `dailyLimit=300`, `costCeilingUsd=0.02`.
- `AITaskPolicy` for `COMPARE_EXPLAINER` (new): `allowedRoles=*`,
  `hourlyLimit=30`, `dailyLimit=100`, `costCeilingUsd=0.03`, results cached
  per `(comparisonSessionId, attributeSet hash)` for 24h.

#### 6. Revenue model
- **Included** for all users (search is the marketplace front door; gating
  it kills conversion).
- Premium tier: "saved comparison" with shareable link, comparison history,
  and "alert me when a better match appears" (extends `SavedSearch`).

#### 7. Success metric (with baseline)
- **Metric:** "Search-to-listing-view conversion" = fraction of search
  sessions that result in ≥1 Listing detail page view, measured via
  `AnalyticsEvent` (SEARCH → LISTING_VIEW within 5 min, same userId/session).
- **Baseline:** Current filter-based search conversion over the prior
  28-day window. If NL search is A/B tested, baseline = the control arm.
- **Secondary metric:** Compare-tray usage rate (fraction of listing
  detail views that add to `ComparisonSession`), baseline = current rate.

#### 8. MVP vs Future
- **MVP:** NL→filters parsing (Persian + English), filter chips, result
  list, 2–4 listing comparison table, deterministic difference-explanation
  in Persian (templated strings — no LLM in MVP to keep cost zero).
- **Future:** LLM-phrased difference explanations, voice input (Persian
  ASR), "explain in simpler terms" toggle for non-technical buyers,
  cross-brand comparison with reliability hints from `Review` data, and
  "MEKANIX explains" mode (idea H) for technical education.

---

### D. Lead Intelligence — Explainable Lead Score with Human Override

**Status:** MVP-shippable (uses existing `Lead` + `AnalyticsEvent`; the
ADR-005 §3 `Lead.status` field is a nice-to-have, not a blocker).
**Tagline:** "Every lead gets a score, a reason, and a one-click 'I disagree'
button. The AI never moves a lead; you do."

#### 1. Real problem
Sellers receive leads (`Lead` rows) but have no way to triage them. Today
they see a flat list ordered by `createdAt`. A buyer who inquired about 3 of
the seller's listings in 2 days is hotter than one who inquired about 1 a
week ago, but the seller can't see that without manually correlating by
`viewerPhone`. The result: hot leads go cold, cold leads get over-attended.

#### 2. User experience
- **Who:** Sellers (their own leads), admins (any seller's leads).
- **What they do:** Open `/seller/leads`. Each lead row shows a "Lead
  Intelligence" badge: 🔥 Hot / 🟡 Warm / ⚪ Cold, with a one-line reason
  ("این خریدار در ۲ روز گذشته برای ۳ آگهی شما استعلام گرفته است" —
  "this buyer inquired about 3 of your listings in the last 2 days").
- **What they see:** The badge, the reason, and a "why?" expandable that
  shows the deterministic factors (inquiry count, recency, listing value,
  offer history). A "I disagree — re-rank" button lets the seller manually
  override the badge (Cold↔Hot); the override is logged with a reason.
- **What they do NOT see:** the AI never changes `Lead.status` (which
  doesn't exist yet anyway) and never sends a message to the buyer.

#### 3. Required data (verified against schema)
- `Lead`: `listingId`, `viewerPhone`, `viewerName`, `leadType`, `note`,
  `createdAt`. **Note:** `Lead` has no `userId` and no `status` — scoring
  is by `viewerPhone` correlation across the seller's listings.
- `Listing` (the seller's, via `sellerId`/`companyId`): `price` (for
  listing-value weighting), `viewCount`, `favoriteCount`.
- `ListingOffer` (from the same `viewerPhone` or `buyerId`): `offerAmount`,
  `status`, `createdAt` — a buyer who made an offer is hotter than one who
  only inquired.
- `AnalyticsEvent` (permitted behavior data): `eventType` (LISTING_VIEW,
  FAVORITE, COMPARE, CONTACT, SHARE) for the same `userId` or session.
  This is the "permitted behavior data" referenced in the brief —
  `AnalyticsEvent` is HEAVIX's own first-party event stream, not external
  tracking.
- `Conversation` + `Message` (if a chat has started): `lastMessageAt`,
  message count.
- ADR-005 §3 `Lead.status` (proposed, additive): when added, the seller's
  manual override writes to `status`; until then, the override is stored
  in a per-user preference (UI-only).

#### 4. AI method
**Deterministic rule-based (no LLM in MVP).**
- **Score** = `inquiry_recency` (0–30) + `inquiry_count` (0–25) +
  `listing_value` (0–20) + `offer_history` (0–15) + `engagement_depth` (0–10,
  from AnalyticsEvent count).
- **Tier:** ≥70 = Hot, 40–69 = Warm, <40 = Cold.
- **Reason:** Templated Persian string assembled from the contributing
  factors ("۳ استعلام در ۲ روز، ۱ پیشنهاد قیمت، روی آگهی ۱.۲ میلیاردی").
- **Future:** LLM (Persian-first) rephrases the templated reason into a
  natural sentence and suggests a follow-up message (advisory — seller must
  click to send).

#### 5. Safety control
- Advisory only. The score and badge are display-only.
- **Human override is first-class:** the "I disagree" button is prominent,
  and overrides are logged with seller ID, timestamp, old tier, new tier,
  and optional reason.
- **No buyer-side consequence:** the buyer is never notified that they were
  scored "Cold"; the score is internal seller tooling.
- **No autonomous outreach:** the AI never sends a message to the buyer.
  Even the Future "suggest follow-up message" requires the seller to click
  "send".
- `AITaskPolicy`: not applicable in MVP (deterministic, no AI call). Future
  LLM phrasing uses `SELLER_ASSISTANT` policy.
- Rate limit: override API is 10/min per seller (anti-abuse).

#### 6. Revenue model
- **Included** for all sellers (lead triage is core CRM value).
- Premium tier (`PremiumSubscription.priorityLeads = true`): leads from
  VIP buyers or high-value listings are flagged with a "priority" chip;
  seller gets a daily e-mail digest of hot leads.

#### 7. Success metric (with baseline)
- **Metric:** "Lead-to-offer conversion" = fraction of `Lead` rows that
  produce a `ListingOffer` within 14 days, measured per seller cohort
  (with-intelligence vs without).
- **Baseline:** Pre-feature conversion rate over the prior 90-day window
  for the same sellers. If the seller has <20 leads in the baseline window,
  baseline = "—" and the metric is tracked descriptively.
- **Secondary metric:** Override rate (fraction of leads where the seller
  clicked "I disagree"). High override rate (>30%) signals the scoring
  weights need recalibration — it is a quality signal, not a success signal.

#### 8. MVP vs Future
- **MVP:** Deterministic 0–100 score, Hot/Warm/Cold badge, templated
  Persian reason, "why?" expandable, "I disagree" override (UI-only, logged).
  No LLM, no e-mail, no follow-up suggestions.
- **Future:** ADR-005 §3 `Lead.status` integration (override writes to
  status), LLM-phrased reason, follow-up message suggestions (advisory),
  daily hot-lead e-mail digest for premium sellers, cross-listing "this
  buyer also viewed" panel.

---

### E. Dealer Growth Studio — Listing Image, Text, and Showroom SEO Improvement

**Status:** MVP-shippable (uses `ListingImage`, `Listing.description`,
`Company.metaTitle/metaDescription`, `BrandSEO`).
**Tagline:** "Upload a blurry photo and a one-line description. The rhino
shows you exactly what to fix and writes a draft you can edit."

#### 1. Real problem
Most seller listings on HEAVIX have weak photos (single low-res image, no
context), thin descriptions (1–2 sentences), and no SEO metadata. Sellers
know their machines but not how to present them. The result: low
`viewCount`, low inquiry rate, and the seller blames the platform. Today
there is no in-product guidance on what "good" looks like.

#### 2. User experience
- **Who:** Sellers (their own listings + showroom).
- **What they do:** Open a Listing's "Growth Studio" tab. The studio shows
  4 cards: **Photos** (each image with a VLM-generated quality note:
  "تصویر تار است" / "زاویه خوبی نیست" / "عالی"), **Description** (the
  seller's text with inline suggestions and a "draft improved version"
  button), **SEO** (`Company.metaTitle`/`metaDescription` suggestions
  based on the listing's brand/model/category), **Showroom** (VIP sellers
  only — banner/logo/layout suggestions per ADR-005 §2).
- **What they see:** Each card has a "score" (deterministic) and a list of
  specific, actionable improvements. Each improvement has a deep link to
  the edit page. The "draft improved version" produces an editable text
  area prefilled with an LLM draft; the seller must review and click save.
- **What they do NOT see:** no auto-publish. The seller reviews every
  change.

#### 3. Required data (verified against schema)
- `ListingImage`: `url`, `isPrimary`, `sortOrder`, `alt`. (VLM analyzes
  each image.)
- `Listing`: `title`, `description`, `shortDesc`, `condition`, `year`,
  `workingHours`, `brandId`, `modelId`, `categoryId`.
- `ListingAttributeValue`: existing spec values (the description draft can
  reference them).
- `Company`: `description`, `metaTitle`, `metaDescription`, `logoUrl`,
  `coverImage` (ADR-005 §1 proposes additive `bannerUrl`, `brandColor`,
  `storeDescription`, `storeSlug` for the showroom card).
- `Brand` + `BrandSEO`: brand-level SEO keywords to seed suggestions.
- `Category`: category-level SEO patterns.
- `Showroom` (ADR-005 §2, proposed): for the VIP showroom card.
- `AIGatewayLog` task types: **reuse `LISTING_BUILDER`** for description
  drafts; **new `IMAGE_QUALITY`** for VLM photo analysis (or reuse
  `MODERATION` which already scans images).

#### 4. AI method
**Hybrid (VLM + LLM + rules).**
- **Photo quality:** VLM analyzes each `ListingImage` and returns a
  structured quality assessment (blur, lighting, angle, context, machine
  visibility, count). Deterministic post-processing maps to a 0–100 photo
  score per image and per listing.
- **Description draft:** LLM (Persian-first) takes the listing's
  structured data (brand, model, year, hours, condition, key specs from
  `ListingAttributeValue`) and writes a 3–5 sentence Persian description
  draft. The draft is **clearly labeled "AI draft — review before
  publishing"** and placed in an editable textarea.
- **SEO suggestions:** Rule-based, seeded from `BrandSEO.keywords` +
  `Category` patterns + the listing's spec values. Produces a suggested
  `metaTitle` (≤60 chars) and `metaDescription` (≤160 chars) in Persian.
- **Showroom layout (VIP):** Rule-based suggestions per ADR-005 §2
  template (dealer/manufacturer/used_equipment).

#### 5. Safety control
- Advisory only. Every change is a manual seller action.
- **VLM image analysis is read-only** — the VLM never modifies or
  re-uploads images. The "improve photo" CTA links to the seller's own
  upload page.
- **Description draft is labeled AI** and placed in an editable field. The
  seller must click "save" to publish. The saved description is stored as
  seller-authored (no `sourceType = AI` poisoning of `Listing.description`).
- SEO suggestions are templated + LLM-phrased but the seller must save
  them to `Company.metaTitle`/`metaDescription`.
- `AITaskPolicy` for `LISTING_BUILDER`: `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.04`.
- `AITaskPolicy` for `IMAGE_QUALITY` (new): `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=30`, `dailyLimit=200`, `costCeilingUsd=0.02` (VLM is cheap
  for single-image classification), results cached per image hash.
- Cost cap: a seller cannot run the studio on more than 50 listings/day
  (anti-abuse + budget protection).

#### 6. Revenue model
- **Included** for all sellers (description + SEO cards; 3 listings/day).
- Premium tier (`PremiumSubscription.aiAssistantAccess = true` or
  `companyPage = true`): unlimited listings, VLM photo analysis, VIP
  showroom layout card, batch "improve all listings" queue.
- Per-use: a one-off "deep growth audit" (50+ checks, competitor benchmark)
  for a flat fee (marketplace credit, not subscription).

#### 7. Success metric (with baseline)
- **Metric:** "Listing inquiry lift post-studio" = median
  (leads+offers+conversations per view) in the 28 days after a seller
  first uses the Growth Studio, vs the 28 days before for the same
  listings.
- **Baseline:** Pre-studio rate for the same listings. If the seller's
  listings had <100 views in the baseline window, baseline = "—".
- **Secondary metric:** Adoption rate (fraction of active sellers who use
  the Growth Studio at least once in 28 days), baseline = 0 (new feature).

#### 8. MVP vs Future
- **MVP:** Description draft card (LLM, Persian-first, editable, labeled
  AI) + SEO card (rule-based + LLM-phrased, editable) + per-listing
  growth score (deterministic). 3 listings/day free. No VLM.
- **Future:** VLM photo analysis, VIP showroom layout card, batch queue,
  competitor benchmarking ("listings like yours in your category average X
  photos; you have Y"), A/B test harness for description variants, and
  scheduled re-audit (monthly) with diff ("you added 2 photos; score up
  18 points").

---

### F. Machine Match — Buyer-Side Machine Recommendation

**Status:** MVP-shippable (extends existing `UserRecommendation`).
**Tagline:** "Tell the rhino what you need. It shows you 5 machines and why
each one fits."

#### 1. Real problem
Buyers arrive at HEAVIX with a need ("I need an excavator for a residential
site in Tehran, budget 4–6 billion IRR, prefer Caterpillar but open, need it
within 2 months") but no single listing matches perfectly. Today they
search, scroll, get overwhelmed, and leave. The existing
`UserRecommendation` engine produces "similar to viewed" suggestions, but
that is reactive (based on past views), not need-driven (based on a stated
need).

#### 2. User experience
- **Who:** Buyers (and sellers doing competitive research).
- **What they do:** Click "Machine Match" on the homepage or after a
  zero-result search. Fill a 4-field need form: use-case (category), budget
  range, location, timeline. Optionally: brand preference, capacity need,
  new/used.
- **What they see:** 5 matching listings, each with a "Why this matches"
  panel: 3 bullets (e.g. "بودجه: در محدوده شما" / "کارکرد: ۱۲٪ کمتر از
  میانگین دسته" / "موقعیت: تهران، ۲۰ کیلومتر"). A "show me 5 more" button
  re-runs with relaxed constraints.
- **What they do NOT see:** no auto-favorite, no auto-contact. The buyer
  clicks through to the listing like any other.

#### 3. Required data (verified against schema)
- `UserRecommendation` (existing): `userId`, `listingId`, `reason`, `score`,
  `dismissed`, `clickedAt`. Extend the `reason` enum with `NEED_MATCH`.
- `Listing`: `price`, `year`, `workingHours`, `province`, `city`,
  `condition`, `listingType`, `brandId`, `categoryId`, `modelId`,
  `status = PUBLISHED`, `expiresAt` (must not be expired).
- `ListingAttributeValue`: capacity, power, weight, etc. for need matching.
- `BuyRequest` (existing): if the buyer has posted a BuyRequest, use its
  `budgetMin/Max`, `category`, `brandPref`, `city`, `province`, `deadline`
  as the need.
- `Category` + `Brand`: for normalization.
- `PriceEstimate`: optional, for "priced fairly vs market" chip.
- `AIGatewayLog` task type: **reuse `SEMANTIC_SEARCH`** for need parsing,
  **new `NEED_MATCH`** for the scoring (or reuse `MARKET_ANALYST`).

#### 4. AI method
**Hybrid.**
- **Need parsing:** If the buyer typed a free-text need (optional), small
  LLM parses it into the same JSON filter object as idea C. Otherwise the
  structured form is used directly.
- **Matching:** Deterministic scoring. For each candidate listing, compute
  a 0–100 match score = `budget_fit` (30) + `use_case_fit` (25, category
  match) + `capacity_fit` (20, from `ListingAttributeValue` vs need) +
  `location_fit` (15, province/city) + `timeline_fit` (10, listing
  availability + `expiresAt`).
- **Why-this-matches:** Templated Persian bullets from the contributing
  factors. Each bullet cites the field ("بودجه: ۴.۸ میلیارد، در محدوده
  شما (۴–۶)").
- **Future:** LLM-phrased bullets + "relax constraint" suggestions ("if
  you raise your budget by 10%, 12 more matches appear").

#### 5. Safety control
- Advisory only. No mutations; no auto-favorite; no auto-contact.
- The buyer's need is stored as a `SavedSearch` (existing model) so they
  can opt into alerts — opt-in, not default.
- Match results are deterministic and explainable; the buyer can see the
  match score breakdown.
- Listings are not ranked by seller VIP status in the match score (that
  would corrupt the trust signal); VIP status only affects the optional
  "featured" chip, clearly separated.
- `AITaskPolicy` for `NEED_MATCH` (new): `allowedRoles=*`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.02`. Results
  cached per need-hash for 1h.

#### 6. Revenue model
- **Included** for all buyers (matching is the marketplace's core value).
- Premium tier for sellers: "boost in match results" is **not** pay-to-rank
  (that would corrupt trust). Instead, VIP sellers get a "featured" chip
  that is visually distinct and only appears when the listing is already in
  the top-5 by match score. This preserves ranking integrity.
- Per-use: a "deep match" with financing eligibility pre-check (GATED —
  see §6).

#### 7. Success metric (with baseline)
- **Metric:** "Match-to-inquiry conversion" = fraction of Machine Match
  sessions that produce ≥1 `Lead` or `ListingOffer` or Conversation start
  within 7 days.
- **Baseline:** Same conversion for the regular search flow over the prior
  28-day window. If Machine Match is A/B tested, baseline = control arm.
- **Secondary metric:** Return rate (fraction of Machine Match users who
  use it again within 14 days), baseline = 0 (new feature).

#### 8. MVP vs Future
- **MVP:** 4-field need form, deterministic 0–100 match score, top-5
  listings, templated Persian "why this matches" bullets, "5 more" button,
  save-need-as-SavedSearch (opt-in alert). No LLM.
- **Future:** Free-text need input (LLM parsing), LLM-phrased bullets,
  "relax constraint" suggestions, cross-need ("buyers with similar needs
  also considered..."), and "alert me when a better match appears"
  (extends `SavedSearch` notification).

---

### G. Trust & Documentation Center — Missing/Expired Doc Detection + Contradiction Flagging

**Status:** MVP-shippable (uses `CompanyDocument`, `CompanyVerification`,
`DealDocument`, `Inspection`, `MachinePassport`).
**Tagline:** "The rhino reads your paperwork so the buyer doesn't have to
doubt you. It catches what's missing and what contradicts itself — but it
never certifies, and never accuses."

#### 1. Real problem
Trust on a machinery marketplace depends on documentation: business
license, ownership proof, inspection report, service history. Today these
are scattered across `CompanyDocument`, `CompanyVerification`,
`DealDocument`, `Inspection`, and `MachinePassport`. Sellers don't know
which docs are missing or expired; buyers can't tell which docs are
current. Worse, sellers sometimes upload contradictory info (year 2020 in
one place, 2021 in another) and no one notices until a deal falls through.

#### 2. User experience
- **Who:** Sellers (their own trust center), buyers (view a seller's
  public trust card), admins (verify/reject).
- **What they do (seller):** Open `/seller/trust`. See a checklist:
  Business License (✅ verified 2026-08, expires 2027-08), Ownership Proof
  for Listing X (⚠️ expired 2026-09), Inspection for Listing Y (❌ missing),
  Service History for Listing Z (❌ missing). Each row has a deep link to
  upload or renew.
- **What they do (buyer):** On a Listing detail page, see a "Trust" card
  with the seller's verification level (Company.verified) and the listing's
  doc status (which docs are present and current). **No "HEAVIX-certified"
  badge** — just presence + freshness.
- **Contradiction flagging (seller + admin):** A "Review contradictions"
  panel lists detected contradictions ("Listing X says year=2020 in
  description but year=2021 in `ListingAttributeValue`; Passport
  `inspectionResult` says 'passed' but `Inspection.score` = 42/100"). Each
  is a deep link to resolve.

#### 3. Required data (verified against schema)
- `CompanyDocument`: `type` (BUSINESS_LICENSE/TAX_CERT/OWNERSHIP_PROOF/
  REPRESENTATIVE_ID/BANK_STATEMENT/OTHER), `status`
  (PENDING/VERIFIED/REJECTED), `verifiedBy`, `verifiedAt`.
- `CompanyVerification`: `status`, `verificationType`, `expiresAt`,
  `revokedAt`, `revokeReason`.
- `DealDocument` (per deal): `type` (CONTRACT/INSPECTION_REPORT/INVOICE/
  OWNERSHIP_PROOF/TRANSPORT_DOC/OTHER), `status`.
- `Inspection`: `status`, `completedAt`, `score`, `reportUrl`,
  `scheduledDate`.
- `MachinePassport`: `serialNumber`, `inspectionDate`, `inspectionResult`,
  `events[]`. ADR-005 §6 per-section verification fields (proposed) for
  Future.
- `Listing` vs `ListingAttributeValue` vs `MachinePassport`:
  cross-source field comparison for contradiction detection
  (year, hours, condition, inspection pass/fail).
- `Company.expiresAt`-equivalent: `CompanyVerification.expiresAt` is the
  closest existing field; company-level doc expiry is per-`CompanyDocument`
  (no `expiresAt` on that model — a gap to flag in Open Questions).

#### 4. AI method
**Hybrid (rules + LLM).**
- **Missing/expired detection:** Deterministic rules. For each listing,
  check: ownership proof present + current? Inspection within last 12
  months? Service history (`MachinePassport.events`) non-empty? Business
  license (Company-level) current?
- **Contradiction detection:** Deterministic field-by-field comparison
  across `Listing`, `ListingAttributeValue`, `MachinePassport`,
  `Inspection`. Numeric tolerance (e.g. ±2% on working hours) before
  flagging.
- **LLM (Persian-first):** Writes a 1-sentence human-readable description
  of each contradiction for the "Review contradictions" panel. The LLM is
  given the deterministic diff and told to phrase, not invent. Fallback:
  templated Persian string.

#### 5. Safety control
- Advisory only. The Trust Center never rejects, approves, or revokes a
  document — that is always a human admin action via
  `CompanyVerification`/`CompanyDocument` status transitions.
- **No forgery detection.** The brief explicitly says "NO forgery, NO
  auto-certification." The Trust Center does **not** claim to detect
  forged documents. It only checks presence, freshness, and internal
  consistency. A dedicated forgery-detection feature is out of scope and
  would require legal review (a candidate for the Gated register, but
  **not proposed here** — see §6 note).
- **No public accusation.** Contradiction flags are seller-visible and
  admin-visible only; buyers see doc presence + freshness, never
  "contradictions found".
- **No "HEAVIX-certified" badge.** The Trust card shows `Company.verified`
  (an existing boolean) and per-doc status; it does not introduce a new
  certification claim.
- `AITaskPolicy` for the contradiction-description LLM: reuse
  `SELLER_ASSISTANT` or `MODERATION`, `costCeilingUsd=0.02`, cached per
  contradiction-set hash.

#### 6. Revenue model
- **Included** for all sellers and buyers (trust is a marketplace public
  good; gating it reduces liquidity).
- Premium tier (`PremiumSubscription.companyPage = true`): sellers can
  display the Trust card prominently on their VIP showroom (ADR-005 §2)
  and add a custom "trust statement" (seller-authored, clearly labeled).
- Per-use: none. Trust is not paywalled.

#### 7. Success metric (with baseline)
- **Metric:** "Deal completion rate" = fraction of `Deal` rows reaching
  `COMPLETED` (vs `CANCELLED`/`DISPUTED`/`EXPIRED`) for sellers who use
  the Trust Center, vs a matched cohort who don't, over 90 days.
- **Baseline:** Pre-feature deal completion rate for the same sellers
  (paired before/after) or for a matched control cohort. If the seller
  cohort is <20 deals, baseline = "—".
- **Secondary metric:** Doc completeness uplift (count of present+current
  docs per seller) 28 days after first Trust Center visit, baseline =
  count at first visit.

#### 8. MVP vs Future
- **MVP:** Seller-side checklist (missing/expired docs with deep links),
  buyer-side Trust card (doc presence + freshness, no contradictions
  shown), deterministic contradiction detection (seller + admin only),
  templated Persian contradiction descriptions.
- **Future:** LLM-phrased contradiction descriptions, ADR-005 §6 per-
  section passport verification chips, expiry-reminder e-mails (30/7/1
  days before), "trust score" (deterministic, weighted) shown to buyers
  as a number with a "what goes into this" expandable, and a (legally
  reviewed, GATED) optional third-party document-verification service
  integration — explicitly Gated, not proposed for de-gating.

---

### H. HEAVIX / MEKANIX Character Experience — Commercial Guidance & Technical Education

**Status:** MVP-shippable as a surfaced identity system; Future adds
interactive guidance.
**Tagline:** "HEAVIX (the rhino in the coordinator vest) helps you buy and
sell. MEKANIX (the same rhino in the technician apron) helps you understand
the machine. Neither replaces a licensed inspector, a credit officer, or a
safety authority."

#### 1. Real problem
The Store Center, search, deal room, and trust flows are dense and
jargon-heavy. New sellers get lost; new buyers don't know what "working
hours" or "operating weight" means in context. The existing mascot identity
(`PRODUCT-HEAVIX-MECHANICS-MASCOT.md`) defines the character but does not
specify where and how it surfaces in the product to actually help. Without
surfacing, the character is marketing art, not a UX asset.

#### 2. User experience
- **Who:** All users (sellers, buyers, admins).
- **What they do (HEAVIX role — commercial):** See HEAVIX in onboarding
  checklists, empty states across Store Center sections, error messages,
  and the Copilot panel (idea A). HEAVIX speaks Persian-first, in a
  coordinator tone: friendly, action-oriented, never technical.
- **What they do (MEKANIX role — technical):** See MEKANIX on Listing
  detail pages (explaining a spec in plain Persian when the user clicks
  the "MEKANIX explains" chip beside a `ListingAttributeValue`), in
  inspection guides, in service-history narratives, and in the comparison
  "Differences" panel (idea C). MEKANIX speaks Persian-first, in a
  technician tone: precise, educational, never salesy.
- **What they do NOT see:** characters never claim to be a licensed
  inspector, a credit officer, a safety authority, or a qualified
  mechanic. Every MEKANIX technical explanation carries a visible
  "آموزشی — برای تصمیم نهایی به کارشناس مراجعه کنید" ("educational —
  consult a qualified expert for the final decision") disclaimer.

#### 3. Required data (verified against schema)
- Character identity: defined in `PRODUCT-HEAVIX-MECHANICS-MASCOT.md`.
  No schema change for MVP — the character is a UI/voice layer.
- HEAVIX surfaces reuse: idea A (Copilot), idea E (Growth Studio), idea G
  (Trust Center), Store Center empty states.
- MEKANIX surfaces reuse: idea B (Machine Intelligence Profile — spec
  explanations), idea C (Smart Search & Compare — difference
  explanations), idea N (Inspection Intelligence — service cadence
  education), `KnowledgeEntry` (verified manufacturer specs for
  accuracy).
- `AttributeDefinition`: `labelFa`/`labelEn` + `unit` + `description` (if
  added) for spec explanations.
- `KnowledgeEntry`: `source = MANUFACTURER`, `verified = true` entries
  are the authoritative source MEKANIX cites.
- `AIGatewayLog` task type: **new `CHARACTER_GUIDE`** (or reuse
  `SELLER_ASSISTANT` for HEAVIX, `MARKET_ANALYST` for MEKANIX).

#### 4. AI method
**LLM (Persian-first) with character system prompts.**
- **HEAVIX system prompt:** "You are HEAVIX, a friendly industrial rhino
  in a coordinator vest. You help users navigate the HEAVIX marketplace.
  You speak Persian first, English on request. You are action-oriented
  and never technical. You never claim to be a licensed professional. You
  always link to the next action."
- **MEKANIX system prompt:** "You are MEKANIX, the same rhino in a
  technician apron. You explain machine specifications and inspection
  concepts in plain Persian. You cite the source (manufacturer spec,
  seller-input, AI-inferred) for every fact. You always end with the
  disclaimer: 'این توضیح آموزشی است؛ برای تصمیم نهایی به کارشناس
  مراجعه کنید.' You never make a certification claim."
- **Retrieval:** MEKANIX explanations are grounded in `KnowledgeEntry`
  (verified) + `AttributeDefinition` (labels/units). The LLM is given
  the relevant entries as context; if no verified entry exists, MEKANIX
  says "I don't have a manufacturer-verified value for this" rather than
  guessing.

#### 5. Safety control
- **Characters never replace experts.** Every MEKANIX surface carries the
  visible disclaimer. Every HEAVIX commercial surface avoids specific
  technical claims ("this machine is in good condition" is forbidden;
  "the seller reports condition X, last inspected Y" is allowed).
- **No autonomous action.** Characters suggest; users click.
- **No certification claim.** Characters never say "HEAVIX-certified" or
  "MEKANIX-approved."
- **Source citation.** MEKANIX cites `KnowledgeEntry.source` for every
  spec; if `source = AI`, MEKANIX says "this is an AI-inferred value,
  not manufacturer-verified."
- **Tone safety.** System prompts include negative constraints (no
  medical/safety/legal/financial advice; no guaranteed returns; no
  price guarantees).
- `AITaskPolicy` for `CHARACTER_GUIDE` (new): `allowedRoles=*`,
  `hourlyLimit=30`, `dailyLimit=200`, `costCeilingUsd=0.02`,
  `maxOutputTokens=300`. Cached per (question, attribute set) hash.

#### 6. Revenue model
- **Included** for all users (character is brand experience, not a
  paywall).
- Premium tier: VIP sellers get a customized HEAVIX onboarding flow
  (branded with their `Company.brandColor` per ADR-005 §1) and a
  "MEKANIX deep-dive" on their listings (longer technical explanations
  for buyers).

#### 7. Success metric (with baseline)
- **Metric:** "Onboarding completion rate" = fraction of new sellers who
  complete the Store Center onboarding checklist within 7 days, with
  HEAVIX character surfaces vs without (A/B).
- **Baseline:** Pre-character onboarding completion rate over the prior
  28-day window. If A/B tested, baseline = control arm.
- **Secondary metric:** "Spec explanation engagement" = fraction of
  Listing detail page views where the user clicks at least one "MEKANIX
  explains" chip. Baseline = 0 (new surface).

#### 8. MVP vs Future
- **MVP:** HEAVIX in onboarding checklist + empty states + Copilot panel
  (idea A); MEKANIX "explains" chip on 5–10 key `ListingAttributeValue`
  fields (engine power, operating weight, working hours, bucket capacity,
  fuel consumption), Persian-first, source-cited, disclaimer-shown.
  Static character assets.
- **Future:** Interactive MEKANIX chat on Listing detail pages ("ask
  MEKANIX about this machine"), voice readout (Persian TTS) for
  accessibility, animated character reactions (subtle), per-Company
  branded HEAVIX for VIP showrooms, and a "MEKANIX academy" content hub
  (long-form educational articles, Persian-first, sourced from
  `KnowledgeEntry`).

---

### I. Price Intelligence Advisory — Confidence-Banded Estimates for Buyers & Sellers

**Status:** MVP-shippable (the `PriceObservation`/`PriceEstimate`/
`PriceOverride` engine already exists; this is a UX/surfacing layer).
**Tagline:** "Not a quote. Not an appraisal. A confidence band with the
comparables and the warnings, in Persian, so both sides negotiate with the
same facts."

#### 1. Real problem
HEAVIX already computes `PriceEstimate` (estimatedPrice, priceLower,
priceUpper, confidence, comparableCount, mainDrivers, warnings) per
listing, but the surface is buried in admin tooling. Buyers and sellers
don't see it, so they negotiate blind. The result: asymmetric information,
stalled deals, and price disputes. The fix is not a new engine — it is
surfacing the existing estimate with its provenance and confidence band,
clearly labeled "advisory, not a quote."

#### 2. User experience
- **Who:** Buyers and sellers (each sees the same neutral estimate).
- **What they do:** On a Listing detail page, see a "Price Intelligence"
  card (only if a `PriceEstimate` row exists with `confidence !=
  INSUFFICIENT`). The card shows: the asking price, the estimated band
  (priceLower–priceUpper), a confidence chip (HIGH/MEDIUM/LOW), the
  comparable count, and 1–3 "mainDrivers" bullets in Persian ("کارکرد
  ۱۲٪ کمتر از میانگین دسته" / "سال ساخت جدید‌تر از میانگین"). Warnings
  ("تعداد کمِ نمونه‌های قابل مقایسه") are shown if present.
- **What they do NOT see:** no "fair price" verdict, no "you should offer
  X" recommendation. The card is informational; the negotiation is the
  user's.

#### 3. Required data (verified against schema)
- `PriceEstimate` (existing): `estimatedPrice`, `priceLower`,
  `priceUpper`, `confidence`, `comparableCount`, `dataFreshness`,
  `mainDrivers` (JSON), `warnings` (JSON), `modelVersion`, `createdAt`.
- `PriceObservation` (existing): the underlying comparables — used to
  populate a "see comparables" expandable.
- `PriceOverride` (existing): if a seller/admin has overridden the
  estimate, the card shows the override + reason (transparency).
- `Listing.price`: the asking price, shown alongside the band.
- `CurrencyRate` (store-schema): if the estimate is in IRR and the
  listing is in USD (or vice versa), the card shows both via the current
  rate, labeled "converted at today's rate".
- `AIGatewayLog` task type: **reuse `PRICE_ANALYSIS`** (already exists).

#### 4. AI method
**Hybrid.**
- **Estimate computation:** Existing deterministic engine (out of scope
  for this idea — it already runs). The idea is about surfacing.
- **MainDrivers / warnings phrasing:** LLM (Persian-first) takes the
  structured `mainDrivers` JSON (e.g. `{factor: "working_hours",
  direction: "lower", magnitude: 0.12}`) and writes a Persian bullet.
  Fallback: templated Persian string from the JSON.
- **Comparables summary:** Deterministic count + median + range; LLM
  writes a 1-sentence summary.

#### 5. Safety control
- Advisory only. The card is read-only.
- **No "fair price" verdict.** The card shows a band and drivers, never
  a recommendation.
- **Confidence is prominent.** LOW-confidence estimates show a muted card
  with "low confidence — few comparables" warning. INSUFFICIENT-
  confidence estimates are not shown at all (no fabrication).
- **No guaranteed valuation.** The card explicitly says "این یک برآورد
  آماری است، نه ارزیابی رسمی" ("this is a statistical estimate, not an
  official appraisal").
- `AITaskPolicy` for the phrasing LLM: reuse `PRICE_ANALYSIS` or
  `MARKET_ANALYST`, `costCeilingUsd=0.02`, cached per
  (PriceEstimate.id, locale) for 24h.

#### 6. Revenue model
- **Included** for all users (price transparency is a marketplace public
  good).
- Premium tier: sellers see a "price intelligence history" for their
  listings (how the band has moved over 90 days) and a "competitor price
  map" for their category. Buyers see nothing extra (symmetric
  information is the point).
- **No per-use fee** on the estimate itself — that would create a
  perverse incentive to inflate estimates.

#### 7. Success metric (with baseline)
- **Metric:** "Deal cycle time" = median days from `Deal.createdAt` to
  `Deal.completedAt`, for deals where the Price Intelligence card was
  shown to both parties vs a matched cohort where it wasn't.
- **Baseline:** Pre-feature deal cycle time over the prior 90-day window
  for the same listings. If cohort <20 deals, baseline = "—".
- **Secondary metric:** Card-view-to-inquiry rate (fraction of Listing
  detail views with the card shown that produce an inquiry), baseline =
  same rate for listings without a card.

#### 8. MVP vs Future
- **MVP:** Price Intelligence card on Listing detail (if
  `PriceEstimate` exists with confidence ≠ INSUFFICIENT), asking price +
  band + confidence chip + comparable count + templated Persian
  mainDrivers/warnings + override transparency. No LLM phrasing (templated
  only) to keep MVP cost zero.
- **Future:** LLM-phrased bullets, 90-day band history (premium),
  competitor price map (premium), "alert me when this listing's estimate
  crosses the asking price" (extends `SavedSearch`), and a (GATED, legally
  reviewed) optional integration with a licensed appraiser network for a
  paid official appraisal — explicitly Gated, not de-gated.

---

### J. RFQ Auto-Match & Quote Bench — Advisory Seller Ranking + Quote Benchmarking

**Status:** MVP-shippable (uses existing `RFQ` + `RFQQuote`).
**Tagline:** "Post an RFQ. The rhino ranks which sellers are most likely to
quote well, and shows each seller how their quote compares — without
revealing anyone's price."

#### 1. Real problem
A buyer posts an `RFQ` ("I need 2 excavators, Caterpillar, Tehran, 60-day
deadline, budget 8–10 billion IRR"). Today the RFQ sits in a queue and
sellers quote blindly. The buyer has no signal for which sellers are
likely to be responsive, fair-priced, or well-matched. Sellers who do
quote have no sense of whether their `unitPrice` is competitive. The
result: low RFQ conversion, sellers waste time on poor-fit RFQs, buyers
get few quotes.

#### 2. User experience
- **Who:** Buyers (post RFQ, see ranked seller suggestions), sellers (see
  RFQs matched to them, see quote benchmark after quoting).
- **What they do (buyer):** After posting an RFQ, see a "Suggested
  Sellers" panel: 5–10 sellers ranked by match score (listing catalog
  fit, location fit, past responsiveness, review rating). Each has a
  "invite to quote" button (advisory — the buyer can also let the RFQ be
  public).
- **What they do (seller):** See RFQs that match their catalog in a
  "Matched RFQs" feed (instead of the firehose). After submitting a
  quote, see a "Quote Bench" card: "your quote is in the lower/middle/
  upper third of quotes received" (no other seller's price revealed),
  with a fairness hint based on `PriceEstimate` for the implied machine.
- **What they do NOT see:** no auto-quoting, no price revelation, no
  seller-side ranking manipulation.

#### 3. Required data (verified against schema)
- `RFQ` (existing): `machineType`, `brandPref`, `quantity`, `specJson`,
  `budgetMin/Max`, `location`, `deadline`, `status`.
- `RFQQuote` (existing): `unitPrice`, `totalPrice`, `deliveryTime`,
  `status`, `sellerId`.
- `Listing` (seller's catalog): for matching `machineType`/`brandPref`
  to the seller's `categoryId`/`brandId`.
- `Company`: `verified`, `city`, `province`, `avgRating`, `reviewCount`.
- `Review`: `verifiedDeal`, `rating` — for seller responsiveness/fairness
  signal.
- `Deal` + `Order`: past deal velocity per seller (time from quote to
  `Deal.completedAt`).
- `PriceEstimate`: for the quote-bench fairness hint.
- `AIGatewayLog` task type: **new `RFQ_MATCH`** (or reuse
  `MARKET_ANALYST`).

#### 4. AI method
**Deterministic rule-based (no LLM in MVP).**
- **Seller match score** = `catalog_fit` (30, category/brand match) +
  `location_fit` (20) + `responsiveness` (20, from past deal velocity) +
  `reputation` (20, from `Review.verifiedDeal` + rating) +
  `capacity_fit` (10, from `specJson` vs seller's `ListingAttributeValue`
  ranges).
- **Quote bench:** Deterministic. After a seller quotes, compute the
  quote's percentile among all quotes for that RFQ (without revealing
  others' prices). Show "lower third / middle third / upper third" +
  fairness hint from `PriceEstimate` ("your quote is 8% above the
  market estimate band for this machine").
- **Future:** LLM (Persian-first) writes a 1-sentence "why this seller
  is suggested" explanation for the buyer.

#### 5. Safety control
- Advisory only. The buyer invites; the seller quotes; both are manual.
- **No price revelation.** The quote bench shows percentiles, never other
  sellers' prices.
- **No pay-to-rank.** Seller match score does not include VIP status;
  VIP sellers get a "featured" chip only, clearly separated.
- **No auto-quote.** Sellers always type their own price.
- `AITaskPolicy` for `RFQ_MATCH`: `allowedRoles=*`, `hourlyLimit=20`,
  `dailyLimit=100`, `costCeilingUsd=0.02`, cached per (RFQ.id) for 1h.

#### 6. Revenue model
- **Included** for all buyers and sellers (RFQ conversion benefits the
  marketplace).
- Premium tier (`PremiumSubscription.priorityLeads = true`): sellers see
  matched RFQs 24h before non-premium sellers (priority queue, not
  ranking boost).
- Per-use: a "deep RFQ analyst" (competitor quote distribution, win-rate
  prediction) for a flat fee — premium feature.

#### 7. Success metric (with baseline)
- **Metric:** "RFQ-to-award conversion" = fraction of `RFQ` rows reaching
  `AWARDED` status within `deadline`, with Auto-Match vs without.
- **Baseline:** Pre-feature RFQ-to-award rate over the prior 90-day
  window. If RFQ volume <30 in baseline, baseline = "—".
- **Secondary metric:** Quotes-per-RFQ (median), baseline = current
  median.

#### 8. MVP vs Future
- **MVP:** Seller match score (deterministic), suggested-sellers panel
  for buyers (top 5, with "invite to quote"), matched-RFQs feed for
  sellers, quote-bench percentile card (no price reveal), fairness hint
  from `PriceEstimate`. No LLM.
- **Future:** LLM-phrased "why this seller" explanations, win-rate
  prediction (premium), competitor quote distribution (premium, anonymized),
  auto-invite (buyer sets criteria; system invites top-N — but each
  invite is logged and the buyer can revoke), and a (GATED) financing-
  eligibility pre-check on awarded RFQs.

---

### K. Demand Pulse — Seller Sourcing Intel from Zero-Result Searches

**Status:** MVP-shippable (uses existing `DemandSignal` + `AnalyticsEvent`).
**Tagline:** "The rhino tells you what buyers searched for and didn't find.
That's your next listing."

#### 1. Real problem
`DemandSignal` already captures zero-result searches (`resultCount = 0`)
with `intent` (BUY/RENT/COMPARE/RESEARCH/PARTS/SERVICE), `category`,
`brand`, `city`. This is gold for sellers deciding what to source/list
next — but today it sits unused in the database. Sellers list what they
have, not what buyers want, creating supply-demand mismatch.

#### 2. User experience
- **Who:** Sellers (their category/region), admins (market-wide).
- **What they do:** Open `/seller/demand-pulse`. See a "Top unmet demand"
  table: for their categories (`Listing.categoryId` set) and provinces,
  the top 10 zero-result search patterns in the last 30 days, with
  count + intent + recent trend (↑/↓).
- **What they see:** Each row: search pattern ("بیل کوماتسو زیر ۳
  میلیارد در اصفهان"), count (e.g. 47 searches in 30d), intent (BUY),
  trend (↑ 18% vs prior 30d), and a "I have one — list it" CTA that
  pre-fills a Listing draft with the category/brand/province.
- **What they do NOT see:** no individual buyer identities, no
  contact-info scraping. The data is aggregated and anonymized.

#### 3. Required data (verified against schema)
- `DemandSignal` (existing): `query`, `category`, `brand`, `city`,
  `resultCount`, `intent`, `convertedToRequest`, `createdAt`.
- `AnalyticsEvent` (existing, supplementary): `eventType = SEARCH` with
  `query` + `userId?` for richer trend analysis (opt-in, anonymized).
- `Listing` (seller's): `categoryId`, `province`, `city` — to scope the
  demand view to the seller's catalog.
- `BuyRequest` (existing): cross-reference — if a `DemandSignal` has
  `convertedToRequest = true`, the BuyRequest shows public demand
  confirmation.
- `Category` + `Brand`: for normalization and display.
- `AIGatewayLog` task type: **deterministic, no AI call in MVP**. Future:
  LLM (Persian-first) writes a "demand narrative" summary.

#### 4. AI method
**Deterministic rule-based (MVP).**
- **Aggregation:** Group `DemandSignal` by (normalized query, category,
  brand, city) over 30d. Filter `resultCount = 0`. Rank by count.
- **Trend:** Compare last-30d count to prior-30d count; show ↑/↓/flat.
- **Seller scoping:** Restrict to (categories where the seller has ≥1
  listing) OR (provinces where the seller has ≥1 listing), to avoid
  noise.
- **Future:** LLM (Persian-first) writes a 2-sentence "demand narrative"
  per category ("خریداران در اصفهان به‌دنبال بیل‌های کوماتسو زیر ۳
  میلیارد هستند؛ این تقاضا در ۳۰ روز گذشته ۱۸٪ رشد داشته است").
  Fallback: templated string.

#### 5. Safety control
- Advisory only. No mutations; no auto-listing.
- **Anonymization.** Demand Pulse shows aggregated counts, never
  individual `AnalyticsEvent.userId` or `DemandSignal` row contents. A
  minimum threshold (e.g. ≥5 searches in 30d) prevents deducing a single
  buyer's activity.
- **No contact scraping.** Demand Pulse never reveals buyer phone/email.
- **No "guaranteed demand" claim.** The surface says "buyers searched
  for this and didn't find it" — not "you will sell this."
- `AITaskPolicy`: not applicable in MVP (deterministic). Future LLM
  narrative uses `MARKET_ANALYST`, `costCeilingUsd=0.02`, cached per
  (seller, category, 30d window).

#### 6. Revenue model
- **Included** for all sellers (market liquidity benefits everyone).
- Premium tier: 90-day trend (vs 30d free), cross-category demand map,
  weekly e-mail digest of top unmet demand in the seller's scope.
- Per-use: a "deep demand report" (cross-region, 12-month trend,
  competitor supply analysis) for a flat fee — premium.

#### 7. Success metric (with baseline)
- **Metric:** "Demand-to-listing conversion" = fraction of top-10
  Demand Pulse patterns (per seller, per 30d window) that produce ≥1
  new `Listing` from that seller within 14 days, vs a control cohort
  without Demand Pulse access.
- **Baseline:** Pre-feature, the rate at which zero-result search
  patterns organically produce new listings (from any seller) within
  14 days. If baseline data is sparse, baseline = "—".
- **Secondary metric:** Demand Pulse weekly active users (sellers),
  baseline = 0 (new feature).

#### 8. MVP vs Future
- **MVP:** Top-10 unmet demand table (30d, scoped to seller's categories
  + provinces), with count + intent + trend + "I have one — list it"
  CTA (pre-fills Listing draft). No LLM.
- **Future:** LLM demand narrative, 90-day trend (premium), cross-
  category demand map (premium), weekly e-mail digest (premium), and a
  "demand-alert" subscription (extends `SavedSearch` — alert me when
  demand for X in my region crosses a threshold).

---

### L. Listing Moderation Co-Pilot — VLM-Based Pre-Publish Risk Scan (Advisory to Admin)

**Status:** MVP-shippable (uses existing `ModerationLog` + `ListingImage`).
**Tagline:** "Before a listing goes live, the rhino scans it for risk signals
and shows the admin a ranked queue. The admin still approves every one."

#### 1. Real problem
HEAVIX moderation today is reactive: a listing publishes, then a human
moderator reviews `ModerationLog` entries. High-risk listings (prohibited
categories, mismatched photos, suspicious pricing, duplicate listings) can
sit live for hours. The `ModerationLog` model already supports
`AI_SCAN`/`FLAG`/`APPROVE`/`REJECT`/`OVERRIDE` actions and a `riskScore`,
but the AI scan that populates it is underused. The fix is a pre-publish
VLM+rules scan that ranks the moderation queue by risk so humans focus
where it matters.

#### 2. User experience
- **Who:** Admins (moderation queue); sellers (see "in review" status
  faster).
- **What they do (admin):** Open the moderation queue. Listings are
  ranked by `riskScore` (descending). Each row shows: top 1–3
  `flaggedIssues` (e.g. "photo appears to be from a different machine"
  / "price 80% below market estimate" / "description contains phone
  number"), the `riskScore`, and quick actions (APPROVE / FLAG / REJECT
  / OVERRIDE) that write to `ModerationLog`.
- **What they do (seller):** On publish, see "your listing is in review
  (typically <2h)" — faster because the queue is prioritized.
- **What they do NOT see:** no auto-publish, no auto-reject. The admin
  always decides.

#### 3. Required data (verified against schema)
- `ModerationLog` (existing): `listingId`, `action` (AI_SCAN/FLAG/APPROVE/
  REJECT/OVERRIDE), `reason`, `riskScore`, `flaggedIssues` (JSON),
  `moderatorId`, `createdAt`.
- `Listing`: `title`, `description`, `price`, `condition`, `status`,
  `brandId`, `categoryId`, `sellerId`, `companyId`, `sourceUrl`,
  `sourceSite` (for duplicate detection).
- `ListingImage`: `url` (VLM scans each image).
- `PriceEstimate`: "price 80% below market estimate" flag (if
  `Listing.price < PriceEstimate.priceLower * 0.8`).
- `ListingAttributeValue`: cross-check description claims vs spec values
  (e.g. "year 2020" in description but `year=2021` in attribute).
- `AIGatewayLog` task type: **reuse `MODERATION`** (already exists).

#### 4. AI method
**Hybrid (VLM + rules + LLM).**
- **VLM image scan:** For each `ListingImage`, VLM returns a structured
  assessment: machine visible? matches category? watermark/logo from
  another site? human face present? text overlay (phone number)? This
  populates `flaggedIssues` and contributes to `riskScore`.
- **Rule-based text scan:** Regex + keyword list on `Listing.title` +
  `description` for phone numbers, off-platform contact, prohibited
  terms, duplicate-detection (Levenshtein on title across the seller's
  other listings + `sourceUrl` cross-check).
- **Rule-based price scan:** Compare `Listing.price` to
  `PriceEstimate.priceLower`/`priceUpper`; flag if outside 0.5×–2× band.
- **LLM (Persian-first, optional Future):** Writes a 1-sentence
  `reason` for each flag (e.g. "تصویر شامل شماره تلفن است" — "image
  contains a phone number"). MVP uses templated strings.
- **`riskScore` computation:** Deterministic weighted sum of flag
  severities.

#### 5. Safety control
- Advisory only. The VLM/rules populate `ModerationLog` with
  `action = AI_SCAN`; they never write `APPROVE`/`REJECT`. Only a human
  admin writes those.
- **No auto-publish, no auto-reject.** Every listing waits for a human
  decision (or auto-publishes after a TTL if `riskScore < threshold`,
  but that TTL path is a Future, explicitly gated on legal review).
- **No false-positive harm.** A flagged listing is held for review, not
  publicly marked "suspicious." The seller sees only "in review."
- **Override audit.** `OVERRIDE` action is logged with admin ID + reason;
  overrides are reviewed monthly.
- `AITaskPolicy` for `MODERATION`: `allowedRoles=ADMIN`,
  `hourlyLimit=200`, `dailyLimit=2000`, `costCeilingUsd=0.02` (VLM is
  cheap for single-image classification), cached per image hash.

#### 6. Revenue model
- **Included** (moderation is a platform cost, not a seller fee).
- No premium tier — moderation quality is uniform across sellers.
- Indirect revenue: faster review = faster time-to-live = higher seller
  satisfaction = retention.

#### 7. Success metric (with baseline)
- **Metric:** "Time-to-moderation" = median minutes from `Listing`
  publish (`status = PUBLISHED` + `publishedAt`) to moderation decision
  (`ModerationLog.action IN (APPROVE, REJECT)` at `moderatorId` not
  null), with Co-Pilot vs without.
- **Baseline:** Pre-feature median time-to-moderation over the prior
  28-day window. If moderation backlog is currently unmeasured,
  baseline = "—" and the metric is established first.
- **Secondary metric:** Flag precision (% of AI flags that the admin
  confirms via REJECT or OVERRIDE), baseline = first-28d precision as
  the calibration baseline.

#### 8. MVP vs Future
- **MVP:** Rule-based text + price scan, VLM image scan, `riskScore`-
  ranked moderation queue, `flaggedIssues` + templated Persian
  `reason`, admin quick actions writing to `ModerationLog`.
- **Future:** LLM-phrased reasons, auto-publish-TTL for low-risk
  listings (legally reviewed), cross-listing duplicate detection
  (seller's own + marketplace-wide), and a "moderator copilot chat"
  (admin asks "why was this flagged?" — MEKANIX explains the
  deterministic factors).

---

### M. Spare Parts Compatibility Advisor — Natural-Language "Will This Part Fit?"

**Status:** MVP-shippable (uses existing `Part.compatibleCars` JSON +
`Part.carModels` relation + `CarModel` + `Brand` + `Category`).
**Tagline:** "Ask in Persian: 'این فیلتر روغن برای کاترپیلار ۳۲۰ سال
۲۰۲۰ هست؟' The rhino checks the compatibility graph and says yes/no/unknown
— with the source."

#### 1. Real problem
`Part` already has `compatibleCars` (JSON) and a `carModels` relation
(`Part.carModels: CarModel[]`), but buyers can't query this in natural
language. They browse a part, see a compatibility list, and try to mentally
match their machine. For machinery parts (not just car parts), the
compatibility question is more complex (model + generation + year range +
attachment variant). The result: wrong parts ordered, returns, seller
support load.

#### 2. User experience
- **Who:** Buyers (parts shoppers), sellers (compatibility data quality).
- **What they do (buyer):** On a `Part` detail page, type or speak a
  Persian question: "این برای کاترپیلار ۳۲۰D مدل ۲۰۲۰ مناسب هست؟"
  The advisor returns: ✅ Yes (with source: "تولیدکننده" / "فروشنده" /
  "استنتاج هوش مصنوعی — نیاز به تأیید") / ⚠️ Probably (with conditions)
  / ❌ No (with reason) / ❓ Unknown ("no compatibility data on file —
  contact seller").
- **What they do (seller):** See a "compatibility data quality" score
  per part (% of expected compat entries filled), with a "add
  compatibility" CTA.

#### 3. Required data (verified against schema)
- `Part` (store-schema): `compatibleCars` (JSON), `carModels` (relation
  to `CarModel`), `categoryId`, `brandId`, `name`, `nameFa`, `sku`.
- `CarModel` (store-schema): the structured vehicle/machine
  compatibility table.
- `Brand` + `BrandAlias`: brand name normalization
  ("کاترپیلار" ↔ "Caterpillar").
- `Category`: category-level compatibility rules (e.g. "oil filters
  fit by engine model, not by machine model").
- `ProductModel` + `Generation` (main schema): for machinery parts,
  the `Generation.yearFrom`/`yearTo` range is the compatibility window.
- `ListingAttributeValue` (main schema): if the part is linked to a
  listing's machine, the machine's specs inform compatibility.
- `AIGatewayLog` task type: **new `PARTS_COMPAT`** (or reuse
  `SEMANTIC_SEARCH`).

#### 4. AI method
**Hybrid (LLM + rules).**
- **Question parsing:** Small LLM (Persian-first) parses the buyer's
  question into a structured compatibility query: `{brand, model,
  generation, year, attachmentVariant?}`. Constrained JSON output.
- **Compatibility lookup:** Deterministic. Check `Part.compatibleCars`
  (JSON) and `Part.carModels` (relation) against the parsed query. Use
  `Generation.yearFrom`/`yearTo` for year-range matching.
- **Answer phrasing:** LLM (Persian-first) writes the yes/probably/no/
  unknown answer with the source citation. The LLM is given the
  deterministic lookup result and told to phrase, not invent. Fallback:
  templated Persian string.
- **Source chip:** Every answer shows the source
  (manufacturer/seller/AI-inferred/unknown) — never an unsupported
  claim.

#### 5. Safety control
- Advisory only. No auto-add-to-cart; no auto-order.
- **No fabrication.** If no compatibility data exists, the advisor says
  "unknown — contact seller," never "yes" or "probably."
- **Source citation.** Every answer cites the source of the
  compatibility data. `compatibleCars` JSON entries that lack a source
  are labeled "seller-provided, unverified."
- **No certification.** The advisor never says "HEAVIX-guaranteed fit."
  It says "the compatibility data on file indicates X."
- `AITaskPolicy` for `PARTS_COMPAT`: `allowedRoles=*`,
  `hourlyLimit=30`, `dailyLimit=200`, `costCeilingUsd=0.02`, cached
  per (Part.id, question hash) for 24h.

#### 6. Revenue model
- **Included** for all buyers (compatibility questions are pre-purchase
  friction; gating them kills conversion).
- Premium tier for sellers: "compatibility data quality score" +
  bulk-import tool + "AI suggests missing compat entries" (advisory —
  seller must confirm each).
- Per-use: a "compatibility audit" (premium) — the advisor scans all
  of a seller's parts and flags low-compatibility-data SKUs.

#### 7. Success metric (with baseline)
- **Metric:** "Parts return rate" = fraction of `Order` rows (store-
  schema) with ≥1 `Return` row, where the buyer cited
  "incompatibility" as the return reason, with the advisor vs without.
- **Baseline:** Pre-feature parts return rate (incompatibility-
  attributed) over the prior 90-day window. If return volume <30,
  baseline = "—".
- **Secondary metric:** Advisor usage rate (fraction of `Part` detail
  page views that trigger a compatibility question), baseline = 0
  (new feature).

#### 8. MVP vs Future
- **MVP:** NL question parsing (Persian + English), deterministic
  compatibility lookup, yes/probably/no/unknown answer with source
  chip, templated Persian phrasing. No LLM phrasing (templated only)
  to keep MVP cost near zero.
- **Future:** LLM-phrased answers, voice input, "suggest missing compat
  entries" for sellers (advisory), cross-reference with `Review`
  ("buyers who bought this for the same machine reported fit issues"),
  and a "compatibility graph" visualization (premium).

---

### N. Inspection & Service Marketplace Intelligence — Recommend Inspection Cadence + Surface Service Gaps

**Status:** MVP-shippable (uses existing `Inspection` + `ServiceProvider` +
`ServiceRequest` + `Listing.workingHours` + `MachinePassport.events`).
**Tagline:** "The rhino notices your machine hasn't been inspected in 14
months and your service history stopped 8 months ago. It suggests the
service providers who can fix that — you book, you pay, the rhino never
does."

#### 1. Real problem
`Inspection` and `MachinePassport.events` capture when a machine was last
inspected and serviced, but no surface acts on this data. A listing with
`workingHours = 8000` and last inspection 14 months ago is a trust liability
and a deal-breaker risk. Sellers don't notice the gap; buyers see "no recent
inspection" and walk. Meanwhile, the `ServiceProvider` marketplace
(TRANSPORT/INSPECTION/MAINTENANCE/REPAIR/INSTALLATION/DELIVERY) has
providers waiting but no demand-signaling from listing state.

#### 2. User experience
- **Who:** Sellers (their listings' service state), buyers (trust signal).
- **What they do (seller):** Open `/seller/service-intel`. See a table of
  their listings with: last inspection date + score, last service event
  date, recommended next inspection date (deterministic, based on
  `workingHours` + category norms), and a "book inspection" CTA that
  links to the `ServiceProvider` marketplace (filtered to INSPECTION
  providers in the seller's region).
- **What they do (buyer):** On a Listing detail page, see a "Service &
  Inspection" section in the Machine Intelligence Profile (idea B) with
  last inspection date + score + "next inspection recommended by
  [date]" — a transparency signal.
- **What they do NOT see:** no auto-booking, no auto-payment, no
  autonomous service scheduling.

#### 3. Required data (verified against schema)
- `Inspection` (existing): `listingId`, `status`, `completedAt`,
  `score`, `reportUrl`, `scheduledDate`.
- `MachinePassport` (existing): `inspectionDate`, `inspectionResult`,
  `events[]` (`PassportEvent.eventType` for service events).
- `Listing`: `workingHours`, `categoryId` (category norms for
  inspection cadence), `condition`.
- `ServiceProvider` (store-schema): `type = INSPECTION` or
  `MAINTENANCE`, `verified`, `rating`, `city`/`address`.
- `ServiceRequest` (store-schema): past service requests for the
  listing's seller (responsiveness signal).
- `Category`: category-level inspection cadence norm (e.g.
  "excavators: every 12 months or 2000 hours").
- `AIGatewayLog` task type: **deterministic, no AI in MVP**. Future:
  LLM (Persian-first) writes a "service narrative."

#### 4. AI method
**Deterministic rule-based (MVP).**
- **Inspection cadence:** Per category, define a norm (months OR
  working-hours, whichever comes first). Flag a listing if
  `Inspection.completedAt` is older than the norm OR
  `Listing.workingHours` has increased beyond the norm since last
  inspection.
- **Service gap:** Flag if `MachinePassport.events` has no
  `eventType = SERVICE` (or similar) in the last N months (category-
  dependent).
- **Provider suggestion:** Rank `ServiceProvider` rows by
  (`type` match, `verified`, `rating`, location proximity to the
  listing's `province`/`city`).
- **Future:** LLM (Persian-first) writes a "service narrative"
  ("ماشین شما از آخرین بازرسی ۱۴ ماه گذشته؛ طبق روال دسته، بازرسی
  سالانه توصیه می‌شود" — "your machine's last inspection was 14 months
  ago; per category norm, annual inspection is recommended").

#### 5. Safety control
- Advisory only. No auto-booking, no auto-payment.
- **No certification claim.** The buyer-facing section says "last
  inspected [date], score [X]" — not "HEAVIX-inspected" or "safety-
  certified."
- **No safety authority.** The recommended cadence is a category norm,
  not a regulatory requirement. The surface says "per category norm,"
  not "legally required."
- **Provider neutrality.** `ServiceProvider` ranking is deterministic
  (verified + rating + proximity). No pay-to-rank. Premium providers
  get a "featured" chip only, clearly separated.
- `AITaskPolicy`: not applicable in MVP (deterministic). Future LLM
  uses `SELLER_ASSISTANT` or `MARKET_ANALYST`.

#### 6. Revenue model
- **Included** for all sellers (transparency benefits the marketplace).
- Premium tier: 90-day service forecast, "service provider
  benchmarking" (premium), priority `ServiceRequest` routing for VIP
  sellers.
- Marketplace fee: a small commission on `ServiceRequest` completed
  via HEAVIX (vs off-platform) — already a roadmap item, not a new
  proposal here.

#### 7. Success metric (with baseline)
- **Metric:** "Inspection refresh rate" = fraction of a seller's
  listings with an `Inspection` in the last 12 months, 90 days after
  the seller first opens Service Intel, vs the rate at first open.
- **Baseline:** The seller's own rate at first open (paired before/
  after). If the seller has <5 listings, baseline = "—".
- **Secondary metric:** `ServiceRequest` volume via HEAVIX (vs
  baseline = current volume), and buyer-side "service section
  engagement" (fraction of Listing detail views where the Service &
  Inspection section is expanded).

#### 8. MVP vs Future
- **MVP:** Seller-side service-intel table (last inspection, last
  service, recommended next inspection, "book inspection" CTA to
  filtered `ServiceProvider` marketplace), buyer-side Service &
  Inspection section in Machine Intelligence Profile (idea B),
  deterministic provider ranking. No LLM.
- **Future:** LLM service narrative, 90-day forecast (premium),
  provider benchmarking (premium), automatic "inspection due" e-mail
  reminders, and integration with `DealRoom` (suggest inspection as a
  deal-contingency step).

---

### O. Conversational Deal Assistant — DealRoom Summary, Next-Step Suggestion, Anomaly Surfacing

**Status:** Future (depends on `Conversation`/`Message` adoption; MVP is a
deterministic summary only).
**Tagline:** "The rhino reads the deal chat so you don't have to scroll.
It surfaces the next step and flags anything weird — but you type every
reply."

#### 1. Real problem
`DealRoom` + `DealMessage` + `DealDocument` capture a deal's conversation,
but deal participants (especially sellers managing multiple deals) drown in
messages. A seller returning from a 2-day absence opens a deal room with 40
messages and has to scroll to find: did we agree on price? Is the inspection
scheduled? Did the buyer send the contract? Without a summary, deals stall.

#### 2. User experience
- **Who:** Buyers and sellers (their own deal rooms), admins (mediation).
- **What they do:** Open a `DealRoom`. See a "Deal Assistant" panel: (1)
  a 3-bullet "where this deal stands" summary ("قیمت توافق شد: ۴.۵
  میلیارد" / "بازرسی برنامه‌ریزی نشده" / "قرارداد خریدار ارسال شده،
  تأیید نشده"), (2) a single "suggested next step" ("برنامه‌ریزی بازرسی
  — لینک"), (3) optional "anomaly flags" ("خریدار در ۳ پیام آخر قیمت را
  دوبار تغییر داده است").
- **What they do NOT see:** no auto-reply, no auto-schedule, no auto-
  document-verify. Every action is a manual click.

#### 3. Required data (verified against schema)
- `DealRoom`: `status` (OPEN/NEGOTIATING/AGREED/INSPECTION/TRANSPORT/
  COMPLETED/CANCELLED), `agreedPrice`, `buyerConfirmed`,
  `sellerConfirmed`, `lastMessageAt`.
- `DealMessage`: `senderRole`, `message`, `attachmentUrl`, `createdAt`
  — the conversation to summarize.
- `DealDocument`: `type`, `status` (PENDING/VERIFIED/REJECTED) —
  document state.
- `Inspection`: `status`, `scheduledDate` — inspection state for the
  deal's listing.
- `ListingOffer` + `RFQQuote`: source of the deal (price context).
- `Conversation` + `Message` (P1-MESSAGING): if the deal has a parallel
  direct conversation, include it.
- `AIGatewayLog` task type: **new `DEAL_ASSISTANT`** (or reuse
  `SELLER_ASSISTANT`).

#### 4. AI method
**Hybrid (LLM + rules).**
- **Summary:** LLM (Persian-first) takes the last N `DealMessage` rows +
  current `DealRoom` state + `DealDocument` statuses and writes a 3-
  bullet summary. Constrained output (3 bullets, ≤280 chars each).
- **Next-step suggestion:** Deterministic state-machine lookup
  (DealRoom.status → expected next action). LLM phrases it in Persian.
- **Anomaly detection:** Rule-based (price mentioned in ≥3 messages with
  ≥2 distinct values → flag; document pending >7 days → flag; one party
  silent >5 days → flag). LLM phrases the flag.
- **Fallback:** If LLM fails, show the deterministic state + templated
  Persian next-step.

#### 5. Safety control
- Advisory only. No mutations; no auto-reply; no auto-schedule.
- **No message drafting.** The MVP does not draft replies (that would
  risk the seller sending an AI-written message they didn't read). The
  Future "draft reply" is opt-in, labeled "AI draft — review before
  sending," and the seller must click send.
- **No legal advice.** The assistant never interprets contract terms
  ("this clause means X"). It only states document status
  ("contract uploaded, not yet verified").
- **Anomaly flags are private.** They show only to the deal
  participant viewing the panel, never to the other party.
- `AITaskPolicy` for `DEAL_ASSISTANT`: `allowedRoles=ADMIN,SELLER,BUYER`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.03`,
  `maxInputChars=8000` (conversation history), `maxOutputTokens=400`,
  cached per (DealRoom.id, lastMessageAt) for 1h.

#### 6. Revenue model
- **Included** for all deal participants (deal velocity benefits the
  marketplace).
- Premium tier: multi-deal "deal board" (all your deals' summaries on
  one page), anomaly alert e-mails, and the "draft reply" opt-in
  (premium).
- Per-use: a "deal mediation pack" (premium) — admin-mediated dispute
  resolution with full conversation timeline + AI summary.

#### 7. Success metric (with baseline)
- **Metric:** "Deal velocity" = median days from `DealRoom.createdAt`
  to `DealRoom.status = COMPLETED`, for deals where the assistant was
  available to ≥1 party vs a matched cohort where it wasn't.
- **Baseline:** Pre-feature deal velocity over the prior 90-day window
  for the same cohort. If deal volume <30, baseline = "—".
- **Secondary metric:** Assistant-panel open rate (fraction of
  DealRoom views where the panel is expanded), baseline = 0 (new
  surface).

#### 8. MVP vs Future
- **MVP (Future-tagged):** Deterministic state-machine summary + next-
  step suggestion + templated Persian phrasing + anomaly flags
  (rule-based). No LLM. This MVP is "Future" not because it's hard,
  but because it depends on `DealRoom` adoption reaching a baseline
  volume first.
- **Future:** LLM-phrased summary + next-step + anomaly explanations,
  multi-deal deal board (premium), anomaly e-mail alerts (premium),
  opt-in "draft reply" (premium, labeled AI), and integration with
  idea G (Trust Center) to surface "buyer's verification expired"
  as an anomaly.

---

### P. Brand & Model Knowledge Graph — Verified-vs-AI-Inferred Knowledge Surfacing

**Status:** MVP-shippable (uses existing `KnowledgeEntry` + `Brand` +
`BrandAlias` + `ProductModel` + `Generation` + `BrandIndustry`).
**Tagline:** "When MEKANIX says 'the Cat 320D has 103 kW engine power,' it
cites the source: manufacturer spec, seller-input, or AI-inferred. You
decide what to trust."

#### 1. Real problem
HEAVIX has a rich brand/model taxonomy (`Brand`, `BrandAlias`,
`BrandFamily`, `BrandIndustry`, `BrandDomain`, `ProductModel`,
`Generation`) and a provenance-aware knowledge base (`KnowledgeEntry` with
`source` and `verified` and `aiSuggested`). But this knowledge is not
surfaced as a unified, queryable graph. Buyers asking "what's the
difference between Cat 320D and 320GC?" get ad-hoc answers; sellers can't
see which of their listing's specs are manufacturer-verified vs AI-inferred.
The data exists; the surfacing doesn't.

#### 2. User experience
- **Who:** Buyers (research), sellers (data quality), admins (curation).
- **What they do (buyer):** On a `ProductModel` page (or via search),
  see a "Knowledge Graph" panel: key specs (engine power, operating
  weight, bucket capacity, fuel consumption) each with a source chip
  (Manufacturer ✅ / Seller / AI-inferred ⚠️ / Unknown). A "ask about
  this model" chat (MEKANIX, idea H) answers questions grounded in
  verified entries only.
- **What they do (seller):** See which of their listing's
  `ListingAttributeValue` rows lack a manufacturer-verified
  `KnowledgeEntry` counterpart — a "verify these specs" CTA.
- **What they do (admin):** A curation queue of `KnowledgeEntry` rows
  where `aiSuggested = true` and `verified = false`, ranked by usage
  (how many listings reference them), to prioritize human verification.

#### 3. Required data (verified against schema)
- `KnowledgeEntry` (existing): `entityType` (BRAND/MODEL/MACHINE/
  CATEGORY/ATTRIBUTE), `entityId`, `key`, `value`, `unit`, `source`
  (MANUFACTURER/SELLER/HEAVIX/USER/AI/EXTERNAL), `sourceUrl`,
  `sourceRef`, `verified`, `verifiedBy`, `verifiedAt`, `aiSuggested`.
- `Brand` + `BrandAlias` + `BrandFamily` + `BrandIndustry` +
  `BrandDomain` (existing): brand identity and aliases (Persian/Latin
  matching).
- `ProductModel` + `Generation` (existing): model identity and year
  ranges.
- `Category` + `AttributeDefinition` (existing): attribute keys and
  labels.
- `ListingAttributeValue` (existing, provenance-aware): cross-reference
  to spot listings whose spec values diverge from the
  manufacturer-verified `KnowledgeEntry`.
- `AIGatewayLog` task type: **deterministic surfacing in MVP**. Future:
  LLM (Persian-first) for the MEKANIX chat (idea H) + a new
  `KNOWLEDGE_GRAPH` task for AI-inference of missing entries (advisory,
  always `aiSuggested = true`, never auto-verified).

#### 4. AI method
**Hybrid (rules + LLM + embeddings).**
- **Surfacing (MVP):** Deterministic. Read `KnowledgeEntry` rows for
  the (entityType, entityId) pair; render with source chips.
- **Divergence detection (MVP):** Deterministic. For each
  `ListingAttributeValue` with a matching `KnowledgeEntry` key,
  compare values (numeric tolerance) and flag divergence.
- **MEKANIX chat (Future, idea H):** LLM (Persian-first) grounded in
  verified `KnowledgeEntry` rows; refuses to answer if no verified
  entry exists.
- **AI-inference of missing entries (Future, gated):** LLM infers
  missing spec values from related models (`Generation` siblings,
  `BrandFamily` members). Inferred values are written to
  `KnowledgeEntry` with `source = AI`, `aiSuggested = true`,
  `verified = false` — never auto-verified, never shown without the
  ⚠️ chip.
- **Embeddings (Future):** `Brand`/`ProductModel` embeddings for
  "similar models" recommendations and alias matching.

#### 5. Safety control
- Advisory only. Knowledge is surfaced, not certified.
- **Source chips are mandatory.** Every surfaced spec shows its
  `source`. AI-inferred specs show a ⚠️ chip and a "needs verification"
  label.
- **No auto-verification.** `KnowledgeEntry.verified = true` is only
  set by a human admin (`verifiedBy`). The AI-inference pipeline
  always writes `verified = false`.
- **No certification claim.** The graph says "manufacturer reports X"
  — not "HEAVIX certifies X."
- **Divergence flags are seller/admin-visible** (not buyer-visible as
  "contradictions") to avoid public accusation.
- `AITaskPolicy` for `KNOWLEDGE_GRAPH` (Future): `allowedRoles=ADMIN`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.04` (inference
  is more expensive than phrasing).

#### 6. Revenue model
- **Included** for all users (knowledge graph is a marketplace public
  good).
- Premium tier: "brand intelligence report" (premium) — for a given
  brand/category, a deep report on model variants, common specs,
  market price bands (from `PriceEstimate`), and reliability hints
  (from `Review`).
- Per-use: a "competitor brand benchmark" (premium) for sellers.

#### 7. Success metric (with baseline)
- **Metric:** "Spec verification rate" = fraction of
  `KnowledgeEntry` rows referenced by ≥1 live listing that have
  `verified = true`, measured monthly.
- **Baseline:** Current verified fraction (computed at feature ship
  date). The target is uplift over time as admins work the curation
  queue.
- **Secondary metric:** Knowledge-graph-panel engagement (fraction of
  `ProductModel` page views where the panel is expanded), baseline = 0
  (new surface).

#### 8. MVP vs Future
- **MVP:** Knowledge-graph panel on `ProductModel` pages (key specs
  with source chips), divergence detection (seller/admin), admin
  curation queue for `aiSuggested = true` entries. Deterministic. No
  LLM, no AI-inference.
- **Future:** MEKANIX chat (idea H) grounded in the graph, AI-inference
  of missing entries (advisory, always `aiSuggested`, never auto-
  verified), embeddings for "similar models," brand intelligence
  reports (premium), and a (legally reviewed, GATED) integration with
  manufacturer APIs for automated spec ingestion — explicitly Gated.

---

### Q. Reputation-Weighted Match Priority — Verified-Deal Reviews + Company Verification as a Match Signal

**Status:** MVP-shippable (uses existing `Review.verifiedDeal` +
`Company.verified` + `Company.avgRating`).
**Tagline:** "When two listings match equally, the rhino nudges the one
from a verified company with verified-deal reviews — visibly, with the
reason, never invisibly."

#### 1. Real problem
HEAVIX has trust signals (`Company.verified`, `Review.verifiedDeal`,
`Company.avgRating`, `Company.reviewCount`) but they are not used as a
match-quality signal in search/recommendation results. Two equally-
matching listings appear in arbitrary order; the buyer can't tell which
seller has a track record. The result: good sellers lose to lucky
newcomers; buyers take more risk than necessary.

#### 2. User experience
- **Who:** Buyers (search/compare/match results).
- **What they do:** See search results, Machine Match results (idea F),
  and RFQ Auto-Match results (idea J). Listings from verified companies
  with verified-deal reviews get a subtle "reputation nudge" — a small
  badge ("✓ شرکت تأییدشده · ۴.۶ از ۲۳ بازخورد") and, in tied-score
  situations, appear earlier in the list.
- **What they see:** The badge, the rating, the review count, and (on
  hover) "why this is ranked here: match score 87 + reputation nudge."
  No invisible re-ranking.
- **What they do NOT see:** no pay-to-rank, no invisible suppression
  of unverified sellers (they still appear, just without the nudge).

#### 3. Required data (verified against schema)
- `Company`: `verified`, `avgRating`, `reviewCount`.
- `Review`: `verifiedDeal`, `rating`, `status = PUBLISHED`,
  `sellerResponse` (responsiveness signal).
- `Listing`: `companyId`, `sellerId`, `verified` (listing-level).
- `Deal` + `Order`: completed-deal count per seller (track record).
- `UserRecommendation` (existing): the `score` field can incorporate
  the reputation nudge as a tiebreaker.
- `AIGatewayLog` task type: **deterministic, no AI in MVP**.

#### 4. AI method
**Deterministic rule-based (MVP).**
- **Reputation score** = `company_verified` (binary, +10 if true) +
  `verified_deal_review_count` (0–15, log-scaled) + `avg_rating`
  (0–10, normalized to 5) + `completed_deal_count` (0–5, log-scaled).
  Max 40; used only as a tiebreaker when match scores are within ±2.
- **Tiebreaker rule:** When two listings' match scores are within ±2,
  the higher reputation score ranks first. When match scores differ by
  >2, match score wins (reputation is a tiebreaker, not a primary
  ranker).
- **Badge:** Deterministic. Show "✓ شرکت تأییدشده" if
  `Company.verified`, plus the `avgRating` + `reviewCount`.
- **Future:** LLM (Persian-first) writes a 1-sentence "why ranked here"
  explanation.

#### 5. Safety control
- Advisory only. No mutations.
- **No pay-to-rank.** Reputation score does not include VIP
  subscription status. VIP sellers get a separate "featured" chip,
  clearly distinct from the reputation badge.
- **No invisible suppression.** Unverified sellers still appear in
  results; they just don't get the nudge.
- **Transparency.** The "why ranked here" expandable shows the
  deterministic factors. No black-box ranking.
- **Review integrity.** Only `Review.status = PUBLISHED` and
  `verifiedDeal = true` reviews count toward the score (anti-fraud).
- `AITaskPolicy`: not applicable in MVP (deterministic). Future LLM
  explanation uses `SEMANTIC_SEARCH` or `MARKET_ANALYST`.

#### 6. Revenue model
- **Included** for all users (reputation is a marketplace public good).
- No premium tier for ranking — ranking integrity is non-negotiable.
- Indirect revenue: better buyer outcomes → higher conversion → higher
  marketplace fee revenue.

#### 7. Success metric (with baseline)
- **Metric:** "Reputation-nudge click-through" = fraction of search
  result clicks that go to reputation-nudged listings, vs their
  share of impressions. (If nudged listings get 30% of impressions but
  45% of clicks, the nudge is working.)
- **Baseline:** Pre-feature, the click-through rate of listings that
  *would have been* nudged (verified company + verified-deal reviews),
  vs their impression share. This establishes whether the nudge adds
  lift beyond the natural advantage of verified sellers.
- **Secondary metric:** Buyer-side "verified seller selection rate"
  (fraction of inquiries that go to verified companies), baseline =
  current rate.

#### 8. MVP vs Future
- **MVP:** Deterministic reputation score (tiebreaker only),
  reputation badge on results, "why ranked here" expandable with
  deterministic factors. No LLM.
- **Future:** LLM-phrased "why ranked here," reputation-score history
  (90-day trend per seller, premium), "reputation alert" for sellers
  when their score drops (e.g. a new 1-star review), and integration
  with idea G (Trust Center) to surface doc-freshness as an additional
  reputation factor.

---

## 6. Gated Ideas Register (Finance / Investment / Leasing — NOT de-gated)

Per the hard rules (§2.4), any idea touching fund collection, credit
decisions, guaranteed returns, escrow, or security issuance is **GATED**
behind legal review. This document **does not propose de-gating any of
them.** The following Gated ideas already exist in prior HEAVIX product
documents and are referenced here for completeness; they are **not** part
of the 17 evaluable ideas in §5 and are **not** recommended for MVP.

| # | Gated idea | Source doc | Why gated |
|---|---|---|---|
| G1 | Machinery Investment Framework (4 investment models, no fund collection until legal compliance) | `docs/PRODUCT-MACHINERY-INVESTMENT.md` | Securities/regulatory law; fund collection requires licensing |
| G2 | Financing & Leasing Partnerships (HEAVIX as facilitator, NOT lender; Machine Dossier; inspection ≠ credit approval) | `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` | Credit-decision law; lender licensing; consumer protection |
| G3 | Leasing Eligibility Pre-Check (advisory only, but touches credit) | Referenced in idea F Future + idea J Future | Credit decisioning; requires partnership with licensed lessor |
| G4 | Official Appraisal Service (licensed appraiser network, paid) | Referenced in idea I Future | Appraisal licensing; liability |
| G5 | Third-Party Document Verification (forgery detection) | Referenced in idea G Future | Legal evidence rules; forgery accusations; liability |
| G6 | Auto-Publish TTL for Low-Risk Listings (skip human moderation) | Referenced in idea L Future | Liability for prohibited/fraudulent listings published without human review |
| G7 | Manufacturer API Integration for Automated Spec Ingestion | Referenced in idea P Future | Data licensing; manufacturer IP; contract law |

**Status of all Gated ideas:** Design-only. No fund movement, no credit
decision, no auto-publish, no forgery detection, no manufacturer-data
ingestion without (a) legal review, (b) partner contracts, and (c) ADR
approval. This document does not change their status.

---

## 7. Priority Matrix

Legend:
- **Value:** H = direct revenue or core trust; M = indirect revenue or
  efficiency; L = nice-to-have.
- **Complexity:** H = needs schema migration + multi-system integration;
  M = significant UX + AI work but no migration; L = surfacing layer on
  existing data.
- **Risk:** H = legal/safety/privacy sensitivity; M = some sensitivity,
  mitigable; L = low sensitivity.
- **Differentiation:** H = no competitor in IRAN machinery market does
  this; M = some competitors do it weakly; L = table stakes.
- **Priority (1–5):** 1 = ship first; 5 = ship last. Computed from
  Value ↑, Complexity ↓, Risk ↓, Differentiation ↑.
- **Stage:** MVP = shippable now (no migration); Future = needs
  prerequisite adoption or migration; Gated = §6 (not in §5).

| Idea | Value | Complexity | Risk | Differentiation | Priority | Stage |
|------|-------|-----------|------|-----------------|----------|-------|
| A. HEAVIX Copilot (Daily Briefing) | H | L | L | M | 1 | MVP |
| B. Machine Intelligence Profile | H | L | M | H | 1 | MVP |
| C. Smart Search & Compare | H | M | L | M | 2 | MVP |
| D. Lead Intelligence (Explainable) | H | L | M | H | 1 | MVP |
| E. Dealer Growth Studio | M | M | L | M | 3 | MVP |
| F. Machine Match (Buyer-side) | H | M | L | M | 2 | MVP |
| G. Trust & Documentation Center | H | M | M | H | 2 | MVP |
| H. HEAVIX / MEKANIX Characters | M | L | M | H | 3 | MVP |
| I. Price Intelligence Advisory | H | L | M | H | 2 | MVP |
| J. RFQ Auto-Match & Quote Bench | M | M | L | H | 3 | MVP |
| K. Demand Pulse (Sourcing Intel) | M | L | L | H | 3 | MVP |
| L. Listing Moderation Co-Pilot | M | M | M | M | 4 | MVP |
| M. Spare Parts Compatibility Advisor | M | M | L | H | 4 | MVP |
| N. Inspection & Service Intel | M | L | M | M | 4 | MVP |
| O. Conversational Deal Assistant | M | H | M | M | 5 | Future |
| P. Brand & Model Knowledge Graph | M | M | L | H | 4 | MVP |
| Q. Reputation-Weighted Match Priority | M | L | L | M | 5 | MVP |

**Gated (not in §5, see §6):** G1–G7 — all Stage = Gated, all Priority =
n/a (legal-gated, not engineering-gated).

---

## 8. Recommended Sequencing

The matrix suggests a 4-wave rollout. Each wave is independently shippable
and each wave's ideas share infrastructure (reducing marginal cost).

### Wave 1 — Trust & Transparency (Priority 1–2, MVP, no migration)
- **A. HEAVIX Copilot** (reuses `SELLER_ASSISTANT` AI task; deterministic
  candidate selection)
- **B. Machine Intelligence Profile** (pure surfacing on
  `ListingAttributeValue` provenance; the foundation for several later
  ideas)
- **D. Lead Intelligence** (deterministic, no AI in MVP; the ADR-005 §3
  `Lead.status` migration is a nice-to-have, not a blocker)
- **G. Trust & Documentation Center** (deterministic doc/contradiction
  detection; depends on B for the buyer-side Trust card)
- **I. Price Intelligence Advisory** (pure surfacing on existing
  `PriceEstimate`)

**Why first:** All five are low-complexity (L), high-value (H), high-
differentiation (H), and require no schema migration. They establish the
trust-and-transparency foundation that later waves build on. Combined AI
cost ceiling: ~$0.02/call × ~5 task types, well under the `AIBudget`
default.

### Wave 2 — Discovery & Match (Priority 2–3, MVP, no migration)
- **C. Smart Search & Compare** (extends `ComparisonSession` +
  `SEMANTIC_SEARCH`)
- **F. Machine Match** (extends `UserRecommendation`)
- **H. HEAVIX / MEKANIX Characters** (surfacing layer; depends on B for
  MEKANIX spec explanations)
- **P. Brand & Model Knowledge Graph** (depends on B + H for surfacing)

**Why second:** These extend Wave 1's transparency into discovery. They
share the NL-parsing infrastructure (one `SEMANTIC_SEARCH` policy serves
C, F, and the Future LLM-phrasing paths of others).

### Wave 3 — Seller Growth & Marketplace Health (Priority 3–4, MVP, no migration)
- **E. Dealer Growth Studio** (depends on B for the per-listing growth
  score)
- **J. RFQ Auto-Match & Quote Bench** (depends on I for the quote-bench
  fairness hint)
- **K. Demand Pulse** (independent; pure aggregation)
- **N. Inspection & Service Intel** (depends on B for buyer-side section)
- **Q. Reputation-Weighted Match Priority** (depends on F for the match
  score that reputation breaks ties within)

**Why third:** These are seller-facing growth tools and marketplace-
health surfaces. They depend on Wave 1–2 foundations but don't block
each other.

### Wave 4 — Operations & Quality (Priority 4–5, mixed)
- **L. Listing Moderation Co-Pilot** (admin-facing; VLM cost is the main
  concern)
- **M. Spare Parts Compatibility Advisor** (buyer-facing; depends on
  `Part` data quality)
- **O. Conversational Deal Assistant** (Future — depends on `DealRoom`
  adoption reaching baseline volume)

**Why last:** These are higher-complexity or depend on adoption baselines.
They ship when their prerequisites are met.

### Gated track (parallel, legal-gated)
- **G1–G7** remain design-only. No engineering work is recommended until
  legal review + partner contracts + ADR approval. This document does
  not propose de-gating any of them.

---

## 9. Open Questions

### 9.1 Baseline discrepancy
The task brief states `main = 4566efd`. The repository at authoring time
shows `main = 710df93` (with `docs/store-center-ux-prototype` branch HEAD
= `35b3a30` containing the STEP 11.28 UX prototype + ADR-005 +
implementation plan, not yet merged to main). This document was authored
read-only against the working tree; **no commits, no PRs, no merges** were
performed. The discrepancy is flagged for the owner; it does not affect
the document's content (all schema verification was done against the
actual `prisma/schema.prisma` and `prisma/store-schema.prisma` files in
the working tree).

### 9.2 Schema gaps to confirm before MVP of specific ideas
- **`Lead.status` (ADR-005 §3):** Idea D's MVP works without it (UI-only
  override), but the Future version needs it. Confirm migration is on
  the roadmap.
- **`Lead.userId`:** `Lead` has no `userId` — leads are phone-based. If
  idea D's Future version wants to join `Lead` to `AnalyticsEvent.userId`,
  either (a) add `userId` to `Lead` (additive) or (b) join via
  `viewerPhone` ↔ `User.mobile`. Option (b) is privacy-sensitive and
  needs review.
- **`CompanyDocument.expiresAt`:** Idea G's MVP checks doc freshness;
  `CompanyDocument` has `status` + `verifiedAt` but no `expiresAt`. Either
  (a) add `expiresAt` (additive) or (b) use `CompanyVerification.expiresAt`
  as a proxy. Confirm preferred path.
- **`MachinePassport` per-section verification (ADR-005 §6):** Idea B's
  Future version needs these additive fields. Confirm migration is on
  the roadmap.
- **`Part.inventoryScore` (ADR-005 §5):** Idea A's inventory alert can
  use it when available; MVP falls back to `stock` + `lowStockThreshold`
  only.
- **`Showroom` model (ADR-005 §2):** Idea E's VIP showroom card needs
  it. MVP omits the showroom card for non-VIP sellers.
- **`PremiumSubscription` per-Company vs per-User:** ADR-005 §2 notes
  that VIP enforcement needs a Company-level check, but
  `PremiumSubscription` is per-User today. Confirm whether (a) a
  Company-level subscription model will be added, or (b) the check is
  "any user of the Company has an active PremiumSubscription." This
  affects ideas E (VIP showroom card), H (branded HEAVIX for VIP), and
  Q (premium chip separation).

### 9.3 AI task policy — new task types to seed
The following new `AITaskPolicy` rows are implied by §5 (existing task
types are reused where possible). Each needs an `AITaskPolicy` row
before the idea ships:
- `COMPARE_EXPLAINER` (idea C Future) — `allowedRoles=*`,
  `costCeilingUsd=0.03`.
- `NEED_MATCH` (idea F) — `allowedRoles=*`, `costCeilingUsd=0.02`.
- `IMAGE_QUALITY` (idea E) — `allowedRoles=ADMIN,SELLER`,
  `costCeilingUsd=0.02`.
- `RFQ_MATCH` (idea J) — `allowedRoles=*`, `costCeilingUsd=0.02`.
- `PARTS_COMPAT` (idea M) — `allowedRoles=*`, `costCeilingUsd=0.02`.
- `DEAL_ASSISTANT` (idea O) — `allowedRoles=ADMIN,SELLER,BUYER`,
  `costCeilingUsd=0.03`, `maxInputChars=8000`.
- `CHARACTER_GUIDE` (idea H) — `allowedRoles=*`, `costCeilingUsd=0.02`.
- `KNOWLEDGE_GRAPH` (idea P Future) — `allowedRoles=ADMIN`,
  `costCeilingUsd=0.04`.

All other ideas reuse existing task types (`SELLER_ASSISTANT`,
`SEMANTIC_SEARCH`, `PRICE_ANALYSIS`, `MARKET_ANALYST`, `MODERATION`,
`LISTING_BUILDER`) or are deterministic (no AI call).

### 9.4 Success-metric baseline feasibility
Several success metrics in §5 depend on `AnalyticsEvent` data that may
not yet be collected at the required granularity (e.g. "time-to-first-
action on dashboard" requires `AnalyticsEvent.page = '/seller/dashboard'`
plus a subsequent navigation event). Before each idea ships, confirm the
required `AnalyticsEvent` instrumentation exists; if not, instrument
first (no schema change — `AnalyticsEvent` is a generic event stream),
collect for 14–28 days, then establish the baseline.

### 9.5 Persian-first quality bar
All AI surfaces are Persian-first. The LLM model selection (which model
handles Persian well at the `$0.02–0.04` cost ceiling) is an
implementation decision, not a product decision. Confirm the AI Gateway's
default model meets the Persian quality bar before Wave 1 ships;
otherwise, escalate the cost ceiling for Persian-heavy tasks
(`SELLER_ASSISTANT`, `CHARACTER_GUIDE`, `COMPARE_EXPLAINER`).

### 9.6 Character asset production
Idea H's MVP uses static character assets. The mascot identity document
(`PRODUCT-HEAVIX-MECHANICS-MASCOT.md`) explicitly does not commission
final illustration assets. Confirm whether (a) static SVG/PNG assets
will be produced for the MVP, or (b) the MVP uses placeholder art with a
production-grade asset swap later.

---

## 10. Summary

This document defines **17 evaluable innovation ideas (A–Q)** for HEAVIX,
all advisory-only (ADR-005 §8), all grounded in data HEAVIX actually has
(verified against `prisma/schema.prisma` and `prisma/store-schema.prisma`),
and all keeping financial/investment/leasing ideas GATED (§6, not de-gated).
The 8 base ideas (A–H) are refined and completed; the 9 new ideas (I–Q)
extend HEAVIX's existing infrastructure (Price engine, Comparison engine,
Recommendation engine, Moderation log, Knowledge base, RFQ, DealRoom,
ServiceProvider, DemandSignal) rather than inventing new engines.

**Top 3 priority ideas (Priority 1, MVP, no migration):**
1. **A. HEAVIX Copilot** — daily store briefing & lead triage
2. **B. Machine Intelligence Profile** — unified machine dossier with
   data-completeness index
3. **D. Lead Intelligence** — explainable lead score with human override

**Gated ideas (not in §5, see §6):** G1–G7 (machinery investment,
financing/leasing, leasing eligibility pre-check, official appraisal,
third-party doc verification, auto-publish TTL, manufacturer API
integration). All remain design-only. No de-gating proposed.

**No code, schema, migration, or PR changes were made.** This file is
documentation.
