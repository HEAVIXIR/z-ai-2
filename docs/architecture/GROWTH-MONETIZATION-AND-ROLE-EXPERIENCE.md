# HEAVIX — Growth, Monetization & Role-Based Experience Architecture
## 2026-11-06 · Product architecture proposal and verified baseline

### 1. Product intent
HEAVIX is a Persian-first industrial marketplace and intelligence platform. Monetization must help users discover value before purchase, not merely place a paywall around pages. The system shall support configurable subscriptions, individual feature entitlements, gifts, trials, promotions, role-aware experiences, and measurable conversion while preserving trust and preventing privilege escalation.
This document separates verified current implementation from proposed architecture. It does not authorize schema migration, payment activation, pricing publication, or production changes.

### 2. Verified baseline on main d86e3fa715d27b95477ed09eda60b2bfba8daaa6
Present:
- `SubscriptionPlan` exists with unique code, Persian/English names, description, monthly and yearly price, currency, legacy feature booleans, quotas (maxListings/maxImages), support level, active/popular flags, sort order, and featuresJson.
- `PremiumSubscription` exists with one row per user (`userId @unique`), plan/status/start/expiry, amount/paymentRef, featuredCredits, analyticsAccess, aiAssistantAccess, priorityLeads, and companyPage.
- `/admin/subscriptions` displays plan cards and subscription records; `PlansAdminClient` supports plan create/edit/delete through `/api/admin/subscription-plans`.
- `/api/admin/subscriptions` supports listing/stats and an admin upsert for a user's subscription. Plan and subscription API routes use subscription permissions and audit records.
- Permission keys include `subscription.read`, `subscription.manage`, `promotions.read`, and `promotions.manage`.
- Existing roles include ADMIN, SELLER, BUYER, MODERATOR and SUPPORT. Company and seller contexts already exist.
- Existing comparison foundation includes `ComparisonSession` and `ComparisonItem`; product innovation documentation identifies comparison and price intelligence as existing foundations rather than features to duplicate.
Verified gaps:
- `SubscriptionPlan` only has monthly/yearly price fields; quarterly billing cadence is not represented in this model.
- The current plan feature matrix is coarse and hard-coded in the subscription overview; detailed feature entitlement catalog is not established by the inspected schema.
- `PremiumSubscription` is user-scoped and unique per user; organization/company subscription ownership, seats, delegated admins, and company-level entitlements require explicit design.
- No dedicated time-bounded grant/gift/trial ledger was found in the inspected subscription models.
- No general feature-level allow/deny override, precedence resolver, usage-meter ledger, campaign attribution, experiment assignment, or conversion funnel was established by the inspected subscription models.
- The subscription admin server page queried private subscription/user data without its own page-level authz check. A narrow fix is proposed in PR #205; draft and awaiting CI/review.
- The current subscription API's generic upsert is not a safe substitute for a grant lifecycle with issuer, reason, start/end, revocation, scope, idempotency, and audit.

### 3. Core architecture: catalog, entitlements, grants, usage, billing
#### 3.1 Feature catalog
Create one canonical, versioned feature catalog. Every paid or gated capability must have a stable key, Persian/English label, description, domain, supported audience/role, access mode, quota/limit definition, dependencies, and enforcement points.
Illustrative keys, subject to source-code inventory:
- `compare.basic`, `compare.advanced`, `compare.unlimited`
- `machine.specs.full`, `machine.history`, `machine.passport`, `machine.compatibility`
- `market.analytics`, `price.intelligence`, `lead.priority`, `lead.export`
- `ai.assistant`, `ai.research`, `ai.listing.copilot`, `ai.bulk_enrichment`
- `seller.storefront`, `seller.verified_badge`, `seller.featured_listings`
- `buyer.rfq.pro`, `buyer.watchlists.pro`, `buyer.due_diligence`
- `dealer.crm`, `dealer.inventory`, `dealer.multi_branch`
- `agent.client_workspace`, `agent.lead_routing`, `agent.commission_reports`
- `company.team_seats`, `company.analytics`, `company.api_access`
Do not invent parallel feature flags for an existing capability. Map current implementations to canonical feature keys and enforce at server/service/API boundaries, not only by hiding buttons.

#### 3.2 Entitlement resolution
Resolve effective access from explicit sources with a deterministic, explainable decision trace:
1. Hard safety/compliance deny and account suspension.
2. Platform/Owner emergency kill switch.
3. Explicit user/company deny when supported and authorized.
4. Active paid subscription or active plan entitlement.
5. Active time-bounded grant/gift/trial/promotion.
6. Role/audience eligibility and organization membership.
7. Usage quota and plan limits.
8. Free/default baseline.
An entitlement response should include allowed/denied, feature key, scope (user/company/workspace), source (plan/trial/gift/promo/admin), validFrom, validUntil, remaining quota, reason code, and policy/catalog version. Do not expose internal policy details or other users' grant records to customers.
All protected operations must call the same server-side entitlement service. UI gating is presentation only and never an authorization boundary.

#### 3.3 Time-bounded access grants
Support distinct grant types:
- `TRIAL`: time-limited evaluation with explicit start/end and optional usage cap.
- `GIFT`: Owner/admin-issued complimentary access with a recorded reason and recipient.
- `PROMOTION`: campaign-bound access with eligibility, source, and redemption limits.
- `SUPPORT_CREDIT`: scoped support compensation; not a silent subscription mutation.
- `BETA_ACCESS`: opt-in preview access to a named feature, cohort, or release.
Each grant requires issuer, recipient/scope, feature or plan, start/end, reason, source campaign/ticket, status, created/updated timestamps, revocation metadata, idempotency key, and audit event. Grants must be revocable and expire automatically. Never silently convert a gift or trial into a paid subscription.
Admin actions should support one user, one company, selected cohort, or a rule-based segment only after previewing the exact audience and impact. Bulk grants require explicit confirmation and maximum-recipient safeguards.

#### 3.4 Subscription plans and billing periods
Support monthly, quarterly, annual, and configurable custom durations where commercially justified. Each plan should support currency, amount, tax/fee presentation, billing interval, grace period, renewal behavior, cancellation policy, feature entitlements, quotas, audience/role eligibility, seat limits, and effective dates.
Pricing must be editable by authorized Owner/finance roles, versioned, and scheduled. Existing subscriptions retain purchased terms unless an explicit, lawful migration policy is approved. Do not hard-code public prices in UI components.
Payment provider integration, local payment rails, settlement, refund, tax, and financial/legal policy require separate verification before enabling real charges. Until then, keep payment activation gated and clearly distinguish manual/admin grants from verified paid transactions.

### 4. Role and workspace experience
Role is not a subscription tier. A user may hold multiple business roles; company membership and role-specific workspace context must be resolved separately from entitlements.
Proposed experiences:
- BUYER: discovery, saved searches, compare, RFQ, due diligence, procurement workflows, alerts, buyer analytics.
- SELLER: listing studio, inventory, leads/CRM, offers, analytics, storefront, promotions, seller AI tools.
- DEALER: multi-inventory operations, branch/team management, customer pipeline, stock/price intelligence, comparison packs, lead routing, performance reports.
- AGENT/BROKER: assigned client workspaces, mandate/consent tracking, matching, lead routing, commission/attribution reporting, conflict-of-interest controls.
- COMPANY: organization dashboard, members/seats, roles, branches, shared assets, company-level subscription, consolidated analytics and audit.
- MODERATOR/SUPPORT: scoped operational workspaces with least privilege; never inherit Owner billing authority by default.
- ADMIN: operational management according to explicit permissions.
- PLATFORM OWNER/SUPER ADMIN: platform-level governance, plan/catalog configuration, controlled grants, policy management, financial overview, and audited emergency controls.
Support multiple roles and company memberships without creating separate user accounts. Provide role switcher/context selector, scoped navigation, role-specific onboarding, empty states, dashboards, and permissions. Never infer authority solely from a display label or subscription purchase.

### 5. Admin control center
Build a coherent Monetization & Growth Center with:
1. Feature catalog and entitlement matrix by plan, role, company type, and lifecycle.
2. Plan builder: monthly/quarterly/yearly/custom prices, features, quotas, seats, audience, ordering, active dates, comparison table, draft/publish/version/rollback.
3. Grant desk: trial/gift/beta/support grant creation, user/company lookup, single/bulk audience preview, duration, feature scope, quotas, reason, revoke, history.
4. Campaign studio: campaign objective, target segment, eligibility, offer, coupon/referral, start/end, cap, channel, landing page, attribution, holdout group, and budget cap.
5. Promotion rules: first-time users, verified companies, active sellers, dormant users, dealers, agents, category/industry cohorts; rules must be explainable and testable.
6. Usage metering: per-feature counts, quota consumption, limits, abuse detection, and fair-use rules.
7. Subscription operations: invoices/payment states, renewal, cancellation, grace period, refund workflow, manual correction with reason and dual control for sensitive financial operations.
8. Growth analytics: activation, trial starts, feature adoption, trial-to-paid conversion, paid conversion, retention, churn, revenue by cohort/role/feature/campaign, gift cost, and upgrade funnel.
9. Experimentation: feature-level A/B tests and holdout cohorts, with privacy-aware event collection and statistical caution.
10. Audit and governance: actor, target, before/after, reason, scope, expiry, approval, correlation ID, and exportable audit trail.

### 6. Growth mechanics and user experience
- Feature discovery: locked capabilities remain visible with a clear value explanation and non-coercive upgrade path.
- Contextual trial: offer a limited trial at the moment a user reaches a relevant workflow, not a generic pop-up everywhere.
- Seven-day access: support the owner's example as a configurable duration, not a hard-coded rule.
- Trial end: notify before expiry, on expiry, and provide a clear upgrade path; preserve user-created data and show read-only/export options where appropriate.
- Gift recognition: clearly label complimentary access and its expiry; never misrepresent it as paid membership.
- Role-aware plans: buyers, sellers, dealers, agents, and companies should see relevant benefits rather than one generic feature list.
- Referral and invitation: attribute acquisition and conversion while preventing self-referral, duplicate claims, and abuse.
- Comparison and technical intelligence: use existing comparison and catalog foundations; gate premium depth, saved comparison capacity, export, AI summaries, and team sharing through feature entitlements.

### 7. Safety, privacy, and commercial safeguards
- Server-side authorization and entitlement enforcement on every protected API/service action.
- No arbitrary role elevation through gift/trial grants. Grants add only named product entitlements; they never add admin permissions.
- No payment auto-renewal or charge after trial without explicit user consent and verified payment flow.
- No hidden fees, deceptive countdowns, fake scarcity, or misleading premium labels.
- Rate-limit grants, campaign redemption, coupons, and high-cost AI/analytics features.
- Separate company data by tenant; verify membership and role on every request.
- Audit all admin grants, revocations, pricing changes, manual payment corrections, and bulk campaigns.
- Use least privilege, approval thresholds, and optional two-person approval for pricing, refunds, large grants, and financial actions.
- Collect only necessary analytics; document consent, retention, and deletion policies.
- Gifts and trials must not bypass safety, moderation, identity, KYC, licensing, or regulated-finance gates.

### 8. Rollout sequence
P0 — Safety and baseline
- Complete page-level RBAC on subscription admin (PR #205).
- Inventory every current premium check, plan flag, subscription route, promotion endpoint, payment route, role, company relation, and feature gate.
- Build a no-write entitlement decision matrix and tests before changing schema.
P1 — Canonical feature catalog and entitlement resolver
- Map current capabilities to stable feature keys.
- Implement a single server-side resolver and instrumentation.
- Preserve compatibility with current plan/subscription fields during migration.
P2 — Trials and gifts
- Add auditable, time-bounded grants with revocation, idempotency, quota and expiry.
- Admin single-user grant workflow first; cohort grants only after dry-run/preview and abuse controls.
- Add trial UX and lifecycle notifications.
P3 — Role-specific plans and workspaces
- Establish buyer/seller/dealer/agent/company product requirements and company-level billing/entitlements.
- Build distinct navigation and dashboards over shared domain services.
P4 — Campaigns, promotions and analytics
- Add segment builder, campaign attribution, experiments, conversion and retention reporting.
- Ensure analytics baseline exists before setting targets.
P5 — Billing periods and payment lifecycle
- Add quarterly cadence and robust renewal/cancellation/refund/receipt behavior after payment/legal review.
- Enable actual charges only after provider verification and end-to-end payment tests.
P6 — Advanced industrial premium features
- Package comparison, technical specification depth, machine history/passports, compatibility, market/price intelligence, AI tools, dealer CRM, agent workflows, company seats and API access.
- Gate each capability by a real server-side entitlement and measure adoption/conversion.

### 9. Definition of Done
A monetized capability is complete only when its feature key, audience, plan mapping, entitlement resolver, server-side enforcement, admin control, user-facing explanation, expiry/revocation behavior, audit, usage metering, analytics events, tests, and documentation are all verified.
A trial/gift is complete only when it is time-bounded, scoped, non-recurring, auditable, revocable, idempotent, visible to the recipient, expires without deleting user data, and cannot elevate system permissions.

### 10. Immediate implementation notes
- Existing schema already supports editable monthly/yearly plans and coarse plan feature flags; do not recreate that functionality.
- Existing user-level subscription model is insufficient by itself for company-wide subscriptions, feature-specific grants, and multi-role entitlement resolution.
- The first implementation should be an additive, backwards-compatible entitlement layer; no schema migration should be prepared until current premium enforcement call sites and Store schema are inventoried.
- PR #205 proposes a narrowly scoped page-level authorization and audit fix for `/admin/subscriptions`; it is draft and requires CI/review.
- This proposal does not authorize any production billing, payment gateway activation, data migration, or paid infrastructure.