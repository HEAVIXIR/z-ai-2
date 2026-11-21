# HEAVIX — Intent Intelligence, Demand Memory & Lifecycle Matching
**Date:** 2026-11-19  
**Target branch:** `integration/preview-readiness-workerd-2026-11-15`  
**Status:** Product/technical extension contract. Existing features must be reused; this document does not claim the full capability is implemented.

## 1. Product objective

Evolve HEAVIX from a reactive listing marketplace into an industrial demand-intelligence marketplace that can:
- Understand a user's declared and observed equipment/product/service interests.
- Preserve useful, consented demand signals over time, including older wanted/buy requests.
- Detect when a newly published listing matches an earlier expressed need.
- Deliver timely, relevant, explainable alerts through user-approved channels.
- Help sellers reach genuinely interested buyers without exposing private user behavior or contact details.

This is an extension of existing search, saved-search, recommendation, BuyRequest, analytics, notification and AI foundations—not a parallel replacement.

## 2. Existing Integration code found (source inspection)

At inspected Integration source revision:
- `src/lib/recommendations.ts` implements a server-side recommendation generator. Current primary affinity source is favorites; it derives category/brand affinity and adds recent category/trending candidates. It upserts `UserRecommendation` rows and preserves dismissed state.
- `src/app/api/recommendations/route.ts` exposes authenticated recommendation retrieval and click/dismiss actions.
- `SearchQuery` stores normalized query, result count, optional userId, IP, category/brand slugs and timestamp.
- `SavedSearch` stores query/category/brand/price/condition/city filters, email/push preferences, lastNotifiedAt, matchCount, active state and optional userId.
- `BuyRequest` stores request title/description/category/brand preference/transaction/budget/location/status/viewCount/expiry and optional userId.
- `AnalyticsEvent` stores event type, optional user/listing/category/brand IDs, query/page/referrer/IP/user-agent/metadata and timestamp.
- `UserRecommendation` stores per-user listing/reason/score/dismissed/clickedAt.
- `src/app/api/search/route.ts` logs search queries and tracks analytics events.
- `src/app/api/saved-searches/route.ts` creates and manages saved searches, including notification preferences.
- `src/lib/event-taxonomy.ts` already defines discovery and intent events such as search, listing_view, listing_compare, saved_search and wanted_created.

### Important current limitations / verification points
1. Current recommender comments and implementation use favorites as the primary user-affinity signal; the module explicitly notes lack of a ListingView table in its SQLite-compatible implementation. Do not describe it as already learning from all listing views.
2. Search logging stores query and optional user association, but does not yet constitute a durable, structured industrial purchase-intent profile.
3. SavedSearch has notification preference fields and counters; the presence of these fields alone does not prove a reliable matching scheduler, delivery provider, retry policy, unsubscribe handling or end-to-end notification delivery. Verify those paths before claiming they work.
4. BuyRequest expiry/status fields exist; do not assume old requests are retained, searchable and eligible for matching after expiry. Define archival/retention policy and explicit requester intent.
5. Analytics tracking must be privacy-reviewed. The public `/api/analytics/track` currently accepts a client-supplied `userId` field; an untrusted client must never be allowed to attribute activity to an arbitrary account. Resolve authenticated identity server-side, use an anonymous first-party identifier only under approved consent/policy, and reject/ignore spoofed user IDs.
6. The current recommendations API auto-refreshes on GET by default. Review query cost, throttling, caching, and avoid expensive per-request scans as usage grows.

## 3. Unified intent signal model

Use a normalized internal signal abstraction, reusing existing records and adding only missing persistence:
- Explicit intent: BuyRequest, RFQ, SavedSearch, comparison/watchlist, enquiry/contact, quote request.
- Behavioral intent: listing views, repeat views, dwell/engagement where lawful and reliable, repeated search terms, filters, category/brand/model/attribute selection, comparison actions, favorites.
- Negative/decay signals: dismiss, hide, unsubscribe, repeated ignored recommendations, request fulfilled/cancelled, listing no longer relevant.
- Context: canonical subject/category, brand/model/generation, typed technical attributes, capacity/operating-weight range, condition, transaction intent, geography/radius, budget/currency, time horizon and recency.

Do not treat one accidental page view as purchase intent. Weight explicit requests and saved searches above passive browsing. Repeated behavior can increase confidence but must have caps and time decay. Store signal source, timestamp, confidence, expiry/retention class and provenance.

## 4. Intent profile and matching

Build a user-level preference/intent profile from event and domain records:
- Preferred subjects/categories and canonical taxonomy IDs
- Brand/model preferences and accepted alternatives
- Technical ranges and must-have attributes
- Purchase vs rental vs service intent
- Budget range, currency and geography
- Urgency/time horizon
- Confidence and last-evidence timestamp per preference

Matching pipeline when a listing is submitted/published:
1. Eligibility gate: listing must be published/visible and pass moderation.
2. Candidate retrieval: active saved searches, open/retained demand requests, high-confidence recent intent profiles, and relevant recommendations.
3. Hard constraints: transaction type, category compatibility, critical technical limits, location and user exclusions.
4. Soft ranking: attribute similarity, brand/model fit, price/budget fit, distance, recency, seller trust and intent confidence.
5. Explainability: record human-readable match reasons, e.g. “matches your saved wheel-loader search”, “similar to your earlier purchase request”, “within your selected operating-weight range”.
6. Deduplicate across overlapping signals and campaigns.
7. Apply relevance threshold, quiet hours, frequency cap and user channel preferences.
8. Queue delivery; do not send synchronously in the listing publication request.
9. Record delivery, failure, open/click, conversion and user feedback with attribution.

A six-month-old request can be a candidate only if it remains active or the user has opted into longer-term matching. An expired/fulfilled/cancelled request must not silently reactivate. Provide a “keep this request active / continue matching” option and periodic confirmation for older demand.

## 5. Matching examples

- User creates a request for a used wheel loader with an operating-weight band and a specified region. Months later a matching used loader is published. If the request is still active and alert permission exists, notify the user with the listing and match explanation.
- User repeatedly searches for a specific excavator family, views multiple models and compares them. Build a tentative preference, but ask for confirmation or offer a saved-search alert rather than treating browsing as a confirmed purchase request.
- A user wants a rental rather than a purchase. Do not send sale listings as direct matches unless the user has explicitly enabled alternatives.
- An exact brand/model is unavailable. Offer close technical alternatives with a clear “alternative match” explanation rather than pretending it is an exact match.

## 6. User controls, consent and privacy

Provide a transparent “My interests and alerts” area:
- View, edit, pause, delete or reset inferred interests.
- View active purchase requests and their expiry/renewal state.
- Manage saved searches and alert channels.
- Choose instant, daily digest, weekly digest or no alerts.
- Select categories/brands/regions/price/technical filters.
- Explain why a recommendation or alert was shown.
- Opt out of behavioral personalization while retaining explicit saved searches if desired.

Rules:
- Do not infer or store sensitive personal traits.
- Collect only data needed for marketplace relevance.
- Separate service-critical messages from marketing alerts.
- Email/SMS/push require channel-specific permission and unsubscribe/opt-out support according to applicable law and provider rules.
- SMS must be disabled unless the user has explicitly consented and a compliant provider is configured.
- Do not expose one user's searches, requests, phone, email, identity or inferred interests to sellers or other users.
- Apply data minimization, access controls, retention schedules, deletion/export workflows and audit logs.
- Anonymous visitor signals must not be joined to a named account without a lawful, transparent basis and appropriate user choice.

## 7. Delivery and notification architecture

Use an asynchronous outbox/queue pattern:
- Persist a deduplicated notification intent with event key, recipient, channel, template version, listing/request references, match score/reasons, scheduledAt and expiry.
- A worker claims work safely, enforces idempotency and per-user/channel rate limits, sends via configured provider, and records provider response.
- Retry transient failures with bounded exponential backoff; dead-letter permanent failures.
- Respect quiet hours, locale, timezone, notification preferences and campaign suppression.
- Prevent repeat notifications for the same listing/user unless meaningful listing changes or a configured reminder interval applies.
- Provide admin delivery health, failure, cost and complaint metrics.
- Keep provider credentials server-side and never expose them in admin-readable logs.

## 8. AI role and governance

AI may:
- Extract structured technical preferences from free-text wanted requests.
- Normalize synonyms and Persian/English terminology to canonical taxonomy.
- Suggest compatible category, brand/model and technical ranges.
- Rank candidates and explain likely relevance.
- Detect stale, fulfilled or contradictory intent for human/user confirmation.

AI must not:
- Invent or silently harden a preference from weak evidence.
- Contact users or send marketing messages outside explicit channel consent.
- Change a BuyRequest's status or reactivate it autonomously.
- Reveal private user behavior to sellers.
- Treat model output as verified truth.

Use deterministic hard filters for safety-critical matching constraints and AI only as a bounded assistive ranking/extraction layer. Persist model/version, prompt-policy version, confidence, evidence IDs and explanation. Provide admin kill switch, quotas, audit, fallback to deterministic saved-search matching and human review.

## 9. Admin control plane

Owner/admin with granular permissions should manage:
- Signal weights, decay windows, confidence thresholds and eligible event types.
- Category/industry-specific matching profiles and technical attribute importance.
- Exact vs alternative match policy.
- Request retention/renewal rules and alert re-confirmation cadence.
- Channels, templates, quiet hours defaults, frequency caps and campaign limits.
- AI enablement, model/provider policy, budgets, rate limits and fallback behavior.
- Exclusions, suppression lists and complaint thresholds.
- Preview/simulation against anonymized or appropriately authorized data.
- Delivery, match quality, opt-out, conversion and false-positive dashboards.

Changes require validation, preview, versioning, audit and rollback. Do not make security/privacy invariants or provider secrets editable as ordinary business configuration.

## 10. Metrics and quality controls

Measure:
- Eligible demand profiles and active saved searches
- Match precision (user feedback and qualified engagement), recall proxy and false-positive rate
- Alert delivery success, latency, duplicate rate, open/click rate
- Qualified leads, seller responses, conversions and time-to-match
- Opt-out, complaint and spam rates
- Match quality by category, brand/model and transaction type
- AI cost per accepted match and fallback rate

Use holdout cohorts and controlled experiments before changing ranking weights broadly. Avoid optimizing only for clicks; prioritize qualified match and user satisfaction.

## 11. Acceptance tests

1. Explicit active BuyRequest matches a later compatible published listing.
2. Expired/fulfilled/cancelled requests are excluded unless user renews.
3. Old requests require active status/renewal policy; no silent resurrection.
4. One passive view alone does not trigger a high-confidence purchase alert.
5. Repeated views/searches increase tentative affinity only within configured caps/decay.
6. Sale, rental and service intents do not cross-match incorrectly.
7. Technical hard constraints are respected; alternatives are labelled.
8. User can inspect, edit, pause and delete interests and alerts.
9. No notification is delivered without channel consent and enabled preferences.
10. Deduplication and idempotency prevent repeated sends across overlapping signals.
11. Provider failure retries safely and does not block listing publication.
12. Cross-user privacy tests prove no private search/request data leaks to sellers or other users.
13. Spoofed client-supplied userId cannot write analytics under another account.
14. AI output remains a suggestion and cannot mutate request state or send messages.
15. Ranking and delivery can be disabled independently, with deterministic saved-search fallback.

## 12. Delivery priority

This capability is a planned extension and must not interrupt the current P0 listing lifecycle, taxonomy, admin governance and Integration CI work.

When scheduled:
- First audit existing event instrumentation, saved-search notification jobs, notification providers and BuyRequest lifecycle.
- Fix identity attribution and consent/security gaps before increasing behavioral tracking.
- Complete deterministic saved-search and explicit-demand matching first.
- Add lifecycle-aware intent profile and ranking next.
- Introduce AI enrichment only after baseline matching quality and privacy controls are measured.
- Launch in shadow mode, then opt-in cohort, then gradual rollout with kill switch.

## 13. Operational safety
- Integration branch only; PR #340 remains draft.
- No Production merge/deploy or Production DB writes.
- No migrations before schema audit, read-only diagnostics, paired encrypted backup and reviewed Preview workflow.
- No paid provider/API or wallet top-up under the free-only policy.
- Distinguish code inspection, tests, Preview runtime and Production runtime evidence.
