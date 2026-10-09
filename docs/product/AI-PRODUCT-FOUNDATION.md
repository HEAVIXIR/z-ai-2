# HEAVIX — AI Product Foundation

- **Status:** Accepted — STEP 11.29 Phase C
- **Date:** 2026-10-09
- **Baseline:** main `4566efd`; PR-SC-01 (Lead CRM Foundation) open as PR #9
- **Author:** STEP 11.29 orchestrator
- **Informs:** Stage 6 of the Store Center Roadmap (AI Business Layer)
- **Hard rule:** AI is **advisory-only** (ADR-005 §8). No autonomous mutations. Every action flows through the normal authenticated, authorized, audited API path.

## 1. Purpose

This document defines the AI Product Foundation for HEAVIX. It records, for each AI capability: the use case, permitted input data, **forbidden** data, structured output, quality evaluation, execution cost, and human-in-the-loop control. It exists so that Stage 6 of the roadmap builds AI that is **measurable, safe, and revenue-justified** — not a generic chatbot bolted onto the product (per Master Order Phase C #2: "do not build a generic chatbot as a substitute for product flows").

It synthesizes the AI-relevant findings from the STEP 11.29 reviews:
- `/research` — 18 capabilities (7 MVP-ready, 7 need-data, 4 need-partner/legal)
- `/brainstorm` — 17 ideas (8 base A–H + 9 new I–Q); 7 GATED
- `/analyst` — Lead Score v1 (deterministic, no AI in v1); AIGatewayLog lacks accept/reject tracking
- `/detailed` — R11: existing `/api/ai-sales-agent` + `/api/ai-seller-assistant` bypass the AI Gateway (ADR-005 §8 violation)
- `/expert` — AI-1..AI-4 gates: input whitelist, zod output schema, no-function-calling test, AIGatewayLog extension

## 2. AI Governance Principles (non-negotiable)

| # | Principle | Enforcement |
|---|---|---|
| G1 | **Advisory-only.** AI returns text/structured suggestions. It never writes to the DB, never changes permissions, never executes a "tool" or "function call". | Static-analysis gate (PR-SC-09): no `tools` param in any AI Gateway call; test asserts no mutation on the request path. |
| G2 | **Permitted data only.** Input to the model is a whitelist of fields the caller's company owns. PII, other-seller data, and internal IDs are stripped before the call. | Input-filtering contract per capability (§4). Test: forbidden-data leakage test (PR-SC-09). |
| G3 | **Model output is untrusted input.** Every output is validated against a zod schema before rendering. Never directly interpolated into SQL, HTML, or a DB write. | zod schema per capability (§4). Test: malformed-output rejection test. |
| G4 | **Mutations flow through the normal path.** If a user accepts an AI suggestion, the resulting action is a normal authenticated, authorized, audited API call — identical to if the user clicked the button manually. | No "AI executes" code path exists. Code review gate. |
| G5 | **Cost + latency + quality + errors + usage are monitored.** Every call logs to `AIGatewayLog` (or the proposed `AISuggestion` model). Cost caps per task type. | AIGatewayLog fields: promptTokens, completionTokens, latencyMs, costUsd, error. Per-task budget in `AITaskPolicy`. |
| G6 | **Uncertainty is stated.** When evidence is insufficient, the model response must say so and refer the user to a human/expert — never fabricate. | System-prompt clause + output schema `confidence` field with an `INSUFFICIENT` band. |
| G7 | **No safety-authority claims.** HEAVIX/MEKANIX characters and AI outputs never claim to replace licensed inspectors, credit officers, or safety authorities. | Visible disclaimer on every AI surface; system-prompt clause. |

## 3. AI Capability Matrix (MVP scope — Stage 6)

Each capability below is **advisory-only** and connected to a measurable product flow (not a standalone chat). Capabilities marked GATED are not built until legal/partner clearance (Stage 7).

| ID | Capability | Stage | MVP? | Depends on |
|---|---|---|---|---|
| AI-1 | HEAVIX Copilot (daily seller briefing) | 6 | MVP | PR-SC-05 dashboard data |
| AI-2 | Listing draft generation (multilingual) | 6 | MVP | ListingAttributeValue substrate (exists) |
| AI-3 | Lead Intelligence explanation | 6 | MVP | PR-SC-01 Lead Score (deterministic, AI only explains) |
| AI-4 | Business Assistant (reports suggestions) | 6 | MVP | PR-SC-05 + PR-SC-06 data |
| AI-5 | Smart Search (semantic) | 6 | **Needs data** | Embedding index over Listings (not yet built) |
| AI-6 | Machine Match (recommendation) | 6 | **Needs data** | Buyer-intent signals + Listing attributes |
| AI-7 | Dealer Growth Studio (image/text/SEO hints) | 6 | MVP | Listing media + text fields |
| AI-8 | Missing-document detection | 6 | **Needs data** | Document manifest (not yet modeled) |
| AI-9 | Duplicate/irrelevant image detection | 6 | MVP | Listing images (VLM) |
| AI-10 | Price suggestion advisory | 6 | **Needs data** | `PriceEstimate` exists but `comparableCount` too low (per /research) |
| G1 | Machinery investment framework | 7 | GATED | Legal clearance |
| G2 | Financing/leasing partnerships | 7 | GATED | Legal + partner contract |
| G4 | Official appraisal service | 7 | GATED | Licensed appraiser partner |
| G5 | Forgery detection | 7 | GATED | Forensic partner |

## 4. Per-capability contracts (MVP set)

For each MVP AI capability, the contract below is the merge gate for its PR.

### AI-1 — HEAVIX Copilot (daily seller briefing)

| Field | Value |
|---|---|
| **Use case** | Seller opens dashboard; sees a 3-bullet daily briefing: top lead to follow up, listing losing views, stock alert. |
| **Input (permitted)** | Seller's own: leads (top 3 by Lead Score v1), listings (viewCount 7d delta), store-DB inventory (low-stock). Aggregated counts only — no raw PII. |
| **Input (forbidden)** | Other sellers' data; buyer PII (viewerPhone, viewerName); internal user IDs; audit logs. |
| **Output (structured)** | `{ briefing: [{ kind: "lead"\|"listing"\|"stock", title, detail, ctaUrl, priority }], confidence: "HIGH"\|"MEDIUM"\|"INSUFFICIENT" }` |
| **Quality eval** | Deterministic candidate selection (top-3 by score) → LLM only formats the text. Eval: text must reference the real selected items (automated check). Human spot-check weekly. |
| **Cost** | 1 LLM call/seller/day. Budget cap in AITaskPolicy. Fallback: if cost exceeded, show raw deterministic list without LLM formatting. |
| **Human control** | Each bullet has a CTA link to the real page. User acts manually. "Dismiss" stored in AdminPreference. |
| **Uncertainty** | If <3 candidates exist, `confidence=INSUFFICIENT`, briefing says "Not enough activity yet — add listings or inventory to get daily insights." |

### AI-2 — Listing draft generation (multilingual)

| Field | Value |
|---|---|
| **Use case** | Seller starts a listing; clicks "Draft description". AI generates a Persian + English draft from the verified attribute values. |
| **Input (permitted)** | The listing's own `ListingAttributeValue` rows (sourceType MANUFACTURER or SELLER only — never AI_INFERENCE), brand, model, year, hours, price. |
| **Input (forbidden)** | Other listings' text (plagiarism); buyer data; unverified AI-inferred attributes (no circular AI-on-AI). |
| **Output (structured)** | `{ draftFa: string, draftEn: string, bullets: string[], confidence, disclaimer }`. `disclaimer` always present: "Draft generated from verified data — review before publishing." |
| **Quality eval** | Draft must not assert specs not present in input (automated: extract entities from draft, diff against input attributes). BLEU/ROUGE not applicable (no gold reference); use factual-consistency check instead. |
| **Cost** | 1 LLM call per draft request. Rate-limited per seller (e.g. 10/hour). |
| **Human control** | Draft loads into the listing form as editable text. Seller MUST review + save. No auto-publish. |
| **Uncertainty** | If <5 attribute values present, `confidence=INSUFFICIENT`, draft is minimal + suggests "add more specs for a richer description." |

### AI-3 — Lead Intelligence explanation

| Field | Value |
|---|---|
| **Use case** | Seller sees a lead labeled "HOT 87/100". Hovers → sees the deterministic breakdown + a one-sentence AI explanation. |
| **Input (permitted)** | The `LeadScoreResult.breakdown` (factor, points, detail) — already computed by the deterministic `computeLeadScore`. |
| **Input (forbidden)** | Buyer PII; other sellers' leads; raw lead note text (only its length is used by the score, never sent to LLM). |
| **Output (structured)** | `{ explanation: string (≤200 chars), confidence }`. Explanation references the top 2 factors. |
| **Quality eval** | Explanation must name the top factor (automated check). Deterministic score is the source of truth — AI must not contradict it. |
| **Cost** | 1 LLM call per explanation request (lazy, on hover). Cache 24h. |
| **Human control** | Seller can override the score (PATCH with reason, audited). The explanation is non-mutating. |
| **Uncertainty** | If score <20, explanation says "Low signal — consider manual review." |

### AI-4 — Business Assistant (reports suggestions)

| Field | Value |
|---|---|
| **Use case** | Seller opens `/seller/reports`; sees 3+ advisory suggestions (e.g. "3 listings have incomplete specs", "Part B out of stock", "Buyer C showed interest in 3 machines"). |
| **Input (permitted)** | Aggregated counts from seller's own data: incomplete-spec listing count, low-stock part count, repeat-viewer count. |
| **Input (forbidden)** | Individual buyer identities in the suggestion text (use "a returning buyer" not "Ahmad R."); other sellers' data. |
| **Output (structured)** | `{ suggestions: [{ kind, severity: "info"\|"warn"\|"opportunity", title, detail, ctaUrl, dismissable }], confidence }` |
| **Quality eval** | Each suggestion must map to a real query result (automated: re-run the underlying count, assert match). Human spot-check. |
| **Cost** | 1 LLM call per report open. Cache 1h. |
| **Human control** | Each suggestion has a CTA link. "Dismiss" stored per-user. No auto-action. |
| **Uncertainty** | If <7 days of activity, `confidence=INSUFFICIENT`, says "Reports generate after 7 days of activity." |

### AI-7 — Dealer Growth Studio (hints)

| Field | Value |
|---|---|
| **Use case** | Seller views a listing; clicks "Growth hints". AI returns image-quality hints + text-improvement hints + 1 SEO tip. |
| **Input (permitted)** | Listing's image count + dimensions (metadata only, not pixels sent to LLM for text); listing text length; brand/category for SEO context. |
| **Input (forbidden)** | Other sellers' listings; buyer data. |
| **Output (structured)** | `{ hints: [{ area: "image"\|"text"\|"seo", title, detail, ctaUrl }], confidence }` |
| **Quality eval** | Hints must be actionable (no "improve your listing" — must say "add 3+ photos showing the engine compartment"). Automated: each hint must contain a verb. |
| **Cost** | 1 LLM call per request. Rate-limited. |
| **Human control** | Hints are advisory. Seller edits manually. |
| **Uncertainty** | If listing has 0 images + no text, `confidence=INSUFFICIENT`. |

### AI-9 — Duplicate/irrelevant image detection

| Field | Value |
|---|---|
| **Use case** | Seller uploads 5 images; system flags 2 as "possibly duplicate" or "not a machine photo" (VLM). |
| **Input (permitted)** | The listing's own uploaded images (base64 or URL). |
| **Input (forbidden)** | Other listings' images (unless exact-hash dedup against seller's own catalog, which is deterministic, not VLM). |
| **Output (structured)** | `{ flags: [{ imageId, kind: "duplicate"\|"irrelevant", confidence: 0..1, reason }], confidence }` |
| **Quality eval** | Precision@0.9 threshold for "duplicate" (false positive worse than false negative — seller annoyance). Eval set: 100 labeled images. |
| **Cost** | 1 VLM call per image. Batched. Budget cap. |
| **Human control** | Flags are advisory — seller can dismiss. Image is not deleted by AI. |
| **Uncertainty** | If VLM confidence <0.6, do not flag (avoid false positives). |

## 5. Data dependency register (what blocks each AI capability)

| Capability | Blocker | Resolving PR |
|---|---|---|
| AI-1 Copilot | Dashboard KPI data not aggregated yet | PR-SC-05 |
| AI-2 Listing draft | None — substrate exists | PR-SC-09 |
| AI-3 Lead explanation | Lead Score v1 (deterministic) — shipped in PR-SC-01 ✓ | PR-SC-09 |
| AI-4 Business Assistant | Reports aggregation + Lead CRM API | PR-SC-05 + PR-SC-06 |
| AI-5 Smart Search | No embedding index over Listings | New PR (Stage 6) |
| AI-6 Machine Match | No buyer-intent signal model | New PR (Stage 6) |
| AI-7 Growth Studio | None | PR-SC-09 |
| AI-8 Missing-doc detection | No document manifest model | New PR (Stage 6) |
| AI-9 Image dedup | None — VLM available | PR-SC-09 |
| AI-10 Price suggestion | `PriceEstimate.comparableCount` too low | Grow PriceObservation volume first |

## 6. AIGatewayLog extension (proposed — PR-SC-09)

`/analyst` found `AIGatewayLog` lacks accept/reject tracking. KPI-8 (AI suggestion acceptance rate) is blocked without it.

**Proposal (Option B from /expert):** new `AISuggestion` model (preferred over extending AIGatewayLog, to keep the gateway log immutable):

```prisma
model AISuggestion {
  id           String   @id @default(cuid())
  gatewayLogId String   // FK → AIGatewayLog (the call that produced it)
  userId       String   // who received it
  taskType     String   // SELLER_ASSISTANT | LISTING_DRAFT | ...
  suggestion   Json     // the structured suggestion payload
  status       String   @default("PENDING") // PENDING | ACCEPTED | DISMISSED | ACTED_MANUALLY
  actedAt      DateTime?
  createdAt    DateTime @default(now())
  @@index([userId, taskType, status])
  @@index([gatewayLogId])
}
```

This enables KPI-8 (acceptance rate) without mutating the gateway log. Acceptance is recorded when the user clicks a CTA (the normal API path) — no AI mutation.

## 7. Cost governance

- Per-task budget in `AITaskPolicy` (e.g. SELLER_ASSISTANT: 0.02 USD/call, 50/seller/day).
- Hard cap: if daily budget exceeded, AI features degrade gracefully to deterministic fallbacks (raw data without LLM formatting). Never error to the user.
- Monthly cost report per task type (from AIGatewayLog aggregation).
- No AI call without a logged `taskType` + `userId`.

## 8. What this foundation explicitly is NOT

- **Not a generic chatbot.** There is no "ask HEAVIX anything" box. Every AI surface is a specific product flow (briefing, draft, explanation, suggestion, hint, flag) with a structured output and a CTA.
- **Not an autonomous agent.** AI never executes actions. G4 is absolute.
- **Not a certification authority.** AI-9 flags images; it does not certify them. AI-3 explains a score; it does not set it. AI never claims inspection or appraisal authority (G7).
- **Not a financing engine.** G1/G2/G4/G5 stay GATED (Stage 7).

## Rollback

This is documentation-only. No code/schema change. Rollback = remove this file.
