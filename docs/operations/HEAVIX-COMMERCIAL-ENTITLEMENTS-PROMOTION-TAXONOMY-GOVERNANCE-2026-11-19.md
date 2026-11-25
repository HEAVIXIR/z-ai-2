# HEAVIX Commercial Entitlements, Listing Promotion & Admin Taxonomy Governance
**Date:** 2026-11-19  
**Target:** `integration/preview-readiness-workerd-2026-11-15`  
**Status:** Architecture and implementation contract; not a claim of shipped runtime functionality.

## 1. Product decisions

HEAVIX must keep three commercial concepts independent:
1. **Listing moderation/publication** — editorial and trust workflow controlled by policy and authorized moderators.
2. **Listing promotion** — a paid, time-bounded campaign attached to a listing. Payment purchases promotion inventory/placement, never approval or publication.
3. **User subscription and feature entitlements** — access rights for platform capabilities. A trial grant does not silently change the user's paid subscription.

A free listing must remain a complete, useful path: submit without payment, enter the normal moderation queue, and publish only after approval. A paid promotion is optional and must never be a hidden prerequisite for review.

## 2. Listing creation and promotion journey

### 2.1 Free path
- User completes the listing wizard and chooses the free submission path.
- Server validates the listing and records an immutable submission event.
- Listing enters the configured moderation queue (e.g. PENDING/IN_REVIEW).
- Moderator may request changes, reject with reason, approve, or publish according to permissions.
- No payment intent, invoice, or payment provider call is created for a free submission.

### 2.2 Promotion path
- At the final step, present a clear comparison of free submission and optional promotion packages.
- A promotion selection creates a server-priced, expiring quote/order bound to the listing, owner, package version, currency, and placement inventory.
- Redirect to the configured payment provider only after explicit user confirmation.
- Verify payment server-to-server (signed webhook/provider verification); never trust browser redirect parameters as proof of payment.
- Use idempotency keys for order creation and webhook processing. Persist payment state transitions and reconcile delayed/duplicate webhooks.
- After confirmed payment, attach a promotion entitlement with start/end timestamps and campaign state. The listing still follows moderation. If the listing is rejected or never published, apply the configured refund/credit/cancel policy transparently.
- Failed/cancelled payment returns the user to a recoverable state with the listing draft intact. Never duplicate charges on retry.
- A promotion cannot override listing visibility restrictions, safety policy, category eligibility, moderation, or legal requirements.

### 2.3 Promotion inventory types
Admin-configurable placements may include:
- Featured slot on home page
- Featured slot within a category/industry
- Sponsored placement in relevant search results
- Seller storefront highlight
- Time-bounded campaign with frequency caps

Each placement must have explicit eligibility, inventory/capacity, ranking weight, duration, price, currency, country/market scope, start/end rules, and disclosure label. Sponsored ranking must not corrupt organic relevance or hide the fact that placement is paid.

## 3. Promotion measurement and upsell

Seller dashboard must distinguish:
- Organic impressions and clicks
- Sponsored impressions and clicks
- Listing views, qualified leads, contact actions, RFQ/contact submissions (where available)
- CTR and conversion rate with clearly defined denominators and attribution windows
- Campaign spend, remaining budget/time, status, and invoice/payment history

Do not promise guaranteed view uplift unless backed by a validated forecast and disclosed methodology. Prefer factual placement, duration, estimated range (only if supported by historical data), and actual results. Do not fabricate view counts. Exclude bot/internal traffic and define deduplication rules. Record analytics event schema/version and attribution source.

Post-publication upsell should be contextual, optional, and frequency-capped. Explain what the package changes, price, duration, eligibility, and that moderation remains mandatory. Do not use dark patterns or imply payment guarantees approval.

## 4. Feature entitlement and trial engine

### 4.1 Separate entitlement from subscription
A user's effective access is resolved from multiple grants:
- Plan/subscription entitlement
- Time-limited trial grant
- Admin/manual grant
- Campaign grant
- Promotional/partner grant
- Explicit deny/suspension or compliance restriction

Define precedence centrally. Security-sensitive restrictions and account suspension always override promotional grants. A trial must not mutate subscription billing state or payment history.

### 4.2 Grant dimensions
Each grant should support:
- Subject: user, organization/team, or eligible segment
- Feature key and optional scope (category, industry, geography, workflow)
- StartsAt / ExpiresAt and timezone-safe UTC persistence
- Usage limit, quota period, concurrency or rate cap
- Source/campaign, reason, createdBy, approvedBy
- Status: scheduled, active, exhausted, expired, revoked
- Revocation reason and full audit trail
- Stacking policy and conflict resolution
- Optional conversion CTA after expiration

### 4.3 Campaign administration
Owner/admin can create a campaign with:
- Audience criteria and exclusions
- Feature(s) granted
- Duration and quota
- Start/end dates, total cap, per-user cap
- Manual assignment or controlled cohort rollout
- Eligibility preview and estimated audience count (read-only query)
- A/B or holdout cohort where measurable
- Budget/cost guardrails for AI or metered features
- Pause, resume, revoke, and rollback controls
- Conversion and retention reporting

Example: grant the comparison tool to eligible newly registered non-admin users for seven days, with a defined comparison quota. On expiry, preserve user data and saved comparisons but deny new premium actions unless another grant applies. Notify the user before expiry and explain the available plan.

### 4.4 Abuse and safety
- Do not allow a normal admin to grant owner/admin-only permissions or bypass RBAC.
- Enforce entitlements server-side at API/action boundaries; UI hiding is not authorization.
- Protect against self-granting, repeated trial farming, multiple accounts, and campaign stacking.
- Require elevated permission and optional second approval for high-value grants or broad campaigns.
- Audit every create/edit/revoke action and provide a dry-run preview.
- Do not delete user-created content when a trial expires.

## 5. Admin-managed brands and taxonomy

Manual brand/category creation is supported, but uses the same validation and governance pipeline as imported or AI-suggested data.

### 5.1 Brand workflow
- Create/edit bilingual canonical name, aliases, slug, logo candidates, website/source provenance, country, status and category applicability.
- Detect duplicates using normalized names, aliases, known identifiers, and fuzzy match suggestions.
- Logo research must prefer official manufacturer sources and retain source URL, retrieval timestamp, rights/provenance notes, confidence, and candidate status.
- New/changed brands remain draft/pending review until authorized approval.
- Preserve historical references and prevent destructive merge/deletion when listings or models depend on the brand.

### 5.2 Category workflow
- Create/edit bilingual names, stable slug/ID, parent, level, domain, taxonomy path, industry/application links, aliases, source/reference, and lifecycle status.
- Validate acyclic parent graph, legal level transitions, unique slug, no duplicate canonical identity, and allowed parent-child combinations.
- Preview impact on listing wizard, dynamic forms, search filters, URLs, analytics, existing listings, brand/model applicability and downstream APIs.
- Support draft, review, publish, deprecate, merge/redirect and rollback.
- Never silently re-parent or deactivate a populated branch. Require migration/crosswalk plan and impact approval.
- Machine types, industry applications, model/configuration, capacity class and transaction intent remain distinct dimensions.

### 5.3 Shared governance
All manual, imported, and AI-generated records share validation, provenance, approval, versioning, audit and rollback. Admin forms must not expose direct database writes or bypass domain invariants.

## 6. Admin authorization and editability

- Owner retains immutable break-glass and billing/security controls.
- Admin permissions are granular: taxonomy.manage, brands.manage, promotions.manage, entitlements.grant, campaigns.manage, pricing.manage, moderation.manage, analytics.view, etc.
- Restrict campaign grants, price changes, refunds, and global taxonomy changes to explicit capabilities.
- Provide preview/dry-run, confirmation for destructive/high-impact changes, audit history and rollback where safe.
- Keep business-editable values in validated configuration/records rather than scattered hardcoded UI constants. Critical security invariants, provider secrets and authorization policy remain code-controlled and are not made editable through ordinary CMS controls.

## 7. Suggested domain boundaries (not final Prisma model names)

- PromotionPackage / PromotionPlacement / PromotionOrder / PromotionCampaign
- PromotionEntitlement / PromotionEvent / PromotionAnalyticsDaily
- PaymentAttempt / PaymentWebhookEvent / RefundOrCredit
- FeatureDefinition / EntitlementGrant / EntitlementUsage / EntitlementCampaign / EntitlementAudit
- TaxonomyDraft / TaxonomyVersion / TaxonomyChangeSet / TaxonomyAudit
- BrandSource / BrandLogoCandidate / BrandApproval

Before adding migrations, inspect current schema and existing models for overlap; reuse existing concepts where safe. Do not create duplicate payment, subscription, campaign, or audit models.

## 8. Required acceptance tests

### Listing / payment
1. Free listing creates no payment record and reaches moderation.
2. Paid promotion creates a quote/order but does not publish or approve listing.
3. Client-forged payment success is rejected.
4. Duplicate webhook is idempotent; one payment produces one entitlement.
5. Failed/cancelled payment preserves the draft and creates no active promotion.
6. Rejected/unpublished listing follows explicit refund/credit policy.
7. Expired promotion stops sponsored placement but leaves listing lifecycle unchanged.
8. Organic and sponsored metrics are separately reported.

### Entitlements
1. Trial grants access only to configured feature/scope and dates.
2. Expiry denies new premium operations server-side while preserving saved data.
3. Owner/admin-only capabilities cannot be granted to ordinary users.
4. Revocation is immediate and audited.
5. Overlapping grants follow deterministic precedence and quota rules.
6. Campaign audience preview matches actual grant eligibility.
7. Suspended users cannot use trial grants to bypass restrictions.

### Taxonomy and brands
1. Duplicate/alias detection warns before creation.
2. Invalid parent/level and cyclic tree changes are rejected.
3. New records remain unpublished until approved.
4. Impact preview identifies affected listings/forms/search routes.
5. Deprecation/merge preserves references and redirects safely.
6. Manual and AI-origin records use identical validation and audit pipeline.

## 9. Delivery sequence

**P0 — inspect before build**
- Inventory current listing, payment, subscription, analytics, promotion, RBAC, brand and taxonomy models/routes.
- Map current implementation to this contract and identify reuse vs gaps.
- Confirm payment provider availability and supported markets; do not introduce paid dependencies without explicit approval.

**P1 — no-payment foundation**
- Complete free listing → moderation path.
- Implement server-side feature entitlement resolution and admin grant audit.
- Implement taxonomy/brand draft-create-review-publish flow and impact preview.

**P2 — monetization**
- Implement promotion package/placement configuration, payment order/webhook idempotency, refund/credit rules, sponsored inventory and seller analytics.
- Launch only after end-to-end payment sandbox and abuse tests.

**P3 — growth**
- Admin-managed trial campaigns, cohorts, expiry messaging, conversion analytics and safe experiments.

## 10. Operational guardrails
- Integration branch only; keep PR #340 draft and base main.
- No merge/deploy to Production without explicit authorization.
- No Production database writes or migrations.
- Preview migrations only after schema inspection, read-only diagnostics, paired encrypted backup, preconditions and reviewed workflow.
- No paid provider/API or wallet top-up under the free-only policy.
- Report code-level, CI-level, preview-runtime and production-runtime evidence separately.
