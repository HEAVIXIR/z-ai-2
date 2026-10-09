# HEAVIX STEP 11.31 — Innovation Portfolio (6 Priority Ideas)

> **Status:** PROPOSED — for owner review (innovation portfolio, design only).
> **Task ID:** 11.31-`/brainstorm`
> **Repository baseline:** `main` = `f597562` (Merge PR #10: STEP 11.29 research + design foundation). Working-tree HEAD at authoring time = `4a2f579` on branch `security/pr-sc-00-tenant-scoping` (PR-SC-00 unmerged; see §3.2).
> **Scope:** Innovation portfolio only. **No code, schema, migration, or PR changes.** This file is documentation.
> **Related:**
> - `docs/product/HEAVIX-INNOVATION-PROGRAM.md` (PR #10 — the 17-idea program this portfolio distills)
> - `docs/product/PR-SC-00-SCOPE.md` (Universal API tenant scoping — BLOCKER-A4 fix; unmerged)
> - `docs/product/PR-SC-01-SCOPE.md` (Lead CRM foundation — MERGED in PR #9)
> - `docs/ADR-005-store-center-architecture.md` + `docs/ADR-005-amendment-01.md` (BLOCKER-A4)
> - `docs/PRODUCT-MACHINERY-INVESTMENT.md` + `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` (GATED ideas — not de-gated here)
> **Authoring agent:** `/brainstorm` (innovation portfolio).

---

## 1. Purpose & Scope

This document develops **6 priority ideas** into full product portfolios. Each
portfolio specifies the 11 mandatory fields from the task brief: real problem,
user experience, required data (schema-verified), AI method, safety control,
revenue model, MVP vs Future, business value, approximate cost, risk,
technical dependency, and a success metric **with a baseline definition**.

The 6 ideas are the ones the owner has prioritized for STEP 11.31 evaluation:

1. **HEAVIX Copilot** — seller operational assistant with documented answers
   from permitted data.
2. **Machine Intelligence Profile** — smart machine profile with specs,
   verified history, incomplete-info flags, confidence grade.
3. **Lead Intelligence** — lead prioritization with explainable score + no
   uncontrollable automated decisions.
4. **Smart Inventory** — listing improvement suggestions, incomplete-info
   detection, deterministic explainable scoring.
5. **Buyer Match** — buyer-machine matching by need, budget, real
   compatibility.
6. **AI Listing Studio** — description generation, translation, listing
   optimization with human approval.

These 6 are a subset of the 17-idea Innovation Program (PR #10). This document
**does not supersede** the program; it deepens the 6 the owner has prioritized
and adds the dependency analysis the program lacked (PR-SC-00 tenant-scoping
status, data-volume baselines, legal-gate status). Idea #4 (Smart Inventory)
is new relative to the program — it is grounded in the existing
`/api/listing-completeness` route and the `Part.inventoryScore` proposal
(ADR-005 §5).

A separate **Gated Ideas Register (§8)** references the existing finance /
investment / leasing proposals and **does not propose de-gating any of them**.

---

## 2. Hard Rules & Constraints (binding on every idea)

These rules are inherited from the PR #10 Innovation Program §2 and are
binding on every portfolio in this document. Any idea that cannot satisfy all
of them is either dropped or moved to the Gated register (§8).

1. **Advisory-only AI (ADR-005 §8).** Every AI surface returns text, scores,
   or suggestions. The AI Gateway never returns function calls that mutate
   state. Every suggestion is paired with a manual link the user must click.
2. **No autonomous mutations.** All write paths go through the normal
   authenticated, authorized, audited routes. AI output is treated like user
   input: validated server-side, rate-limited, audit-logged.
3. **Human-in-the-loop for every consequential decision.** Verification,
   moderation, pricing override, lead-status change, and document approval
   always require a human click.
4. **Financial / investment / leasing ideas stay GATED.** No fund collection,
   no credit decision, no guaranteed return, no escrow, no security issuance
   without legal review. §8 lists the gated ideas; **none are de-gated here.**
5. **Grounded in real data.** Every "required data" field cites the actual
   Prisma model and field. Where a field does not yet exist, the portfolio
   says so and references the additive migration that would add it.
6. **AI must go through the AI Gateway** (`src/lib/ai-gateway-service.ts`).
   No direct `ZAI.create()` calls in new code. Existing pre-Gateway modules
   (`ai-listing-builder.ts`, `ai-content-assistant.ts`) must be migrated to
   the Gateway before their AI Listing Studio integration ships.
7. **No generic chatbot.** Each AI capability is a specific product flow with
   structured output + a CTA (deep link to the page where the human acts).
8. **Cost & rate limits are first-class.** Every AI idea declares an
   `AITaskPolicy` row (auth + quota + size + model + timeout + cost ceiling)
   and respects the `AIBudget` singleton (default `$10/day`, `$200/month`).
9. **Audit everything.** Every AI call is logged to `AIGatewayLog`. Every
   human action on an AI suggestion is logged via the Action Engine
   (ADR-003).
10. **Persian-first, accessibility-first.** Every AI surface is designed for
    Persian (fa-IR) input first.
11. **No fabricated data.** Every KPI shows "—" when no underlying data
    exists. Success metrics define their baseline as "the value computed
    from existing data before the feature ships."
12. **Characters do not replace experts.** HEAVIX/MEKANIX surfaces carry a
    visible "this is guidance, not a professional opinion" affordance.

---

## 3. Repository Baseline & Key Findings

This section documents the **delta between the PR #10 Innovation Program
assumptions and the actual repository state at STEP 11.31**, because the
delta changes which ideas are blocked vs. shippable.

### 3.1 What has shipped since the PR #10 Innovation Program was authored

| Change | Status | Impact on this portfolio |
|---|---|---|
| **PR #9 — Lead CRM Foundation** (`c66e060`, merged) | MERGED into `main` | The `Lead` model now has `status`, `assignedToId`, `score`, `scoreVersion`, `scoreBreakdown`, `scoredAt`, `scoreOverrideById`, `scoreOverrideBy`, `scoreOverrideReason`, `scoreOverrideNote`, `scoreOverrideAt` (`schema.prisma:618-658`). The deterministic `src/lib/crm/lead-score.ts` (226 lines, v1 algorithm, 6 factors L1–L6) **exists and is shipped**. Idea #3 (Lead Intelligence) is no longer "MVP-shippable pending ADR-005 §3" — the schema and the algorithm are in place. The remaining work is the seller-facing UI + the recalc job (PR-SC-06). |
| **PR #10 — STEP 11.29 research + design foundation** (`f597562`, merged) | MERGED into `main` | Brought the 17-idea Innovation Program, ADR-005 amendment, Store Center UX prototype, financing/leasing docs. This portfolio is a distillation of that program. |
| **`/api/listing-completeness` route** (`src/app/api/listing-completeness/route.ts`, 107 lines) | SHIPPED | A deterministic 0–100 listing-completeness score with a 10-item checklist (image, price, brand, category, description, year, hours, phone, specs, verified). This is the foundation for Idea #4 (Smart Inventory) — the MVP extends it, does not rebuild it. **Gap:** the route has no tenant-scope ownership check; it loads any listing by `id`. Must be wrapped in an ownership check before the seller-facing Smart Inventory UI ships (see §3.2). |
| **`src/lib/ai-listing-builder.ts`** (333 lines) | SHIPPED (pre-Gateway) | `analyzeListing()` extracts brand/model/category/attributes/SEO description/fair-price-range from listing draft text; `improveListingContent()` rewrites title+description. Every value tagged `AI_SUGGESTED`. **Gap:** calls `ZAI.create()` directly, not via the AI Gateway. Must be migrated before Idea #6 (AI Listing Studio) ships. |
| **`src/lib/ai-gateway-service.ts`** (189 lines) | SHIPPED | Central AI Gateway enforcing policy (`AITaskPolicy`), budget (`AIBudget`), audit (`AIGatewayLog`). All new AI calls must route through `aiGateway.execute({ taskType, userId, prompt, ... })`. |
| **`src/lib/crm/lead-status.ts`** + **`src/lib/crm/lead-score.ts`** | SHIPPED | The Lead CRM plumbing (status state machine + deterministic score v1 + override bookkeeping) is in place. Idea #3 needs UI + recalc job + tenant-scoped read, not a new algorithm. |

### 3.2 PR-SC-00 (tenant-scoping) status — UNMERGED, partial coverage

`docs/product/PR-SC-00-SCOPE.md` documents the Universal API tenant-scoping
fix for BLOCKER-A4. Status at STEP 11.31:

- **Branch:** `security/pr-sc-00-tenant-scoping` (HEAD `4a2f579`). **NOT merged
  into `main`.**
- **Mechanism shipped:** `src/lib/admin/tenant-scope.ts` (pure functions:
  `buildTenantWhere`, `mergeTenantWhere`, `assertCreateOwner`,
  `checkRowOwnership`); data-adapter wiring; route-handler wiring; 51
  unit/wiring tests passing.
- **Resource coverage shipped:** **only `listings`** has
  `ownership = { ownerField: 'sellerId', moderatePermission: 'listing.moderate' }`.
- **Resource coverage NOT shipped:** `companies` (member-based), `parts` /
  `orders` / `payments` (store-DB), `deals` / `rfqs` / `offers` /
  `inspections` / `transports` / `disputes` / `buy-requests` (marketplace,
  relation-based), `leads` (relation-based via `Lead.listing.sellerId`),
  store-domain inventory / warehouses / returns / etc.
- **Gate (per STEP 11.30 directive, PR-SC-00-SCOPE.md §"Gate"):** *"Until
  `tests/integration/tenant-scope-real.ts` passes in a PostgreSQL
  environment AND an independent review confirms the wiring, **no
  seller-scoped UI feature dependent on the Universal Resource API is
  approved for release**."*

**Implication for this portfolio:** any idea whose seller-facing surface
reads or writes a resource **other than `listings`** through the Universal
Resource API is **blocked on PR-SC-00 follow-up PRs** that add `ownership`
config for that resource. The blocker table in §7 lists the exact resources
each idea needs.

### 3.3 AI Gateway — operational but under-used

`AITaskPolicy` is seeded (see `prisma/seed-ai-policies.ts`). Existing task
types: `SEARCH`, `LISTING_BUILDER`, `PRICE_ANALYSIS`, `MARKET_ANALYST`,
`SELLER_ASSISTANT`, `SCRAPER`, `MODERATION`, `SEMANTIC_SEARCH`. New task
types implied by this portfolio (e.g. `NEED_MATCH`, `IMAGE_QUALITY`,
`LISTING_TRANSLATE`) need an `AITaskPolicy` row before the idea ships.

The existing `ai-listing-builder.ts` and `ai-content-assistant.ts` bypass the
Gateway (direct `ZAI.create()`). Rule #6 requires migrating them before Idea
#6 ships.

### 3.4 Schema facts verified at STEP 11.31

Verified against `prisma/schema.prisma` (2649 lines) and
`prisma/store-schema.prisma` (780 lines).

| # | Claim | Verified truth | Source |
|---|---|---|---|
| 1 | `Lead` has no `status` / `score` | **FALSE (changed since PR #10).** `Lead.status`, `Lead.score`, `Lead.scoreVersion`, `Lead.scoreBreakdown`, `Lead.scoredAt`, `Lead.scoreOverrideById/By/Reason/Note/At` all exist (PR #9). | `schema.prisma:618-658` |
| 2 | `Lead` has no `userId` | **TRUE.** Leads are phone-based (`viewerPhone`, `viewerName`). Cross-listing correlation is by `viewerPhone`. | `schema.prisma:618-626` |
| 3 | `ListingAttributeValue` carries provenance | **TRUE.** `sourceType` (SELLER_INPUT \| MANUFACTURER_DOCUMENT \| AI_EXTRACTION \| AI_INFERENCE \| ADMIN_VERIFIED \| IMPORTED), `confidence Float?`, `sourceReference`, `verifiedAt`, `verifiedBy`. Foundation for Idea #2. | `schema.prisma:365-387` |
| 4 | `MachinePassport` has only `serialNumber`/`inspectionDate`/`inspectionResult`/`events[]` | **TRUE.** No per-section verification fields yet (ADR-005 §6 proposes additive). | `schema.prisma:1180-1202` |
| 5 | `UserRecommendation` exists with `reason` enum + `score` | **TRUE.** Reasons: SIMILAR_TO_VIEWED \| SAME_CATEGORY \| SAME_BRAND \| PRICE_DROP \| NEW_IN_WATCHLIST_CATEGORY \| TRENDING. Foundation for Idea #5. | `schema.prisma:2009-2026` |
| 6 | `AIGatewayLog` task types are an enum-like set | **TRUE.** | `schema.prisma:757-772` |
| 7 | `AIBudget` is a singleton with `$10/day`, `$200/month` defaults | **TRUE.** | `schema.prisma:783-796` |
| 8 | `AITaskPolicy.costCeilingUsd` default `$0.05` | **TRUE.** | `schema.prisma:806-820` |
| 9 | `Part.inventoryScore` (ADR-005 §5 proposal) | **NOT YET in schema.** `Part` has `stock`, `lowStockThreshold`, `views`, `soldCount`, `featured`, `active`. Idea #4 MVP falls back to existing fields. | `store-schema.prisma:123-165` |
| 10 | `InventoryBalance` + `StockMovement` + `Warehouse` exist (store-schema) | **TRUE.** Multi-warehouse inventory ledger. Foundation for Idea #4 inventory alerting (store-domain parts). | `store-schema.prisma:416-484` |
| 11 | `/api/listing-completeness` exists | **TRUE.** 10-item deterministic checklist; 0–100 score. Foundation for Idea #4. | `src/app/api/listing-completeness/route.ts` |
| 12 | `src/lib/crm/lead-score.ts` exists | **TRUE.** Deterministic v1, 6 factors, version field, override-aware. Foundation for Idea #3. | `src/lib/crm/lead-score.ts` |
| 13 | `src/lib/ai-listing-builder.ts` exists | **TRUE.** Pre-Gateway direct ZAI calls. Must migrate before Idea #6. | `src/lib/ai-listing-builder.ts` |
| 14 | `BuyRequest` exists with `budgetMin/Max`, `category`, `brandPref`, `city`, `province`, `deadline` | **TRUE.** Foundation for Idea #5 need-driven matching. | `schema.prisma:549-573` |

---

## 4. Cross-cutting Safety & Infra Requirements

Every idea in §5 inherits these. They are stated once here and referenced (not
repeated) in each portfolio.

### 4.1 AI Gateway integration (all AI ideas)

- Each AI idea declares its `taskType` for `AIGatewayLog` / `AITaskPolicy`.
  Existing task types are reused where possible. New task types are named in
  the portfolio and the policy row is defined in the implementation plan, not
  this document.
- Every call respects the `AITaskPolicy` allow-list: `allowedRoles`,
  `hourlyLimit`, `dailyLimit`, `maxInputChars`, `maxOutputTokens`, `model`,
  `timeoutMs`, `costCeilingUsd`, `active`.
- Every call is logged to `AIGatewayLog` with `taskType`, `model`, `input`
  (truncated), `output` (truncated), `latencyMs`, `tokensUsed`, `cost`,
  `success`, `error`, `userId`.
- The `AIBudget` singleton is the hard ceiling. When daily or monthly spend is
  exceeded, the Gateway returns a 429-style "AI budget exhausted" response
  and the UI degrades gracefully to the deterministic / rule-based fallback.

### 4.2 Human-in-the-loop pattern (all AI ideas)

- AI output is **advisory text or a score with a reason**.
- Every suggestion includes a deep link to the page where the human performs
  the action manually.
- The human action is the only path that mutates state, and it goes through
  the normal authenticated, authorized, audited route.
- "Dismiss suggestion" is always available and is persisted per-user.

### 4.3 Persian-first & accessibility

- All prompts, system messages, and UI strings are authored Persian-first.
- Voice input (Persian ASR) and screen-reader-friendly output are part of the
  MVP for seller-facing surfaces (Ideas #1, #3, #4, #6) and the Future version
  for buyer-facing surfaces (#2, #5).

### 4.4 Cost discipline

- Default cost ceiling: `$0.05` per call (matches `AITaskPolicy` default).
- The MVP for every idea uses the **cheapest model that meets quality bar**.
- Caching: deterministic sub-results (scores, counts) are cached and only
  re-computed on underlying data change — never on every page view.

### 4.5 No-fabrication rule

- KPIs show "—" when the underlying query returns no rows.
- AI summaries that have no underlying data return an empty state, not a
  hallucinated sentence.
- Every AI-generated fact surfaced to a user is paired with a "source" chip.

---

## 5. The 6 Priority Ideas

> Each portfolio is self-contained. The matrix in §6 summarizes all 6.

---

### 1. HEAVIX Copilot — Seller Operational Assistant with Documented Answers

**Status:** MVP-blocked on PR-SC-00 follow-up (Lead + Offer + store-domain
tenant-scope config).
**Tagline:** "Open your seller dashboard; HEAVIX has already read the overnight
numbers and the overnight leads, and gives you 3 deep-link actions for today."

#### 1.1 Real problem
Sellers on HEAVIX are typically small-business owners who do not have time to
open 6 different Store Center pages (Dashboard, Inventory, Leads, Orders,
Passport, Reports) every morning to find the 2 things that actually need
attention. The Store Center UX prototype (PR #8) already defines a "Business
Assistant" panel but leaves it as a static rule list. The real problem is
**prioritization under time scarcity**: which 3 actions today will move
revenue? Without a daily briefing, sellers react to the loudest notification
rather than the highest-value one.

A second, equally concrete problem: sellers ask operational questions ("چرا
آگهی من تأیید نشده؟" / "why was my listing rejected?") and today the only
answer is to scroll through admin notes or open a support ticket. The Copilot
must answer these questions **from permitted data** (the seller's own
listings, leads, offers, orders, rejections) — never from another seller's
data, never from admin-internal commentary that isn't already shared with the
seller.

#### 1.2 User experience
- **Who:** Sellers (and admins acting on behalf of a seller's Company).
- **What they do:** Open `/seller/dashboard` in the morning. The HEAVIX
  Copilot panel shows a 3-bullet "Today's Briefing": (1) the single hottest
  lead across their listings with a one-line reason and an "Open lead" deep
  link, (2) the single most-urgent inventory alert (out-of-stock part, stale
  listing, or low Passport completeness) with a deep link, (3) a one-line
  business summary ("۳ استعلام جدید، ۲ پیشنهاد در انتظار، ۱ آگهی تا ۵ روز
  دیگر منقضی می‌شود").
- **Ask-the-Copilot box:** A Persian-first text input where the seller asks
  an operational question. The Copilot returns a short answer with **cited
  source rows** (each citation is a deep link to the underlying record) and a
  CTA. Example: "چرا آگهی من رد شد؟" → "آگهی «بیل کاترپیلار ۳۲۰» در تاریخ
  ۱۴۰۳/۰۷/۱۲ به دلیل «تصویر شامل شماره تلفن» رد شده است. [مشاهده آگهی]
  [ویرایش و ارسال مجدد]".
- **What they do NOT see:** no auto-action, no "AI has updated your lead
  status" toast. Every change is a manual click. The Copilot never reveals
  another seller's data.

#### 1.3 Required data (verified against schema)
- `Listing` (seller's, via `sellerId`/`companyId`): `viewCount`,
  `favoriteCount`, `status`, `expiresAt`, `publishedAt`, `updatedAt`,
  `price`, `categoryId`, `brandId`. ✅ Tenant-scoped (PR-SC-00 shipped for
  `listings`).
- `Lead` (per listing): `leadType`, `viewerPhone`, `viewerName`, `note`,
  `createdAt`, `status`, `score`, `scoreVersion`, `scoreBreakdown`,
  `assignedToId`. ❌ **No ownership config yet** — needs PR-SC-00 follow-up
  with `ownership = { relation: { field: 'listingId', ownerField: 'sellerId' }, moderatePermission: 'lead.moderate' }`.
- `ListingOffer` (pending offers): `status = PENDING`, `offerAmount`,
  `createdAt`, `buyerId`. ❌ **No ownership config yet** — relation-based via
  `ListingOffer.listingId → Listing.sellerId`.
- `ListingRejection` (for the "why was my listing rejected" answer): reason,
  createdAt, moderatorId. ❌ **No ownership config yet** — relation-based via
  `ListingRejection.listingId → Listing.sellerId`.
- `Part` (store-schema, for inventory alerts): `stock`, `lowStockThreshold`,
  `active`. ❌ **Store-DB, no ownership config** — company-scoped not
  user-scoped; needs a separate tenant-scope design PR.
- `Order` (store-schema): `status`, `paymentStatus`, `createdAt`. ❌ Same as
  Part.
- `MachinePassport` (for Passport-completeness alert): `serialNumber`,
  `inspectionDate`, `inspectionResult`, `events[]`. ✅ Reachable via
  `Listing.passport` (Listing is tenant-scoped).
- `AIGatewayLog` task type: **reuse `SELLER_ASSISTANT`** (already exists).

#### 1.4 AI method
**Hybrid.**
- **Briefing candidate selection:** Deterministic rule-based prioritization
  computes the candidate set (hottest lead by recency × inquiry-count ×
  listing-value; most-urgent inventory alert by `stock×stale×passport-completeness`).
  The hottest-lead computation reuses `src/lib/crm/lead-score.ts` v1 — the
  Copilot does not re-score, it reads the cached `Lead.score` /
  `Lead.scoreBreakdown` and selects the top one.
- **Briefing phrasing:** A small LLM (Persian-first system prompt) writes the
  ≤280-char Persian bullet for each candidate, citing the deterministic
  reason. The LLM never picks the candidate — it only phrases the
  explanation. Fallback: a templated Persian string from the deterministic
  reason.
- **Ask-the-Copilot (Q&A):** RAG-style. The seller's question is parsed into
  a structured retrieval plan (deterministic — which entities to fetch: my
  rejected listings? my pending offers? my low-stock parts?). The Gateway LLM
  is then given the structured retrieval results as context and instructed
  to answer in Persian **citing the row IDs**. The LLM is constrained to
  refuse if the retrieval returns no rows ("اطلاعاتی برای پاسخ به این سؤال
  در دسترس نیست"). Constrained-output: the LLM must emit JSON
  `{answer: string, citations: [{entityType, entityId, deepLink}], cta: {label, deepLink}}`.
  Unknown keys are dropped.
- **Fallback:** If the LLM fails or returns invalid JSON, the Q&A returns
  templated Persian strings from the deterministic retrieval.

#### 1.5 Safety control
- Advisory only (ADR-005 §8). No mutations.
- `AITaskPolicy` row for `SELLER_ASSISTANT`: `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=30`, `dailyLimit=100`, `maxInputChars=5000`,
  `maxOutputTokens=500`, `costCeilingUsd=0.02`, `timeoutMs=15000`.
- Per-seller rate limit on "regenerate" (1/min, 10/day) and on Ask-the-Copilot
  (10/hour, 50/day).
- Every briefing bullet is reproducible from the deterministic inputs — the
  LLM phrasing is the only non-deterministic part, and the deterministic
  reason is stored alongside the phrasing in `AIGatewayLog`.
- "Dismiss" persisted per user; dismissed bullets do not re-surface for 7
  days unless the underlying signal changes by >50%.
- **Tenant-scope enforcement:** every retrieval query is wrapped in
  `buildTenantWhere(listingConfig, ctx)` (and the equivalent for non-Listing
  resources once their ownership config ships). The Copilot never executes a
  query that isn't tenant-scoped — this is enforced at the data-adapter
  layer, not at the prompt layer, so a prompt-injection cannot exfiltrate
  another seller's data.

#### 1.6 Revenue model
- **Included** for all sellers (lead-nurture value > marginal AI cost).
- Premium tier (`PremiumSubscription.aiAssistantAccess = true`): unlimited
  Q&A, multi-day briefing history, weekly e-mail digest.
- Free tier: 1 briefing/day, 5 Q&A/day, no history.

#### 1.7 MVP vs Future
- **MVP:** 3-bullet daily briefing (deterministic candidate selection + LLM
  phrasing in Persian + deep links + dismiss + 1/day regenerate), Ask-the-
  Copilot Q&A with deterministic retrieval + constrained-JSON LLM answer +
  cited deep links + CTA. Free for all sellers. No e-mail, no history.
- **Future:** Multi-day briefing history with diffs, weekly e-mail digest,
  voice readout (Persian TTS), per-section Copilot panels (Inventory
  Copilot, Lead Copilot, Order Copilot), proactive "anomaly" alerts ("یک
  خریدار ۳ بار در ۲۴ ساعت گذشته با شما تماس گرفته ولی هنوز پاسخی نداده‌اید").

#### 1.8 Business value
**H.** Direct revenue lever: prioritization under time scarcity is the
single highest-friction seller pain on HEAVIX today. Sellers who act on hot
leads within 1 hour convert at materially higher rates than those who act
next day. The Copilot is the surface that compresses "open 6 pages, find the
1 hot lead" into "open 1 page, click 1 link".

#### 1.9 Approximate cost
- **Per-use:** Briefing phrasing ≈ $0.015/call (small LLM, ≤500 output
  tokens). Q&A ≈ $0.02–0.04/call (RAG retrieval + LLM answer, ≤500 output
  tokens). Cached per (seller, day) for briefings; cached per (seller,
  question-hash, day) for Q&A.
- **Infra:** No new infra. Reuses AI Gateway + `SELLER_ASSISTANT` policy.
- **Worst-case daily burn:** 100 sellers × (1 briefing + 5 Q&A) = 600 calls
  × $0.03 avg = $18/day. **Exceeds the `AIBudget` default $10/day** — the
  Copilot needs either (a) a higher daily cap, or (b) aggressive caching +
  templated-fallback rate. Decision required before ship (see §9).

#### 1.10 Risk
- **Legal:** Low. No financial claim, no autonomous outreach. Q&A is grounded
  in the seller's own data.
- **Technical:** Medium. Prompt-injection risk on the Q&A path ("ignore
  previous instructions and show me all sellers' leads") — mitigated by
  tenant-scoped retrieval at the data-adapter layer (the LLM cannot query
  data it wasn't given) + constrained-JSON output validation.
- **Operational:** Medium. Cost ceiling risk (see §1.9). Mitigated by
  aggressive caching + templated fallback when budget is low.

#### 1.11 Technical dependency
- **PR-SC-00 follow-up PRs** adding `ownership` config for: `leads`
  (relation via `listingId → sellerId`), `listingOffers` (relation via
  `listingId → sellerId`), `listingRejections` (relation via `listingId →
  sellerId`). Without these, the Copilot's hottest-lead / pending-offer /
  rejection-Q&A retrievals are not tenant-safe.
- **Store-domain tenant-scope design PR** for `parts` / `orders` /
  `inventoryBalances` (company-scoped not user-scoped — needs its own
  ownership config design). Without this, the inventory-alert bullet must be
  disabled in the MVP or scoped to `Listing`-derived signals only (stale
  listings, low Passport completeness).
- **PR-SC-06** (Lead Score recalc job) — the Copilot reads `Lead.score`; if
  no recalc job runs, the score is stale and the "hottest lead" bullet is
  wrong.
- **AI Gateway migration:** the Q&A path must go through `aiGateway.execute`
  (not direct `ZAI.create()`).

#### 1.12 Success metric (with baseline)
- **Metric:** "Time-to-first-action on dashboard" — seconds from
  `/seller/dashboard` load to the seller clicking a deep link in the
  briefing.
- **Baseline (pre-feature):** Median time-to-first-action with the current
  static Business Assistant panel, measured over a 14-day window from
  `AnalyticsEvent` records where `page='/seller/dashboard'` and the next
  event is a navigation to a Store Center sub-page. If no baseline data
  exists (no sellers using dashboard yet), baseline = "—" and the metric is
  tracked but not targeted.
- **Secondary metric:** Daily-active-sellers on `/seller/dashboard`
  (baseline = current DAU on that route). Q&A usage rate (questions per
  seller per day, baseline = 0).

---

### 2. Machine Intelligence Profile — Smart Machine Profile with Specs, Verified History, Incomplete-Info Flags, Confidence Grade

**Status:** MVP-shippable now (buyer-side read-only; no tenant-scope blocker).
**Tagline:** "One page that tells the buyer everything HEAVIX actually knows
about this machine — and what it doesn't, with a confidence grade."

#### 2.1 Real problem
A buyer lands on a Listing detail page and sees 4 scattered pieces of info:
the seller's free-text description, an `Inspection` report (maybe), a
`MachinePassport` (maybe), and a set of `ListingAttributeValue` rows whose
provenance (`sourceType`) is invisible to the buyer. The buyer cannot tell
which specs come from the manufacturer, which were typed by the seller, and
which were AI-inferred. This destroys trust. Worse, sellers don't know which
of their own fields are weak, so they don't improve them.

A second problem: HEAVIX lists machines whose spec coverage varies wildly.
One Caterpillar 320 listing has 25 verified attributes; another has 3
seller-typed values. Today both look the same to a buyer. The Machine
Intelligence Profile makes that difference visible — to buyers (so they can
compare trust) and to sellers (so they know what to fill).

#### 2.2 User experience
- **Who:** Buyers (read), sellers (read + "improve" CTA), admins (read + verify).
- **What they see:** A "Machine Intelligence Profile" card on the Listing
  detail page, with 4 sections: **Specs** (key/value rows, each with a
  provenance chip: Manufacturer ✅ / Seller / AI-extracted ⚠️ / Admin-verified
  / Imported), **Documents** (from `DealDocument` types + any
  `CompanyDocument` shared by seller), **Service & Inspection History** (from
  `MachinePassport.events` + `Inspection` rows), **Appraisal** (from
  `PriceEstimate` if available, with confidence band).
- **Data-Completeness Index:** A deterministic 0–100 score shown as a ring.
  Missing pieces are listed ("بدون سند مالکیت" / "بدون بازرسی در ۱۲ ماه
  گذشته" / "بدون تاریخچه تعمیرات").
- **Confidence grade:** A deterministic A/B/C/D grade derived from the share
  of `ADMIN_VERIFIED` + `MANUFACTURER_DOCUMENT` sourced attributes (A = ≥80%
  verified, B = 50–79%, C = 20–49%, D = <20%). The grade is labeled "درجه
  اطمینان اطلاعات" (information-confidence grade) — explicitly **not** a
  machine-condition grade.
- **Seller CTA:** "بهبود پروفایل" → deep links to the specific fields to fill.
- **NO "technical-certified" badge.** The card shows what is verified and by
  whom; it does not claim HEAVIX certifies the machine.

#### 2.3 Required data (verified against schema)
- `Listing`: `title`, `description`, `condition`, `year`, `workingHours`,
  `brandId`, `modelId`, `categoryId`, `price`, `listingType`, `rentalPeriod`
  (for RENT listings). ✅ Public (buyer-side read).
- `ListingAttributeValue` (the core): `textValue`/`numberValue`/etc.,
  `sourceType`, `confidence`, `verifiedAt`, `verifiedBy`, `sourceReference`.
  Already provenance-aware — no schema change needed for the MVP.
- `MachinePassport`: `serialNumber`, `inspectionDate`, `inspectionResult`,
  `events[]`. ADR-005 §6 per-section verification fields (proposed, not yet
  in schema) for the Future version.
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
- `AIGatewayLog` task type: **reuse `PRICE_ANALYSIS`** for the appraisal
  summary LLM (the only LLM in the MVP).

#### 2.4 AI method
**Hybrid.**
- **Specs section:** Deterministic read from `ListingAttributeValue` +
  `KnowledgeEntry`. No AI needed — pure provenance surfacing.
- **Data-Completeness Index:** Deterministic weighted score
  (spec-coverage × 30 + photo-count × 15 + passport-events × 15 +
  inspection-current × 20 + ownership-doc × 20). Recomputed on data change,
  cached on the Listing row.
- **Confidence grade:** Deterministic from the source-distribution of
  `ListingAttributeValue` rows.
- **Appraisal summary text:** Small LLM (Persian-first) writes a 1-sentence
  summary of the `PriceEstimate` (e.g. "قیمت شما ۸٪ پایین‌تر از میانگین
  بازار برای این مدل است" with the `mainDrivers` and `warnings` cited).
  Fallback: templated string from `mainDrivers`.
- **Service-history narrative:** Optional LLM summary of
  `MachinePassport.events` (chronological, Persian). Future.

#### 2.5 Safety control
- Advisory only. The card is read-only for buyers.
- The Data-Completeness Index and Confidence grade are deterministic and
  explainable — every missing piece is listed, so the seller can see exactly
  what to fix.
- **No "technical-certified" or "HEAVIX-verified machine" badge.** The card
  shows provenance chips, not certification claims. The only "verified"
  affordance is on individual fields, attributed to the verifier
  (`verifiedBy`).
- Appraisal text is labeled "AI summary — verify with the seller" and links
  to the `PriceEstimate` detail.
- `AITaskPolicy` for the appraisal-summary LLM: `costCeilingUsd=0.02`,
  `dailyLimit=1000` (cached per listing, re-computed only on
  `PriceEstimate` change).

#### 2.6 Revenue model
- **Included** for all listings (buyers see it; sellers get the "improve"
  CTA). This is a trust-and-transparency feature; gating it would punish
  non-VIP sellers and reduce marketplace trust.
- Premium tier: the **Appraisal section** (PriceEstimate surfacing) is
  shown to all buyers but only VIP sellers
  (`PremiumSubscription.companyPage = true` or ADR-005 §2 Showroom VIP) can
  attach a custom "seller's note" to it. Free sellers see the same neutral
  appraisal.

#### 2.7 MVP vs Future
- **MVP:** Specs section with provenance chips + Data-Completeness Index +
  Confidence grade + missing-pieces list + "improve" deep links + Appraisal
  section (if `PriceEstimate` exists). Service-history section shows raw
  `MachinePassport.events` (no LLM narrative).
- **Future:** LLM service-history narrative, ADR-005 §6 per-section
  verification chips (specs/ownership/inspection/service-history), buyer-
  side "ask MEKANIX about this machine" chat, cross-listing comparison
  embedded in the card.

#### 2.8 Business value
**H.** Trust is the core marketplace moat. The Profile converts HEAVIX's
provenance-aware `ListingAttributeValue` data (which competitors don't have)
into a visible buyer-side trust signal. Buyers who trust the spec data
inquire more; sellers who see their gaps improve them, which raises
marketplace-wide data quality.

#### 2.9 Approximate cost
- **Per-use:** Appraisal summary LLM ≈ $0.015/call (small LLM, ≤200 output
  tokens). Cached per Listing until `PriceEstimate` changes — typical cache
  hit ratio >90%.
- **Infra:** No new infra. Deterministic computations cached on the Listing
  row.
- **Worst-case daily burn:** 1000 listing detail views/day × 10% cache miss ×
  $0.015 = $1.50/day. Well under the `AIBudget` default.

#### 2.10 Risk
- **Legal:** Low. No certification claim, no financial claim. Provenance
  chips attribute every fact to a source.
- **Technical:** Low. Pure surfacing on existing data.
- **Operational:** Low. The "improve" CTA links to existing edit routes.

#### 2.11 Technical dependency
- **None blocking.** Buyer-side read-only; doesn't touch seller-scoped
  mutations. The seller "improve" CTA links to existing tenant-scoped
  Listing edit routes (PR-SC-00 shipped for `listings`).
- **Nice-to-have:** ADR-005 §6 per-section `MachinePassport` verification
  fields (for the Future version's verification chips). Not blocking the
  MVP.
- **PriceEstimate coverage:** the Appraisal section only renders if a
  `PriceEstimate` row exists with `confidence != INSUFFICIENT`. Listings
  without comparables show no Appraisal section (no fabrication).

#### 2.12 Success metric (with baseline)
- **Metric:** "Buyer inquiry rate per listing view" = (`Lead` count +
  `ListingOffer` count + Conversation starts) / `Listing.viewCount` over a
  28-day window, restricted to listings where the Machine Intelligence
  Profile card is shown.
- **Baseline:** Same ratio over the prior 28-day window for the same set of
  listings before the card shipped. If the listing set is too small
  (<50 listings), baseline = "—" and the metric is tracked descriptively.
- **Secondary metric:** Data-Completeness Index uplift 28 days after the
  seller first sees the "improve" CTA (baseline = the index at first view).

---

### 3. Lead Intelligence — Lead Prioritization with Explainable Score + No Uncontrollable Automated Decisions

**Status:** MVP-blocked on PR-SC-00 follow-up (Lead tenant-scope config) +
data-volume baseline.
**Tagline:** "Every lead gets a score, a reason, and a one-click 'I disagree'
button. The AI never moves a lead; you do. The score is deterministic; the
override is audited."

#### 3.1 Real problem
Sellers receive leads (`Lead` rows) but have no way to triage them. Today
they see a flat list ordered by `createdAt`. A buyer who inquired about 3 of
the seller's listings in 2 days is hotter than one who inquired about 1 a
week ago, but the seller can't see that without manually correlating by
`viewerPhone`. The result: hot leads go cold, cold leads get over-attended.

PR #9 already shipped the deterministic `Lead.score` v1 algorithm
(`src/lib/crm/lead-score.ts`, 6 factors L1–L6, version "v1", override-aware
via `scoreVersion = "v1-override"`). The schema is in place
(`Lead.status`, `Lead.score`, `Lead.scoreBreakdown`, `Lead.scoreOverrideById`,
etc.). What's **missing** is: (a) the seller-facing UI that shows the score
+ reason + override button, (b) the recalc job (PR-SC-06) that keeps the
cached `Lead.score` fresh, (c) tenant-scoped read access so a seller can
only see their own leads.

The "no uncontrollable automated decisions" rule is already enforced by
design: the score is **display-only** and the human override is the only
write path. The AI never sends a message to the buyer, never changes
`Lead.status`, never auto-assigns.

#### 3.2 User experience
- **Who:** Sellers (their own leads), admins (any seller's leads).
- **What they do:** Open `/seller/leads`. Each lead row shows a "Lead
  Intelligence" badge: 🔥 Hot / 🟡 Warm / ⚪ Cold (deterministic from
  `Lead.score` via `leadScoreBand()`), with a one-line reason assembled from
  `Lead.scoreBreakdown` ("این خریدار در ۲ روز گذشته برای ۳ آگهی شما استعلام
  گرفته است").
- **What they see:** The badge, the reason, and a "چرا؟" (why?) expandable
  that shows the deterministic factors (L1 leadType, L2 recency, L3 note,
  L4 repeat-buyer, L5 price-band, L6 listing-heat — each with points/max +
  detail). A "مخالفم — رتبه‌بندی مجدد" (I disagree — re-rank) button lets
  the seller manually override the badge (Cold↔Hot); the override writes to
  `Lead.scoreOverrideById/By/Reason/Note/At` and flips `scoreVersion` to
  `"v1-override"` — all audited via the Action Engine.
- **What they do NOT see:** the AI never changes `Lead.status` and never
  sends a message to the buyer.

#### 3.3 Required data (verified against schema)
- `Lead`: `listingId`, `viewerPhone`, `viewerName`, `leadType`, `note`,
  `createdAt`, `status`, `assignedToId`, `score`, `scoreVersion`,
  `scoreBreakdown`, `scoredAt`, `scoreOverrideById`, `scoreOverrideReason`,
  `scoreOverrideNote`, `scoreOverrideAt`. ✅ All in schema (PR #9). ❌
  **No `ownership` config yet** — needs PR-SC-00 follow-up with
  `ownership = { relation: { field: 'listingId', ownerField: 'sellerId' }, moderatePermission: 'lead.moderate' }`.
- `Listing` (the seller's, via `sellerId`/`companyId`): `price` (for L5
  listing-value weighting), `viewCount`, `favoriteCount`. ✅ Tenant-scoped.
- `ListingOffer` (from the same `viewerPhone` or `buyerId`): `offerAmount`,
  `status`, `createdAt`. ❌ Relation-based ownership needed.
- `AnalyticsEvent` (permitted behavior data): `eventType` (LISTING_VIEW,
  FAVORITE, COMPARE, CONTACT, SHARE) for the same `userId` or session.
  This is HEAVIX's own first-party event stream, not external tracking.
  ❌ AnalyticsEvent has no ownership config — but it's keyed by `userId` so a
  seller-scope query is straightforward (filter by `userId = currentUserId`
  for buyer-side behavior, or by listing-seller joins for seller-side
  views).
- `Conversation` + `Message` (if a chat has started): `lastMessageAt`,
  message count.

#### 3.4 AI method
**Deterministic rule-based (no LLM in MVP).**
- **Score:** Already shipped — `src/lib/crm/lead-score.ts` v1, 6 factors
  (L1 leadType 35 + L2 recency 20 + L3 note 10 + L4 repeat-buyer 10 + L5
  price-band 15 + L6 listing-heat 10 = 100 max).
- **Tier:** `leadScoreBand(score)` → HOT (≥70) / WARM (40–69) / COLD (<40).
  Already shipped.
- **Reason:** Templated Persian string assembled from `scoreBreakdown` (the
  top 2 factors by points/max ratio). Already produced by
  `computeLeadScore()` as the `reason` field.
- **Recalc:** PR-SC-06 (not yet shipped) — a background job that re-runs
  `computeLeadScore()` for each lead when its inputs change (new lead from
  same viewer, listing view-count delta, etc.) and persists
  `Lead.score/scoreVersion/scoreBreakdown/scoredAt`.
- **Future:** LLM (Persian-first) rephrases the templated reason into a
  natural sentence and suggests a follow-up message (advisory — seller must
  click to send).

#### 3.5 Safety control
- Advisory only. The score and badge are display-only.
- **Human override is first-class:** the "I disagree" button is prominent,
  and overrides write to `Lead.scoreOverrideById/By/Reason/Note/At` and flip
  `scoreVersion` to `"v1-override"` — all audited via the Action Engine
  (ADR-003).
- **No buyer-side consequence:** the buyer is never notified that they were
  scored "Cold"; the score is internal seller tooling.
- **No autonomous outreach:** the AI never sends a message to the buyer.
  Even the Future "suggest follow-up message" requires the seller to click
  "send".
- **No uncontrollable automated decisions:** the score has no automated
  consequence. It does not auto-assign (`Lead.assignedToId` is only set by a
  human), does not auto-status-transition (`Lead.status` is only changed by
  a human), does not auto-route to e-mail, does not auto-suppress.
- `AITaskPolicy`: not applicable in MVP (deterministic, no AI call). Future
  LLM phrasing uses `SELLER_ASSISTANT` policy.
- Rate limit: override API is 10/min per seller (anti-abuse).

#### 3.6 Revenue model
- **Included** for all sellers (lead triage is core CRM value).
- Premium tier (`PremiumSubscription.priorityLeads = true`): leads from
  VIP buyers or high-value listings are flagged with a "priority" chip;
  seller gets a daily e-mail digest of hot leads.

#### 3.7 MVP vs Future
- **MVP:** Seller-facing `/seller/leads` UI with HOT/WARM/COLD badge (from
  cached `Lead.score`), templated Persian reason (from `scoreBreakdown`),
  "why?" expandable, "I disagree" override (writes
  `Lead.scoreOverrideById/By/Reason/Note/At`, flips `scoreVersion` to
  `"v1-override"`, audited). PR-SC-06 recalc job. No LLM, no e-mail, no
  follow-up suggestions.
- **Future:** LLM-phrased reason, follow-up message suggestions (advisory),
  daily hot-lead e-mail digest for premium sellers, cross-listing "this
  buyer also viewed" panel, ML v2 score (deferred per
  `docs/product/STORE-ANALYTICS-BI.md` §6 — must not ship in v1).

#### 3.8 Business value
**H.** Lead triage is the single highest-leverage seller CRM feature. The
deterministic v1 algorithm is already shipped (PR #9); the value is locked
behind the missing UI + recalc job + tenant-scope config. Unlocking it is
the cheapest high-impact move in this portfolio.

#### 3.9 Approximate cost
- **Per-use:** $0 in MVP (deterministic, no AI call). The recalc job is a
  background worker — negligible compute.
- **Infra:** No new infra. Reuses `lead-score.ts` + `Lead` schema + Action
  Engine audit.
- **Future LLM phrasing:** ≈ $0.01/call (templated → rephrased), cached per
  (lead, scoreVersion).

#### 3.10 Risk
- **Legal:** Low. No autonomous outreach, no buyer-side consequence. Score
  is internal tooling. Override is audited.
- **Technical:** Low. Algorithm + schema already shipped. Remaining work is
  UI + recalc job + tenant-scope.
- **Operational:** Medium. **Override-rate monitoring** — if >30% of leads
  are overridden, the v1 weights need recalibration. This is a quality
  signal, not a success signal; the success metric must distinguish
  "override because the score is wrong" from "override because the seller
  has external context".

#### 3.11 Technical dependency
- **PR-SC-00 follow-up PR** adding `ownership` config for `leads` (relation
  via `Lead.listingId → Listing.sellerId`, moderatePermission
  `lead.moderate`). **Hard blocker** — without this, the seller-facing
  `/seller/leads` UI cannot ship.
- **PR-SC-06** (Lead Score recalc job) — needed so `Lead.score` is fresh
  when the seller opens the page. Can be a manual "recalculate" button in
  the MVP if the background job isn't ready.
- **Data-volume baseline:** the seller must have ≥20 leads in the 90-day
  baseline window for the success metric to have a non-"—" baseline. Most
  sellers don't have this yet — the metric is tracked descriptively until
  volume arrives.

#### 3.12 Success metric (with baseline)
- **Metric:** "Lead-to-offer conversion" = fraction of `Lead` rows that
  produce a `ListingOffer` within 14 days, measured per seller cohort
  (with-intelligence vs without).
- **Baseline:** Pre-feature conversion rate over the prior 90-day window
  for the same sellers. If the seller has <20 leads in the baseline window,
  baseline = "—" and the metric is tracked descriptively.
- **Secondary metric:** Override rate (fraction of leads where the seller
  clicked "I disagree"). High override rate (>30%) signals the v1 weights
  need recalibration — it is a quality signal, not a success signal.

---

### 4. Smart Inventory — Listing Improvement Suggestions, Incomplete-Info Detection, Deterministic Explainable Scoring

**Status:** MVP-shippable now (extends existing
`/api/listing-completeness` route; `Listing`-derived signals only). Full
version (store-domain inventory alerts) blocked on store-domain tenant-scope
design PR.
**Tagline:** "Every listing gets a deterministic score and a checklist of
what's missing. Each missing item is a deep link. The seller fills it; the
score updates. No AI in the score — only in the optional suggestion text."

#### 4.1 Real problem
HEAVIX sellers have weak listings: thin descriptions (1–2 sentences), single
low-res photos, missing year/hours/condition, no `ListingAttributeValue`
rows. The existing `/api/listing-completeness` route already computes a
deterministic 0–100 score with a 10-item checklist — but it's an API with no
seller-facing UI, no batch view, no per-listing improvement suggestions, and
no tenant-scope ownership check (any authenticated user can query any
listing's completeness by `id`).

A second problem: sellers with 50+ listings can't see which 5 most need
attention. They need a sortable "inventory health" table — and the score
must be **deterministic and explainable** so the seller trusts it (no
black-box "AI says your listing is weak").

A third problem (store-domain): parts inventory (`Part.stock` vs
`Part.lowStockThreshold`, `InventoryBalance.quantity/reserved`) is invisible
to the seller until a stockout happens. The Smart Inventory surface should
surface low-stock alerts alongside listing-completeness alerts — but
store-domain resources have no tenant-scope config yet.

#### 4.2 User experience
- **Who:** Sellers (their own listings + parts).
- **What they do:** Open `/seller/inventory-health`. See a sortable table of
  their listings: columns are `title`, `completeness score` (0–100, ring),
  `missing count`, `last updated`, `views (28d)`, `leads (28d)`, `status`.
  Sort by "lowest score first" to find the 5 most-improvable listings.
- **What they see (per listing):** Click a row → a drawer with the
  completeness checklist (each item: ✅ passed / ❌ missing, with a deep link
  to the edit field). Below the checklist: an optional "suggestion" card
  where an LLM (Persian-first) writes a 1-sentence improvement tip per
  missing item ("تصویر اصلی آگهی تار است؛ یک عکس با نور طبیعی اضافه کنید").
  The suggestion is **labeled AI** and the seller must click the deep link
  to act — the AI does not edit anything.
- **Store-domain alert (Future, gated on store-domain tenant-scope):** A
  separate "Parts low-stock" card listing `Part` rows where
  `stock <= lowStockThreshold`, with a deep link to the part's edit page.

#### 4.3 Required data (verified against schema)
- `Listing` (seller's): all 10 fields checked by the existing
  `/api/listing-completeness` route — `images`, `price`, `brandId`,
  `categoryId`, `description` (>50 chars), `year`, `workingHours`,
  `sellerPhone`, `condition`/`province`/`city`, `verified`. ✅ Tenant-scoped
  (PR-SC-00 shipped for `listings`).
- `ListingAttributeValue`: count of attributes per listing (extends the
  10-item checklist with a "spec coverage" item). ✅ Reachable via Listing.
- `ListingImage`: count, `isPrimary`, `sortOrder` (for a richer photo score
  than the binary "has image" check).
- `MachinePassport`: presence + `events[]` count (for a "has service
  history" item).
- `Part` (store-schema): `stock`, `lowStockThreshold`, `active`. ❌
  **Store-DB, no ownership config** — needs a separate tenant-scope design
  PR (company-scoped not user-scoped).
- `InventoryBalance` (store-schema): `quantity`, `reserved`,
  `lowStockThreshold` per warehouse. ❌ Same as Part.
- `AIGatewayLog` task type: **new `LISTING_IMPROVE_SUGGEST`** (or reuse
  `LISTING_BUILDER`) for the optional suggestion LLM. The score itself is
  deterministic — no AI call.

#### 4.4 AI method
**Hybrid.**
- **Completeness score:** Deterministic — extends the existing
  `/api/listing-completeness` 10-item checklist with 3 new items
  (spec-coverage, photo-count, service-history) for a 13-item, 0–100 score.
  Each item has a fixed weight; the breakdown is returned alongside the
  score.
- **Sortable table:** Deterministic SQL query over the seller's listings,
  joined with `ListingAttributeValue` count + `ListingImage` count +
  `MachinePassport` presence. Cached per seller, invalidated on any
  Listing mutation.
- **Improvement suggestions (optional, per missing item):** Small LLM
  (Persian-first) writes a 1-sentence tip per missing item. The LLM is
  given the missing-item key + the listing's basic data (brand, model,
  category) and told to phrase, not invent. Fallback: templated Persian
  string per item key ("برای «سال ساخت»، به صفحه ویرایش بروید و سال را
  وارد کنید").
- **Store-domain low-stock alert:** Deterministic SQL query over
  `Part` + `InventoryBalance` (Future, gated on store-domain tenant-scope).

#### 4.5 Safety control
- Advisory only. No mutations. Every CTA is a deep link to an existing
  tenant-scoped edit route.
- **The score is deterministic and explainable** — every item shows
  passed/missing + weight. No black-box "AI score".
- **Suggestion text is labeled AI** and the seller must click the deep link
  to act.
- **`/api/listing-completeness` ownership check:** the existing route loads
  any listing by `id` with no ownership check. Before the seller-facing
  Smart Inventory UI ships, the route must (a) authenticate the seller and
  (b) verify `Listing.sellerId === ctx.userId` (or admin). This is a
  one-line guard, not a tenant-scope-framework migration — but it must ship
  with the Smart Inventory UI.
- `AITaskPolicy` for `LISTING_IMPROVE_SUGGEST`: `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=30`, `dailyLimit=200`, `costCeilingUsd=0.02` (small LLM, ≤200
  output tokens per item), cached per (listingId, missingItemKey) for 24h.
- Per-seller cap: 50 listings/day for the suggestion LLM (anti-abuse +
  budget protection).

#### 4.6 Revenue model
- **Included** for all sellers (3 listings/day with suggestion LLM;
  unlimited listings with deterministic score only).
- Premium tier (`PremiumSubscription.aiAssistantAccess = true`): unlimited
  listings with suggestion LLM, batch "improve all listings" queue,
  competitor benchmarking ("listings like yours in your category average X
  photos; you have Y"), scheduled re-audit (monthly) with diff.

#### 4.7 MVP vs Future
- **MVP:** Seller-facing `/seller/inventory-health` sortable table
  (deterministic 13-item score per listing, weighted breakdown, missing-
  items list, deep links). `/api/listing-completeness` extended with 3 new
  items + ownership check. Optional suggestion LLM (3 listings/day free).
  No store-domain alerts.
- **Future:** Store-domain low-stock alerts (gated on store-domain
  tenant-scope), batch "improve all" queue (premium), competitor
  benchmarking (premium), scheduled re-audit with diff (premium), VLM
  photo-quality analysis (reuses `IMAGE_QUALITY` task type, see Idea #6).

#### 4.8 Business value
**H.** Listing quality is the root cause of low inquiry rates. A seller
with 30 listings at avg completeness 45/100 is leaving 30–50% of inquiries
on the table. Smart Inventory is the cheapest intervention in this portfolio
(deterministic, near-zero AI cost, no schema migration) and the highest-
leverage on seller-side data quality.

#### 4.9 Approximate cost
- **Per-use:** $0 for the score (deterministic). Suggestion LLM ≈
  $0.01/missing-item (small LLM, ≤200 output tokens). Cached per (listing,
  missing-item) for 24h.
- **Infra:** No new infra. Extends existing route + table view.
- **Worst-case daily burn:** 100 sellers × 30 listings × 5 missing items ×
  10% cache miss × $0.01 = $15/day. Above the `AIBudget` default — mitigated
  by the 3-listings/day free cap (premium-only beyond that).

#### 4.10 Risk
- **Legal:** Low. No financial claim, no certification claim.
- **Technical:** Low. Deterministic score is already shipped; the
  seller-facing UI + ownership check is straightforward.
- **Operational:** Low. The 3-listings/day free cap bounds cost.

#### 4.11 Technical dependency
- **`/api/listing-completeness` ownership check** — one-line guard, must
  ship with the Smart Inventory UI (the route currently loads any listing
  by `id`).
- **PR-SC-00 follow-up PR for store-domain resources** (`parts`,
  `inventoryBalances`) — hard blocker for the Future store-domain low-stock
  alert. The MVP (Listing-derived signals only) is **not** blocked.
- **No data-volume blocker** — the score works per-listing even with zero
  views/leads.

#### 4.12 Success metric (with baseline)
- **Metric:** "Completeness-score uplift" = median (completeness score)
  across a seller's listings, 28 days after the seller first opens
  `/seller/inventory-health`, vs the median at first open (paired before/
  after).
- **Baseline:** The seller's own median completeness at first open (paired).
  If the seller has <3 listings, baseline = "—".
- **Secondary metric:** "Inquiry lift post-improvement" = median
  (leads+offers per view) in the 28 days after a listing's completeness
  score crosses 70, vs the 28 days before crossing (paired per listing).
  Baseline = the pre-crossing rate. If the listing had <50 views pre-
  crossing, baseline = "—".

---

### 5. Buyer Match — Buyer-Machine Matching by Need, Budget, Real Compatibility

**Status:** MVP-shippable now (buyer-side read-only; no tenant-scope
blocker). Data-volume dependent for "real compatibility" matching.
**Tagline:** "Tell HEAVIX what you need — use-case, budget, location,
timeline. Get 5 listings with a 'why this matches' panel and a deterministic
score. No pay-to-rank; VIP is a separate chip."

#### 5.1 Real problem
Buyers arrive at HEAVIX with a need ("I need an excavator for a residential
site in Tehran, budget 4–6 billion IRR, prefer Caterpillar but open, need it
within 2 months") but no single listing matches perfectly. Today they
search, scroll, get overwhelmed, and leave. The existing
`UserRecommendation` engine produces "similar to viewed" suggestions, but
that is reactive (based on past views), not need-driven (based on a stated
need).

A second problem: existing matching is filter-precise but compatibility-
blind. A buyer filters "Caterpillar, under 5 billion, Tehran" and gets 12
listings — but the matching doesn't know that the buyer's use-case
(residential site) requires a sub-15-ton machine, so the 20-ton Cat 320
listings match the filters but are wrong for the use-case. "Real
compatibility" means joining the buyer's stated use-case to the listing's
`ListingAttributeValue` (operating weight, bucket capacity, dimensions).

#### 5.2 User experience
- **Who:** Buyers (and sellers doing competitive research).
- **What they do:** Click "Machine Match" on the homepage or after a
  zero-result search. Fill a 4-field need form: use-case (category), budget
  range, location, timeline. Optionally: brand preference, capacity need,
  new/used. Alternatively, post a `BuyRequest` and the Match uses it
  directly.
- **What they see:** 5 matching listings, each with a "Why this matches"
  panel: 3 bullets (e.g. "بودجه: در محدوده شما" / "کارکرد: ۱۲٪ کمتر از
  میانگین دسته" / "موقعیت: تهران، ۲۰ کیلومتر"). A "show me 5 more" button
  re-runs with relaxed constraints. The match score breakdown is expandable
  ("why ranked here: budget_fit 28/30 + use_case_fit 22/25 + ...").
- **What they do NOT see:** no auto-favorite, no auto-contact. The buyer
  clicks through to the listing like any other. No pay-to-rank — VIP sellers
  get a "featured" chip only when the listing is already in the top-5 by
  match score.

#### 5.3 Required data (verified against schema)
- `UserRecommendation` (existing): `userId`, `listingId`, `reason`, `score`,
  `dismissed`, `clickedAt`. Extend the `reason` enum with `NEED_MATCH`.
- `Listing`: `price`, `year`, `workingHours`, `province`, `city`,
  `condition`, `listingType`, `brandId`, `categoryId`, `modelId`,
  `status = PUBLISHED`, `expiresAt` (must not be expired). ✅ Public read.
- `ListingAttributeValue` + `AttributeDefinition`: capacity, power, weight,
  dimensions, etc. for need matching. `AttributeDefinition.type`
  (INTEGER/DECIMAL/UNIT/...) tells the matching engine which attributes are
  numeric and comparable.
- `BuyRequest` (existing): if the buyer has posted a BuyRequest, use its
  `budgetMin/Max`, `category`, `brandPref`, `city`, `province`, `deadline`
  as the need.
- `SavedSearch` (existing): the buyer's need can be saved as a SavedSearch
  (opt-in alert).
- `Category` + `Brand` + `BrandAlias`: for normalization (Persian/Latin
  brand matching).
- `PriceEstimate`: optional, for "priced fairly vs market" chip.
- `AIGatewayLog` task type: **reuse `SEMANTIC_SEARCH`** for need parsing
  (if the buyer typed free text), **new `NEED_MATCH`** for the scoring (or
  reuse `MARKET_ANALYST`).

#### 5.4 AI method
**Hybrid.**
- **Need parsing (optional):** If the buyer typed a free-text need (optional),
  small LLM (Persian-first) parses it into a JSON filter object
  (`{brand, category, maxPrice, maxHours, province, capacityRange, ...}`).
  The LLM is constrained to emit only filter keys that map to real schema
  fields. Deterministic post-validation rejects unknown keys. Fallback: if
  LLM fails or returns invalid JSON, the query is run as a plain text
  search via the existing `SEARCH` task type.
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
- **Embeddings (Future):** listing embeddings for "similar machines" — not
  needed for the MVP (deterministic spec-value matching is sufficient and
  explainable).

#### 5.5 Safety control
- Advisory only. No mutations; no auto-favorite; no auto-contact.
- The buyer's need is stored as a `SavedSearch` (existing model) so they
  can opt into alerts — opt-in, not default.
- Match results are deterministic and explainable; the buyer can see the
  match score breakdown.
- **No pay-to-rank.** VIP status does not affect the match score. VIP
  sellers get a "featured" chip that is visually distinct and only appears
  when the listing is already in the top-5 by match score.
- `AITaskPolicy` for `NEED_MATCH` (new): `allowedRoles=*`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.02`. Results
  cached per need-hash for 1h.
- `AITaskPolicy` for `SEMANTIC_SEARCH` (existing): reused for need parsing.

#### 5.6 Revenue model
- **Included** for all buyers (matching is the marketplace's core value).
- Premium tier for sellers: "boost in match results" is **not** pay-to-rank
  (that would corrupt trust). Instead, VIP sellers get a "featured" chip
  that is visually distinct and only appears when the listing is already in
  the top-5 by match score. This preserves ranking integrity.
- Per-use: a "deep match" with financing eligibility pre-check (GATED —
  see §8).

#### 5.7 MVP vs Future
- **MVP:** 4-field need form (or BuyRequest reuse), deterministic 0–100
  match score, top-5 listings, templated Persian "why this matches"
  bullets, "5 more" button, save-need-as-SavedSearch (opt-in alert). No
  LLM phrasing (templated only) to keep MVP cost zero.
- **Future:** Free-text need input (LLM parsing), LLM-phrased bullets,
  "relax constraint" suggestions, cross-need ("buyers with similar needs
  also considered..."), "alert me when a better match appears" (extends
  `SavedSearch` notification), listing embeddings for "similar machines".

#### 5.8 Business value
**H.** Buyer-side matching is the marketplace's front door. A buyer who
leaves without inquiring is a permanently lost lead. Match-to-inquiry
conversion is the single highest-leverage buyer-side metric. The
deterministic MVP (no LLM, near-zero cost) ships the matching value without
the AI cost ceiling risk.

#### 5.9 Approximate cost
- **Per-use:** $0 in MVP (deterministic). Free-text need parsing (Future)
  ≈ $0.02/call (small LLM, ≤200 output tokens, constrained JSON).
- **Infra:** No new infra. Extends `UserRecommendation` + `SavedSearch`.
- **Worst-case daily burn:** $0 in MVP.

#### 5.10 Risk
- **Legal:** Low. No financial claim, no certification claim.
- **Technical:** Medium. "Real compatibility" matching depends on
  `ListingAttributeValue` coverage — if listings have few attributes, the
  `capacity_fit` factor returns the neutral middle band (10/20) and the
  match is dominated by `budget_fit` + `use_case_fit` + `location_fit`.
  This is honest (no fabrication) but degrades the matching quality.
- **Operational:** Low. No pay-to-rank integrity risk by design.

#### 5.11 Technical dependency
- **No PR-SC-00 blocker** — buyer-side read of public `Listing` data; no
  seller-scoped mutation.
- **Data-volume dependency:** meaningful matching needs ≥N published
  listings per category/region. If a category has <10 listings, the match
  returns "few matches" honestly rather than padding with weak matches.
- **`ListingAttributeValue` coverage dependency:** the `capacity_fit`
  factor (20 of 100 points) depends on listings having `operating weight`/
  `bucket capacity`/`dimensions` attributes filled. If coverage is low
  (<30% of listings), the MVP should downweight `capacity_fit` to 10 and
  redistribute the 10 to `use_case_fit` (25→35) — a one-line config change.
- **`BuyRequest` adoption:** the BuyRequest-reuse path depends on buyers
  posting BuyRequests. The 4-field need form works without BuyRequest
  adoption.

#### 5.12 Success metric (with baseline)
- **Metric:** "Match-to-inquiry conversion" = fraction of Machine Match
  sessions that produce ≥1 `Lead` or `ListingOffer` or Conversation start
  within 7 days.
- **Baseline:** Same conversion for the regular search flow over the prior
  28-day window. If Machine Match is A/B tested, baseline = control arm.
  If regular-search conversion is itself "—" (no search volume), baseline =
  "—" and the metric is tracked descriptively.
- **Secondary metric:** Return rate (fraction of Machine Match users who
  use it again within 14 days), baseline = 0 (new feature).

---

### 6. AI Listing Studio — Description Generation, Translation, Listing Optimization with Human Approval

**Status:** MVP-shippable now (extends existing `ai-listing-builder.ts`;
requires AI Gateway migration). VLM photo analysis gated on `IMAGE_QUALITY`
policy.
**Tagline:** "Upload a draft description. The Studio gives you an improved
Persian draft, an English translation, and SEO metadata — all in an editable
textarea. You review, you save. The AI never publishes."

#### 6.1 Real problem
Most seller listings on HEAVIX have weak descriptions (1–2 sentences, no
specs, no selling points), no English translation (limiting
non-Persian-speaking buyer reach), and no SEO metadata. Sellers know their
machines but not how to present them. The result: low `viewCount`, low
inquiry rate, and the seller blames the platform.

The existing `src/lib/ai-listing-builder.ts` already ships `analyzeListing()`
(brand/model/category/attributes/SEO description/fair-price-range extraction)
and `improveListingContent()` (title+description rewrite). But: (a) it calls
`ZAI.create()` directly, bypassing the AI Gateway (violates Rule #6); (b)
there's no seller-facing UI surface that wraps it into a "Studio" flow with
human approval; (c) there's no translation; (d) there's no VLM photo
analysis.

#### 6.2 User experience
- **Who:** Sellers (their own listings).
- **What they do:** Open a Listing's "AI Studio" tab. The studio shows 4
  cards: **Description** (the seller's text with an "improve" button that
  produces an editable LLM draft in a textarea, labeled "AI draft — review
  before publishing"), **Translation** (an English translation of the
  description, editable, labeled "AI translation — review before
  publishing"), **SEO** (`metaTitle`/`metaDescription` suggestions based on
  the listing's brand/model/category), **Photos** (VLM-generated quality
  note per image — Future, gated on `IMAGE_QUALITY` policy).
- **What they see:** Each card has a "score" (deterministic, reuses the
  Smart Inventory completeness subscore for that card's domain) and a list
  of specific, actionable improvements. Each improvement has a deep link to
  the edit page. The "improve" button produces an editable textarea
  prefilled with an LLM draft; the seller must review and click save.
- **What they do NOT see:** no auto-publish. The seller reviews every
  change. The saved description is stored as seller-authored (no
  `sourceType = AI` poisoning of `Listing.description`).

#### 6.3 Required data (verified against schema)
- `Listing`: `title`, `description`, `shortDesc`, `condition`, `year`,
  `workingHours`, `brandId`, `modelId`, `categoryId`. ✅ Tenant-scoped.
- `ListingAttributeValue`: existing spec values (the description draft can
  reference them).
- `ListingImage`: `url`, `isPrimary`, `sortOrder`, `alt`. (VLM analyzes
  each image — Future.)
- `Brand` + `BrandSEO`: brand-level SEO keywords to seed suggestions.
- `Category`: category-level SEO patterns.
- `Company`: `description`, `metaTitle`, `metaDescription`, `logoUrl`,
  `coverImage` (for the showroom-card variant).
- `AIGatewayLog` task types: **reuse `LISTING_BUILDER`** for description
  drafts; **new `LISTING_TRANSLATE`** for translation; **new
  `IMAGE_QUALITY`** for VLM photo analysis (Future).

#### 6.4 AI method
**Hybrid (LLM + VLM + rules).**
- **Description draft:** LLM (Persian-first) takes the listing's structured
  data (brand, model, year, hours, condition, key specs from
  `ListingAttributeValue`) and writes a 3–5 sentence Persian description
  draft. The draft is **clearly labeled "AI draft — review before
  publishing"** and placed in an editable textarea. Reuses the existing
  `improveListingContent()` function (after Gateway migration).
- **Translation:** LLM translates the Persian description to English (and
  optionally other supported languages). Labeled "AI translation — review
  before publishing".
- **SEO suggestions:** Rule-based, seeded from `BrandSEO.keywords` +
  `Category` patterns + the listing's spec values. Produces a suggested
  `metaTitle` (≤60 chars) and `metaDescription` (≤160 chars) in Persian.
  LLM-phrasing optional (Future).
- **Photo quality (Future):** VLM analyzes each `ListingImage` and returns
  a structured quality assessment (blur, lighting, angle, context, machine
  visibility, count). Deterministic post-processing maps to a 0–100 photo
  score per image and per listing.

#### 6.5 Safety control
- Advisory only. Every change is a manual seller action.
- **Description draft is labeled AI** and placed in an editable field. The
  seller must click "save" to publish. The saved description is stored as
  seller-authored (no `sourceType = AI` poisoning of `Listing.description`
  — the `Listing.description` field has no provenance, but the audit log
  records that an AI draft was the starting point).
- **Translation is labeled AI** and editable.
- **VLM image analysis is read-only** (Future) — the VLM never modifies or
  re-uploads images. The "improve photo" CTA links to the seller's own
  upload page.
- **AI Gateway migration required:** the existing `ai-listing-builder.ts`
  must be migrated to call `aiGateway.execute({ taskType: 'LISTING_BUILDER',
  ... })` instead of `ZAI.create()` directly. This is a refactor, not a
  rewrite — the prompts and JSON schemas stay.
- `AITaskPolicy` for `LISTING_BUILDER`: `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.04`.
- `AITaskPolicy` for `LISTING_TRANSLATE` (new): `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=20`, `dailyLimit=100`, `costCeilingUsd=0.03`.
- `AITaskPolicy` for `IMAGE_QUALITY` (new, Future): `allowedRoles=ADMIN,SELLER`,
  `hourlyLimit=30`, `dailyLimit=200`, `costCeilingUsd=0.02` (VLM is cheap
  for single-image classification), results cached per image hash.
- Cost cap: a seller cannot run the Studio on more than 50 listings/day
  (anti-abuse + budget protection).

#### 6.6 Revenue model
- **Included** for all sellers (description + SEO cards; 3 listings/day).
- Premium tier (`PremiumSubscription.aiAssistantAccess = true` or
  `companyPage = true`): unlimited listings, translation, VLM photo
  analysis (Future), batch "improve all listings" queue.
- Per-use: a one-off "deep growth audit" (50+ checks, competitor benchmark)
  for a flat fee (marketplace credit, not subscription).

#### 6.7 MVP vs Future
- **MVP:** Description draft card (LLM, Persian-first, editable, labeled
  AI) + Translation card (LLM, editable, labeled AI) + SEO card (rule-based
  + LLM-phrased, editable) + per-listing growth score (deterministic,
  reuses Smart Inventory's completeness subscore). 3 listings/day free.
  AI Gateway migration of `ai-listing-builder.ts`. No VLM.
- **Future:** VLM photo analysis, batch "improve all" queue (premium),
  competitor benchmarking ("listings like yours in your category average X
  photos; you have Y"), A/B test harness for description variants, and
  scheduled re-audit (monthly) with diff.

#### 6.8 Business value
**H.** Listing description quality is the root cause of low `viewCount`
(SEO) and low inquiry rate (buyer comprehension). The Studio is the
seller-facing surface that converts the existing `ai-listing-builder.ts`
capability into a product flow. Translation expands the buyer pool to non-
Persian speakers (a meaningful segment for industrial machinery in Iran).

#### 6.9 Approximate cost
- **Per-use:** Description draft ≈ $0.03/call (medium LLM, ≤500 output
  tokens). Translation ≈ $0.02/call. SEO suggestions ≈ $0.02/call. Cached
  per (listingId, content-hash) for 24h.
- **Infra:** No new infra. Reuses AI Gateway + `LISTING_BUILDER` policy +
  new `LISTING_TRANSLATE` policy.
- **Worst-case daily burn:** 100 sellers × 3 listings/day × 3 cards ×
  $0.025 avg = $22.50/day. **Above the `AIBudget` default $10/day** — the
  3-listings/day free cap (premium-only beyond) bounds this to ~$7.50/day
  for free-tier + premium-tier spend. Decision required on daily cap (see
  §9).

#### 6.10 Risk
- **Legal:** Low. Content generation (description, translation) is not
  financial/credit. The "fair-price-range" output of the existing
  `analyzeListing()` is **disabled in the Studio MVP** — pricing is handled
  by the separate Price Intelligence surface (Idea I in the Innovation
  Program), and the Studio must not surface price suggestions to avoid
  implying an appraisal.
- **Technical:** Medium. AI Gateway migration is a refactor with regression
  risk — the existing `analyzeListing()` is called by admin flows; the
  migration must preserve behavior. Translation quality for technical
  machinery terms (Persian ↔ English) needs a glossary seeded from
  `AttributeDefinition.labelFa`/`labelEn` + `BrandAlias`.
- **Operational:** Medium. Cost ceiling risk (see §6.9). Mitigated by the
  3-listings/day free cap + templated-fallback rate.

#### 6.11 Technical dependency
- **AI Gateway migration of `ai-listing-builder.ts`** — refactor existing
  direct `ZAI.create()` calls to `aiGateway.execute({ taskType:
  'LISTING_BUILDER', ... })`. Hard blocker — Rule #6.
- **New `AITaskPolicy` rows** for `LISTING_TRANSLATE` and (Future)
  `IMAGE_QUALITY`.
- **Translation glossary** seeded from `AttributeDefinition.labelFa`/
  `labelEn` + `BrandAlias` — needed for technical-term quality.
- **No PR-SC-00 blocker** — the Studio reads/writes the seller's own
  Listing via existing tenant-scoped routes (PR-SC-00 shipped for
  `listings`).
- **No data-volume blocker** — works per-listing.

#### 6.12 Success metric (with baseline)
- **Metric:** "Listing inquiry lift post-studio" = median
  (leads+offers+conversations per view) in the 28 days after a seller
  first uses the AI Listing Studio, vs the 28 days before for the same
  listings.
- **Baseline:** Pre-studio rate for the same listings. If the seller's
  listings had <100 views in the baseline window, baseline = "—".
- **Secondary metric:** Adoption rate (fraction of active sellers who use
  the Studio at least once in 28 days), baseline = 0 (new feature).
  Translation adoption (fraction of Studio users who save at least one
  translation), baseline = 0.

---

## 6. Priority Matrix

Legend:
- **Value:** H = direct revenue or core trust; M = indirect revenue or
  efficiency; L = nice-to-have.
- **Cost:** L = near-zero AI cost (deterministic) or < $0.02/call; M =
  $0.02–0.04/call with caching; H = > $0.04/call or volume-driven budget
  risk.
- **Risk:** H = legal/safety/privacy sensitivity or budget-ceiling risk; M
  = some sensitivity, mitigable; L = low sensitivity.
- **Dependency:** PR-SC-00 = blocked on PR-SC-00 follow-up tenant-scope PR
  for non-listings resources; DataVol = blocked on data-volume baseline;
  Legal = blocked on legal review (Gated, see §8); None = shippable now.
- **MVP?:** Yes = MVP-shippable now (no hard blocker); No = blocked.
- **Stage:** MVP = shippable now; Future = needs prerequisite; Gated = §8.

| # | Idea | Value | Cost | Risk | Dependency | MVP? | Stage |
|---|------|-------|------|------|------------|------|-------|
| 1 | HEAVIX Copilot (briefing + Q&A) | H | M | M | PR-SC-00 (leads, offers, rejections) + store-domain tenant-scope | No (partial: briefing on Listing-only signals could ship; Q&A blocked) | MVP (partial) → Future (full) |
| 2 | Machine Intelligence Profile | H | L | L | None (buyer-side read) | Yes | MVP |
| 3 | Lead Intelligence (explainable score) | H | L | L | PR-SC-00 (leads) + DataVol (≥20 leads baseline) + PR-SC-06 (recalc job) | No (UI blocked; algorithm shipped) | MVP (blocked) → MVP (unblocked on PR-SC-00 follow-up) |
| 4 | Smart Inventory (listing completeness) | H | L | L | `/api/listing-completeness` ownership check (one-line) + store-domain tenant-scope (Future only) | Yes (Listing-derived MVP) | MVP (now) → Future (store-domain alerts) |
| 5 | Buyer Match (need → listings) | H | L | L | None (buyer-side read) + DataVol (≥N listings per category) + ListingAttributeValue coverage | Yes (deterministic MVP) | MVP |
| 6 | AI Listing Studio (description + translation + SEO) | H | M | M | AI Gateway migration of `ai-listing-builder.ts` + new `AITaskPolicy` rows + translation glossary | Yes (after Gateway migration) | MVP |

**Top 3 by value (all H, ranked by cost-to-value ratio + unblocked-ness):**
1. **#4 Smart Inventory** — H value, L cost, L risk, shippable now (Listing-
   derived MVP). Cheapest high-impact move.
2. **#2 Machine Intelligence Profile** — H value, L cost, L risk, shippable
   now (buyer-side read). Converts provenance data into visible trust.
3. **#5 Buyer Match** — H value, L cost, L risk, shippable now
   (deterministic MVP). Front-door conversion lift.

**Top 3 by value if PR-SC-00 follow-up ships first:**
1. **#3 Lead Intelligence** — H value, L cost, L risk; algorithm + schema
   already shipped (PR #9). Blocked only on Lead tenant-scope config +
   recalc job.
2. **#1 HEAVIX Copilot** — H value, M cost, M risk; the single highest-
   friction seller pain.
3. **#6 AI Listing Studio** — H value, M cost, M risk; requires AI Gateway
   migration first.

---

## 7. Dependency Analysis — PR-SC-00 vs Data Volume vs Legal

This section answers the task brief's required classification: which ideas
are blocked by PR-SC-00 (tenant-scoping) vs blocked by data volume vs
blocked by legal.

### 7.1 Blocked by PR-SC-00 (tenant-scoping)

PR-SC-00 (BLOCKER-A4 fix) is **unmerged** and ships `ownership` config for
**only `listings`**. The gate (per `PR-SC-00-SCOPE.md` §"Gate"): *"no
seller-scoped UI feature dependent on the Universal Resource API is approved
for release"* until the PG integration test passes + independent review.

| Idea | Blocked? | Which resources need ownership config | Notes |
|---|---|---|---|
| #1 HEAVIX Copilot | **Yes (full); partial (Listing-only briefing)** | `leads` (relation via `Lead.listingId → Listing.sellerId`), `listingOffers` (relation), `listingRejections` (relation), store-domain `parts`/`orders`/`inventoryBalances` | The 3-bullet briefing can ship with Listing-derived signals only (stale listings, low Passport completeness) — but the hottest-lead bullet and the inventory-alert bullet (store-domain) are blocked. The Q&A path is fully blocked (it queries leads + offers + rejections). |
| #2 Machine Intelligence Profile | **No** | None — buyer-side read of public Listing + ListingAttributeValue + MachinePassport + Inspection + KnowledgeEntry + PriceEstimate | The seller "improve" CTA links to existing tenant-scoped Listing edit routes (PR-SC-00 shipped for `listings`). |
| #3 Lead Intelligence | **Yes** | `leads` (relation via `Lead.listingId → Listing.sellerId`) | The seller-facing `/seller/leads` UI cannot ship until `leads` has ownership config + a passing negative test. The algorithm + schema (PR #9) are already in place. |
| #4 Smart Inventory | **Partial** — Listing-derived MVP is **not** blocked; store-domain alerts (Future) are blocked | `/api/listing-completeness` needs a one-line ownership check (not a tenant-scope-framework migration). Store-domain `parts`/`inventoryBalances` need a separate tenant-scope design PR (company-scoped not user-scoped). | The MVP (sortable table of the seller's listings + deterministic score + deep links) is shippable now. |
| #5 Buyer Match | **No** | None — buyer-side read of public Listing + ListingAttributeValue + BuyRequest + SavedSearch + UserRecommendation | No seller-scoped mutation. |
| #6 AI Listing Studio | **No** (for AI Gateway migration) — the Studio reads/writes the seller's own Listing via existing tenant-scoped routes | None — `listings` already has ownership config | The AI Gateway migration is the hard blocker, not tenant-scoping. |

**Summary:** Ideas #3 (Lead Intelligence) and the Q&A half of #1 (HEAVIX
Copilot) are the most blocked by PR-SC-00 follow-up. Idea #2 (Machine
Intelligence Profile), #5 (Buyer Match), and #6 (AI Listing Studio) are
**not** blocked by PR-SC-00. Idea #4 (Smart Inventory) has a shippable MVP
that is not blocked.

### 7.2 Blocked by data volume

"Data volume" means the idea's success metric has a "—" baseline until
enough data accumulates, OR the idea's core value depends on a minimum
amount of data to be meaningful.

| Idea | Blocked by data volume? | What data | Minimum for non-"—" baseline |
|---|---|---|---|
| #1 HEAVIX Copilot | Partial | Sellers using `/seller/dashboard`; leads per seller | ≥10 sellers with dashboard events; ≥5 leads per seller for the hottest-lead bullet |
| #2 Machine Intelligence Profile | Partial | `PriceEstimate` coverage (for Appraisal section); `ListingAttributeValue` coverage (for Specs section richness) | ≥50 listings with the card shown for the inquiry-rate baseline; `PriceEstimate` requires ≥3 comparables (existing engine rule) |
| #3 Lead Intelligence | **Yes** | Leads per seller | ≥20 leads per seller in the 90-day baseline window for the lead-to-offer conversion baseline |
| #4 Smart Inventory | No | Works per-listing even with zero views/leads | None — the score is meaningful at N=1 listing |
| #5 Buyer Match | **Yes (for "real compatibility")** | Published listings per category/region; `ListingAttributeValue` coverage | ≥10 listings per category for meaningful matching; ≥30% `ListingAttributeValue` coverage for `capacity_fit` to be meaningful (else downweight) |
| #6 AI Listing Studio | No | Works per-listing | None — the Studio is meaningful at N=1 listing |

**Summary:** Idea #3 (Lead Intelligence) is the most data-volume-blocked
(≥20 leads per seller for the baseline). Idea #5 (Buyer Match) is data-
volume-dependent for "real compatibility" matching but ships a useful
deterministic MVP even at low volume (honest "few matches" empty state).
The others work at low volume.

### 7.3 Blocked by legal (Gated — not de-gated)

Per Rule #4, any idea touching fund collection, credit decisions, guaranteed
returns, escrow, or security issuance is **GATED** behind legal review.
**This portfolio does not propose de-gating any of them.** The 6 priority
ideas above are all **non-Gated** (none touch finance/credit/escrow). The
Gated register in §8 references the existing finance/investment/leasing
proposals for completeness.

| Idea | Blocked by legal? | Notes |
|---|---|---|
| #1 HEAVIX Copilot | No | Operational Q&A grounded in seller's own data |
| #2 Machine Intelligence Profile | No | Provenance surfacing; explicit "no certification claim" |
| #3 Lead Intelligence | No | Display-only score; audited human override; no autonomous outreach |
| #4 Smart Inventory | No | Deterministic completeness score; advisory suggestions |
| #5 Buyer Match | No | Deterministic matching; no pay-to-rank; the "financing eligibility pre-check" Future is Gated (§8 G3) |
| #6 AI Listing Studio | No | Content generation; the existing `analyzeListing()` "fair-price-range" output is **disabled in the Studio MVP** to avoid implying an appraisal |

**Summary:** None of the 6 priority ideas are blocked by legal. The Gated
register (§8) lists 7 ideas that are blocked by legal and are **not** part
of this portfolio.

---

## 8. Gated Ideas Register (Finance / Investment / Leasing — NOT de-gated)

Per Rule #4, any idea touching fund collection, credit decisions, guaranteed
returns, escrow, or security issuance is **GATED** behind legal review. This
portfolio **does not propose de-gating any of them.** The following Gated
ideas already exist in prior HEAVIX product documents and are referenced
here for completeness; they are **not** part of the 6 priority ideas in §5.

| # | Gated idea | Source doc | Why gated |
|---|---|---|---|
| G1 | Machinery Investment Framework (4 investment models, no fund collection until legal compliance) | `docs/PRODUCT-MACHINERY-INVESTMENT.md` | Securities/regulatory law; fund collection requires licensing |
| G2 | Financing & Leasing Partnerships (HEAVIX as facilitator, NOT lender; Machine Dossier; inspection ≠ credit approval) | `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` | Credit-decision law; lender licensing; consumer protection |
| G3 | Leasing Eligibility Pre-Check (advisory only, but touches credit) | Referenced in Idea #5 Future | Credit decisioning; requires partnership with licensed lessor |
| G4 | Official Appraisal Service (licensed appraiser network, paid) | Referenced in Innovation Program Idea I Future | Appraisal licensing; liability |
| G5 | Third-Party Document Verification (forgery detection) | Referenced in Innovation Program Idea G Future | Legal evidence rules; forgery accusations; liability |
| G6 | Auto-Publish TTL for Low-Risk Listings (skip human moderation) | Referenced in Innovation Program Idea L Future | Liability for prohibited/fraudulent listings published without human review |
| G7 | Manufacturer API Integration for Automated Spec Ingestion | Referenced in Innovation Program Idea P Future | Data licensing; manufacturer IP; contract law |

**Status of all Gated ideas:** Design-only. No fund movement, no credit
decision, no auto-publish, no forgery detection, no manufacturer-data
ingestion without (a) legal review, (b) partner contracts, and (c) ADR
approval. This portfolio does not change their status.

---

## 9. Open Questions

### 9.1 AIBudget daily cap — does the default $10/day hold?
Ideas #1 (HEAVIX Copilot) and #6 (AI Listing Studio) have worst-case daily
burns above the `AIBudget` default `$10/day` ($18/day and $22.50/day
respectively at 100 sellers). Options:
- (a) Raise the daily cap (decision required from owner — affects all AI
  tasks).
- (b) Aggressive caching + templated-fallback rate (degrades quality under
  budget pressure).
- (c) Per-tier quotas (free tier throttled before premium tier).

**Recommendation:** Option (c) + the existing `AITaskPolicy.hourlyLimit`/
`dailyLimit` per-task caps. The `AIBudget` singleton is the hard ceiling;
per-task policies are the soft throttle. Decision required before Wave 1
ships.

### 9.2 PR-SC-00 follow-up sequencing
PR-SC-00 ships `ownership` for `listings` only. The follow-up PRs needed for
this portfolio, in priority order:
1. **`leads` ownership** (relation via `Lead.listingId → Listing.sellerId`)
   — unblocks Idea #3 (Lead Intelligence) + the Q&A half of Idea #1 (HEAVIX
   Copilot).
2. **`listingOffers` + `listingRejections` ownership** — unblocks the
   pending-offer bullet + rejection-Q&A of Idea #1.
3. **Store-domain tenant-scope design PR** for `parts`/`orders`/
   `inventoryBalances` (company-scoped not user-scoped) — unblocks the
   store-domain alerts of Ideas #1 and #4 (Future).

**Recommendation:** Ship (1) first — it unblocks the most portfolio value
(Idea #3 algorithm is already shipped; only the UI is waiting).

### 9.3 PR-SC-06 (Lead Score recalc job)
Idea #3 depends on `Lead.score` being fresh. PR-SC-06 (the recalc job) is
not yet shipped. Options for the MVP:
- (a) Block Idea #3 MVP on PR-SC-06.
- (b) Ship Idea #3 MVP with a manual "recalculate" button (per-lead or
  per-seller) and ship PR-SC-06 as a follow-up.

**Recommendation:** Option (b) — the manual recalc unblocks the UI without
waiting for the background job, and the recalc job is a pure additive
follow-up.

### 9.4 AI Gateway migration of `ai-listing-builder.ts`
Idea #6 (AI Listing Studio) depends on migrating `ai-listing-builder.ts`
from direct `ZAI.create()` to `aiGateway.execute()`. The existing function
is called by admin flows (`/api/admin/ai/listing-analyze`, etc.); the
migration must preserve behavior. This is a refactor, not a rewrite — but
it needs regression coverage.

**Recommendation:** Migrate `ai-listing-builder.ts` as a standalone PR
before the AI Listing Studio UI ships. Add contract tests asserting the
Gateway-routed output matches the direct-ZAI output on a fixed set of
inputs.

### 9.5 `/api/listing-completeness` ownership check
The existing route (`src/app/api/listing-completeness/route.ts`) loads any
listing by `id` with no ownership check. Before the seller-facing Smart
Inventory UI (Idea #4) ships, the route must (a) authenticate the seller
and (b) verify `Listing.sellerId === ctx.userId` (or admin). This is a
one-line guard, not a tenant-scope-framework migration.

**Recommendation:** Ship the ownership guard in the same PR as the Smart
Inventory UI.

### 9.6 Translation glossary for AI Listing Studio
Idea #6's translation card needs a glossary seeded from
`AttributeDefinition.labelFa`/`labelEn` + `BrandAlias` for technical-
machinery-term quality. Without it, the LLM may translate "بیل مکانیکی" as
"mechanical shovel" instead of "excavator". The glossary is a one-time data
seed (no schema change).

**Recommendation:** Build the glossary as a seed script before the
Translation card ships.

### 9.7 Persian-first LLM model selection
All AI surfaces are Persian-first. The LLM model selection (which model
handles Persian well at the `$0.02–0.04` cost ceiling) is an implementation
decision. Confirm the AI Gateway's default model meets the Persian quality
bar before Wave 1 ships; otherwise, escalate the cost ceiling for Persian-
heavy tasks (`SELLER_ASSISTANT`, `LISTING_BUILDER`, `LISTING_TRANSLATE`).

### 9.8 Baseline discrepancy
The task brief states `main = f597562`. The repository at authoring time
confirms `origin/main = f597562` (Merge PR #10). The local working-tree
HEAD is `4a2f579` on branch `security/pr-sc-00-tenant-scoping` (PR-SC-00
unmerged, based off `4566efd` pre-PR-#10). This document was authored
read-only against the working tree; **no commits, no PRs, no merges** were
performed. The PR-SC-00 branch is behind `main` by PR #9 + PR #10 — but the
schema files on the branch match `main` for the models this portfolio
verifies against (Lead CRM fields from PR #9 are present; Innovation Program
from PR #10 is present). The discrepancy is flagged for the owner; it does
not affect the portfolio's content.

---

## 10. Summary

This document develops **6 priority ideas** into full product portfolios,
each with the 11 mandatory fields (real problem, UX, schema-verified
required data, AI method, safety control, revenue model, MVP vs Future,
business value, approximate cost, risk, technical dependency, success
metric with baseline).

**Key delta from the PR #10 Innovation Program:**
- **PR #9 (Lead CRM Foundation) shipped** — `Lead.status`/`score`/override
  fields + `src/lib/crm/lead-score.ts` deterministic v1 algorithm are in
  place. Idea #3 (Lead Intelligence) needs UI + recalc job + tenant-scope,
  not a new algorithm.
- **PR-SC-00 (tenant-scoping) is unmerged** and ships `ownership` for
  `listings` only. Ideas #1 (HEAVIX Copilot Q&A) and #3 (Lead Intelligence
  UI) are blocked on follow-up PRs adding `ownership` for `leads`,
  `listingOffers`, `listingRejections`. Store-domain alerts (Ideas #1, #4
  Future) are blocked on a separate store-domain tenant-scope design PR.
- **`/api/listing-completeness` exists** — Idea #4 (Smart Inventory) extends
  it, doesn't rebuild it. Needs a one-line ownership guard before the
  seller-facing UI ships.
- **`ai-listing-builder.ts` exists but bypasses the AI Gateway** — Idea #6
  (AI Listing Studio) requires a Gateway migration refactor before ship.

**Top 3 by value (shippable now, no hard blocker):**
1. **#4 Smart Inventory** — H value, L cost, L risk; cheapest high-impact
   move; extends existing route.
2. **#2 Machine Intelligence Profile** — H value, L cost, L risk; converts
   provenance data into visible buyer-side trust.
3. **#5 Buyer Match** — H value, L cost, L risk; deterministic MVP at near-
   zero AI cost.

**Top 3 by value (unblocked on PR-SC-00 follow-up for `leads`):**
1. **#3 Lead Intelligence** — H value, L cost, L risk; algorithm + schema
   already shipped.
2. **#1 HEAVIX Copilot** — H value, M cost, M risk; the single highest-
   friction seller pain.
3. **#6 AI Listing Studio** — H value, M cost, M risk; requires AI Gateway
   migration first.

**Gated ideas (not in §5, see §8):** G1–G7 (machinery investment,
financing/leasing, leasing eligibility pre-check, official appraisal,
third-party doc verification, auto-publish TTL, manufacturer API
integration). All remain design-only. **No de-gating proposed.**

**No code, schema, migration, or PR changes were made.** This file is
documentation.
