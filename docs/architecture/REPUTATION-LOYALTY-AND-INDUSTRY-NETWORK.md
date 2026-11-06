# Heavix Reputation, Loyalty & Industry Network Economy

**Status:** Product strategy / implementation contract (proposed; not yet implemented)  
**Created:** 2026-11-06  
**Owner:** HEAVIX product  
**Relationship:** Complements `GROWTH-MONETIZATION-AND-ROLE-EXPERIENCE.md` and `OWNER-CONTROL-PLANE-CONTRACT.md`  
**Delivery constraint:** Must not delay the first usable Preview targeted within the next 2–3 days. Preview foundation and this product program proceed in parallel.

## 1. Executive intent

Heavix should become the trusted reference network for industrial machinery, equipment, auctions, companies, and professional knowledge—not merely another classified-listing website. The platform should reward users and organizations for creating measurable, exclusive, trustworthy value for the Heavix ecosystem.

The proposed **Heavix Reputation & Loyalty Economy (HRLE)** combines:
1. A non-transferable reward-credit ledger that can pay for eligible subscriptions and premium features.
2. A separate reputation system that expresses trust, expertise, reliability, and contribution quality.
3. A professional industrial social network built around companies, machines, auctions, technical knowledge, and verified activity.
4. A contribution marketplace in which exclusive, accurate, and useful supply receives more reward than low-quality volume.
5. Transparent anti-abuse, dispute, expiry, and financial controls.

The system is a product capability and growth moat. It is not a cryptocurrency launch. Do not introduce blockchain, tradable tokens, cash redemption, or a speculative asset in the initial design.

## 2. Product principles

- **Reward value, not activity spam.** A verified exclusive auction with complete data is worth more than dozens of duplicate low-quality posts.
- **Separate reputation from spendable credits.** Reputation should not be purchasable or spendable. Reward credits may be redeemed under explicit rules but must not imply trust.
- **Prove exclusivity.** Exclusivity requires a defined scope, duration, source/rights attestation, duplicate detection, and enforcement process.
- **Reward outcomes, not only submissions.** Quality, freshness, completeness, response, verified engagement, and successful outcomes affect final rewards.
- **Fair by role and category.** Buyers, sellers, dealers, agents, companies, and experts have different valuable contributions and fair earning paths.
- **Explain every balance change.** Each earning, adjustment, expiry, reversal, and redemption has a reason, policy version, actor, timestamp, and audit trail.
- **Protect market integrity.** No reward for fake leads, self-dealing, fabricated auctions, manipulated reviews, duplicate inventory, or unverifiable claims.
- **No pay-to-trust.** Paying a subscription or buying credits never increases verification status, review score, or reputation.
- **Privacy and consent.** Social visibility, following, contact discovery, and company affiliation require clear controls.
- **No hidden financial promise.** Credits are platform promotional/reward units, not deposits, securities, e-money, or cash-equivalent claims. Legal review is required before public terms or real redemption.

## 3. Two independent value systems

### 3.1 Heavix Credits (HC) — redeemable reward balance

A closed-loop, non-transferable platform credit, earned through eligible contributions and redeemed for eligible Heavix services.

Possible redemptions:
- One month of an eligible subscription when the published credit threshold is met.
- Partial subscription payment (credits + permitted payment method), if later approved.
- Specific premium features, extra listing capacity, analytics reports, AI enrichment packs, featured placement, or auction promotion.
- Company/team benefits and event/training access, subject to a published catalogue.
- Time-limited campaigns and partner benefits.

Initial constraints:
- Credits are not withdrawable, transferable, peer-to-peer tradable, or convertible to cash.
- Credits do not buy verification, moderation outcomes, ranking manipulation, or administrative permissions.
- No credit redemption should trigger an automatic paid renewal. Any subsequent paid renewal requires explicit consent.
- Credit prices, expiry, eligible products, caps, and refund/reversal rules must be visible before earning and redemption.
- Do not promise that any particular amount of activity guarantees a free subscription until unit economics and fraud exposure are modelled.

### 3.2 Heavix Reputation — non-spendable trust and contribution profile

A distinct reputation profile with explainable dimensions, not one opaque score:
- Identity and company verification status.
- Data accuracy and technical completeness.
- Exclusivity and source reliability.
- Transaction/auction fulfilment reliability.
- Response quality and timeliness.
- Community expertise and accepted answers.
- Dispute, complaint, and policy history (with due process and appeal).
- Longevity and consistency.

Show dimension-level signals and evidence summaries. Avoid public disclosure of sensitive risk signals or personal data. A single summary tier may be displayed only with a clear explanation and should not replace the dimensions.

## 4. Eligible contribution and earning catalogue

All values below are **illustrative policy examples**, not approved prices or final point amounts. The Admin must configure versioned rules and caps before launch.

| Contribution | Qualification / proof | Reward design |
|---|---|---|
| Exclusive machinery/equipment listing | Ownership/authorization attestation, unique asset checks, required technical fields, valid photos, availability confirmation | Base reward + quality/completeness multiplier + exclusivity-duration bonus |
| Exclusive auction published on Heavix | Organizer/company verification, auction terms, schedule, lots, reserve/inspection details where applicable, source and rights evidence | Higher base reward; bonus after auction validity and completion are confirmed |
| Verified invoice or transaction evidence | Redacted evidence, consent, permitted purpose, manual/automated validation; never expose invoice details publicly | Reward for verified marketplace contribution, not for disclosing unnecessary financial/personal data |
| Accurate technical specification enrichment | Source citation, model/serial matching, reviewer acceptance, correction history | Per accepted field-set / verified record, capped by model and contributor |
| Unique industrial knowledge or guide | Originality check, editorial review, usefulness, source attribution | Editorial acceptance reward + useful engagement bonus |
| Expert answer / question resolution | Accepted by requester or moderator, evidence and conflict-of-interest checks | Reward for accepted and helpful answers; no vote rings |
| Buyer RFQ with actionable detail | Verified buyer intent, category/quantity/specification, reachable contact, anti-spam check | Small reward after qualification; larger only on validated outcome |
| Seller response / fulfilment | Timely, relevant response and verified status update | Service-quality reward, subject to buyer feedback and moderation |
| Successful verified transaction | Both sides' confirmation or acceptable independent evidence; dispute window elapsed | Outcome reward; avoid incentives that pressure users into unsafe transactions |
| Referral of a qualified company | New entity is genuinely new, verified, active and meets minimum quality threshold | Delayed reward after activation and fraud window |
| Company data correction / market intelligence | Verifiable source, reviewer acceptance, freshness and uniqueness | Reward for accepted update |
| Community contribution | Event, useful discussion, peer-reviewed benchmark, standards glossary | Quality-based reward, never raw post count |

### 4.1 Exclusivity contract

“Exclusive to Heavix” must be a structured agreement, not a checkbox with no enforcement:
- Define exclusive object: listing, auction, inventory feed, dataset, report, or content.
- Define geography, category, channels, and duration.
- Capture contributor authority and source/rights attestation.
- Record start/end, evidence, and the policy version.
- Run duplicate/fingerprint checks across known inventory and user submissions.
- Define permitted exceptions (e.g. the seller's own website, legally required publication, or pre-existing contractual channels) explicitly.
- Detect material breach where possible; allow human review and appeal.
- Apply reward only after qualification; prorate/withhold future bonuses if terms are breached, and reverse only according to published rules and due process.

Do not claim global exclusivity where Heavix cannot verify all external channels. Prefer precise wording such as “exclusive auction publication on Heavix for the agreed period and scope.”

## 5. Credit policy, thresholds, and economic controls

### 5.1 Reward formula

Use a policy-driven formula, not hard-coded front-end points:

`reward = base × quality_factor × verification_factor × outcome_factor × exclusivity_factor`

Apply category caps, account/company caps, campaign budgets, daily/weekly limits, and manual review thresholds. Factors must be bounded and explainable. A missing or failed verification factor should result in zero or pending reward, not an arbitrary estimate.

### 5.2 Subscription redemption

- Admin defines a credit price for each eligible plan/feature and effective dates.
- Users see current balance, pending balance, expiring balance, redemption quote, and remaining balance.
- Support monthly, quarterly, annual, and custom subscription terms only when the subscription architecture supports them and pricing is approved.
- Redeem atomically and idempotently; prevent double-spend and race conditions.
- Record a credit debit and subscription entitlement grant as one auditable business operation.
- If redemption fails, no partial debit remains.
- Show a confirmation before redemption and a receipt afterward.
- Credit-funded access is time-bounded and does not silently auto-renew.

### 5.3 Unit economics

Before enabling redemption, model:
- Expected gross margin by plan and premium feature.
- Cost to serve AI, storage, media, support, and featured placement.
- Expected earned-credit liability under conservative/base/aggressive scenarios.
- Fraud, reversals, unused/expired balance, and redemption rate.
- Campaign and cohort budgets.
- Maximum credit issuance per verified user/company and per month.
- Breakage treatment only after legal/accounting review; do not rely on expiry to hide liabilities.

Start with a small, capped Preview/Beta cohort and non-cash service credits. Never issue unlimited rewards.

## 6. Professional industrial social network

Build a domain-specific network rather than a generic social feed.

### 6.1 Core graph and profiles
- Professional profiles for people, companies, dealers, agents, experts, and verified organizers.
- Company pages with branches, team members, capabilities, inventory, auctions, certifications, and activity.
- Follow companies, experts, machinery models, categories, auctions, and saved searches.
- Role-aware public/private profile fields and company membership permissions.
- Verified affiliation and role claims with expiry/revalidation where appropriate.

### 6.2 Useful network experiences
- Industry activity feed: new verified machines, exclusive auctions, specification updates, market reports, accepted answers, company announcements.
- Watchlists and alerts for a model, brand, category, company, price range, auction, or technical attribute.
- Machine/model pages with structured specs, compatible attachments, known issues, manuals and source references, market signals, and change history.
- Auction calendar, saved lots, inspection questions, reminders, and post-auction outcomes.
- Expert Q&A, technical discussions, how-to guides, standards glossary, and editorial collections.
- Buyer RFQ ↔ qualified seller matching with consent-based introductions.
- Dealer inventory and branch updates; agent-managed client workspaces with explicit authorization.
- Company team collaboration, saved research, shared comparisons, and internal notes.
- Verified reviews and transaction feedback with evidence, right of reply, moderation, and appeal.
- Professional events, webinars, training, and industry announcements.
- Digest notifications that are useful and configurable, not engagement spam.

### 6.3 Differentiating Heavix capabilities
1. **Machine Passport:** structured identity/history record for a machine, with ownership/maintenance/inspection events only where evidence and consent support them.
2. **Industrial Data Trust Graph:** source-linked technical facts, confidence, freshness, conflicts, corrections, and provenance.
3. **Auction Integrity Layer:** verified organizers, standardized auction data, change history, result reporting, and post-event reliability.
4. **Specification Intelligence:** normalized cross-brand/model comparison, compatibility, missing-field detection, and cited AI-assisted enrichment.
5. **Market Pulse:** category/model price and supply trends with sample size, freshness, and confidence labels; never imply precision unsupported by data.
6. **Verified Supply Exclusivity:** time-bounded, scope-specific exclusive listings/auctions with transparent status.
7. **Industrial Expert Graph:** discover experts by validated topics, accepted answers, credentials, and company affiliation.
8. **Trust-aware RFQ matching:** match by technical fit, location/availability where consented, verified capability, and response reliability—not paid rank alone.
9. **Company Reliability Timeline:** public, evidence-based history of profile completeness, auction fulfilment, and service signals with appeal.
10. **Portable professional dossier:** user-controlled export of their own profile, contributions, credentials, and records in a readable format.

These are roadmap differentiators. Do not claim they exist until implemented and verified.

## 7. Levels, badges, missions, and community loops

Possible non-financial status levels:
- Newcomer
- Contributor
- Verified Contributor
- Specialist
- Industry Expert
- Trusted Partner
- Founding Member (proposed launch program; separate approval and criteria)

Levels should reflect sustained, quality-weighted contribution and trust. Do not make them purchasable. A user can have category-specific expertise (e.g. cranes, compressors, CNC) instead of one universal prestige score.

Missions can encourage useful actions:
- Complete a verified company profile.
- Add missing specs to a known model.
- Publish an eligible exclusive auction.
- Resolve a technical question with accepted evidence.
- Refresh an out-of-date listing.
- Submit a verified correction.
- Complete a safe, verified transaction flow.

Missions must be optional, transparent, capped, accessible, and never pressure users to disclose private data or complete risky transactions.

## 8. Abuse prevention, governance, and appeals

Threats include duplicate listings, fabricated auctions, fake invoices, self-referrals, review rings, bot activity, collusion, company account farming, stolen content, manipulated engagement, false exclusivity, and staff misuse.

Required controls:
- Immutable append-only credit ledger with idempotency keys and balanced debit/credit operations.
- Separate pending, available, redeemed, expired, reversed, and disputed states.
- Evidence references and retention policy; redact sensitive documents and store only minimum necessary data.
- Duplicate detection and anomaly signals; do not auto-punish solely on opaque model output.
- Risk-based manual review and maker-checker approval for large adjustments.
- Per-user, per-company, per-device/session and per-campaign velocity limits where lawful and proportionate.
- Conflict-of-interest declarations for staff, reviewers, and contributors.
- Moderation reasons, user notice, appeal path, SLA, and audit trail.
- Admin adjustment requires reason, permission, actor, before/after values, and audit event.
- Admin gifts/trials/credits never grant admin roles, bypass identity checks, or override moderation.
- Do not expose internal fraud rules or sensitive risk signals publicly.

## 9. Admin control plane

Create a **Reputation & Loyalty Center** within the existing Admin experience, subject to RBAC:
- Reward rule catalogue and versioning.
- Contribution types, evidence requirements, factors, caps, cooldowns, and campaign budgets.
- Credit issuance, pending review, adjustments, revocations, expiry, and redemption.
- User/company ledger and full reason history.
- Exclusive content agreements and breach/dispute workflows.
- Reputation dimensions, verification statuses, badges, levels, and appeal decisions.
- Campaigns, missions, referrals, cohort experiments, and conversion analytics.
- Liability/issuance/redemption dashboards and anomaly alerts.
- Role-based permissions and maker-checker controls.
- Dry-run/simulation mode before publishing any rule change.
- Effective dating and rollback to a previous policy version.
- Audit log for every administrative action.

Owner can configure business policies, but cannot bypass legal, privacy, identity, payment, moderation, or security safeguards.

## 10. Data and service architecture direction

This section is a target architecture, not an assertion that the schema already exists.

Suggested conceptual entities:
- `RewardProgram`, `RewardPolicyVersion`, `RewardRule`
- `Contribution`, `ContributionEvidence`, `ContributionReview`
- `ExclusivityAgreement`, `ExclusivityScope`, `ExclusivityEvent`
- `CreditAccount`, `CreditLedgerEntry`, `CreditReservation`, `CreditRedemption`
- `ReputationProfile`, `ReputationSignal`, `ReputationEvidence`, `BadgeAward`
- `Mission`, `MissionProgress`, `ReferralAttribution`, `Campaign`
- `Follow`, `FeedEvent`, `NotificationPreference`, `ExpertiseTopic`
- `Dispute`, `Appeal`, `RiskReview`, `AdminAdjustment`

Architecture requirements:
- One authoritative server-side entitlement and credit service; never trust client-supplied balances or reward amounts.
- Ledger operations transactional, idempotent, concurrency-safe, and fully audited.
- Reputation signals derived from evidence and versioned rules; retain provenance and correction history.
- Separate public profile projections from private evidence and financial ledger data.
- Events/outbox for feed, notifications, analytics, and downstream rewards; consumers must be idempotent.
- Role, company membership, subscription, and feature entitlements remain separate dimensions.
- Avoid introducing a second competing subscription/entitlement engine; integrate with the central resolver defined in the Growth & Monetization architecture.
- Review App DB vs Store DB ownership and cross-database consistency before any schema change.
- Add schema only after code/model inventory, migration review, tests, and safe Preview DB identity gates. No DB writes as part of this documentation task.

## 11. Metrics and success criteria

North-star: **trusted, useful industrial contributions per active verified organization**, not raw page views or post volume.

Measure:
- Verified exclusive supply added and retained.
- Auction validity, completion, and organizer reliability.
- Technical data completeness, correction rate, and freshness.
- Accepted expert answers and time-to-resolution.
- Qualified RFQs and response/fulfilment rates.
- Verified company activation and 30/90-day retention.
- Contribution-to-credit cost and credit redemption rate.
- Credit issuance vs redemption liability and fraud/reversal rate.
- Subscription conversion, retention, and contribution-funded subscription share.
- Feed usefulness, saves/follows, notification opt-outs, and report rates.
- Distribution/fairness across roles, company sizes, and categories.

Guardrails:
- No increase in fake/duplicate content or disputes.
- No decline in buyer trust or search relevance.
- No reward inflation beyond approved budget.
- No unexplained concentration of rewards among a small number of accounts.
- No sensitive-data exposure or coercive engagement.

## 12. Phased implementation

### Phase 0 — Preview (target: next 2–3 days)
- Keep first Preview as the immediate delivery priority.
- Do not block Preview on a points ledger, social feed, new migrations, payment integrations, or full Admin Center.
- Include this strategy in product architecture and backlog; existing UI may show a clearly marked future concept only if it does not mislead.
- Validate current app and Preview independently; a successful build is not a deployed/working Preview.

### Phase 1 — Foundation and internal simulation
- Complete code/schema/legacy audit and map existing promotions, subscriptions, comparison, company, auction, review, and activity features.
- Define canonical contribution taxonomy and policy version format.
- Implement calculation simulator with synthetic data only.
- Finalize economic assumptions, privacy/legal review, and abuse cases.
- No real credit issuance or redemption yet.

### Phase 2 — Controlled reward ledger
- Add append-only ledger, pending review, idempotency, caps, expiry, reversal, and audit.
- Start with a tiny internal/test cohort and non-cash platform benefits.
- Test concurrent redemption, retries, disputes, and reversals.

### Phase 3 — Earn and redeem beta
- Launch a few measurable contribution types: verified technical enrichment, qualified exclusive listing, and verified exclusive auction.
- Publish exact terms and reward schedule.
- Enable a capped subscription/feature redemption catalogue only after unit economics and end-to-end tests.
- No automatic paid renewal.

### Phase 4 — Reputation and network
- Roll out evidence-based reputation dimensions, company pages, follows, watchlists, expert Q&A, industry feed, and useful notifications.
- Add Machine Passport and Auction Integrity in stages with provenance and consent.

### Phase 5 — Growth ecosystem
- Add referrals, missions, partner campaigns, team benefits, category expert programs, founding-member cohorts, and experiments.
- Expand only after abuse, economics, and retention metrics are healthy.

## 13. Preview critical path and 2–3 day commitment

This is a planning target, not a guarantee of external service availability:
1. Stabilize and validate the current Preview path using existing safe infrastructure.
2. Resolve the highest-priority build/runtime/auth blockers on isolated branches.
3. Confirm the preview URL renders and core flows can be exercised without contacting Production.
4. Keep all new product concepts documented and prioritized, not implemented ahead of Preview unless a small change is essential to make Preview usable.
5. Deliver the Preview for owner visual and functional review; then collect the user's homepage/header/hero and broader design changes.
6. Continue the legacy parity, role experience, monetization, and HRLE implementation after the first review.

Do not merge to main, deploy Workers, migrate databases, write to databases/B2, or change DNS merely to satisfy the target date. Existing release and infrastructure safety gates remain authoritative.

## 14. Decisions still requiring validation

- Exact credit unit name, earning values, redemption prices, expiry, and legal wording.
- Whether credits expire, and how pending/disputed credits are handled.
- Exclusivity scope and acceptable exceptions by content type.
- Which evidence types are proportionate and privacy-preserving.
- Whether partial subscription redemption is economically viable.
- Public reputation display and appeal policy.
- Initial eligible categories and beta cohort.
- Whether any third-party partner benefits are feasible at zero infrastructure budget.

Until approved, all figures and detailed policies remain proposals.

## 15. Continuity / handoff contract

This file is a durable source of truth for future chats and contributors. On resumption:
1. Read this file together with `GROWTH-MONETIZATION-AND-ROLE-EXPERIENCE.md`, `OWNER-CONTROL-PLANE-CONTRACT.md`, and the current Preview readiness report.
2. Recheck the live repository state, PRs, CI, deployment metadata, and blockers; never assume historical SHAs/status remain current.
3. Preserve the 2–3 day Preview priority until a usable Preview is delivered and reviewed.
4. Treat HRLE as approved product direction for discovery/documentation, not permission to make schema, financial, legal, or production changes.
5. Update this document and the central project issue/roadmap whenever a decision changes.
6. Report verified facts separately from proposals, assumptions, and work not yet executed.
7. Keep zero-cost constraints and all security/production gates in force.

---
**Non-goals for initial release:** cryptocurrency, blockchain token, peer-to-peer transfer, cash-out, speculative trading, unbounded rewards, paid reputation, purchased verification, or engagement farming.
