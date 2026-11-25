# Subscription Billing & Entitlement Decision Register — 2026-11-19

**Status: DECISION REQUIRED.** This is a specification and decision register only. It does not select product/financial rules by implication and does not authorize migrations, seeds, database writes, payment activation, merge, or deployment.

Repository: `HEAVIXIR/z-ai-2`  
Branch: `feat/subscription-tier-listing-quotas-2026-11-19`  
Release blocker: [Issue #271](https://github.com/HEAVIXIR/z-ai-2/issues/271)  
Related audit: `docs/operations/SUBSCRIPTION-ENTITLEMENT-GAP-AUDIT-2026-11-19.md`

## 1. Verified source facts

At the audited HEAD:

- `SubscriptionPlan.priceMonthly` and `priceYearly` are BigInt; schema comments describe plan prices as Tomans, while `currency` defaults to `IRR`.
- `Payment.amount` and `Payment.currency` are independently persisted; Payment currency defaults to `IRR`.
- `PremiumSubscription` stores plan/status/start/expiry, copied feature flags and featured credits, amount, and payment reference; it has no durable purchased-term or plan-version snapshot.
- Admin subscription upsert accepts amount, expiry, feature flags, and featured-credit count, and writes audit evidence transactionally. This is an administrative mutation path, not proof of paid checkout.
- Manual admin creation rejects `type=SUBSCRIPTION`; direct verify rejects PAID transitions for subscription payments; the generic admin action engine has a matching fail-closed guard.
- Public payment creation is fail-closed and creates no payment.
- Existing source does not establish an approved credit allocation cadence, rollover rule, credit ledger, renewal policy, or ranking weight.

These facts do not constitute a production-ready subscription checkout.

## 2. D1 — Canonical monetary unit and currency

Choose one representation for plan prices, payment ledger amounts, UI labels, gateway requests, and audit records.

| Option | Meaning | Required controls |
|---|---|---|
| IRR canonical | Persist/display Rial | Convert toman-entered admin values at one validated boundary; label all amounts Rial |
| Toman canonical | Persist/display Toman | Convert only at gateway adapter boundary; preserve provider-submitted unit/value for reconciliation where required |

Decision record:
- Canonical unit: **PENDING**
- Admin input unit and label: **PENDING**
- Public display unit and label: **PENDING**
- Gateway conversion contract: **PENDING**
- Historical Payment-row interpretation/reconciliation: **PENDING**

No automatic 10× conversion is permitted until historical-row semantics and the canonical choice are approved. Reject ambiguous or mixed-unit writes.

## 3. D2 — Immutable purchase snapshot

Every paid purchase must preserve what was bought independently of later plan edits.

Required snapshot contract to approve:
- plan identifier and stable plan code;
- plan display name at purchase time;
- plan version or immutable entitlement snapshot;
- selected term (`MONTHLY` or `YEARLY`);
- canonical amount and currency/unit;
- purchase timestamp;
- service start and expiry convention;
- discount/override amount, reason, authorizer, and audit evidence when applicable.

Decision record:
- Snapshot storage (Payment columns vs dedicated purchase record): **PENDING**
- Plan versioning strategy: **PENDING**
- Effect of future plan edits on existing subscriptions: **PENDING**

A mutable plan row must never be the only evidence of price or benefits purchased.

## 4. D3 — Activation and term boundaries

Choose the event that starts the term: verified provider settlement, authorized offline/manual settlement with separate evidence, or another explicitly documented event.

Define monthly/yearly expiry arithmetic, timezone, month-end behavior (including dates 29–31), leap-year behavior, and whether activation may be scheduled for a future date.

Decision record:
- Activation event: **PENDING**
- Monthly calculation: **PENDING**
- Yearly calculation: **PENDING**
- Timezone and boundary convention: **PENDING**
- Future activation support: **PENDING**

No fixed 30-day assumption or implicit calendar-month assumption may be introduced.

## 5. D4 — Renewal, retries, and concurrency

Issue #271 requires idempotent retries and an explicit renewal rule. Decide whether a valid renewal extends from the later of now/current unexpired `expiresAt`, or from a separate billing anchor.

Also define:
- provider idempotency-key scope and retention;
- duplicate callback behavior;
- concurrent verification behavior;
- failed/abandoned renewal behavior;
- upgrade/downgrade timing and proration;
- cancellation and auto-renewal semantics;
- refund/credit behavior where legally and operationally supported.

Decision record:
- Renewal anchor: **PENDING**
- Upgrade/downgrade and proration: **PENDING**
- Cancellation semantics: **PENDING**
- Retry/idempotency contract: **PENDING**

## 6. D5 — Admin grants versus paid purchases

Keep two distinct paths:
- **Paid purchase:** amount and term are server-derived from an active plan and verified settlement evidence.
- **Admin grant/override:** privileged, reasoned, audited, explicitly non-payment entitlement grant with its own authorization and expiry policy.

Decision record:
- Authorized roles: **PENDING**
- Required reason/evidence: **PENDING**
- Featured-credit treatment: **PENDING**
- Grant duration and revocation: **PENDING**

An admin-entered amount is not proof of customer payment.

## 7. Featured-credit lifecycle

Seed values currently observed are FREE=0, PRO=2, PREMIUM=5. These values do not define allocation or consumption semantics.

Decide:
| Dimension | Options requiring product selection |
|---|---|
| Allocation cadence | Activation; billing-period boundary; calendar month |
| Unused balance | Forfeit; capped rollover; unlimited rollover |
| Mid-period upgrade | Immediate increment; next boundary; prorated |
| Downgrade | Preserve current balance; reduce to plan cap; next boundary |
| Pause/expiry | Freeze; forfeit; retain to a specified date |
| Rejected/unpublished listing | Refund; no refund; conditional refund |
| Unfeature/delete/relist | Restore; permanently consume; policy-specific |
| Admin adjustment | Separate audited grant/reversal event |

Decision record:
- Allocation cadence: **PENDING**
- Rollover/forfeiture: **PENDING**
- Upgrade/downgrade: **PENDING**
- Pause/expiry: **PENDING**
- Reversal/refund: **PENDING**

After approval, implementation must include:
1. Append-only credit event ledger (grant, consume, reverse, expire, admin adjustment).
2. Events record subscription, owner scope, quantity, source/reason, idempotency key, actor, timestamp.
3. Balance mutation and event insertion in one transaction.
4. Conditional atomic decrement or equivalent concurrency-safe consumption.
5. Duplicate requests cannot consume twice.
6. Real PostgreSQL concurrency tests prove no negative balance, lost update, or duplicate consumption.
7. Reconciliation can reconstruct balance from events.

## 8. Search-ranking policy

Current source uses a featured boolean and creation time in a search ordering path; it does not implement a verified PRO/PREMIUM tier score.

Decide whether tier affects ranking; global vs category/region scope; exact weights and tie-breaks; decay/rotation and exposure fairness; relevance/quality interaction; abuse controls; relation between featured credits and tier boost; and precedence of explicit user sorts.

Decision record:
- Tier boost enabled: **PENDING**
- Ranking dimensions/weights: **PENDING**
- Fairness/decay: **PENDING**
- Explicit-sort precedence: **PENDING**

No arbitrary score may be introduced. Deterministic tests must preserve explicit sort semantics.

## 9. Company-page entitlement

The existing public company route renders profiles and published listings without checking `companyPage`. Do not block existing public profiles because an individual user lacks a subscription until product meaning and ownership are approved.

Choose the intended meaning:
- A. entitlement to any public company profile;
- B. premium enhanced/customized company microsite;
- C. distinct company landing page/route.

Also decide company-level vs user-level ownership, multi-member behavior, ownership transfer, downgrade/expiry behavior, SEO, and URL continuity.

Decision record:
- Meaning (A/B/C): **PENDING**
- Entitlement owner: **PENDING**
- Multi-member resolution: **PENDING**
- Downgrade/expiry behavior: **PENDING**

## 10. Public pricing page

A public pricing page may read active `SubscriptionPlan` records only after D1 is resolved. It must use unambiguous unit labels, safe BigInt serialization, monthly/yearly terms, no duplicated hard-coded prices, and feature data consistent with entitlement enforcement. It must not imply checkout is available while Issue #271 remains open.

Decision record:
- Currency/unit and labels: **PENDING**
- Monthly/yearly copy and savings claims: **PENDING**
- Checkout availability statement: **PENDING**

## 11. Implementation order and release gates

1. Record approved answers for D1–D5 and feature-specific decisions above.
2. Define immutable purchase snapshot and any required credit ledger schema.
3. Derive amount server-side from active plan + selected term; reject mismatches.
4. Implement provider verification and activation/renewal atomically with audit and idempotency.
5. Add unit, contract, API, and real-PostgreSQL tests for conversion, inactive plans, mismatch, term boundaries, retries, concurrent callbacks, expiry, and audit rollback.
6. Implement credit ledger/consumption only after lifecycle decisions are approved.
7. Implement ranking and company-page entitlements only after their policies are approved.
8. Publish pricing only after canonical unit and labels are approved.
9. Require exact-HEAD CI, review, preview evidence, and explicit release approval.

## 12. Current safety state

- Issue #271 remains open.
- Subscription payment creation/verification remains fail-closed.
- No production database write, migration, seed, payment settlement, entitlement activation, merge, or deployment is performed or claimed.
- The preceding audit commit passed CI run [44597481095](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44597481095) on exact HEAD `6cf145ab3178d0a81c2adaf1e9d250be8f122d45`.
- This register records unresolved decisions; it does not resolve them by implication.
