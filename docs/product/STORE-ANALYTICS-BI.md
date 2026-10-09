# HEAVIX — Store Analytics & Business Intelligence Plan

> **Status:** SPECIFICATION — analytics + BI contract. No code, schema, or migration changes.
> **Task ID:** 7 (/analyst — STEP 11.29-A)
> **Baseline:** `main` `4566efd`
> **Author:** /analyst agent
> **Companion docs:**
> - `docs/product/PRODUCT-ADMIN-STORE-CENTER-SPEC.md` (Store Center product spec — ASC capabilities)
> - `docs/product/STORE-CENTER-IMPLEMENTATION-PLAN.md` (PR-SC-01 … PR-SC-09)
> - `docs/ADR-005-store-center-architecture.md` (architecture decisions)
> - `docs/ADR-003-audit-transactionality.md` (cross-DB limitation, §5)
>
> **Scope of this document:** define the KPI dictionary, the Lead Score v1 algorithm, the Smart Inventory Score v1 algorithm, the data dictionary for every referenced field, and the validation plan. Every formula references a real Prisma field; fields that do not exist yet are explicitly marked `REQUIRES MIGRATION (PR-SC-XX)`.

---

## 0. Schema-Grounding Preface (verified facts)

Every KPI and score below is grounded against the actual schemas on `main` `4566efd`. The following facts were verified by reading `prisma/schema.prisma` (main DB) and `prisma/store-schema.prisma` (store DB) line-by-line:

| # | Fact | Verified at |
|---|---|---|
| F1 | `Lead` model has **no** `status` field and **no** `sellerId`. Reaches seller only via `Lead.listing.sellerId` or `Lead.listing.company`. | `schema.prisma:618-627` |
| F2 | `Lead.leadType` is a free `String` (no enum constraint in schema; spec §7.1 documents values CALL\|MESSAGE\|FAVORITE\|CONTACT\|VIEW\|OFFER). | `schema.prisma:622` |
| F3 | `MachinePassport` has only `serialNumber`, `inspectionDate`, `inspectionResult`, `events`. It has **no** `source` / `verification` / `specsVerifiedAt` / `ownershipVerifiedAt` / `inspectionVerifiedAt` / `serviceHistoryVerifiedAt` / `photos` fields. ADR-005 §6's claim that "MachinePassport already exists with `source` and `verification` fields" is **false** against the current schema. | `schema.prisma:1149-1159` |
| F4 | `PremiumSubscription` is keyed `userId @unique` (per-USER, **not** per-COMPANY). VIP/Dealer eligibility is derived via `Company.users[] → User.premium`. | `schema.prisma:1126-1143` |
| F5 | `Part` lives in **store-schema** (store DB, separate PrismaClient `storeDb`). `Listing` lives in **main schema** (main DB, PrismaClient `db`). Cross-DB JOINs and cross-DB transactions are NOT supported (ADR-003 §5). | `store-schema.prisma:123-165`, `schema.prisma:444-533` |
| F6 | `Part` has `sku` (not `partNumber`), **no** `oemNumber`, **no** `documents` relation, **no** formal `specifications` field (only `compatibleCars` JSON + `carModels` relation). ADR-005 §5's Smart Inventory Score factors `has_partNumber` / `has_oemNumber` / `has_documents` / `has_specifications` therefore **all require migration**. | `store-schema.prisma:123-165` |
| F7 | `Company` already has `logoUrl`, `coverImage`, `slug`, `viewCount`, `avgRating`, `reviewCount`, `verified`, `premium`. ADR-005 §1's proposed `logoUrl` / `bannerUrl` / `storeSlug` additions are partially redundant (`logoUrl` and `slug` already exist). | `schema.prisma:1177-1215` |
| F8 | `ListingAttributeValue` exists with `sourceType`, `confidence`, `verifiedAt`, `verifiedBy` (provenance fields). Spec-completeness is computable from `CategoryAttribute.required` × filled `ListingAttributeValue` rows. | `schema.prisma:350-387` |
| F9 | `Listing` has `viewCount` and `favoriteCount` as **denormalized counters** (not event logs). For time-windowed view analytics, use `AnalyticsEvent` (`eventType='LISTING_VIEW'`). | `schema.prisma:462-463`, `schema.prisma:2217-2238` |
| F10 | `AIGatewayLog` has `taskType`, `model`, `cost`, `tokensUsed`, `success`, `userId`, `createdAt`. Cost-per-task is computable today. AI suggestion **acceptance** is NOT measurable today — `AIGatewayLog` stores `output` (text) but has no accept/reject tracking. | `schema.prisma:726-741` |
| F11 | `Conversation` + `Message` exist on main DB. Seller-response time is derivable from `Lead.createdAt` → first `Message` with `senderId = Lead.listing.sellerId` in a `Conversation` scoped to that `listingId`. | `schema.prisma:2173-2209` |
| F12 | `SalesTeamMember` model does **not** exist. Sales-team-level performance KPIs are blocked until PR-SC-02 ships. | `STORE-CENTER-IMPLEMENTATION-PLAN.md:40-53` |
| F13 | `Showroom` and `ShowroomAnalytics` models do **not** exist. Showroom-page-performance KPI is blocked until PR-SC-02 (model) + ASC-074 (analytics aggregate) ship. | `STORE-CENTER-IMPLEMENTATION-PLAN.md:40-53`, `PRODUCT-ADMIN-STORE-CENTER-SPEC.md:229` |
| F14 | No existing `score` field on `Listing` or `Part`. The only score-bearing models today are `Inspection.score` (0-100), `Opportunity.score` (0-1), `PriceOverride.score` (0-1), `ModerationLog.riskScore` (0-1). | `schema.prisma:1362, 1921, 1981, 2247` |

### 0.1 Cross-DB limitation reminder (ADR-003 §5)

The HEAVIX deployment uses two separate PostgreSQL databases (`heavix` and `heavix_store`) accessed via two separate Prisma clients (`db` and `storeDb`). Consequences for this document:

- **No cross-DB JOIN.** Any KPI that mixes main-DB and store-DB fields must execute **two queries** (one per client) and merge at the service layer. Such KPIs are flagged `⚠ CROSS-DB (ADR-003 §5)` in the KPI dictionary.
- **No cross-DB transaction.** A score-recompute job that touches both DBs cannot be atomic. The job must be idempotent and tolerate partial failure (re-run on next tick).
- **AuditLog lives in main DB only.** Store-side score mutations (e.g., a future Part Catalog Score) write audit via best-effort `auditMutation` (ADR-003 §5), NOT `auditMutationTransactional`.

---

## 1. KPI Dictionary

Each KPI below specifies: **formula** (Prisma query shape), **data source** (model + DB), **permission filter** (who can see it), **time window**, **missing-data handling**, **owner role**. Every field referenced is real; fields needing migration are marked.

KPIs marked `⚠ CROSS-DB` require multi-query service-layer merge per ADR-003 §5. KPIs marked `🚧 BLOCKED` cannot be computed today because a required model/field does not exist; each names the unblocking PR.

### KPI-1 — Active listings + spec-completeness rate

| Attribute | Value |
|---|---|
| **Definition** | Count of currently-published seller listings, plus the fill-rate of *required* category attributes across those listings. |
| **Formula (Prisma shape, main DB)** | `activeCount = db.listing.count({ where: { status: 'PUBLISHED', sellerId: <scope> } })` <br/> `withSpecs = db.listing.count({ where: { status: 'PUBLISHED', sellerId: <scope>, attributeValues: { some: { /* all required attrs for its category present */ } } } })` <br/> `specCompletenessRate = withSpecs / activeCount` (per-listing the fill rate is `count(filled required attrs) / count(required attrs)`; the KPI rolls up as the share of listings with fill rate = 100%). |
| **Required-attr set** | `db.categoryAttribute.findMany({ where: { categoryId: listing.categoryId, required: true } })` joined against `db.listingAttributeValue.findMany({ where: { listingId } })` — a required attr is "filled" when a `ListingAttributeValue` row exists with at least one of `textValue`/`numberValue`/`booleanValue`/`dateValue`/`optionId` non-null. |
| **Data source** | `Listing` (main), `ListingAttributeValue` (main), `CategoryAttribute` (main), `AttributeDefinition` (main) |
| **Permission filter** | `ADMIN`: all listings. `SELLER` / `VIP_DEALER`: `sellerId = session.user.id`. Public buyers: not exposed (only the binary `Listing.verified` badge is public, per ASC-032). |
| **Time window** | Snapshot for the rate; 30-day rolling for trend (`publishedAt >= now() - 30d`). |
| **Missing-data handling** | Listing with no `categoryId` → excluded from denominator, counted in `uncategorizedCount` (surfaced as a data-quality warning). Category with zero required attrs → treated as 100% complete (counted in numerator). Division-by-zero (seller has 0 active listings) → KPI returns `null`, UI shows "no listings yet". |
| **Owner role** | Catalog Manager (rate) + BI Engineer (trend). KPI consumer: Seller, Admin. |
| **Migration needed** | None — all fields exist today. |
| **Capability ref** | ASC-010, ASC-011, ASC-032 (factors feed the Smart Inventory Score, §3). |

### KPI-2 — Slow-moving inventory + days-on-market

| Attribute | Value |
|---|---|
| **Definition** | For **machine listings** (main DB): listings still `PUBLISHED` past a threshold with no `soldAt`. Days-on-market = `now() - publishedAt`. (For **store Parts** — separate KPI, see KPI-2b.) |
| **Formula (Prisma shape, main DB)** | `slowMoving = db.listing.findMany({ where: { status: 'PUBLISHED', soldAt: null, publishedAt: { lt: new Date(now() - 90*86400_000) }, sellerId: <scope> }, select: { id, title, publishedAt, createdAt, viewCount, favoriteCount } })` <br/> `daysOnMarket = list.map(l => floor((now - (l.publishedAt ?? l.createdAt)) / 86400_000))` <br/> Aggregate: `median(daysOnMarket)`, `p90(daysOnMarket)`, `count(daysOnMarket > 180)`. |
| **Data source** | `Listing` (main) |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: `sellerId = session.user.id`. |
| **Time window** | Snapshot; bucketed into 0-30 / 31-90 / 91-180 / >180 day bands. |
| **Missing-data handling** | `publishedAt` null → fall back to `createdAt` and flag `publishedAtMissing=true` (data-quality warning). `soldAt` set → excluded (it's sold, not slow). Listing with `status='DRAFT'`/`'REJECTED'` → excluded. |
| **Owner role** | Catalog Manager. KPI consumer: Seller, Admin. |
| **Migration needed** | None. |
| **Capability ref** | ASC-030, ASC-082 (score distribution). |

> **KPI-2b — Slow-moving Parts (store DB, separate KPI).** ⚠ CROSS-DB (ADR-003 §5).
> Formula (store DB): `db_store.part.findMany({ where: { active: true, soldCount: 0, createdAt: { lt: now() - 90d } }, select: { sku, name, createdAt, soldCount } })`.
> ⚠ This is a **different domain** (auto-parts catalog) from the machine-listing slow-moving KPI above. The two CANNOT be joined. The seller dashboard must call two endpoints and merge client-side or at the service layer.
> Part-level "days-on-market" is approximated by `now() - Part.createdAt` (no `publishedAt` on Part). Migration candidate (P2): add `Part.firstListedAt` for a cleaner DOM metric.

### KPI-3 — New / qualified / un-followed-up leads count

| Attribute | Value |
|---|---|
| **Definition** | Three lead-pipeline counts for the seller's listings: **new** (fresh, un-contacted), **qualified** (post-migration `status=QUALIFIED`), **un-followed-up** (no seller action within SLA). |
| **Formula (Prisma shape, main DB)** | `sellerListingIds = db.listing.findMany({ where: { sellerId: <scope> }, select: { id: true } }).map(l => l.id)` <br/> **New (TODAY, pre-migration):** `db.lead.count({ where: { listingId: { in: sellerListingIds }, createdAt: { gte: now() - 7d } } })` <br/> **New (POST PR-SC-01):** `db.lead.count({ where: { listingId: { in: sellerListingIds }, status: 'NEW' } })` <br/> **Qualified (POST PR-SC-01):** `db.lead.count({ where: { listingId: { in: sellerListingIds }, status: 'QUALIFIED' } })` <br/> **Un-followed-up (TODAY, pre-migration):** leads where no `Conversation` exists for `(listingId, sellerId)` — i.e. `db.lead.count({ where: { listingId: { in: sellerListingIds }, createdAt: { lt: now() - 24h } }, AND: [{ conversations: { none: { participant2Id: <sellerId> } } }] })` — approximate. <br/> **Un-followed-up (POST PR-SC-01):** `status='NEW' AND createdAt < now() - 24h` (exact). |
| **Data source** | `Lead` (main), `Listing` (main), `Conversation` (main, for pre-migration approximation) |
| **Permission filter** | `ADMIN`: all leads (joined via `Lead.listing.sellerId`). `SELLER`/`VIP_DEALER`: only leads whose `listing.sellerId = session.user.id`. Cross-seller read → 403 + audit (ASC-050). |
| **Time window** | Rolling 7d / 30d; SLA threshold for "un-followed-up" = 24h (configurable). |
| **Missing-data handling** | Lead with no `listing` (orphan; should not exist due to `onDelete: Cascade`) → excluded. Lead on a listing whose `sellerId` is null → bucketed as `unassignedCount`, flagged for admin review. |
| **Owner role** | Sales/CRM Lead. KPI consumer: Seller, Sales Manager, Admin. |
| **Migration needed** | `Lead.status` (REQUIRES MIGRATION **PR-SC-01** + ASC-052). Until shipped, "qualified" and the exact "un-followed-up" counts are NOT computable — KPI ships with only the "new (7d)" count and the approximate un-followed-up via Conversation join. |
| **Capability ref** | ASC-050, ASC-052, ASC-053. |

### KPI-4 — View→contact/RFQ conversion rate

| Attribute | Value |
|---|---|
| **Definition** | Per-listing and per-seller conversion from listing views to contact-lead or RFQ submission. **No target without baseline** (per hard rule): the dashboard renders the *measured* rate; any "increase by X%" claim must cite a captured pre-period. |
| **Formula (Prisma shape, main DB)** | `views = db.analyticsEvent.count({ where: { eventType: 'LISTING_VIEW', listingId, createdAt: { gte: windowStart } } })` (or `Listing.viewCount` for a lifetime proxy — NOT windowed). <br/> `contacts = db.lead.count({ where: { listingId, leadType: { in: ['CALL','MESSAGE','CONTACT','OFFER'] }, createdAt: { gte: windowStart } } })` <br/> `conversionRate = views > 0 ? contacts / views : null` <br/> Seller roll-up: `sum(contacts) / sum(views)` across the seller's listings. <br/> RFQ variant: `db.rfq.count({ where: { createdAt: { gte: windowStart }, OR: [{ buyerId: <scope> }, { buyerPhone: <scope.phone> }] } })` — note `RFQ` has no `listingId` FK (only `machineType`/`brandPref` free text), so RFQ conversion is **approximate** and must be labeled as such in the UI. |
| **Data source** | `AnalyticsEvent` (main), `Lead` (main), `RFQ` (main), `Listing` (main) |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: only listings where `sellerId = session.user.id`. |
| **Time window** | 30-day rolling window; **baseline = preceding 30 days** (captured at KPI first-run, persisted in `Setting` or a new `KpiBaseline` table — REQUIRES MIGRATION if baselines are to be persisted; for v1 baselines are computed on-demand from the same rolling window shifted back 30d). |
| **Missing-data handling** | `views = 0` → conversion undefined, listing excluded from the aggregate (NOT averaged as 0%). `Listing.viewCount` used only as a fast-path proxy when `AnalyticsEvent` retention has expired; UI flags the source. RFQ conversion labeled "approximate — no listing FK". |
| **Owner role** | Growth/BI Engineer. KPI consumer: Seller, Marketing, Admin. |
| **Migration needed** | None for the contact-lead variant. RFQ variant is approximate today; a `RFQ.listingId` FK would make it exact (REQUIRES MIGRATION — not in current PR-SC plan; raise as a follow-up). |
| **Capability ref** | ASC-080, ASC-083 (Lead→Deal funnel, NEEDS DECISION on Deal-lead join key). |

### KPI-5 — Showroom page performance

| Attribute | Value |
|---|---|
| **Definition** | For a VIP Dealer's showroom (`/showroom/[slug]`): views, avg session depth, contact-action clicks, lead conversions attributable to the showroom. |
| **Formula (Prisma shape)** | 🚧 **BLOCKED** — `Showroom` and `ShowroomAnalytics` models do not exist. <br/> **Pre-migration approximation (TODAY):** `db.analyticsEvent.count({ where: { page: { startsWith: '/sellers/' }, createdAt: { gte: windowStart } } })` and `Company.viewCount` (denormalized lifetime counter on `Company`, main DB). These are coarse proxies, not a true showroom funnel. <br/> **Post-migration (POST PR-SC-02 + ASC-074):** `db.showroom.findUnique({ where: { companyId } })` → `db.showroomAnalytics.aggregate(...)` over a proposed `ShowroomAnalytics` table (views, cardClicks, contactActions, leadConversions, day-bucketed). |
| **Data source** | TODAY: `AnalyticsEvent` (main), `Company.viewCount` (main). POST-MIGRATION: `Showroom` (main, proposed), `ShowroomAnalytics` (main, proposed), `AnalyticsEvent` (main). |
| **Permission filter** | `VIP_DEALER`: own company showroom only. `ADMIN`: all. Public: aggregated, no buyer PII (per ASC-074). |
| **Time window** | 30d rolling; raw retention 90d; aggregates 24mo (per ASC-074 acceptance). |
| **Missing-data handling** | No `Showroom` row for the company → KPI returns `notConfigured`, UI shows "set up your showroom" CTA. VIP lapsed mid-window → window truncated to lapse date. |
| **Owner role** | VIP/Showroom PM. KPI consumer: VIP Dealer, Admin. |
| **Migration needed** | `Showroom` model (REQUIRES MIGRATION **PR-SC-02**); `ShowroomAnalytics` model (REQUIRES MIGRATION **ASC-074**, not yet in PR-SC plan — raise as PR-SC-10 follow-up). |
| **Capability ref** | ASC-070, ASC-071, ASC-074. |

### KPI-6 — Machine Passport doc count + status

| Attribute | Value |
|---|---|
| **Definition** | Per listing: count of `PassportEvent` rows (documented machine history), presence of a serial number, inspection result, and a 5-section verification status (post-migration). Also exposes the **Passport Score** (ADR-005 §6 — but see F3: all 5 factors require migration). |
| **Formula (Prisma shape, main DB)** | `passport = db.machinePassport.findUnique({ where: { listingId }, include: { events: true } })` <br/> **docCount** = `passport.events.length` <br/> **hasSerial** = `passport.serialNumber != null` <br/> **inspectionResult** = `passport.inspectionResult` (free text) <br/> **inspectionFreshness** = `passport.inspectionDate ? (now - passport.inspectionDate) / 86400_000 : null` <br/> **Passport Score (POST PR-SC-03):** `specs_verified(25) + ownership_verified(20) + inspection_current(25) + service_history(15) + photos(15)` — each factor is a boolean from the per-section verification fields added by PR-SC-03. Score stored as `MachinePassport.passportScore Int?` (REQUIRES MIGRATION — not currently in PR-SC-03 scope; add to PR-SC-03 or a PR-SC-03a). |
| **Data source** | `MachinePassport` (main), `PassportEvent` (main), `Inspection` (main), `CompanyDocument` (main) |
| **Permission filter** | `SELLER`/`VIP_DEALER`: own listings. `ADMIN`: all. Public: only the binary `Listing.verified` badge (never the per-section status, per ASC-061). |
| **Time window** | Snapshot. |
| **Missing-data handling** | No `MachinePassport` for the listing → UI shows "create passport" CTA (ASC-060); score = `null`, not 0. `inspectionDate` null → inspection factor = 0 (not verified). |
| **Owner role** | Trust/Verification Lead. KPI consumer: Seller, Admin, Financing partner (export only, gated). |
| **Migration needed** | Per-section verification fields on `MachinePassport` (`specsVerifiedAt`, `specsVerifiedBy`, `ownershipVerifiedAt`, `ownershipVerifiedBy`, `inspectionVerifiedAt`, `inspectionVerifiedBy`, `serviceHistoryVerifiedAt`, `serviceHistoryVerifiedBy`) — REQUIRES MIGRATION **PR-SC-03**. `MachinePassport.passportScore` + `passportScoreVersion` — REQUIRES MIGRATION (add to PR-SC-03 or PR-SC-03a). ADR-005 §6 must be **corrected** to remove the false claim that `source`/`verification` already exist (see F3). |
| **Capability ref** | ASC-060, ASC-061, ASC-062, ASC-063. |

### KPI-7 — Seller response time + sales-team performance

| Attribute | Value |
|---|---|
| **Definition** | (a) Median time from lead arrival to first seller-side reply. (b) Per-sales-team-member closed-lead count and avg response time (post-migration). |
| **Formula (Prisma shape, main DB)** | For each lead: <br/> `firstSellerReply = db.message.findFirst({ where: { conversation: { listingId: lead.listingId, participant2Id: lead.listing.sellerId }, senderId: lead.listing.sellerId, createdAt: { gte: lead.createdAt } }, orderBy: { createdAt: 'asc' } })` <br/> `responseTimeMs = firstSellerReply ? (firstSellerReply.createdAt - lead.createdAt) : null` <br/> Aggregate (seller): `median(responseTimeMs where not null)`, `p90`, `count(responseTimeMs is null AND lead.createdAt < now()-24h)` → "unresponded" bucket. <br/> **Sales-team performance (POST PR-SC-02):** group by `Lead.assignedToId` (REQUIRES MIGRATION ASC-052) joined to `SalesTeamMember` (REQUIRES MIGRATION PR-SC-02): `closedCount`, `avgResponseMs`, `qualificationRate`. |
| **Data source** | `Lead` (main), `Listing` (main), `Conversation` (main), `Message` (main), `SalesTeamMember` (main, proposed), `DealRoom`/`DealMessage` (main, alternative reply channel) |
| **Permission filter** | `SELLER`/`VIP_DEALER`: own listings' leads. `ADMIN`: all. Sales-team member view: only leads `assignedToId = self` (post-migration). |
| **Time window** | 30d rolling for response time; 90d for sales-team performance. |
| **Missing-data handling** | Lead with no seller reply → placed in "unresponded" bucket, **excluded from median** (do NOT average as 0). Lead on listing with `sellerId = null` → excluded, flagged. Conversation missing (seller replied via phone/offline) → not measurable; UI labels "no in-app reply". |
| **Owner role** | Sales Ops. KPI consumer: Seller, Sales Manager, Admin. |
| **Migration needed** | `Lead.assignedToId` (REQUIRES MIGRATION **ASC-052** — currently listed as proposed but NOT in PR-SC-01 scope; must be added). `SalesTeamMember` model (REQUIRES MIGRATION **PR-SC-02**). |
| **Capability ref** | ASC-050, ASC-051, ASC-052. |

### KPI-8 — AI cost per task + AI suggestion acceptance rate

| Attribute | Value |
|---|---|
| **Definition** | (a) Average USD cost per AI task, grouped by `taskType`. (b) Share of AI suggestions the user accepted/acted-on. |
| **Formula (Prisma shape, main DB)** | **(a) Cost per task (TODAY):** `db.aIGatewayLog.groupBy({ by: ['taskType'], _avg: { cost: true }, _sum: { cost: true }, _count: true, where: { createdAt: { gte: windowStart } } })` — also broken down by `success` (failed calls still incur cost). <br/> **(b) Suggestion acceptance (🚧 BLOCKED TODAY):** `AIGatewayLog` has no accept/reject tracking. Need a new `AISuggestion` model: `aiGatewayLogId`, `status` (PROPOSED\|ACCEPTED\|REJECTED\|DISMISSED\|ACTED_ON), `decidedAt`, `decidedById`, `actionEntityType`, `actionEntityId`. Acceptance rate = `count(status in [ACCEPTED, ACTED_ON]) / count(status in [PROPOSED, ACCEPTED, REJECTED, DISMISSED, ACTED_ON])`. |
| **Data source** | `AIGatewayLog` (main). `AISuggestion` (main, proposed). |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: only rows where `userId = session.user.id`. |
| **Time window** | 7d / 30d rolling for cost; 30d for acceptance. |
| **Missing-data handling** | `cost IS NULL` → excluded from cost average (`AIGatewayLog.cost` is nullable). `success = false` → still counted in cost (failed calls cost money). Acceptance denominator = 0 → rate = `null`, UI shows "no suggestions yet". |
| **Owner role** | AI/Platform Engineer. KPI consumer: AI PM, Admin, CFO (cost). |
| **Migration needed** | `AISuggestion` model (REQUIRES MIGRATION — **not in current PR-SC plan**; raise as PR-SC-11 / Phase 6 item). Until shipped, KPI-8 ships with **only the cost-per-task component**; the acceptance-rate card shows "blocked — requires AISuggestion migration". |
| **Capability ref** | ASC-100, ASC-103, ASC-153 (AI budget monitoring). |

### KPI summary table

| # | KPI | Status today | Blocking migration | Cross-DB |
|---|---|---|---|---|
| KPI-1 | Active listings + spec-completeness | ✅ computable | none | no |
| KPI-2 | Slow-moving inventory + DOM (machines) | ✅ computable | none | no |
| KPI-2b | Slow-moving Parts (store) | ✅ computable | none (DOM is approximate) | ⚠ yes (separate DB) |
| KPI-3 | New / qualified / un-followed-up leads | 🚧 partial | `Lead.status` (PR-SC-01) | no |
| KPI-4 | View→contact/RFQ conversion | ✅ computable (contact); RFQ approximate | optional `RFQ.listingId` | no |
| KPI-5 | Showroom page performance | 🚧 blocked | `Showroom` (PR-SC-02) + `ShowroomAnalytics` (ASC-074) | no |
| KPI-6 | Passport doc count + status | 🚧 partial | `MachinePassport` verification fields (PR-SC-03) | no |
| KPI-7 | Seller response time + sales-team perf | 🚧 partial (response time yes; sales-team no) | `Lead.assignedToId` (ASC-052), `SalesTeamMember` (PR-SC-02) | no |
| KPI-8 | AI cost per task + suggestion acceptance | 🚧 partial (cost yes; acceptance blocked) | `AISuggestion` (new, PR-SC-11) | no |

---

## 2. Lead Score Algorithm (v1)

**Design principles:** deterministic, versioned, explainable, overridable, ML-free for v1. Every factor maps to a real field (verified against `schema.prisma`). Factors that depend on a not-yet-existing field are deferred to v1.1.

### 2.1 Scope

The Lead Score v1 prioritizes a seller's inbound leads so the CRM inbox (ASC-050) can surface a "top-10 high-priority leads" panel (ASC-053 acceptance). It is **advisory only** — it never auto-closes, auto-assigns, or mutates a lead. Public buyers never see it. It is **not** a credit or sale-likelihood guarantee.

### 2.2 Factors and weights (v1, 100-point scale)

Every factor below maps to a field that exists on `main` today. No v1 factor depends on a migration.

| # | Factor | Weight | Source field(s) | Logic (points) |
|---|---|---|---|---|
| L1 | Lead-type intent | 35 | `Lead.leadType` (String) | `OFFER`=35 · `CALL`=28 · `MESSAGE`=22 · `CONTACT`=18 · `FAVORITE`=10 · `VIEW`=5 · unknown/other=5 |
| L2 | Recency | 20 | `Lead.createdAt` (DateTime) | `≤24h`=20 · `24-72h`=15 · `3-7d`=10 · `8-30d`=5 · `>30d`=0 |
| L3 | Note quality | 10 | `Lead.note` (String?) | null/empty=0 · `1-20` chars=4 · `21-100`=7 · `>100`=10 |
| L4 | Repeat buyer | 10 | `Lead.viewerPhone` (String?) + `Lead` self-join | distinct-lead count by `viewerPhone` for this seller's listings: `1`=4 · `2-3`=7 · `4+`=10 · phone null=0 |
| L5 | Listing price tier | 15 | `Lead.listing.price` (BigInt?) + seller's own listing prices | top-quartile of seller's active listings=15 · mid=10 · bottom-quartile=5 · `price` null=8 (neutral) |
| L6 | Listing engagement | 10 | `Lead.listing.viewCount` + `Lead.listing.favoriteCount` (Int) | `viewCount>100 OR favoriteCount>10`=10 · `viewCount>20`=6 · else=3 |
| | **Total** | **100** | | clamp to [0, 100] |

**v1.1 (post PR-SC-01, deferred):** add L7 pipeline-stage bonus `+10 if status=QUALIFIED, +5 if status=CONTACTED, 0 otherwise`, clamp at 100. This requires `Lead.status` (PR-SC-01).

### 2.3 Formula

```
leadScore_v1(lead) = clamp(
    L1(lead.leadType)
  + L2(lead.createdAt)
  + L3(lead.note)
  + L4(lead.viewerPhone, sellerListingIds)
  + L5(lead.listing.price, sellerPriceQuartiles)
  + L6(lead.listing.viewCount, lead.listing.favoriteCount)
, 0, 100)
```

Pure function: same inputs → same output. Implemented in `src/lib/scoring/lead-score.ts` (to be created in PR-SC-06). Unit-tested with golden datasets (§5).

### 2.4 Versioning scheme

| Field | Type | Purpose | Migration |
|---|---|---|---|
| `Lead.score` | `Int?` | Cached score 0-100 | REQUIRES MIGRATION (ASC-053) |
| `Lead.scoreVersion` | `String?` | Algorithm version, e.g. `"v1"`, `"v1.1"`, `"v1-override"` | REQUIRES MIGRATION (ASC-053) |
| `Lead.scoredAt` | `DateTime?` | Last computation timestamp (for recency-decay batch) | REQUIRES MIGRATION (ASC-052) |
| `Lead.scoreBreakdown` | `String?` (JSON) | Factor-by-factor point breakdown for explainability | REQUIRES MIGRATION (ASC-053) |

**Recommendation:** store all four fields inline on `Lead` for v1 (one row, no join). A separate `LeadScoreHistory` append-only table (one row per recalculation) is a **v2 candidate**, not needed for v1. Spec §13.1 lists `LeadScore` as NEEDS DEVELOPMENT; this plan picks the inline-column option (simpler, no join, single migration).

**Version bump rules:** bump `scoreVersion` whenever any factor weight or threshold changes. Old scores remain valid until recomputed (the version tag lets the UI render a "stale score — recompute" hint when `scoreVersion != CURRENT_VERSION`).

### 2.5 Recalculation triggers

| Trigger | When | Scope |
|---|---|---|
| Lead creation | on insert | single lead |
| Lead `note` edit | on update | single lead |
| Lead `status` change (post-migration) | on PATCH | single lead |
| Seller-side first reply (Message create) | on insert | single lead (recompute L2/L4 may shift) |
| Nightly batch | 03:00 Asia/Tehran | all leads with `scoredAt < now()-7d` OR `scoreVersion != CURRENT_VERSION` |
| Manual "recompute" button | seller click | single lead |

The nightly batch is idempotent: re-running it for the same day produces the same scores.

### 2.6 Explainability output

For each scored lead, the breakdown JSON is stored in `Lead.scoreBreakdown` and rendered in the CRM UI:

```json
{
  "scoreVersion": "v1",
  "total": 78,
  "factors": [
    { "key": "L1_leadType",      "label": "Lead type: OFFER",            "points": 35, "max": 35 },
    { "key": "L2_recency",       "label": "Created 6h ago",              "points": 20, "max": 20 },
    { "key": "L3_noteQuality",   "label": "Note: 45 chars",              "points":  7, "max": 10 },
    { "key": "L4_repeatBuyer",   "label": "Phone seen 2× before",        "points":  7, "max": 10 },
    { "key": "L5_priceTier",     "label": "Mid-tier listing",            "points": 10, "max": 15 },
    { "key": "L6_engagement",    "label": "38 views, 2 favorites",       "points":  6, "max": 10 }
  ]
}
```

**Human reason string** (rendered above the breakdown):
> "High-intent OFFER lead, fresh (6h), from a repeat buyer; mid-tier listing with moderate engagement."

The reason string is generated by concatenating the top-2 factor labels with a templated lead-in. It is deterministic (same breakdown → same string), so it can be diffed in tests.

### 2.7 Human-override mechanism (audited)

A seller may disagree with the computed score (e.g., the buyer phoned in and is highly qualified, but the lead-type was logged as VIEW). The override flow:

1. Seller clicks **"Re-prioritize"** on a lead → modal opens showing the computed score, breakdown, and reason string (read-only).
2. Seller selects an **override reason** from a fixed enum (prevents free-text abuse):
   - `WRONG_BUYER_PROFILE` — buyer does not match the machine
   - `DUPLICATE` — same inquiry already tracked elsewhere
   - `TEST_SPAM` — automated/test lead
   - `ALREADY_CLOSED_OFFLINE` — deal done outside the platform
   - `HIGH_PRIORITY_OVERRIDE` — seller judges this lead more important than the score suggests
   - `OTHER` (requires a note)
3. Seller enters an optional note (max 500 chars) and a manual score (0-100).
4. On submit, the system writes:
   - `Lead.score = manualValue`
   - `Lead.scoreVersion = "v1-override"`
   - `Lead.scoredAt = now()`
   - `Lead.scoreOverrideById = session.user.id` (REQUIRES MIGRATION ASC-053)
   - `Lead.scoreOverrideReason = <enum>` (REQUIRES MIGRATION ASC-053)
   - `Lead.scoreOverrideNote = <text>` (REQUIRES MIGRATION ASC-053)
   - `Lead.scoreBreakdown = { overridden: true, originalScore, originalVersion, reason, note }`
5. An `AuditLog` row is written via `auditMutationTransactional` (main DB, atomic):
   - `action = "lead.score-override"`
   - `entityType = "Lead"`, `entityId = lead.id`
   - `actorId = session.user.id`, `actorType = "USER"`
   - `beforeJson = { score, scoreVersion }` (old), `afterJson = { score, scoreVersion, reason, note }` (new)
6. Override is **visible to ADMIN** (not hidden). Admin can **revert override** → recomputes from factors, writes another audit row with `action = "lead.score-override-revert"`.
7. Override does NOT mutate the underlying factor inputs (so a future recompute without override would restore the computed value — the override is a separate state, not a data edit).

**Override fields required (REQUIRES MIGRATION ASC-053 extension):**
- `Lead.scoreOverrideById String?`
- `Lead.scoreOverrideReason String?`
- `Lead.scoreOverrideNote String?` (max 500)
- `Lead.scoreOverrideAt DateTime?`

### 2.8 ML later (NOT v1 — documented for the record)

Per the hard rule, v1 is deterministic. ML is a **Phase 6+ investigation**, documented here so future work has a baseline:

| Aspect | Plan |
|---|---|
| Training data | 12 months of leads with outcome labels: positive = a `Deal` was created AND reached `status in [CONFIRMED, COMPLETED]`; negative = `Lead.status = LOST` or no Deal within 60d. **Blocker:** there is no `Deal.listingId` FK from `Lead` today (ASC-083 NEEDS DECISION). The join must be reconstructed via `Lead.listingId → Deal.listingId` (Deal has `listingId`, main DB). |
| Features | the six v1 factors + seller history features (avg response time, close rate) + listing features (price tier, category, days-on-market). All deterministic-derived. |
| Model | gradient-boosted trees (LightGBM/XGBoost) — explainable via SHAP, no deep nets. |
| Evaluation | AUC on a 30-day held-out window; precision@10 for the "top-10 priority leads" panel. **Ship gate:** ML must beat v1 deterministic by ≥5 AUC points AND ≥10% precision@10 lift, else v1 stays in production. |
| Error modes | cold-start (new seller, <10 leads → fall back to v1); drift (monthly retrain); segment bias (audit precision@10 per seller category, per price tier — block ship if any segment degrades >10% vs v1). |
| Baseline comparison | every ML run logs v1 score and ML score side-by-side on the same leads for 30 days before cutover; dashboard shows both. |
| Versioning | ML model version stored in `Lead.scoreVersion` as `"ml-v1-<modelHash>"`; deterministic fallback version `"v1"` retained. |

---

## 3. Smart Inventory Score Algorithm (v1)

### 3.1 Cross-DB clarification (THE critical decision)

ADR-005 §5 proposes adding `inventoryScore` to **`Part`** (store DB). The Store Center Spec §5.2 proposes a "Smart Inventory Score" on **`Listing`** (main DB) with completely different factors. These are **two different scores conflated under one name**:

| | ADR-005 §5 (Part) | Store Center Spec §5.2 (Listing) |
|---|---|---|
| Target model | `Part` (store DB) | `Listing` (main DB) |
| Domain | Auto-parts catalog (MEKANIX) | Machine listings (HEAVIX marketplace) |
| Factors | partNumber, oemNumber, images, documents, specifications, stock_accuracy, recent_movement | spec completeness, media coverage, verification, inspection freshness, documentation, engagement |
| Cross-DB cost | score lives in store DB; seller dashboard (main) would need cross-DB read to display it | score lives in main DB; same DB as seller dashboard — no cross-DB read |
| Field existence today | 4 of 7 factors **do not exist** on Part (F6) | 6 of 6 factors computable from existing main-DB fields (F8) |

**Recommendation:** The "Smart Inventory Score" referenced by the Store Center dashboard KPIs (ASC-032, ASC-082, and KPI-1/KPI-6 above) is the **Machine Listing Completeness Score** and should live on **`Listing`** (main DB). Rationale:

1. **All six factors in Spec §5.2 source from main-DB models** (`Listing`, `ListingImage`, `ListingAttributeValue`, `CategoryAttribute`, `MachinePassport`, `Inspection`, `CompanyDocument`, `Company`). Putting the score on `Part` (store DB) would force a cross-DB read on every dashboard render — forbidden by ADR-003 §5.
2. **"Inventory" in a machinery marketplace = listed machines**, not parts. The MEKANIX auto-parts catalog is a separate domain with a separate audience.
3. The seller dashboard already filters by `Listing.sellerId` (main DB). Adding the score to `Listing` keeps the dashboard query in **one DB, one query**.
4. ADR-005 §5's Part-based score should be **renamed "Part Catalog Score"** and tracked as a separate P2 metric (Store Catalog PM). Its factors (`partNumber`, `oemNumber`, `documents`, `specifications`) do NOT exist on `Part` today (F6) and would require a larger migration than the Listing-side score.

**Cross-DB implication (must be documented in ADR-005 amendment):**
- A future dashboard that shows BOTH scores side-by-side (machine listing score from main + part catalog score from store) must run **two separate queries** (one per Prisma client) and merge at the service layer. No cross-DB JOIN. No cross-DB transaction (ADR-003 §5).
- The Listing-side recompute job runs against `db` (main client); the (future) Part-side recompute job runs against `storeDb` (store client). **Two separate jobs, two separate schedules, two separate audit paths.**
- If ADR-005 §5 is NOT amended and `inventoryScore` is added to `Part` as written, the Store Center dashboard's "Smart Inventory Score" card will either (a) wrongly show the Part score on a machine-listings page, or (b) require a cross-DB read that violates ADR-003 §5. **This is a blocking inconsistency.**

**Action:** ADR-005 §5 should be amended (or a new ADR-005a issued) to:
- Relocate `inventoryScore` + `inventoryScoreVersion` from `Part` to `Listing`.
- Rename the Part-side score to `partCatalogScore` (P2, separate PR).
- Update PR-SC-03 accordingly.

### 3.2 Algorithm (v1) — Machine Listing Completeness Score on Listing

| # | Factor | Weight | Source field(s) (all main DB) | Logic (points) |
|---|---|---|---|---|
| I1 | Spec completeness | 25 | `ListingAttributeValue` + `CategoryAttribute` (required) | `filled_required / total_required × 25` (rounded). Category with 0 required attrs → 25 (full credit, vacuously complete). Listing with no `categoryId` → 0. |
| I2 | Media coverage | 15 | `ListingImage[]` (count via relation) | `≥5 images`=15 · `3-4`=10 · `1-2`=5 · `0`=0 |
| I3 | Verification | 20 | `Company.verified` (Boolean) + `MachinePassport` (exists, via `Listing.passport`) | `Company.verified AND passport exists`=20 · `Company.verified` only=12 · `passport exists` only=8 · neither=0 |
| I4 | Inspection freshness | 15 | `Inspection.status='COMPLETED'` + `Inspection.completedAt` (most recent) | `COMPLETED ≤90d`=15 · `≤180d`=10 · `>180d or no completed inspection`=0 |
| I5 | Documentation | 15 | `CompanyDocument` count where `status='VERIFIED'` (via `Company.documents`) | `≥3 verified`=15 · `1-2`=8 · `0`=0 |
| I6 | Engagement (30d) | 10 | `Listing.viewCount` + `Listing.favoriteCount` (denormalized Int) | `viewCount>50 OR favoriteCount>5`=10 · `viewCount>10`=5 · else=2 |
| | **Total** | **100** | | clamp to [0, 100] |

**Note on I1 provenance:** `ListingAttributeValue` carries `sourceType`, `confidence`, `verifiedAt` (F8). v1 uses raw fill rate. v1.1 (deferred) may weight verified attrs higher (e.g., `verifiedAttr` counts 1.25×). v1 stays simple and deterministic.

**Note on I6:** `Listing.viewCount`/`favoriteCount` are lifetime denormalized counters, not 30d deltas. For a true 30d delta, v1.1 may switch to `AnalyticsEvent` count where `eventType in ['LISTING_VIEW','FAVORITE']` and `createdAt >= now()-30d`. v1 uses the denormalized counters (cheaper query; the "30d" label in the factor name is aspirational and should be relabeled "engagement (lifetime)" in v1 UI copy to avoid misleading the seller).

### 3.3 Formula

```
inventoryScore_v1(listing) = clamp(
    I1(listing.attributeValues, listing.categoryId)
  + I2(listing.images)
  + I3(listing.company?.verified, listing.passport)
  + I4(listing.inspections)
  + I5(listing.company?.documents)
  + I6(listing.viewCount, listing.favoriteCount)
, 0, 100)
```

Pure function. Implemented in `src/lib/scoring/inventory-score.ts` (to be created in PR-SC-03 revised). Unit-tested with golden datasets (§5).

### 3.4 Versioning scheme

| Field | Type | Purpose | Migration |
|---|---|---|---|
| `Listing.inventoryScore` | `Int?` | Cached score 0-100 | REQUIRES MIGRATION (**PR-SC-03 REVISED** — relocate from Part to Listing) |
| `Listing.inventoryScoreVersion` | `String?` | e.g. `"v1"` | REQUIRES MIGRATION (PR-SC-03 revised) |
| `Listing.inventoryScoredAt` | `DateTime?` | Last computation timestamp | REQUIRES MIGRATION (PR-SC-03 revised) |
| `Listing.inventoryScoreBreakdown` | `String?` (JSON) | Factor-by-factor breakdown | REQUIRES MIGRATION (PR-SC-03 revised) |

**Version bump rules:** same as Lead Score (§2.4). UI shows a "stale score" hint when `inventoryScoreVersion != CURRENT_VERSION`.

### 3.5 Recalculation triggers

| Trigger | When | Scope |
|---|---|---|
| `ListingAttributeValue` create/update/delete | on mutation | single listing |
| `ListingImage` create/delete | on mutation | single listing |
| `Company.verified` flip | on update | all listings for that company (batched) |
| `MachinePassport` create | on insert | single listing |
| `Inspection.status` → `COMPLETED` | on update | single listing |
| `CompanyDocument.status` → `VERIFIED` | on update | all listings for that company (batched) |
| Nightly batch | 03:00 Asia/Tehran | all listings with `inventoryScoredAt < now()-7d` OR `inventoryScoreVersion != CURRENT_VERSION` |
| Manual "recompute" button | seller/admin click | single listing |

### 3.6 Explainability output

Same JSON pattern as Lead Score (§2.6). Example:

```json
{
  "scoreVersion": "v1",
  "total": 72,
  "factors": [
    { "key": "I1_specCompleteness", "label": "Specs: 8/10 required filled (80%)", "points": 20, "max": 25 },
    { "key": "I2_media",            "label": "Media: 6 images",                  "points": 15, "max": 15 },
    { "key": "I3_verification",     "label": "Company verified + passport",      "points": 20, "max": 20 },
    { "key": "I4_inspection",       "label": "Inspection COMPLETED 45d ago",     "points": 15, "max": 15 },
    { "key": "I5_documentation",    "label": "2 verified company documents",     "points":  8, "max": 15 },
    { "key": "I6_engagement",       "label": "62 views, 4 favorites",            "points": 10, "max": 10 }
  ]
}
```

**Human reason string:**
> "Strong specs and recent inspection; weak documentation — add a 3rd verified company document to gain 7 points."

The reason string highlights the **single highest-leverage missing factor** (the factor with the largest `max - points` gap), giving the seller an actionable next step. This satisfies ASC-102 (listing optimization hints) at a deterministic level.

### 3.7 Public visibility (NON-NEGOTIABLE)

Per ASC-032 acceptance: the score is **never displayed to public buyers**. Public buyers see only the binary `Listing.verified` badge. The score is seller/admin-only. UI copy must say "completeness indicator", never "sales guarantee" (Appendix A prohibition). This is enforced server-side: the score field is stripped from public listing API responses by field policy.

---

## 4. Data Dictionary

Every field referenced by any KPI or score in this document. `DB` = `main` (heavix) or `store` (heavix_store). "Status" = `EXISTS` (on `main` 4566efd) or `MIGRATION` (does not exist; see "Migration ref").

### 4.1 Main DB fields

| Model | Field | Type | DB | Used by | Status | Migration ref |
|---|---|---|---|---|---|---|
| Listing | id | String | main | KPI-1,2,4,6,7; InvScore | EXISTS | — |
| Listing | slug | String | main | (routing) | EXISTS | — |
| Listing | title | String | main | KPI-2 (label) | EXISTS | — |
| Listing | status | String | main | KPI-1,2 (filter `PUBLISHED`) | EXISTS | — |
| Listing | price | BigInt? | main | LeadScore L5 | EXISTS | — |
| Listing | sellerId | String? | main | KPI-1,2,3,4,7 (scope) | EXISTS | — |
| Listing | companyId | String? | main | InvScore I3,I5 | EXISTS | — |
| Listing | categoryId | String? | main | KPI-1; InvScore I1 | EXISTS | — |
| Listing | viewCount | Int | main | KPI-4; LeadScore L6; InvScore I6 | EXISTS | — |
| Listing | favoriteCount | Int | main | KPI-4; LeadScore L6; InvScore I6 | EXISTS | — |
| Listing | publishedAt | DateTime? | main | KPI-2 (DOM) | EXISTS | — |
| Listing | soldAt | DateTime? | main | KPI-2 (filter) | EXISTS | — |
| Listing | createdAt | DateTime | main | KPI-2 (DOM fallback) | EXISTS | — |
| Listing | attributeValues | ListingAttributeValue[] | main | KPI-1; InvScore I1 | EXISTS | — |
| Listing | images | ListingImage[] | main | InvScore I2 | EXISTS | — |
| Listing | passport | MachinePassport? | main | InvScore I3 | EXISTS | — |
| Listing | inspections | Inspection[] | main | InvScore I4; KPI-6 | EXISTS | — |
| Listing | company | Company? | main | InvScore I3,I5; KPI-6 | EXISTS | — |
| Listing | leads | Lead[] | main | KPI-3,4,7 | EXISTS | — |
| Listing | conversations | Conversation[] | main | KPI-7 | EXISTS | — |
| Listing | inventoryScore | Int? | main | InvScore (cache) | MIGRATION | PR-SC-03 revised |
| Listing | inventoryScoreVersion | String? | main | InvScore (version) | MIGRATION | PR-SC-03 revised |
| Listing | inventoryScoredAt | DateTime? | main | InvScore (recalc) | MIGRATION | PR-SC-03 revised |
| Listing | inventoryScoreBreakdown | String? (JSON) | main | InvScore (explain) | MIGRATION | PR-SC-03 revised |
| Lead | id | String | main | KPI-3,7; LeadScore | EXISTS | — |
| Lead | listingId | String | main | KPI-3,7 (join) | EXISTS | — |
| Lead | leadType | String | main | KPI-4; LeadScore L1 | EXISTS | — |
| Lead | viewerPhone | String? | main | LeadScore L4 | EXISTS | — |
| Lead | viewerName | String? | main | (display) | EXISTS | — |
| Lead | note | String? | main | LeadScore L3 | EXISTS | — |
| Lead | createdAt | DateTime | main | KPI-3,7; LeadScore L2 | EXISTS | — |
| Lead | listing | Listing | main | KPI-3,7 (seller join) | EXISTS | — |
| Lead | status | String | main | KPI-3; LeadScore v1.1 L7 | MIGRATION | PR-SC-01 / ASC-052 |
| Lead | assignedToId | String? | main | KPI-7 (sales-team) | MIGRATION | ASC-052 (not yet in PR-SC-01) |
| Lead | scoredAt | DateTime? | main | LeadScore (recalc) | MIGRATION | ASC-052 |
| Lead | score | Int? | main | LeadScore (cache) | MIGRATION | ASC-053 |
| Lead | scoreVersion | String? | main | LeadScore (version) | MIGRATION | ASC-053 |
| Lead | scoreBreakdown | String? (JSON) | main | LeadScore (explain) | MIGRATION | ASC-053 |
| Lead | scoreOverrideById | String? | main | LeadScore (override) | MIGRATION | ASC-053 ext |
| Lead | scoreOverrideReason | String? | main | LeadScore (override) | MIGRATION | ASC-053 ext |
| Lead | scoreOverrideNote | String? | main | LeadScore (override) | MIGRATION | ASC-053 ext |
| Lead | scoreOverrideAt | DateTime? | main | LeadScore (override) | MIGRATION | ASC-053 ext |
| ListingAttributeValue | listingId | String | main | KPI-1; InvScore I1 | EXISTS | — |
| ListingAttributeValue | attributeId | String | main | KPI-1; InvScore I1 | EXISTS | — |
| ListingAttributeValue | textValue | String? | main | KPI-1 (filled check) | EXISTS | — |
| ListingAttributeValue | numberValue | Float? | main | KPI-1 (filled check) | EXISTS | — |
| ListingAttributeValue | booleanValue | Boolean? | main | KPI-1 (filled check) | EXISTS | — |
| ListingAttributeValue | dateValue | DateTime? | main | KPI-1 (filled check) | EXISTS | — |
| ListingAttributeValue | optionId | String? | main | KPI-1 (filled check) | EXISTS | — |
| ListingAttributeValue | sourceType | String? | main | InvScore v1.1 (deferred) | EXISTS | — |
| ListingAttributeValue | confidence | Float? | main | InvScore v1.1 (deferred) | EXISTS | — |
| ListingAttributeValue | verifiedAt | DateTime? | main | InvScore v1.1 (deferred) | EXISTS | — |
| CategoryAttribute | categoryId | String | main | KPI-1; InvScore I1 | EXISTS | — |
| CategoryAttribute | attributeId | String | main | KPI-1; InvScore I1 | EXISTS | — |
| CategoryAttribute | required | Boolean | main | KPI-1; InvScore I1 | EXISTS | — |
| ListingImage | listingId | String | main | InvScore I2 | EXISTS | — |
| MachinePassport | listingId | String | main | InvScore I3; KPI-6 | EXISTS | — |
| MachinePassport | serialNumber | String? | main | KPI-6 | EXISTS | — |
| MachinePassport | inspectionDate | DateTime? | main | KPI-6 | EXISTS | — |
| MachinePassport | inspectionResult | String? | main | KPI-6 | EXISTS | — |
| MachinePassport | events | PassportEvent[] | main | KPI-6 (docCount) | EXISTS | — |
| MachinePassport | specsVerifiedAt | DateTime? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | specsVerifiedBy | String? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | ownershipVerifiedAt | DateTime? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | ownershipVerifiedBy | String? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | inspectionVerifiedAt | DateTime? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | inspectionVerifiedBy | String? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | serviceHistoryVerifiedAt | DateTime? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | serviceHistoryVerifiedBy | String? | main | KPI-6 (Passport Score) | MIGRATION | PR-SC-03 |
| MachinePassport | passportScore | Int? | main | KPI-6 (Passport Score cache) | MIGRATION | PR-SC-03 or PR-SC-03a |
| MachinePassport | passportScoreVersion | String? | main | KPI-6 (version) | MIGRATION | PR-SC-03 or PR-SC-03a |
| PassportEvent | passportId | String | main | KPI-6 (docCount) | EXISTS | — |
| PassportEvent | eventType | String | main | KPI-6 | EXISTS | — |
| PassportEvent | date | DateTime | main | KPI-6 | EXISTS | — |
| Inspection | listingId | String | main | InvScore I4; KPI-6 | EXISTS | — |
| Inspection | status | String | main | InvScore I4 (COMPLETED) | EXISTS | — |
| Inspection | completedAt | DateTime? | main | InvScore I4 (recency) | EXISTS | — |
| Inspection | score | Float? | main | KPI-6 (display) | EXISTS | — |
| Company | id | String | main | InvScore I3,I5 | EXISTS | — |
| Company | slug | String | main | (routing) | EXISTS | — |
| Company | verified | Boolean | main | InvScore I3 | EXISTS | — |
| Company | premium | Boolean | main | VIP eligibility | EXISTS | — |
| Company | viewCount | Int | main | KPI-5 (pre-migration proxy) | EXISTS | — |
| Company | avgRating | Float? | main | (display) | EXISTS | — |
| Company | reviewCount | Int | main | (display) | EXISTS | — |
| Company | logoUrl | String? | main | (display) | EXISTS | — |
| Company | coverImage | String? | main | (display) | EXISTS | — |
| Company | users | User[] | main | VIP eligibility (per-user sub) | EXISTS | — |
| Company | listings | Listing[] | main | InvScore I3,I5 (back-relation) | EXISTS | — |
| Company | documents | CompanyDocument[] | main | InvScore I5 | EXISTS | — |
| Company | storeSlug | String? | main | Showroom routing | MIGRATION | PR-SC-01 (note: `slug` already exists; `storeSlug` may be redundant — see F7) |
| Company | bannerUrl | String? | main | Showroom banner | MIGRATION | PR-SC-01 (note: `coverImage` already exists; `bannerUrl` may be redundant — see F7) |
| Company | brandColor | String? | main | Showroom branding | MIGRATION | PR-SC-01 |
| Company | storeDescription | String? | main | Showroom description | MIGRATION | PR-SC-01 |
| CompanyDocument | companyId | String | main | InvScore I5 | EXISTS | — |
| CompanyDocument | type | String | main | (display) | EXISTS | — |
| CompanyDocument | status | String | main | InvScore I5 (VERIFIED) | EXISTS | — |
| CompanyDocument | verifiedAt | DateTime? | main | (display) | EXISTS | — |
| Conversation | listingId | String? | main | KPI-7 (lead→reply join) | EXISTS | — |
| Conversation | participant1Id | String | main | KPI-7 | EXISTS | — |
| Conversation | participant2Id | String | main | KPI-7 (seller) | EXISTS | — |
| Conversation | lastMessageAt | DateTime? | main | KPI-7 (alt) | EXISTS | — |
| Message | conversationId | String | main | KPI-7 | EXISTS | — |
| Message | senderId | String | main | KPI-7 (seller reply) | EXISTS | — |
| Message | createdAt | DateTime | main | KPI-7 (response time) | EXISTS | — |
| Message | readAt | DateTime? | main | (display) | EXISTS | — |
| DealRoom | listingId | String | main | KPI-7 (alt reply channel) | EXISTS | — |
| DealRoom | sellerId | String? | main | KPI-7 | EXISTS | — |
| DealRoom | status | String | main | KPI-7 (AGREED/COMPLETED) | EXISTS | — |
| DealRoom | lastMessageAt | DateTime? | main | KPI-7 (alt) | EXISTS | — |
| DealMessage | dealRoomId | String | main | KPI-7 (alt) | EXISTS | — |
| DealMessage | senderRole | String | main | KPI-7 (alt) | EXISTS | — |
| DealMessage | createdAt | DateTime | main | KPI-7 (alt) | EXISTS | — |
| AnalyticsEvent | eventType | String | main | KPI-4 (LISTING_VIEW) | EXISTS | — |
| AnalyticsEvent | listingId | String? | main | KPI-4 | EXISTS | — |
| AnalyticsEvent | page | String? | main | KPI-5 (pre-migration proxy) | EXISTS | — |
| AnalyticsEvent | createdAt | DateTime | main | KPI-4,5 (window) | EXISTS | — |
| AIGatewayLog | taskType | String | main | KPI-8 (group by) | EXISTS | — |
| AIGatewayLog | model | String | main | KPI-8 (display) | EXISTS | — |
| AIGatewayLog | cost | Float? | main | KPI-8 (avg cost) | EXISTS | — |
| AIGatewayLog | tokensUsed | Int? | main | KPI-8 (display) | EXISTS | — |
| AIGatewayLog | success | Boolean | main | KPI-8 (failed-call cost) | EXISTS | — |
| AIGatewayLog | userId | String? | main | KPI-8 (seller scope) | EXISTS | — |
| AIGatewayLog | createdAt | DateTime | main | KPI-8 (window) | EXISTS | — |
| AISuggestion | aiGatewayLogId | String | main | KPI-8 (acceptance) | MIGRATION | new (PR-SC-11) |
| AISuggestion | status | String | main | KPI-8 (acceptance) | MIGRATION | new (PR-SC-11) |
| AISuggestion | decidedAt | DateTime? | main | KPI-8 | MIGRATION | new (PR-SC-11) |
| AISuggestion | decidedById | String? | main | KPI-8 | MIGRATION | new (PR-SC-11) |
| RFQ | id | String | main | KPI-4 (RFQ variant) | EXISTS | — |
| RFQ | buyerId | String? | main | KPI-4 (scope) | EXISTS | — |
| RFQ | buyerPhone | String | main | KPI-4 (scope) | EXISTS | — |
| RFQ | createdAt | DateTime | main | KPI-4 (window) | EXISTS | — |
| RFQ | listingId | String? | main | KPI-4 (exact conversion) | MIGRATION | not in PR-SC plan (follow-up) |
| PremiumSubscription | userId | String | main | VIP eligibility (F4) | EXISTS | — |
| PremiumSubscription | status | String | main | VIP eligibility | EXISTS | — |
| PremiumSubscription | expiresAt | DateTime? | main | VIP eligibility | EXISTS | — |
| SubscriptionPlan | companyPage | Boolean | main | VIP marker | EXISTS | — |
| User | id | String | main | scope | EXISTS | — |
| User | role | String | main | RBAC | EXISTS | — |
| User | companyId | String? | main | seller→company | EXISTS | — |
| User | premium | PremiumSubscription? | main | VIP eligibility | EXISTS | — |
| AuditLog | action | String | main | LeadScore override audit | EXISTS | — |
| AuditLog | entityType | String | main | LeadScore override audit | EXISTS | — |
| AuditLog | entityId | String? | main | LeadScore override audit | EXISTS | — |
| AuditLog | actorId | String? | main | LeadScore override audit | EXISTS | — |
| AuditLog | beforeJson | String? | main | LeadScore override audit | EXISTS | — |
| AuditLog | afterJson | String? | main | LeadScore override audit | EXISTS | — |
| AuditLog | createdAt | DateTime | main | LeadScore override audit | EXISTS | — |
| Showroom | companyId | String | main | KPI-5 | MIGRATION | PR-SC-02 |
| Showroom | isActive | Boolean | main | KPI-5 | MIGRATION | PR-SC-02 |
| Showroom | viewCount | Int | main | KPI-5 | MIGRATION | PR-SC-02 |
| ShowroomAnalytics | showroomId | String | main | KPI-5 | MIGRATION | ASC-074 (PR-SC-10) |
| ShowroomAnalytics | views | Int | main | KPI-5 | MIGRATION | ASC-074 (PR-SC-10) |
| ShowroomAnalytics | contactActions | Int | main | KPI-5 | MIGRATION | ASC-074 (PR-SC-10) |
| SalesTeamMember | id | String | main | KPI-7 | MIGRATION | PR-SC-02 |
| SalesTeamMember | companyId | String | main | KPI-7 | MIGRATION | PR-SC-02 |
| SalesTeamMember | userId | String? | main | KPI-7 | MIGRATION | PR-SC-02 |
| SalesTeamMember | name | String | main | KPI-7 | MIGRATION | PR-SC-02 |
| SalesTeamMember | role | String | main | KPI-7 | MIGRATION | PR-SC-02 |
| SalesTeamMember | isActive | Boolean | main | KPI-7 | MIGRATION | PR-SC-02 |

### 4.2 Store DB fields (cross-DB — flagged per ADR-003 §5)

| Model | Field | Type | DB | Used by | Status | Migration ref |
|---|---|---|---|---|---|---|
| Part | id | String | store | KPI-2b | EXISTS | — |
| Part | sku | String | store | KPI-2b (label) | EXISTS | — |
| Part | name | String | store | KPI-2b (label) | EXISTS | — |
| Part | active | Boolean | store | KPI-2b (filter) | EXISTS | — |
| Part | soldCount | Int | store | KPI-2b (filter) | EXISTS | — |
| Part | createdAt | DateTime | store | KPI-2b (DOM fallback) | EXISTS | — |
| Part | stock | Int | store | (future Part Catalog Score) | EXISTS | — |
| Part | images | String (JSON) | store | (future Part Catalog Score) | EXISTS | — |
| Part | partCatalogScore | Int? | store | (future Part Catalog Score) | MIGRATION | P2 follow-up (renamed from ADR-005 §5 `inventoryScore`) |
| Part | partCatalogScoreVersion | String? | store | (future Part Catalog Score) | MIGRATION | P2 follow-up |
| Part | oemNumber | String? | store | (future Part Catalog Score) | MIGRATION | P2 follow-up |
| Part | documents | (new relation) | store | (future Part Catalog Score) | MIGRATION | P2 follow-up |
| StockMovement | partId | String | store | (future Part Catalog Score: recent_movement) | EXISTS | — |
| StockMovement | balanceAfter | Int | store | (future Part Catalog Score: stock_accuracy) | EXISTS | — |
| StockMovement | createdAt | DateTime | store | (future Part Catalog Score: recent_movement) | EXISTS | — |
| InventoryBalance | partId | String | store | (future Part Catalog Score) | EXISTS | — |
| InventoryBalance | quantity | Int | store | (future Part Catalog Score) | EXISTS | — |
| InventoryBalance | reserved | Int | store | (future Part Catalog Score) | EXISTS | — |
| InventoryBalance | lowStockThreshold | Int | store | KPI-2b (low-stock) | EXISTS | — |

### 4.3 Migration dependency summary

| Migration | Unblocks | PR ref | ADR ref |
|---|---|---|---|
| `Lead.status` | KPI-3 (exact), LeadScore v1.1 L7 | PR-SC-01 / ASC-052 | ADR-005 §3 |
| `Lead.assignedToId`, `Lead.scoredAt` | KPI-7 (sales-team), LeadScore recalc | ASC-052 (add to PR-SC-01) | ADR-005 §3 |
| `Lead.score`, `Lead.scoreVersion`, `Lead.scoreBreakdown`, override fields | LeadScore v1 (cache + explain + override) | ASC-053 | Store Center Spec §7 |
| `Listing.inventoryScore` + version + scoredAt + breakdown (RELOCATED from Part) | Smart Inventory Score v1 | **PR-SC-03 REVISED** | ADR-005 §5 (must amend) |
| `MachinePassport` per-section verification fields + `passportScore` | KPI-6 (Passport Score) | PR-SC-03 (+ PR-SC-03a for score) | ADR-005 §6 (must correct F3) |
| `Showroom` model | KPI-5 | PR-SC-02 | ADR-005 §2 |
| `ShowroomAnalytics` model | KPI-5 (post-migration) | ASC-074 / new PR-SC-10 | Store Center Spec §9 |
| `SalesTeamMember` model | KPI-7 (sales-team perf) | PR-SC-02 | ADR-005 §4 |
| `AISuggestion` model | KPI-8 (acceptance rate) | new PR-SC-11 | (none — raise as new ADR) |
| `RFQ.listingId` FK | KPI-4 (exact RFQ conversion) | not in PR-SC plan (follow-up) | (none) |
| `Part.partCatalogScore` + `oemNumber` + `documents` relation | (future Part Catalog Score, P2) | P2 follow-up | ADR-005 §5 (renamed) |

**ADR corrections required (documentation only, this plan does not modify ADRs):**
1. **ADR-005 §5** must be amended: relocate `inventoryScore` from `Part` to `Listing`; rename Part-side score to `partCatalogScore`.
2. **ADR-005 §6** must be corrected: remove the false claim that `MachinePassport` already has `source`/`verification` fields (F3). All five Passport Score factors require migration.
3. **ADR-005 §1** must be corrected: `Company.logoUrl` and `Company.slug` already exist (F7); only `bannerUrl`, `brandColor`, `storeDescription`, `storeSlug` are genuinely new (and `bannerUrl` overlaps with `coverImage`, `storeSlug` overlaps with `slug` — owner should decide whether to reuse or add).

---

## 5. Validation Plan

Every KPI and score is validated before production. No sample numbers in production (hard rule): the dashboard feeds from real data, validated against real data.

### 5.1 Lead Score v1 — validation

| Layer | What | How | Acceptance |
|---|---|---|---|
| Unit (pure function) | `src/lib/scoring/lead-score.ts` | Vitest golden dataset: 50 hand-crafted leads covering each factor's boundary values (e.g., note of exactly 20 chars → L3=4; note of 21 chars → L3=7). One assertion per factor boundary + one per full-score lead + one per zero-score lead. | 100% line coverage; every factor boundary has ≥1 test; golden JSON breakdowns committed and diffed. |
| Unit (determinism) | same function | Run the same 50 leads twice; assert byte-identical `score` + `scoreBreakdown`. | Zero diff. |
| Unit (override) | override flow | Test that an override writes `scoreVersion="v1-override"`, preserves original in breakdown, and that a revert restores the computed value. | Override + revert round-trip restores original score. |
| Integration (DB) | recalc triggers | Real PostgreSQL; insert a lead → assert `score` populated; edit `note` → assert `score` updated; run nightly batch → assert stale scores refreshed. | Triggers fire within 1s of mutation; batch completes <60s for 10k leads. |
| Integration (audit) | override audit | Override a lead → assert `AuditLog` row with `action="lead.score-override"`, `beforeJson`/`afterJson` correct, atomic with the Lead update. | Atomicity test per ADR-003 §6 (mutation+audit both commit or both roll back). |
| Security (RBAC) | cross-seller isolation | Seller A tries to read Seller B's lead score → 403. Seller A tries to override Seller B's lead → 403 + audit. | Zero cross-seller leaks; extend `tests/security/permissions.test.ts`. |
| Baseline capture | pre-period | Before enabling the score in the CRM UI, capture 30 days of historical leads and compute what the score WOULD have been. Persist the distribution (median, p90, top-10 overlap with actual closed deals) as the v1 baseline. | Baseline report committed; future algorithm changes (v1.1, ML) must beat this baseline (§2.8). |
| Golden dataset | explainability | 10 leads with hand-written expected reason strings; assert the generated reason string matches exactly. | 10/10 match; CI fails on any drift. |

### 5.2 Smart Inventory Score v1 — validation

| Layer | What | How | Acceptance |
|---|---|---|---|
| Unit (pure function) | `src/lib/scoring/inventory-score.ts` | Vitest golden dataset: 40 hand-crafted listings covering each factor's tiers (e.g., 5 images → I2=15; 4 images → I2=10; category with 0 required attrs → I1=25). | 100% line coverage; every factor tier has ≥1 test. |
| Unit (cross-DB isolation) | function does NOT touch store DB | Static analysis / test mock: assert the function only calls `db` (main client), never `storeDb`. | Zero `storeDb` references in the scoring module. |
| Unit (determinism) | same function | Run twice on the same listing; assert byte-identical output. | Zero diff. |
| Integration (DB) | recalc triggers | Real PostgreSQL; create a `ListingAttributeValue` → assert `inventoryScore` updated; flip `Company.verified` → assert all company's listings refreshed; complete an `Inspection` → assert listing refreshed. | Triggers fire within 1s; company-batch <30s for 1k listings. |
| Integration (public visibility) | field policy | GET public listing API → assert `inventoryScore` is NOT in the response. GET seller API → assert it IS. | Public response stripped; extend `tests/security/field-policy.test.ts`. |
| Integration (audit) | manual recompute | Admin clicks "recompute" → assert `AuditLog` row with `action="listing.inventory-score-recompute"`. | Audit row co-committed. |
| Security (RBAC) | cross-seller isolation | Seller A cannot read Seller B's `inventoryScore`. | Zero cross-seller leaks. |
| Baseline capture | pre-period | Before enabling the score badge in the seller dashboard, compute the score for all existing listings. Persist the distribution (histogram, median, p90) as the v1 baseline. | Baseline report committed; future algorithm changes must be compared against this baseline. |
| Golden dataset | explainability | 10 listings with hand-written expected reason strings (including the "highest-leverage missing factor" recommendation). | 10/10 match. |
| Cross-DB validation | ADR-003 §5 compliance | Test that the seller dashboard query plan does NOT issue any cross-DB JOIN. Use query-log inspection in CI. | Zero cross-DB JOINs in dashboard queries. |

### 5.3 KPI validation (per KPI)

| KPI | Unit | Integration | Baseline | Acceptance |
|---|---|---|---|---|
| KPI-1 | spec-completeness fill-rate calculation (pure) | real `Listing` + `CategoryAttribute` + `ListingAttributeValue`; listing with no category → excluded | 30-day historical fill-rate distribution persisted | rate ∈ [0,1]; division-by-zero returns null, not NaN |
| KPI-2 | DOM calc (publishedAt fallback to createdAt) | real listings; sold listing excluded | 30-day DOM distribution | median + p90 match a hand-computed sample of 100 listings |
| KPI-2b | (store) Part slow-moving | real store DB; ⚠ separate query from KPI-2 | 30-day | cross-DB isolation test: KPI-2 query never touches store DB and vice versa |
| KPI-3 | new/qualified/un-followed-up bucket logic | real leads; pre-migration uses Conversation-join approximation, post-migration uses `Lead.status` | 30-day lead-volume baseline | "un-followed-up" count matches a hand-audited sample of 50 leads |
| KPI-4 | conversion rate (division-by-zero → null) | real `AnalyticsEvent` + `Lead`; RFQ variant labeled "approximate" | 30-day pre-period captured before any optimization claim | no "X% increase" claim without baseline citation (hard rule) |
| KPI-5 | (blocked) — when `Showroom` ships: view count, contact-action count | real `ShowroomAnalytics` | first 30 days post-launch | VIP-lapsed window truncation test |
| KPI-6 | Passport docCount; Passport Score (post-migration) | real `MachinePassport` + `PassportEvent` | n/a (snapshot) | public API never exposes per-section status (only binary badge) |
| KPI-7 | response-time median (excludes unresponded); sales-team grouping (post-migration) | real `Lead` + `Message`; alt `DealMessage` | 30-day response-time distribution | unresponded leads excluded from median (NOT averaged as 0) |
| KPI-8 | cost-per-task groupBy; acceptance rate (post-migration) | real `AIGatewayLog`; `cost IS NULL` excluded | 30-day cost baseline | failed calls still counted in cost; acceptance denominator=0 → null |

### 5.4 Production-readiness gates (all must pass before dashboard ships)

1. **No sample numbers in production.** Every KPI card renders from a real DB query. CI test: monkey-patch the stats endpoint to return a sentinel; assert the dashboard renders the sentinel (not a hardcoded mock). Sentinel = `NaN`-like marker; if the dashboard renders a "good-looking" number when the backend returns the sentinel, the test fails.
2. **No target without baseline.** Any dashboard card that shows "target: X" or "increase by Y%" must cite a persisted baseline row (KpiBaseline table or `Setting` key). CI test: a card with a target but no baseline row → fail.
3. **Cross-DB isolation.** Dashboard query log shows zero cross-DB JOINs (ADR-003 §5). CI test: query-log inspection.
4. **Field policy.** Public API responses strip all scoring fields. CI test extends `tests/security/field-policy.test.ts`.
5. **RBAC.** Cross-seller reads return 403 + audit. CI test extends `tests/security/permissions.test.ts`.
6. **Audit.** Every score mutation (compute, override, revert, recompute) writes an `AuditLog` row. CI test: score mutation with audit disabled → mutation rolled back (atomicity per ADR-003).
7. **Explainability.** Every score has a `scoreBreakdown` JSON; UI renders it; reason string matches golden dataset.
8. **Performance.** Dashboard p95 < 1.2s for a seller with 1k listings and 10k leads (per ASC-030 acceptance). Load test in CI.
9. **Baseline capture report.** Committed to `docs/product/STORE-ANALYTICS-BASELINE-V1.md` (to be created at first production run) — documents the measured distribution of every KPI and score at launch, so future changes have a comparison point.

---

## Appendix A — Fields Requiring Migration (consolidated list)

13 fields/models require migration before this plan is fully computable. Grouped by unblocking PR:

| # | Field / Model | Model | DB | Unblocking PR | Used by |
|---|---|---|---|---|---|
| 1 | `Lead.status` | Lead | main | PR-SC-01 / ASC-052 | KPI-3, LeadScore v1.1 |
| 2 | `Lead.assignedToId` | Lead | main | ASC-052 (add to PR-SC-01) | KPI-7 |
| 3 | `Lead.scoredAt` | Lead | main | ASC-052 | LeadScore recalc |
| 4 | `Lead.score` | Lead | main | ASC-053 | LeadScore cache |
| 5 | `Lead.scoreVersion` | Lead | main | ASC-053 | LeadScore version |
| 6 | `Lead.scoreBreakdown` | Lead | main | ASC-053 | LeadScore explain |
| 7 | `Lead.scoreOverride{ById,Reason,Note,At}` (4 fields) | Lead | main | ASC-053 ext | LeadScore override |
| 8 | `Listing.inventoryScore` | Listing | main | **PR-SC-03 REVISED** (relocated from Part) | InvScore cache |
| 9 | `Listing.inventoryScoreVersion` | Listing | main | PR-SC-03 revised | InvScore version |
| 10 | `Listing.inventoryScoredAt` | Listing | main | PR-SC-03 revised | InvScore recalc |
| 11 | `Listing.inventoryScoreBreakdown` | Listing | main | PR-SC-03 revised | InvScore explain |
| 12 | `MachinePassport.specsVerifiedAt/By` (2 fields) | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score |
| 13 | `MachinePassport.ownershipVerifiedAt/By` (2 fields) | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score |
| 14 | `MachinePassport.inspectionVerifiedAt/By` (2 fields) | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score |
| 15 | `MachinePassport.serviceHistoryVerifiedAt/By` (2 fields) | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score |
| 16 | `MachinePassport.passportScore` | MachinePassport | main | PR-SC-03 or PR-SC-03a | KPI-6 cache |
| 17 | `MachinePassport.passportScoreVersion` | MachinePassport | main | PR-SC-03 or PR-SC-03a | KPI-6 version |
| 18 | `Showroom` model (new) | Showroom | main | PR-SC-02 | KPI-5 |
| 19 | `ShowroomAnalytics` model (new) | ShowroomAnalytics | main | ASC-074 / new PR-SC-10 | KPI-5 |
| 20 | `SalesTeamMember` model (new) | SalesTeamMember | main | PR-SC-02 | KPI-7 |
| 21 | `AISuggestion` model (new) | AISuggestion | main | new PR-SC-11 | KPI-8 acceptance |
| 22 | `RFQ.listingId` FK | RFQ | main | follow-up (not in PR-SC plan) | KPI-4 exact conversion |
| 23 | `Part.partCatalogScore` + `partCatalogScoreVersion` | Part | store | P2 follow-up (renamed from ADR-005 §5) | future Part Catalog Score |
| 24 | `Part.oemNumber` | Part | store | P2 follow-up | future Part Catalog Score |
| 25 | `Part.documents` relation (new) | Part | store | P2 follow-up | future Part Catalog Score |
| 26 | `Company.bannerUrl` / `brandColor` / `storeDescription` / `storeSlug` | Company | main | PR-SC-01 (note overlaps with existing `coverImage`/`slug` — F7) | Showroom branding |

**Count of distinct migration items:** 26 (counting each new field and each new model as one item).

**ADR corrections required (no code, no migration — documentation only):**
1. ADR-005 §5 — relocate `inventoryScore` from `Part` to `Listing`; rename Part-side to `partCatalogScore`.
2. ADR-005 §6 — remove false claim that `MachinePassport` has `source`/`verification` (F3).
3. ADR-005 §1 — note that `Company.logoUrl` and `Company.slug` already exist; only `bannerUrl`/`brandColor`/`storeDescription`/`storeSlug` are new (and overlap with `coverImage`/`slug`).

---

## Appendix B — Hard-rule compliance checklist

| Hard rule | Compliance |
|---|---|
| No target number without a baseline definition | ✅ KPI-4 conversion rate cites a 30-day pre-period baseline; §5.4 gate #2 enforces in CI; no "increase by X%" claim appears anywhere in this document. |
| Dashboard must feed from REAL data | ✅ §5.4 gate #1 (sentinel test) enforces; no sample numbers in any KPI formula. |
| Every formula references a REAL field | ✅ Data dictionary §4 maps every field; 26 items marked `MIGRATION` with explicit PR refs. |
| Cross-DB queries flag the ADR-003 limitation | ✅ KPI-2b marked `⚠ CROSS-DB`; §3.1 documents the cross-DB implication for the Smart Inventory Score; §5.2 includes a cross-DB isolation test. |
| Do NOT modify code, schema, or PRs | ✅ This document is documentation only. ADR corrections are listed as **recommendations** in Appendix A, not applied. |

---

**End of document.**
