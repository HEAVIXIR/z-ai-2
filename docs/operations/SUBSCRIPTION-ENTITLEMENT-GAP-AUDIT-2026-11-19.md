# Subscription Entitlement Gap Audit — 2026-11-19

## Scope and baseline

- Repository: `HEAVIXIR/z-ai-2`
- Audited branch: `feat/subscription-tier-listing-quotas-2026-11-19`
- Audited HEAD: `18e68f7fa136f750b70977b4265367382283caca`
- Related work: PR #350 → #351 → #352 (all Draft/open at audit time)
- This is a source audit and decision register. It does not authorize a schema migration, seed, production/Preview database mutation, merge, or deployment.

## Verified implementation facts

### Subscription plan and subscription records

`SubscriptionPlan` currently stores:
- `priceMonthly` and `priceYearly` as BigInt, with schema comments saying Tomans.
- `currency` defaults to `IRR`.
- `featuredCredits`, `analyticsAccess`, `aiAssistantAccess`, `priorityLeads`, and `companyPage` plan fields.
- Listing/image limits and display metadata.

`PremiumSubscription` currently stores:
- `plan`, `status`, `startedAt`, `expiresAt`.
- `featuredCredits` and feature booleans copied onto the subscription.
- `amount` and `paymentRef`.
- It does not store a billing-period/term snapshot, a plan-version snapshot, a featured-credit allocation period, or a credit ledger.

The existing seed defines BASIC=0, PRO=2, PREMIUM=5 featured credits. A seed declaration is not proof that a deployed database has been seeded.

### Billing safety dependency

Issue #271 remains open and explicitly blocks subscription payment activation until:
1. Canonical monetary unit (IRR vs toman) is decided and made consistent.
2. Purchased plan and monthly/yearly term are durably snapshotted.
3. Amount is derived server-side from an active plan.
4. Payment verification, entitlement application, expiry and audit are atomic.
5. Retry and renewal semantics are idempotent and tested.

Issue #271 comments confirm a fail-closed mitigation was added in PR #274 for subscription payment creation/verification. This is a safety gate, not completed checkout. Do not bypass it to activate paid subscriptions.

### Featured credits

Verified source facts:
- Plan-level credit quantities exist in schema and seed source.
- Subscription-level `featuredCredits` exists.
- Listing PATCH permits the admin to set `featured`.
- Search ordering uses `featured DESC` as one sort mode/default behavior.
- No seller-facing atomic credit-consumption path, monthly allocation/reset workflow, credit ledger, or featured-expiry lifecycle was found in the audited paths.

Required design before implementation:
- Define whether credits are allocated at subscription activation, at each billing-period boundary, or on a calendar-month boundary.
- Define rollover/forfeiture and downgrade/upgrade proration.
- Define the featured duration and what happens on listing pause, rejection, expiry, deletion, or relisting.
- Define idempotency and audit/ledger semantics for consume, refund/reversal and admin grant.
- Implement consumption with a conditional atomic decrement and a durable event/ledger record in the same transaction; add real PostgreSQL race tests.

No arbitrary 30-day duration or rollover rule is adopted by this audit.

### Search ranking

Verified source fact:
- The current listing search order uses the `featured` boolean and creation time; it does not join the subscription tier or compute a PRO/PREMIUM score.
- Explicit sort modes such as newest/price/oldest should not be silently overridden by a subscription boost.

Required design before implementation:
- Define whether tier boost applies to all eligible listings or only a bounded subset.
- Define weights, tie-breaking, decay/fairness, abuse controls and interactions with featured placement.
- Define whether boost is global or category/region scoped.
- Add deterministic unit tests and PostgreSQL integration tests proving filters/pagination remain correct.

No numeric ranking weights are adopted by this audit.

### Company page entitlement

Verified source facts:
- `PremiumSubscription.companyPage` exists and is editable in the admin plan/subscription surfaces.
- The public route `src/app/companies/[slug]/page.tsx` currently renders active company profiles and their published supply listings without reading `companyPage`.
- The `companyPage` flag was not found in that public page's source.
- Company membership/partner APIs are a separate domain from public company profile rendering; gating partner-management APIs would not implement a public-page entitlement.

Product decision required:
- Clarify whether `companyPage` means (A) permission to have any public company profile, (B) a premium enhanced/customized company microsite, or (C) a separate company landing page/route.
- Preserve basic company identity, legal/trust information and existing public listing ownership semantics regardless of paid entitlement unless an explicit product/legal decision says otherwise.
- Define company ownership when several users share a company and how entitlement is resolved (company-level vs user-level subscription).

Do not block the existing public company route merely because an individual user lacks a subscription until this meaning is approved.

### Public pricing

A public subscription pricing page was not found in the audited route tree. The admin pricing engine is a separate machine-price estimation domain and must not be repurposed.

A public plan comparison page can be implemented only after the canonical currency/unit decision in #271 is resolved; otherwise it risks displaying a 10x unit error. Plan data should be read from active `SubscriptionPlan` records, with safe BigInt serialization and no duplicated hard-coded prices.

## Ordered implementation gates

1. Resolve issue #271 monetary unit and billing-period/renewal contract; keep payment activation fail-closed until complete.
2. Approve featured-credit allocation, rollover, expiry and reversal rules.
3. Implement atomic credit consumption + ledger + real PostgreSQL concurrency tests.
4. Approve ranking policy and implement deterministic ranking without overriding explicit user sort.
5. Decide the precise meaning and scope of `companyPage`; implement company-level authorization accordingly.
6. Publish pricing page only after amount units and labels are canonical.
7. Run exact-SHA CI, behavioral integration tests, and the separate approved Preview gates.

## Release and safety status

- No migration or seed was run.
- No database was mutated by this audit.
- No Merge or Deploy was performed.
- PR #350/#351/#352 remain Draft until their respective acceptance and review gates pass.
