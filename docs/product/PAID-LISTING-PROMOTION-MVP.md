# Paid Listing Promotion — HEAVIX MVP Product & Engineering Specification

**Status:** Draft proposal; no production behavior or schema has been changed.
**Owner decision:** Pricing and launch window remain configurable and require owner approval before production activation.
**Scope:** One-time paid promotion of an already-published seller-owned listing, independent of a subscription.
**Related systems:** `Listing`, `Payment`, `SubscriptionPlan`, `PremiumSubscription`, user dashboard, public listing/search surfaces.

---

## 1. Product decision

HEAVIX should let a standard user buy visibility for one of their own published listings without purchasing a monthly or annual subscription.

The product name in Persian UI is **«ارتقای آگهی»**. The primary CTA is **«ویژه‌کردن این آگهی»**. It must be clear that the purchase applies only to the selected listing and the selected duration. It does not grant a subscription, verified status, seller verification, or any other account-level entitlement.

The feature is an additional monetization channel, not a replacement for subscription benefits.

### 1.1 Why this model

- A free seller can convert after receiving value from a published listing.
- The purchase is low-commitment and tied to a specific outcome.
- Existing subscribers can still use plan-included featured credits; paid one-off promotion is an alternative for users without sufficient credits.
- The marketplace can measure incremental revenue and visibility lift at listing level.

## 2. Proposed packages and launch pricing

Use the **currently active PRO monthly plan price** as a reference, not as a hard-coded amount. At the time of this repository review, the seed configuration lists PRO at 2,900,000 Tomans/month; this is an illustrative reference only and may not equal the live database price.

| Package | Duration | Initial price rule | Example if PRO monthly = 2,900,000 Tomans |
|---|---:|---:|---:|
| دیده‌شدن بیشتر | 7 days | 1/3 of PRO monthly | ~966,667 Tomans |
| ویژه | 14 days | 1/2 of PRO monthly | 1,450,000 Tomans |
| ویژه طولانی | 30 days | 4/5 of PRO monthly | 2,320,000 Tomans |

These are pilot hypotheses, not claims about competitor prices. Before activation, validate willingness to pay with a small seller cohort and compare conversion, refund, and visibility data.

### 2.1 Pricing controls

- Store and display integer amounts in the platform's canonical monetary unit. The current main Payment model labels currency as IRR while subscription seed values and UI descriptions use Tomans. This unit mismatch must be resolved before connecting a real payment gateway.
- Promotion package prices must be snapshotted onto each purchase. Later admin price changes must not change an existing pending or paid order.
- Admins must be able to activate/deactivate packages and change amount/duration without code deployment. The implementation should use a dedicated package configuration model or a rigorously validated existing settings mechanism; do not overload `SubscriptionPlan`.
- Do not use client-submitted amount, currency, duration, priority, or payment status as authoritative input.
- Do not launch with a fake/mock gateway in production. If the main marketplace payment integration is not ready, the UI must clearly show that online payment is unavailable rather than mark an order paid.

## 3. Seller journey

1. User submits a listing. It follows the existing moderation/publication process.
2. Once the listing is actually `PUBLISHED`, the owner sees a promotion card in `/dashboard` beside that listing.
3. The card says: «آگهی شما منتشر شده است. برای دیده‌شدن بیشتر، می‌توانید آن را ارتقا دهید.»
4. User opens package selection and sees exact duration, total price, placement benefits, start/end semantics, and refund terms.
5. Server creates a pending promotion intent and pending Payment using server-calculated package values.
6. User completes the real payment gateway flow.
7. The gateway callback is verified server-to-server using the amount and authority stored on the pending Payment record.
8. In one database transaction, the payment transitions exactly once to PAID and the promotion transitions to ACTIVE (or SCHEDULED if product rules require a future start).
9. The dashboard displays status, start time, expiry time, and payment receipt/reference.
10. When expired, the promotion ceases to affect ranking automatically. The listing remains published under its ordinary listing status.

### 3.1 Eligibility

The promotion CTA is offered only if all conditions hold:
- Current user is authenticated and explicitly ACTIVE.
- Listing belongs to the current user (sellerId matches server-side).
- Listing status is PUBLISHED.
- Listing is not sold, expired, deleted, suspended, or under moderation hold.
- Listing has no other active paid promotion that conflicts with the selected package.
- The package is active and currently purchasable.

Do not allow promotion of another seller's listing by changing an ID in the request. Return 404 for non-owned listing IDs where practical to avoid existence disclosure.

## 4. What the buyer sees

- A visible **«ویژه»** / **«ارتقایافته»** badge with an accessible text label.
- Improved placement in relevant category/search results during the active period.
- Inclusion in clearly labeled sponsored/featured slots where appropriate.
- No guarantee of a fixed rank, number of impressions, lead count, or sale.

Paid placements must be clearly distinguished from organic rankings. A paid boost must never override category relevance, search filters, moderation, listing status, seller safety restrictions, or user-selected sorting in a misleading way.

### 4.1 Ranking policy

Use a separate promotion signal rather than changing the meaning of `Listing.featured`.

- `Listing.featured` remains the existing editorial/admin-controlled flag.
- Paid promotion has its own state, start/end timestamps, and priority/placement configuration.
- Apply a bounded boost only after relevance and eligibility filters.
- Rotate sponsored placements fairly when several eligible listings compete.
- Label sponsored placements clearly.
- Do not let a promotion make a listing appear verified or admin-endorsed.
- Expired promotions are ignored even if a background expiry job is delayed; all read paths must compare `endsAt > now`.

## 5. Data model proposal (additive)

Do not reuse `Listing.featured` or `PremiumSubscription.featuredCredits` as the sole record of a paid promotion. Both lose the listing-level purchase history and time window.

Proposed entities:

### 5.1 ListingPromotionPackage

- `id`, `code @unique`, `nameFa`, `descriptionFa?`
- `durationDays`, `priceAmount BigInt`, `currency`
- `placementTier` (e.g. STANDARD_BOOST, FEATURED)
- `priorityWeight` (bounded server-side)
- `active`, `sortOrder`
- `createdAt`, `updatedAt`

### 5.2 ListingPromotion

- `id`
- `listingId` FK, `sellerId` FK
- `packageId` FK and immutable package snapshot fields (code/name/duration/amount/currency/placement)
- `paymentId` unique FK
- `status`: PENDING_PAYMENT | SCHEDULED | ACTIVE | EXPIRED | CANCELLED | REFUNDED
- `startsAt?`, `endsAt?`
- `createdAt`, `updatedAt`
- Indexes on `listingId,status,endsAt`, `sellerId,createdAt`, and `status,endsAt`

The exact relation shape must be validated against the current Prisma client and PostgreSQL migration conventions before implementation. Any main-schema change must be mirrored consistently in the preview schema where required. Do not hand-edit generated Prisma clients.

## 6. Payment and financial safety — launch blocker

The current `POST /api/payments/create` route is a ledger-row creator, not a complete online payment flow. It accepts a client-provided amount/type/currency and explicitly documents that gateway redirect/callback handling is out of scope. It must not be reused as a trusted paid-promotion checkout without redesign.

The current `POST /api/payments/[id]/verify` is an admin manual-verification endpoint. It is not a gateway callback and must not be exposed to sellers.

The separate Store Zarinpal integration uses `storeDb` and Store payment models. HEAVIX marketplace payments use the main `db`; do not cross-write between the two databases or copy the Store payment route without adapting the ownership, schema, and ledger contracts.

Required main-marketplace payment flow:
- Server loads package price and listing eligibility.
- Server creates a PENDING payment with server-generated idempotency key and a pending promotion intent.
- Gateway request uses the server-side amount and a fixed allowlisted callback URL.
- Callback identifies the payment by an opaque provider authority/reference; it does not trust a client-supplied amount or listing ID.
- Verify with the provider using the stored amount and authority.
- Compare provider response amount/currency/authority against the stored intent where supported.
- Use a conditional transition (PENDING -> PAID) and unique provider reference to make callbacks idempotent.
- Activate promotion and mark payment PAID atomically; never activate on browser redirect alone.
- Failed/cancelled payments leave the listing unchanged.
- All payment/promotion transitions are audited.
- Refunds/reversals must revoke or terminate the promotion according to explicit policy.
- No manual admin mark-paid action should silently activate a promotion unless a privileged, reason-required audited manual reconciliation path is deliberately designed.

**Currency unit blocker:** the main Payment model defaults currency to IRR, while plan seed amounts are written as Tomans and the Store Zarinpal helper comments inconsistently describe gateway units. A payment-unit audit and an explicit Rial/Toman conversion contract are mandatory before any real gateway integration.

## 7. Dashboard UX

In `/dashboard`, each eligible published listing should show:
- Current state: not promoted / pending payment / active / expired.
- CTA: «ویژه‌کردن این آگهی».
- A small comparison of package durations and prices.
- For active promotions: remaining time and end date.
- For pending payments: payment retry/resume or cancel, without duplicate charge.
- For expired promotions: «تمدید ارتقا» using a new payment, not silently extending the old record.

Do not show promotion purchase CTAs on DRAFT, PENDING, REJECTED, SOLD, EXPIRED, or unpublished listings.

## 8. Admin and operations

Admin tools must provide:
- Package CRUD and activation controls.
- Promotion search by listing, seller, payment, status, and date.
- Manual cancel/refund workflow with mandatory reason and audit.
- Visibility and revenue reports: purchases, gross revenue, active promotions, renewal rate, impressions, clicks, leads, and conversion.
- A kill switch to disable new purchases without hiding already-paid active promotions.
- A separate emergency switch to suppress promotion ranking if abuse or ranking degradation occurs.

## 9. Abuse, fairness, and policy controls

- One active promotion per listing at a time in MVP.
- No self-promotion by blocked/pending accounts.
- Promotion does not bypass moderation or re-publication requirements.
- Seller cannot change price/duration/priority after checkout creation.
- A payment cannot be attached to multiple promotions.
- A promotion cannot outlive the listing's own validity window unless the listing is renewed first.
- Rate-limit purchase-intent creation and prevent repeated pending intents for the same listing/package.
- Never use the paid badge as a trust/verification badge.
- Preserve a full audit trail for creation, payment, activation, expiry, cancellation, and refund.

## 10. Metrics and pilot

Measure:
- Promotion offer impression -> package selection -> checkout start -> payment success.
- Paid promotion revenue per eligible published listing.
- Promoted vs comparable organic listing impressions, clicks, contact leads, and time-to-first-lead.
- Repeat-purchase rate.
- Refund/chargeback rate and complaint rate.
- Cannibalization: whether promoted inventory harms organic discovery or only displaces other promoted listings.

Pilot with a small cohort and a limited number of sponsored slots. Do not set conversion or revenue targets until the pre-launch baseline is computed from actual HEAVIX traffic.

## 11. Acceptance tests

1. Non-owner cannot create or inspect a promotion for another seller's listing.
2. Unpublished, pending, rejected, sold, expired, or blocked listings cannot be promoted.
3. Client cannot choose amount, currency, duration, package status, payment status, or placement weight.
4. Package price is snapshotted at intent creation; later package edits do not mutate the intent.
5. Duplicate requests return the same pending intent or safely create one unique intent; they never create multiple charges.
6. Invalid/mismatched gateway callback cannot activate a promotion.
7. Duplicate successful callbacks activate exactly once.
8. Failed/cancelled payment never changes listing rank or `Listing.featured`.
9. Paid promotion expiry removes the ranking boost without changing publication status.
10. Paid promotion never sets `verified=true`.
11. Manual admin cancellation/refund requires permission, reason, and audit.
12. All search/listing/homepage ranking surfaces use the same active-promotion predicate and respect cache invalidation.
13. The public badge is accessible and explicitly promotional.
14. No migration or production data change occurs before explicit approval.

## 12. Delivery sequence

1. Resolve currency-unit semantics and select the real main-marketplace gateway.
2. Additive schema + migration + generated-client validation.
3. Domain service and transactional/idempotent payment activation.
4. Server-side API and RBAC/CSRF/rate limits.
5. Dashboard package picker and status tracking.
6. Shared ranking predicate + sponsored labels + cache invalidation.
7. Admin package/promotion management and audit.
8. Integration tests with provider mocks and PostgreSQL concurrency tests.
9. Staged preview validation, then explicit owner approval for production migration/deployment.

**Release gate:** do not launch paid promotion until steps 1–8 pass. A UI-only “featured” toggle is not an acceptable implementation.
