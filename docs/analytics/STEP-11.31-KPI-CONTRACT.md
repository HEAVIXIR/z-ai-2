# HEAVIX — STEP 11.31 KPI Contract + Lead Score v1 Validation

> **Status:** SPECIFICATION (documentation only). No code, schema, migration, or PR changes.
> **Task ID:** 11.31-/analyst
> **Baseline:** `main` `f597562` (post PR #9 + PR #10 merge — PR-SC-01 is on `main`).
> **Author:** /analyst agent
> **Companion docs:**
> - `docs/product/STORE-ANALYTICS-BI.md` (STEP 11.29-A — original 9-KPI dictionary; this doc is a **delta** on top of it, not a replacement).
> - `docs/ADR-003-audit-transactionality.md` §5 (cross-DB limitation).
> - `docs/ADR-005-store-center-architecture.md` + `docs/ADR-005-amendment-01.md`.
> - `src/lib/crm/lead-score.ts` (Lead Score v1 implementation, PR #9).
> - `tests/unit/lead-score.test.ts` (40 unit tests pinning v1).
> - `src/lib/crm/lead-status.ts` (5-state pipeline + fail-closed transitions).
> - `prisma/schema.prisma` (main DB) + `prisma/store-schema.prisma` (store DB).
>
> **Mission of this document:** (1) validate Lead Score v1 against the actual implementation now that PR-SC-01 is on `main`; (2) define each dashboard KPI end-to-end (formula, data source, time window, permission filter, missing-data handling, owner); (3) enumerate exactly which KPIs are computable today vs which require new tracking; (4) mandate a 30-day baseline before any growth claim. Every formula references a REAL field. Fields that do not exist are marked `REQUIRES MIGRATION (PR-SC-XX)`.

---

## 0. Schema-Grounding Preface (verified facts on `main` `f597562`)

This document supersedes the field-status table in `STORE-ANALYTICS-BI.md` §4 **only with respect to Lead Score fields**, which PR-SC-01 (PR #9, merged `c66e060`) made real. All other field statuses are unchanged. The following facts were re-verified by reading `prisma/schema.prisma` line-by-line against the PR-SC-01 merge and the live `lead-score.ts` / `lead-score.test.ts`:

| # | Fact | Verified at |
|---|---|---|
| G1 | `Lead.status String @default("NEW")` EXISTS on `main`. Allowed values `NEW\|CONTACTED\|QUALIFIED\|CLOSED\|LOST` enforced app-layer via `src/lib/crm/lead-status.ts`. Index `@@index([status])`. | `schema.prisma:634` |
| G2 | `Lead.assignedToId String?` EXISTS, with `Lead.assignedTo User? @relation("LeadAssignee")` + `@@index([assignedToId])`. Used for sales-team follow-up assignment. | `schema.prisma:637-638, 656` |
| G3 | `Lead.score Int?`, `Lead.scoreVersion String?`, `Lead.scoreBreakdown Json?`, `Lead.scoredAt DateTime?` ALL EXIST. Cached fields for the v1 algorithm. | `schema.prisma:642-645` |
| G4 | `Lead.scoreOverrideById/Reason/Note/At` ALL EXIST (human override path, audited). `scoreOverrideBy User?` back-relation. Setting any override flips `scoreVersion` to `"v1-override"`. | `schema.prisma:649-653` |
| G5 | `Lead.leadType` is still a free `String` (no DB enum). v1 implementation `toUpperCase()`'s it and looks up `LEAD_TYPE_WEIGHTS`; unknown types fall to floor 5. | `schema.prisma:622`, `lead-score.ts:40-48, 175` |
| G6 | `Lead.listingId String` (cascade) is the ONLY path to seller. There is still no `Lead.sellerId` direct FK. Seller scoping MUST traverse `Lead.listing.sellerId`. | `schema.prisma:620-621` |
| G7 | `Listing.viewCount Int @default(0)` + `Listing.favoriteCount Int @default(0)` are **denormalized lifetime counters** (not event logs). For windowed view analytics use `AnalyticsEvent` (`eventType='LISTING_VIEW'`). | `schema.prisma:462-463`, `schema.prisma:2255-2276` |
| G8 | `AnalyticsEvent` EXISTS with `eventType`, `userId?`, `listingId?`, `categoryId?`, `brandId?`, `query?`, `page?`, `referrer?`, `ip?`, `userAgent?`, `metadata?` (JSON as `String?`), `createdAt`. Canonical event-type set in `src/lib/analytics.ts:40-52`: `LISTING_VIEW \| SEARCH \| CLICK \| FAVORITE \| COMPARE \| CONTACT \| SHARE \| REGISTER \| LOGIN \| LISTING_CREATE \| OFFER_MAKE`. | `schema.prisma:2255-2276`, `analytics.ts:40-52` |
| G9 | `AIGatewayLog` EXISTS with `taskType String`, `model String`, `input?`, `output?`, `latencyMs Int?`, `tokensUsed Int?`, `cost Float?`, `success Boolean @default(true)`, `error String?`, `userId String?`, `createdAt`. **No accept/reject tracking** — suggestion acceptance is NOT measurable today. | `schema.prisma:757-772` |
| G10 | `MachinePassport` has only `serialNumber?`, `inspectionDate?`, `inspectionResult?`, `events PassportEvent[]`. Per-section verification fields (`specsVerifiedAt/By`, etc.) and `passportScore`/`passportScoreVersion` DO NOT EXIST. (Same as F3 in `STORE-ANALYTICS-BI.md` — confirmed still true on `f597562`.) | `schema.prisma:1180-1202` |
| G11 | `Showroom` + `ShowroomAnalytics` models DO NOT EXIST. KPI-5 remains blocked at PR-SC-02 + ASC-074. | (absent from `schema.prisma`) |
| G12 | `SalesTeamMember` model DOES NOT EXIST. KPI-7 sales-team grouping uses `Lead.assignedToId` → `User` (works today) but a dedicated `SalesTeamMember` model is still PR-SC-02. | (absent from `schema.prisma`) |
| G13 | `AISuggestion` model DOES NOT EXIST. KPI-8 suggestion-acceptance component is blocked. | (absent from `schema.prisma`) |
| G14 | `RFQ` EXISTS with `buyerName?`, `buyerPhone String`, `buyerEmail?`, `buyerId String?`, `machineType?`, `brandPref?`, `quantity Int`, `budgetMin?`, `budgetMax?`, `status String`, `createdAt`. **No `RFQ.listingId` FK** — RFQ→listing conversion is approximate (free-text `machineType`/`brandPref` match only). | `schema.prisma:864-893` |
| G15 | `Conversation` has `participant1Id`, `participant2Id`, `listingId?`, `lastMessageAt?`. `Message` has `senderId`, `conversationId`, `createdAt`, `readAt?`. **There is no `Conversation.buyerId` / `Conversation.sellerId`** — the two participants are positional (participant1/participant2) and which one is the seller must be inferred from `Conversation.listing.sellerId` membership. | `schema.prisma:2211-2247` |
| G16 | `Deal` EXISTS with `sourceType` (`LISTING_OFFER \| RFQ_QUOTE \| DEAL_ROOM`), `sourceId`, `buyerId?`, `sellerId?`, `listingId?`, `status String @default("DRAFT")` (lifecycle: `DRAFT → PENDING_CONFIRMATION → CONFIRMED → IN_PROGRESS → COMPLETED`; terminal: `CANCELLED, DISPUTED, EXPIRED`), `agreedAt?`, `confirmedAt?`, `completedAt?`, `cancelledAt?`. **No `Deal.leadId` FK** — lead→deal join is reconstructed via `Lead.listingId → Deal.listingId` (approximate; multiple leads may map to one deal). | `schema.prisma:2378-2418` |
| G17 | `ListingAttributeValue` EXISTS with `sourceType?`, `confidence?`, `verifiedAt?`, `verifiedBy?` provenance. Spec-completeness is computable today from `CategoryAttribute.required` × filled `ListingAttributeValue` rows. | `schema.prisma:365-392` |
| G18 | `Setting` model EXISTS (`key String @id`, `value String`) — can store JSON-encoded baseline snapshots WITHOUT migration. A dedicated `KpiBaseline` table would be cleaner but is NOT required for v1 (see §8). | `schema.prisma:1680-1683` |
| G19 | `Part` lives in **store-schema** (`storeDb`), `Listing` lives in **main schema** (`db`). Cross-DB JOIN and cross-DB transactions are NOT supported. Any KPI mixing both must run two queries and merge at the service layer (`⚠ CROSS-DB (ADR-003 §5)`). | `store-schema.prisma:123-165`, `schema.prisma:444-533`, `ADR-003 §5` |
| G20 | `/api/listing-completeness` route EXISTS and implements a 10-item checklist (image, price, brand, category, description>50ch, year, workingHours, sellerPhone, specs, verified) → 0-100. This is the **de facto Listing Quality Score v0**. The Store Center spec §5.2 / `STORE-ANALYTICS-BI.md` §3 I1–I6 score is a richer superset not yet implemented. | `src/app/api/listing-completeness/route.ts` |

---

## 1. Lead Score v1 — Validation Against Implementation

### 1.1 Status

**Lead Score v1 is VALID.** The implementation (`src/lib/crm/lead-score.ts`, 227 lines, merged on `main` via PR #9 / commit `c66e060`) satisfies every design constraint from STEP 11.29 /analyst + /ceo directives: deterministic, versioned, explainable, clamped, pure-function (no DB / no I/O), permitted-data-only. The 40 unit tests in `tests/unit/lead-score.test.ts` pin every factor weight, every factor boundary, the clamping range, the version string, and the band thresholds; there is no test drift.

### 1.2 Algorithm extracted from the implementation (verbatim weights)

```
score = clamp( L1 + L2 + L3 + L4 + L5 + L6 , 0, 100 )
version = "v1"
```

| # | Factor | Weight | Input field(s) | Tiered logic (points) |
|---|---|---|---|---|
| L1 | leadType intent | 35 | `Lead.leadType` (String, upper-cased) | `OFFER=35` · `CALL=28` · `MESSAGE=22` · `CONTACT=18` · `FAVORITE=10` · `VIEW=5` · unknown→floor `5` (case-insensitive lookup) |
| L2 | recency | 20 | `Lead.createdAt` (DateTime) vs `now` | `≤24h=20` · `24–72h=15` · `3–7d=10` · `8–30d=5` · `>30d=0` |
| L3 | note engagement | 10 | `Lead.note` (String?, trimmed length) | null/whitespace-only=0 · `1–20ch=4` · `21–100ch=7` · `>100ch=10` |
| L4 | repeat buyer | 10 | `Lead.viewerPhone` (String?) — caller computes `viewerLeadCountForSeller` (count of leads by same phone on this seller's listings) | `≤1=4` · `2–3=7` · `≥4=10` |
| L5 | price band | 15 | `Lead.listing.price` (BigInt → number) + caller-computed `sellerPriceQuartiles { q1, q3 }` (from seller's PUBLISHED listings) | hidden/neutral=8 · no-quartile-data=8 · `≥Q3=15` · `Q1..Q3=10` · `<Q1=5` |
| L6 | listing heat | 10 | `Lead.listing.viewCount` (Int) + `Lead.listing.favoriteCount` (Int) | `views>100 OR fav>10=10` · `views>20=6` · else=3 |
| | **Total** | **100** | | clamped to `[0, 100]` |

Band label (UI badge): `≥70 = HOT` · `40–69 = WARM` · `<40 = COLD`.

### 1.3 Design-constraint validation

| Constraint | Required | Implementation evidence | Verdict |
|---|---|---|---|
| **Deterministic** | same input → same score, no RNG | `computeLeadScore` is a pure function; `now` is injectable (`input.now ?? new Date()`) so tests pin time. No Math.random, no Date.now dependency on the hot path. | ✅ PASS |
| **Versioned** | score carries a version tag; bump on weight change | `LEAD_SCORE_VERSION = "v1"` exported; `LeadScoreResult.version = LEAD_SCORE_VERSION`. Cached scores invalidated by version mismatch (`Lead.scoreVersion != "v1"` → recompute). Override path writes `"v1-override"`. | ✅ PASS |
| **Explainable** | per-factor breakdown + human reason string | `LeadScoreResult.breakdown: LeadScoreFactor[]` with `{factor, points, max, detail}` for all 6 factors; `reason` string lists the top-2 contributing factors by `points/max` ratio. | ✅ PASS |
| **Clamped** | score ∈ [0, 100] | `clamp(raw, 0, 100)` at `lead-score.ts:205`. Max-input test → 100; min-input test → ≥0. | ✅ PASS |
| **Pure function (no DB / no I/O)** | module never reads/writes DB | `lead-score.ts` has zero Prisma imports. Caller (PR-SC-06 recalc job, not yet shipped) assembles input + persists result. | ✅ PASS |
| **Permitted-data-only** | every input field is seller-owned | L1–L6 all come from `Lead` + its `Listing` — both owned by the seller via `Lead.listing.sellerId`. No cross-seller data, no PII inference. | ✅ PASS |
| **No mutation of factor inputs** | override ≠ data edit | Override writes `Lead.score` + `scoreVersion="v1-override"` + `scoreBreakdown = {overridden:true, originalScore, originalVersion, reason, note}`. Underlying factor inputs untouched; a recompute without override restores the computed value. | ✅ PASS |
| **Fail-closed on unknown** | unknown leadType never inflates score | `LEAD_TYPE_WEIGHTS[unknown] ?? LEAD_TYPE_FLOOR (5)` — a new leadType defaults to the VIEW floor, never 0 and never > VIEW. | ✅ PASS |
| **Audit-traceable override** | override writes AuditLog (atomic) | Override fields (`scoreOverrideById/Reason/Note/At`) + `Lead.scoreOverrideBy User` back-relation exist. The PATCH handler (PR-SC-06) must call `auditMutationTransactional` per ADR-003 §2. (Handler not yet shipped — see §1.5.) | ✅ SCHEMA READY, handler pending |

### 1.4 Cross-check against `tests/unit/lead-score.test.ts` (40 tests)

Every weight and boundary is pinned by an explicit assertion. No test drift was found:

- **L1 (6 cases + 2 edge):** OFFER=35, CALL=28, MESSAGE=22, CONTACT=18, FAVORITE=10, VIEW=5; case-insensitive (`"offer"` → 35); unknown `"WIDGET"` → 5 (floor).
- **L2 (5 boundaries):** ≤24h=20, 24–72h=15, 3–7d=10, 8–30d=5, >30d=0.
- **L3 (5 boundaries):** null=0, whitespace-only=0, ≤20ch=4, 21–100ch=7, >100ch=10.
- **L4 (3 tiers):** ≤1=4, 2–3=7, ≥4=10.
- **L5 (5 tiers):** hidden=8, no-quartile=8, ≥Q3=15, Q1..Q3=10, <Q1=5.
- **L6 (4 tiers):** views>100 OR fav>10=10, fav>10 (alone)=10, views>20=6, else=3.
- **Clamping/structure (5 tests):** all-maxed → 100; min-input → ≥0; version === "v1"; breakdown has exactly 6 factors each with `{factor, points, max, detail}` and `0 ≤ points ≤ max`; reason string contains the score + "v1".
- **Determinism (2 tests):** identical input → identical `score` + `breakdown` + `reason`; `now` override works (fresh lead scores higher than stale lead).
- **Band (3 tests):** ≥70 → HOT, 40–69 → WARM, <40 → COLD.

### 1.5 Are all 6 factors computable from real data today?

**Yes — all 6 factors map to fields that exist on `main` `f597562`.** No v1 factor requires migration.

| Factor | Caller-side computation (PR-SC-06 recalc job, not yet shipped) | Real-field source | Migration? |
|---|---|---|---|
| L1 | read `Lead.leadType` | `schema.prisma:622` | NONE |
| L2 | read `Lead.createdAt`, compute `ageDays = (now - createdAt) / 86400_000` | `schema.prisma:626` | NONE |
| L3 | read `Lead.note`, `trim().length` | `schema.prisma:625` | NONE |
| L4 | `db.lead.count({ where: { viewerPhone: lead.viewerPhone, listing: { sellerId: lead.listing.sellerId } } })` | `Lead.viewerPhone` (`schema.prisma:623`) + `Lead.listing.sellerId` (`schema.prisma:489`) | NONE — but see caveat below |
| L5 | convert `Listing.price BigInt → number`; compute seller price quartiles from `db.listing.findMany({ where: { sellerId, status: 'PUBLISHED' }, select: { price } })` | `Listing.price` (`schema.prisma:450`), `Listing.sellerId` | NONE |
| L6 | read `Listing.viewCount`, `Listing.favoriteCount` | `schema.prisma:462-463` | NONE |

**L4 caveat (data-quality, not a migration blocker):** `Lead.viewerPhone` is `String?` (nullable). A lead with no phone (anonymous web form) returns `count=0` from the L4 lookup, which the algorithm maps to "≤1 → 4 pts" — i.e., an anonymous lead gets the same L4 score as a first-time buyer. This is **intentional and safe** (anonymous leads never earn the repeat-buyer bonus), but the dashboard should surface `anonymousLeadCount` as a data-quality warning so the seller understands why a hot-looking lead didn't get the L4 boost.

### 1.6 Lead Score v1 — issues found

**None blocking.** Two non-blocking observations:

1. **Recalc job not yet shipped.** `lead-score.ts` is a pure function; the recalc job that assembles inputs + persists `Lead.score/scoreVersion/scoreBreakdown/scoredAt` is PR-SC-06 (not yet opened). Until PR-SC-06 ships, the cached `Lead.score` columns are populated only by tests — production leads have `Lead.score = NULL`. The dashboard must render `score = NULL` as "score not yet computed" (not 0).
2. **v1.1 L7 pipeline-stage bonus deferred (still correct).** `STORE-ANALYTICS-BI.md` §2.2 documents a v1.1 extension: `+10 if status=QUALIFIED, +5 if status=CONTACTED, 0 otherwise`. The shipped v1 does NOT include L7. This is consistent with the doc's "v1.1 (deferred)" label. `Lead.status` now EXISTS (G1), so v1.1 is technically unblocked; the deferral is a roadmap decision, not a schema blocker.

### 1.7 Override audit path (schema-ready, handler pending)

`Lead.scoreOverrideById/Reason/Note/At` (G4) are wired to `User` via the `LeadScoreOverride` relation. The override flow (modal → enum reason → manual score → `auditMutationTransactional`) requires the PR-SC-06 PATCH handler. Until PR-SC-06 ships, **there is no API path to write an override**; the columns sit unused. This is the same gap as the recalc job — both ship together in PR-SC-06.

---

## 2. Dashboard KPI Dictionary (8 KPIs)

Each KPI below specifies the six required attributes: **formula** (real Prisma query shape), **data source** (model + field + DB), **time window**, **permission filter**, **missing-data handling**, **data owner**. Every field referenced is real on `main` `f597562`; fields requiring migration are explicitly marked `REQUIRES MIGRATION (PR-SC-XX)`.

KPIs marked `⚠ CROSS-DB` require multi-query service-layer merge per ADR-003 §5 (no cross-DB JOIN, no cross-DB transaction). KPIs marked `🚧 BLOCKED` cannot be computed today because a required model/field does not exist.

### KPI-1 — Active listings + spec-completeness rate

| Attribute | Value |
|---|---|
| **Definition** | Count of currently-published seller listings + the fill-rate of *required* category attributes across those listings. |
| **Formula (Prisma shape, main DB)** | `activeCount = db.listing.count({ where: { status: 'PUBLISHED', sellerId: <scope> } })` <br/> For each active listing: <br/> `requiredAttrs = db.categoryAttribute.findMany({ where: { categoryId: listing.categoryId, required: true } })` <br/> `filledAttrs = db.listingAttributeValue.count({ where: { listingId, attributeId: { in: requiredAttrIds }, OR: [{ textValue: { not: null } }, { numberValue: { not: null } }, { booleanValue: { not: null } }, { dateValue: { not: null } }, { optionId: { not: null } }] } })` <br/> `listingFillRate = requiredAttrs.length === 0 ? 1 : filledAttrs / requiredAttrs.length` <br/> `specCompletenessRate = activeCount === 0 ? null : count(listings where listingFillRate === 1) / activeCount` |
| **Data source** | `Listing` (main, `schema.prisma:444`), `ListingAttributeValue` (main, `schema.prisma:365`), `CategoryAttribute` (main, `schema.prisma:350`), `AttributeDefinition` (main, `schema.prisma:316`) |
| **Time window** | Snapshot for the rate; 30-day rolling for trend (`publishedAt >= now() - 30d`). |
| **Permission filter** | `ADMIN`: all listings. `SELLER`/`VIP_DEALER`: `sellerId = session.user.id`. Public buyers: not exposed (only binary `Listing.verified` badge is public). Enforced by tenant-scope (PR-SC-00 / `src/lib/admin/tenant-scope.ts`). |
| **Missing-data handling** | Listing with no `categoryId` → excluded from denominator, counted in `uncategorizedCount` (data-quality warning). Category with zero required attrs → treated as 100% complete (vacuously true; counted in numerator). Division-by-zero (seller has 0 active listings) → KPI returns `null`, UI shows "no listings yet". |
| **Owner role** | Catalog Manager (rate) + BI Engineer (trend). Consumers: Seller, Admin. |
| **Migration needed** | **NONE — fully computable today.** |
| **Capability ref** | ASC-010, ASC-011, ASC-032. |

### KPI-2 — Slow-moving inventory + days-on-market

| Attribute | Value |
|---|---|
| **Definition** | For **machine listings** (main DB): listings still `PUBLISHED` past a threshold with no `soldAt`. Days-on-market (DOM) = `now() - publishedAt` (fallback `createdAt`). For store-DB Parts, see KPI-2b below (separate KPI, cross-DB). |
| **Formula (Prisma shape, main DB)** | `slowMoving = db.listing.findMany({ where: { status: 'PUBLISHED', soldAt: null, publishedAt: { lt: new Date(now() - 90*86400_000) }, sellerId: <scope> }, select: { id: true, title: true, publishedAt: true, createdAt: true, viewCount: true, favoriteCount: true } })` <br/> `daysOnMarket = list.map(l => Math.floor((now - (l.publishedAt ?? l.createdAt)) / 86400_000))` <br/> Aggregates: `median(daysOnMarket)`, `p90(daysOnMarket)`, `count(daysOnMarket > 180)`. |
| **Data source** | `Listing` (main, `schema.prisma:444-533`). Fields: `status`, `soldAt`, `publishedAt`, `createdAt`, `viewCount`, `favoriteCount`, `sellerId`. |
| **Time window** | Snapshot; bucketed into 0–30 / 31–90 / 91–180 / >180 day bands. |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: `sellerId = session.user.id`. |
| **Missing-data handling** | `publishedAt` null → fall back to `createdAt`, flag `publishedAtMissing=true` (data-quality warning). `soldAt` set → excluded (sold, not slow). `status='DRAFT'`/`'REJECTED'` → excluded. |
| **Owner role** | Catalog Manager. Consumers: Seller, Admin. |
| **Migration needed** | **NONE.** |
| **Capability ref** | ASC-030, ASC-082. |

> **KPI-2b — Slow-moving Parts (store DB, separate KPI).** `⚠ CROSS-DB (ADR-003 §5)`.
> Formula (store DB): `storeDb.part.findMany({ where: { active: true, soldCount: 0, createdAt: { lt: now() - 90*86400_000 } }, select: { id: true, sku: true, name: true, createdAt: true, soldCount: true, stock: true } })`. DOM for Parts is approximated by `now() - Part.createdAt` (no `publishedAt` on Part). The seller dashboard MUST issue two separate queries (one per Prisma client) and merge client-side or service-layer. No cross-DB JOIN, no cross-DB transaction (ADR-003 §5). Migration candidate (P2): `Part.firstListedAt` for a cleaner DOM metric — `REQUIRES MIGRATION (P2 follow-up, not in PR-SC plan)`.

### KPI-3 — New / qualified / un-followed-up leads count

| Attribute | Value |
|---|---|
| **Definition** | Three lead-pipeline counts for the seller's listings: **new** (status `NEW`), **qualified** (status `QUALIFIED`), **un-followed-up** (status `NEW` AND older than SLA). All three are now **exact** because `Lead.status` EXISTS (G1). |
| **Formula (Prisma shape, main DB)** | `sellerListingIds = (await db.listing.findMany({ where: { sellerId: <scope> }, select: { id: true } })).map(l => l.id)` <br/> **new:** `db.lead.count({ where: { listingId: { in: sellerListingIds }, status: 'NEW' } })` <br/> **qualified:** `db.lead.count({ where: { listingId: { in: sellerListingIds }, status: 'QUALIFIED' } })` <br/> **un-followed-up (SLA=24h, configurable):** `db.lead.count({ where: { listingId: { in: sellerListingIds }, status: 'NEW', createdAt: { lt: new Date(now() - 24*3600*1000) } } })` <br/> Optional secondary: **assigned-but-stale** = `status IN ['NEW','CONTACTED'] AND assignedToId != null AND createdAt < now()-48h` (catches leads that were assigned but the assignee hasn't moved them). |
| **Data source** | `Lead` (main, `schema.prisma:618-658`). Fields: `listingId`, `status` (G1), `assignedToId` (G2), `createdAt`. `Listing.sellerId` for scope (`schema.prisma:489`). |
| **Time window** | Rolling 7d for "new" trend; SLA threshold for un-followed-up = 24h (configurable via `Setting`). |
| **Permission filter** | `ADMIN`: all leads. `SELLER`/`VIP_DEALER`: only leads whose `listing.sellerId = session.user.id`. Cross-seller read → 403 + audit (ASC-050). Enforced via `Lead.listing.sellerId` traversal — there is no `Lead.sellerId` direct FK (G6). |
| **Missing-data handling** | Lead on a listing whose `sellerId` is null → bucketed as `unassignedCount`, flagged for admin review (do NOT silently attribute to anyone). Orphan lead (no listing — should not exist due to `onDelete: Cascade`) → excluded. Lead with `status=NULL` (pre-PR-SC-01 rows migrated with `@default("NEW")` — should not occur post-migration) → counted as `NEW`. |
| **Owner role** | Sales/CRM Lead. Consumers: Seller, Sales Manager, Admin. |
| **Migration needed** | **NONE — `Lead.status` (PR-SC-01/PR #9) is on `main`.** This KPI was partial at `4566efd` (only "new (7d)" was computable); it is now fully computable. |
| **Capability ref** | ASC-050, ASC-052, ASC-053. |

### KPI-4 — View→contact/RFQ conversion rate

| Attribute | Value |
|---|---|
| **Definition** | Per-listing and per-seller conversion from listing views to (a) contact-lead or (b) RFQ submission. **No target without baseline** (hard rule, §8): the dashboard renders the *measured* rate; any "increase by X%" claim must cite a captured pre-period. |
| **Formula (Prisma shape, main DB)** | `views = db.analyticsEvent.count({ where: { eventType: 'LISTING_VIEW', listingId, createdAt: { gte: windowStart } } })` <br/> `contacts = db.lead.count({ where: { listingId, leadType: { in: ['CALL','MESSAGE','CONTACT','OFFER'] }, createdAt: { gte: windowStart } } })` <br/> `conversionRate_contact = views > 0 ? contacts / views : null` <br/> Seller roll-up: `sum(contacts) / sum(views)` across the seller's listings. <br/><br/> **RFQ variant (approximate — no `RFQ.listingId` FK, G14):** `rfqs = db.rfq.count({ where: { createdAt: { gte: windowStart }, OR: [{ buyerId: <scope.userId> }, { buyerPhone: <scope.phone> }] } })` → `conversionRate_rfq = views > 0 ? rfqs / views : null`. The RFQ numerator is **buyer-scoped, not listing-scoped**, so the RFQ rate is a buyer-funnel metric, NOT a per-listing conversion. The dashboard MUST label it "approximate — RFQ has no listing FK". |
| **Data source** | `AnalyticsEvent` (main, `schema.prisma:2255`), `Lead` (main), `RFQ` (main, `schema.prisma:864`), `Listing` (main, for seller scope). |
| **Time window** | 30-day rolling window. **Baseline = preceding 30 days**, computed on-demand by shifting the window back 30d (see §8). Persisted baselines require a `KpiBaseline` table (`REQUIRES MIGRATION — new PR-SC-XX follow-up`) OR a `Setting` JSON value (NO migration — `Setting` exists, G18). v1 uses the on-demand approach. |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: only listings where `sellerId = session.user.id`. |
| **Missing-data handling** | `views = 0` → conversion undefined, listing excluded from the aggregate (NOT averaged as 0%). `Listing.viewCount` (denormalized lifetime counter, G7) used ONLY as a fast-path proxy when `AnalyticsEvent` retention has expired; UI must flag the source. RFQ conversion labeled "approximate — no listing FK". |
| **Owner role** | Growth/BI Engineer. Consumers: Seller, Marketing, Admin. |
| **Migration needed** | **NONE for the contact-lead variant.** RFQ variant is approximate; an exact join requires `RFQ.listingId` FK (`REQUIRES MIGRATION — follow-up, not in current PR-SC plan`). |
| **Capability ref** | ASC-080, ASC-083. |

### KPI-5 — Showroom page performance

| Attribute | Value |
|---|---|
| **Definition** | For a VIP Dealer's showroom (`/sellers/[slug]` today; `/showroom/[slug]` post-migration): views, avg session depth, contact-action clicks, lead conversions attributable to the showroom. |
| **Formula (Prisma shape, main DB)** | `🚧 BLOCKED` — `Showroom` and `ShowroomAnalytics` models do not exist (G11). <br/> **Pre-migration approximation (TODAY):** `db.analyticsEvent.count({ where: { page: { startsWith: '/sellers/' }, createdAt: { gte: windowStart } } })` (page-view proxy) and `Company.viewCount` (denormalized lifetime counter on `Company`, main DB). These are coarse proxies, NOT a true showroom funnel. <br/> **Post-migration (POST PR-SC-02 + ASC-074):** `db.showroom.findUnique({ where: { companyId } })` → `db.showroomAnalytics.aggregate(...)` over a proposed `ShowroomAnalytics` table (views, cardClicks, contactActions, leadConversions, day-bucketed). |
| **Data source** | TODAY: `AnalyticsEvent` (main), `Company.viewCount` (main, `schema.prisma:1226`). POST-MIGRATION: `Showroom` (main, proposed), `ShowroomAnalytics` (main, proposed). |
| **Time window** | 30d rolling; raw retention 90d; aggregates 24mo (per ASC-074 acceptance). |
| **Permission filter** | `VIP_DEALER`: own company showroom only. `ADMIN`: all. Public: aggregated, no buyer PII (per ASC-074). |
| **Missing-data handling** | No `Showroom` row for the company → KPI returns `notConfigured`, UI shows "set up your showroom" CTA. VIP lapsed mid-window → window truncated to lapse date. |
| **Owner role** | VIP/Showroom PM. Consumers: VIP Dealer, Admin. |
| **Migration needed** | `Showroom` model (`REQUIRES MIGRATION PR-SC-02`); `ShowroomAnalytics` model (`REQUIRES MIGRATION ASC-074 / new PR-SC-10`). |
| **Capability ref** | ASC-070, ASC-071, ASC-074. |

### KPI-6 — Machine Passport doc count + status

| Attribute | Value |
|---|---|
| **Definition** | Per listing: count of `PassportEvent` rows (documented machine history), presence of a serial number, inspection result, and inspection freshness. Also exposes the **Passport Score** (ADR-005 §6 — but see G10: all 5 per-section verification factors require migration). |
| **Formula (Prisma shape, main DB)** | `passport = db.machinePassport.findUnique({ where: { listingId }, include: { events: true } })` <br/> **docCount** = `passport.events.length` <br/> **hasSerial** = `passport.serialNumber != null` <br/> **inspectionResult** = `passport.inspectionResult` (free text) <br/> **inspectionFreshnessDays** = `passport.inspectionDate ? (now - passport.inspectionDate) / 86400_000 : null` <br/> **Passport Score (POST PR-SC-03):** `specs_verified(25) + ownership_verified(20) + inspection_current(25) + service_history(15) + photos(15)` — each factor is a boolean from the per-section verification fields added by PR-SC-03. Score stored as `MachinePassport.passportScore Int?` (`REQUIRES MIGRATION — PR-SC-03 or PR-SC-03a`). |
| **Data source** | `MachinePassport` (main, `schema.prisma:1180-1190`), `PassportEvent` (main, `schema.prisma:1192-1202`), `Inspection` (main, `schema.prisma:1382-1402`). |
| **Permission filter** | `SELLER`/`VIP_DEALER`: own listings. `ADMIN`: all. Public: only the binary `Listing.verified` badge (never the per-section status, per ASC-061). |
| **Time window** | Snapshot. |
| **Missing-data handling** | No `MachinePassport` for the listing → UI shows "create passport" CTA (ASC-060); score = `null` (NOT 0). `inspectionDate` null → inspection factor = 0 (not verified). |
| **Owner role** | Trust/Verification Lead. Consumers: Seller, Admin, Financing partner (export only, gated). |
| **Migration needed** | Per-section verification fields on `MachinePassport` (`specsVerifiedAt/By`, `ownershipVerifiedAt/By`, `inspectionVerifiedAt/By`, `serviceHistoryVerifiedAt/By` — 8 fields) + `MachinePassport.passportScore` + `passportScoreVersion` — `REQUIRES MIGRATION PR-SC-03` (10 items). Until shipped, KPI-6 renders only docCount + hasSerial + inspectionResult + inspectionFreshness; the Passport Score card shows "blocked — requires PR-SC-03". |
| **Capability ref** | ASC-060, ASC-061, ASC-062, ASC-063. |

### KPI-7 — Seller response time + sales-team performance

| Attribute | Value |
|---|---|
| **Definition** | (a) Median time from lead arrival to first seller-side reply. (b) Per-sales-team-member closed-lead count and avg response time. |
| **Formula (Prisma shape, main DB)** | For each lead: <br/> `firstSellerReply = db.message.findFirst({ where: { conversation: { listingId: lead.listingId, OR: [{ participant1Id: lead.listing.sellerId }, { participant2Id: lead.listing.sellerId }] }, senderId: lead.listing.sellerId, createdAt: { gte: lead.createdAt } }, orderBy: { createdAt: 'asc' } })` <br/> `responseTimeMs = firstSellerReply ? (firstSellerReply.createdAt - lead.createdAt) : null` <br/> Aggregates (seller): `median(responseTimeMs where not null)`, `p90`, `count(responseTimeMs is null AND lead.createdAt < now()-24h)` → "unresponded" bucket. <br/> **Alt reply channel** (DealRoom): if no `Message` found, fall back to `DealMessage` where `dealRoom.listingId = lead.listingId AND senderRole='SELLER' AND createdAt >= lead.createdAt`, ordered ASC. <br/> **Sales-team performance (TODAY, via `Lead.assignedToId`):** `db.lead.groupBy({ by: ['assignedToId'], where: { listing: { sellerId: <scope> }, assignedToId: { not: null } }, _count: { _all: true }, ... })` joined to `User` for display name. Per-assignee metrics: `closedCount` (status=`CLOSED`), `avgResponseMs`, `qualificationRate` (status=`QUALIFIED` / total assigned). <br/> **Sales-team performance (POST PR-SC-02):** group by `SalesTeamMember.userId` for richer role/title display — `REQUIRES MIGRATION PR-SC-02`. |
| **Data source** | `Lead` (main, `schema.prisma:618`), `Listing` (main), `Conversation` (main, `schema.prisma:2211`), `Message` (main, `schema.prisma:2232`), `DealRoom` (main, `schema.prisma:1330`), `DealMessage` (main, `schema.prisma:1353`), `User` (main, `schema.prisma:1578`). |
| **Time window** | 30d rolling for response time; 90d for sales-team performance. |
| **Permission filter** | `SELLER`/`VIP_DEALER`: own listings' leads. `ADMIN`: all. Sales-team member view: only leads `assignedToId = self` (post-migration; works today via `Lead.assignedToId`). |
| **Missing-data handling** | Lead with no seller reply → placed in "unresponded" bucket, **excluded from median** (do NOT average as 0). Lead on listing with `sellerId = null` → excluded, flagged. Conversation missing (seller replied via phone/offline) → not measurable; UI labels "no in-app reply". |
| **Owner role** | Sales Ops. Consumers: Seller, Sales Manager, Admin. |
| **Migration needed** | Response time: **NONE** — `Lead.assignedToId` (G2) EXISTS. Sales-team performance: today uses `Lead.assignedToId` → `User` (works); a dedicated `SalesTeamMember` model with role/title is `REQUIRES MIGRATION PR-SC-02` for richer display, NOT a blocker for the KPI itself. |
| **Capability ref** | ASC-050, ASC-051, ASC-052. |

### KPI-8 — AI cost per task + AI suggestion acceptance rate

| Attribute | Value |
|---|---|
| **Definition** | (a) Average USD cost per AI task, grouped by `taskType`. (b) Share of AI suggestions the user accepted/acted-on. (c) Latency (p50/p95). (d) Error rate. |
| **Formula (Prisma shape, main DB)** | **(a) Cost per task (TODAY):** `db.aIGatewayLog.groupBy({ by: ['taskType'], _avg: { cost: true }, _sum: { cost: true }, _count: true, where: { createdAt: { gte: windowStart } } })` — also broken down by `success` (failed calls still incur cost). <br/> **(c) Latency (TODAY):** `_avg: { latencyMs: true }`, plus a raw query for p50/p95 (Prisma has no native percentile; compute in service-layer from `db.aIGatewayLog.findMany({ select: { latencyMs: true }, where: { ... } })` + sort). <br/> **(d) Error rate (TODAY):** `db.aIGatewayLog.groupBy({ by: ['taskType'], _count: { _all: true }, where: { createdAt: { gte: windowStart } } })` × `where: { success: false }` variant → `errorRate = failedCount / totalCount`. <br/> **(b) Suggestion acceptance (🚧 BLOCKED TODAY):** `AIGatewayLog` has no accept/reject tracking (G9). Need a new `AISuggestion` model: `aiGatewayLogId`, `status` (`PROPOSED\|ACCEPTED\|REJECTED\|DISMISSED\|ACTED_ON`), `decidedAt`, `decidedById`, `actionEntityType`, `actionEntityId`. Acceptance rate = `count(status in [ACCEPTED, ACTED_ON]) / count(status in [PROPOSED, ACCEPTED, REJECTED, DISMISSED, ACTED_ON])`. |
| **Data source** | `AIGatewayLog` (main, `schema.prisma:757-772`). `AISuggestion` (main, proposed — `REQUIRES MIGRATION new PR-SC-11 / Phase 6`). |
| **Permission filter** | `ADMIN`: all. `SELLER`/`VIP_DEALER`: only rows where `userId = session.user.id`. |
| **Time window** | 7d / 30d rolling for cost; 30d for acceptance. |
| **Missing-data handling** | `cost IS NULL` → excluded from cost average (`AIGatewayLog.cost` is nullable). `success = false` → still counted in cost (failed calls cost money). `latencyMs IS NULL` → excluded from latency stats. Acceptance denominator = 0 → rate = `null`, UI shows "no suggestions yet". |
| **Owner role** | AI/Platform Engineer. Consumers: AI PM, Admin, CFO (cost). |
| **Migration needed** | Cost + latency + error rate: **NONE — fully computable today.** Suggestion acceptance: `AISuggestion` model `REQUIRES MIGRATION — new PR-SC-11 / Phase 6` (not yet in PR-SC plan). Until shipped, the acceptance-rate card shows "blocked — requires AISuggestion migration". |
| **Capability ref** | ASC-100, ASC-103, ASC-153. |

### KPI summary table

| # | KPI | Status today | Blocking migration | Cross-DB |
|---|---|---|---|---|
| KPI-1 | Active listings + spec-completeness | ✅ computable | none | no |
| KPI-2 | Slow-moving inventory + DOM (machines) | ✅ computable | none | no |
| KPI-2b | Slow-moving Parts (store) | ✅ computable | none (DOM is approximate) | ⚠ yes |
| KPI-3 | New / qualified / un-followed-up leads | ✅ computable (post PR-SC-01) | none | no |
| KPI-4 | View→contact/RFQ conversion | ✅ computable (contact); RFQ approximate | optional `RFQ.listingId` | no |
| KPI-5 | Showroom page performance | 🚧 blocked | `Showroom` (PR-SC-02) + `ShowroomAnalytics` (ASC-074) | no |
| KPI-6 | Passport doc count + status | 🚧 partial | `MachinePassport` verification fields (PR-SC-03, 10 items) | no |
| KPI-7 | Seller response time + sales-team perf | ✅ computable (response time + assignee grouping); `SalesTeamMember` model nice-to-have | `SalesTeamMember` (PR-SC-02) — non-blocking | no |
| KPI-8 | AI cost per task + suggestion acceptance | ✅ cost+latency+error; 🚧 acceptance blocked | `AISuggestion` (new, PR-SC-11) | no |

**KPIs computable end-to-end today:** 5 of 8 (KPI-1, KPI-2, KPI-3, KPI-4-contact, KPI-7-response, KPI-8-cost). **KPIs partially computable:** KPI-6 (doc count, no score), KPI-8 (cost, no acceptance). **KPIs fully blocked:** KPI-5 (showroom).

---

## 3. Conversion Metrics (view→contact, view→RFQ, lead→deal)

Three conversion funnels. Each is defined by: **numerator event**, **denominator event**, **window**, **schema support today vs new tracking needed**.

### 3.1 View→Contact

| Aspect | Value |
|---|---|
| **Numerator** | A `Lead` row created with `leadType IN ['CALL','MESSAGE','CONTACT','OFFER']` on a specific `listingId`. (`Lead.leadType` is free String, G5; the implementation upper-cases for the score, but the conversion query must use the canonical set.) |
| **Denominator** | An `AnalyticsEvent` row with `eventType='LISTING_VIEW'` on the same `listingId`. |
| **Join key** | `Lead.listingId` = `AnalyticsEvent.listingId` (both main DB, both exist). |
| **Schema support today** | ✅ Both sides exist. No new tracking needed. |
| **Formula** | `conversionRate_view2contact = count(Lead where leadType IN contact-set AND listingId=X AND createdAt within window) / count(AnalyticsEvent where eventType='LISTING_VIEW' AND listingId=X AND createdAt within window)` |
| **Caveats** | (a) `Listing.viewCount` is a denormalized lifetime counter (G7), NOT a windowed view log — use `AnalyticsEvent` for windowed conversion. (b) Multiple views from the same buyer count once per view event (no de-duplication today; if unique-buyer conversion is needed, dedupe by `AnalyticsEvent.userId` or `AnalyticsEvent.ip+userAgent` in the service layer). (c) Anonymous contact leads (`Lead.viewerPhone = null`) are counted in the numerator; this is correct (the contact happened). |
| **Time window** | 30d rolling; baseline = preceding 30d (§8). |

### 3.2 View→RFQ

| Aspect | Value |
|---|---|
| **Numerator** | An `RFQ` row created by a buyer within the window. |
| **Denominator** | An `AnalyticsEvent` row with `eventType='LISTING_VIEW'` (or, for a site-wide funnel, `eventType='SEARCH'`). |
| **Join key** | **There is NO `RFQ.listingId` FK** (G14). RFQ→listing attribution is impossible today. The funnel is **buyer-scoped**, not listing-scoped: `RFQ.buyerId = AnalyticsEvent.userId` OR `RFQ.buyerPhone = AnalyticsEvent.metadata.phone`. |
| **Schema support today** | ⚠ PARTIAL. `RFQ` exists but lacks `listingId`. The funnel is computable as a **buyer-funnel** (buyer views → buyer submits RFQ), NOT as a per-listing conversion. |
| **Formula** | `conversionRate_view2rfq = count(RFQ where (buyerId=viewerUserId OR buyerPhone=viewerPhone) AND createdAt within window) / count(AnalyticsEvent where eventType='LISTING_VIEW' AND userId=viewerUserId AND createdAt within window)` |
| **Caveats** | (a) UI MUST label "approximate — RFQ has no listing FK". (b) A buyer who views 5 listings then submits 1 RFQ shows up as 1/5 = 20% per-view conversion, which is misleading. Recommend: report as a **buyer-conversion** metric ("of buyers who viewed ≥1 listing, X% submitted an RFQ"), not a per-view rate. (c) Anonymous RFQs (`buyerId = null`) require `buyerPhone` matching against `AnalyticsEvent.metadata.phone` — but `AnalyticsEvent.metadata` is a free JSON String field, so the phone must be persisted there by the tracking layer. **Today the tracking layer does NOT persist phone in metadata** — this is a tracking gap. |
| **New tracking needed** | To make View→RFQ exact per-listing: add `RFQ.listingId String?` FK (`REQUIRES MIGRATION — follow-up, not in current PR-SC plan`). To make the buyer-phone join work without the FK: persist `phone` in `AnalyticsEvent.metadata` JSON when the buyer is identifiable (new tracking call in the listing-page handler). |
| **Time window** | 30d rolling; baseline = preceding 30d. |

### 3.3 Lead→Deal

| Aspect | Value |
|---|---|
| **Numerator** | A `Deal` row with `status IN ['CONFIRMED','IN_PROGRESS','COMPLETED']` (i.e., past `DRAFT`/`PENDING_CONFIRMATION`) attributable to a lead. |
| **Denominator** | A `Lead` row in the seller's pipeline (status not `LOST`). |
| **Join key** | **There is NO `Deal.leadId` FK** (G16). Lead→Deal attribution is reconstructed via `Lead.listingId → Deal.listingId` — approximate (multiple leads on the same listing could map to the same deal; the buyer identity (`Lead.viewerPhone` vs `Deal.buyerId`) is the disambiguator but is not a hard FK). |
| **Schema support today** | ⚠ PARTIAL. `Deal` exists with `listingId`, `buyerId`, `sellerId`, `sourceType`, `sourceId`. `sourceType` (`LISTING_OFFER \| RFQ_QUOTE \| DEAL_ROOM`) gives the ORIGIN of the deal, but not the specific `Lead.id` that triggered it. |
| **Formula** | `conversionRate_lead2deal = count(Deal where status IN confirmed-set AND listingId IN sellerListingIds AND createdAt within window) / count(Lead where listingId IN sellerListingIds AND status != 'LOST' AND createdAt within window)` <br/> **Refinement (when `Deal.sourceType='LISTING_OFFER'`):** the `ListingOffer` row (`Deal.sourceId`) has `buyerPhone` — match against `Lead.viewerPhone` on the same listing to attribute the specific lead. This is the closest-to-exact lead→deal join available today. |
| **Caveats** | (a) The denominator counts leads; the numerator counts deals. Without a `Deal.leadId` FK, a single deal may be matched by multiple leads (false-positive numerator inflation). Recommend: use the `ListingOffer.buyerPhone ↔ Lead.viewerPhone` match as the disambiguator and report the match rate as a data-quality metric. (b) Deals that originate from `DEAL_ROOM` (no `ListingOffer` row) cannot be phone-matched to a lead; they are counted in the numerator with a `sourceType=DEAL_ROOM` label and a "match confidence: low" flag. |
| **New tracking needed** | To make Lead→Deal exact: add `Deal.leadId String?` FK (`REQUIRES MIGRATION — follow-up, ASC-083 NEEDS DECISION`). Until then, the funnel is approximate and must be labeled. |
| **Time window** | 90d rolling (deals take longer than views); baseline = preceding 90d. |

### 3.4 Conversion events inventory

| Event | Source model | Field | Exists today? | New tracking needed? |
|---|---|---|---|---|
| Listing view | `AnalyticsEvent` | `eventType='LISTING_VIEW'`, `listingId`, `createdAt` | ✅ YES (`analytics.ts:41`) | NO (already tracked) |
| Contact (lead) | `Lead` | `leadType IN ['CALL','MESSAGE','CONTACT','OFFER']`, `listingId`, `createdAt` | ✅ YES | NO |
| RFQ submit | `RFQ` | `buyerId`, `buyerPhone`, `createdAt` (NO `listingId`) | ⚠ PARTIAL | YES — add `RFQ.listingId` FK OR persist `phone` in `AnalyticsEvent.metadata` |
| Deal create | `Deal` | `sourceType`, `sourceId`, `listingId`, `buyerId`, `createdAt` | ✅ YES | NO (but no `Deal.leadId` FK — attribution approximate) |
| Deal confirm | `Deal` | `status IN ['CONFIRMED','IN_PROGRESS','COMPLETED']`, `confirmedAt` | ✅ YES | NO |
| Deal complete | `Deal` | `status='COMPLETED'`, `completedAt` | ✅ YES | NO |
| Suggestion accept | (none) | — | ❌ NO | YES — `AISuggestion` model (KPI-8b) |
| Showroom view | (none) | — | ❌ NO | YES — `Showroom` + `ShowroomAnalytics` (KPI-5) |

---

## 4. First-Response Time (seller's time to first reply to a lead)

### 4.1 Definition

`firstResponseTimeMs = firstSellerReply.createdAt - lead.createdAt`, where `firstSellerReply` is the earliest seller-authored in-app message (in `Message` or `DealMessage`) on a conversation tied to the lead's listing, sent at or after `lead.createdAt`.

### 4.2 What exists today

| Field | Model | Schema location | Used as |
|---|---|---|---|
| `Lead.createdAt` | Lead | `schema.prisma:626` | start time |
| `Lead.listingId` | Lead | `schema.prisma:620` | scoping |
| `Lead.listing.sellerId` | Listing | `schema.prisma:489` | seller identity |
| `Conversation.listingId` | Conversation | `schema.prisma:2213` | conversation↔listing link |
| `Conversation.participant1Id` / `participant2Id` | Conversation | `schema.prisma:2215-2218` | seller is whichever participant matches `listing.sellerId` |
| `Message.senderId` | Message | `schema.prisma:2236` | reply author |
| `Message.createdAt` | Message | `schema.prisma:2242` | reply time |
| `DealRoom.listingId` | DealRoom | `schema.prisma:1332` | alt reply channel |
| `DealMessage.senderRole` | DealMessage | `schema.prisma:1357` | reply author role (`'SELLER'`) |
| `DealMessage.createdAt` | DealMessage | `schema.prisma:1361` | reply time |

### 4.3 Formula (Prisma shape, main DB)

```
firstSellerReply = await db.message.findFirst({
  where: {
    conversation: {
      listingId: lead.listingId,
      OR: [
        { participant1Id: lead.listing.sellerId },
        { participant2Id: lead.listing.sellerId },
      ],
    },
    senderId: lead.listing.sellerId,
    createdAt: { gte: lead.createdAt },
  },
  orderBy: { createdAt: 'asc' },
})

// Alt channel: DealMessage
if (!firstSellerReply) {
  firstSellerReply = await db.dealMessage.findFirst({
    where: {
      dealRoom: { listingId: lead.listingId },
      senderRole: 'SELLER',
      createdAt: { gte: lead.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  })
}

responseTimeMs = firstSellerReply
  ? firstSellerReply.createdAt.getTime() - lead.createdAt.getTime()
  : null
```

### 4.4 What's missing

1. **No `Conversation.sellerId` / `Conversation.buyerId` discriminator.** The two participants are positional (participant1/participant2); the seller is whichever equals `listing.sellerId`. This works but is brittle — a misconfigured conversation (seller not in participants) silently yields `responseTimeMs = null`. **No migration needed** — service-layer logic handles it; recommend a CI test that every `Conversation` with a `listingId` has the listing's seller as one of the two participants.
2. **No tracking of off-platform replies.** If the seller phones the buyer (the `Lead.leadType='CALL'` case), there is no in-app `Message` and `responseTimeMs = null`. This is a **measurable gap**, not a schema gap — the dashboard must label these "no in-app reply (possibly replied off-platform)" and exclude them from the median (do NOT average as 0).
3. **No `Lead.firstRepliedAt` cache column.** Computing `firstResponseTimeMs` requires a `findFirst` per lead, which is O(N) over the seller's leads. For a seller with 10k leads, the dashboard query is slow. **Recommendation:** add `Lead.firstRepliedAt DateTime?` + `Lead.firstResponseMs Int?` as cached columns, populated by the PR-SC-06 recalc job (`REQUIRES MIGRATION PR-SC-06`). Until then, the dashboard computes on-demand and is capped at the seller's 30-day lead volume.

### 4.5 Aggregates

- **Median** of `responseTimeMs` over leads where `responseTimeMs != null` (last 30d). Prisma has no native median; compute in service-layer from a `findMany` + sort.
- **p90** of the same distribution.
- **Unresponded count:** `count(Lead where createdAt < now()-24h AND no firstSellerReply exists)`.
- **Unresponded rate:** `unrespondedCount / count(Lead where createdAt < now()-24h)`.

---

## 5. Listing Quality Score (completeness)

### 5.1 Two coexisting scores

There are **two Listing Quality Scores in the codebase today**:

| Score | Source | Items | Status |
|---|---|---|---|
| **LQS v0** (de facto) | `/api/listing-completeness/route.ts` | 10 binary items: image, price, brand, category, description>50ch, year, workingHours, sellerPhone, specs (condition\|province\|city), verified | ✅ LIVE — `score = round(passedCount / 10 * 100)` |
| **LQS v1** (spec, not implemented) | `STORE-ANALYTICS-BI.md` §3.2 (I1–I6) | 6 weighted factors: spec completeness (25), media (15), verification (20), inspection freshness (15), documentation (15), engagement (10) | 🚧 NOT IMPLEMENTED — `Listing.inventoryScore` `REQUIRES MIGRATION PR-SC-03 REVISED` |

### 5.2 LQS v0 — fields and formula (LIVE today)

```
checklist = [
  hasImage:        listing.images.length > 0,
  hasPrice:        listing.price != null && listing.price > 0,
  hasBrand:        listing.brand != null,
  hasCategory:     listing.category != null,
  hasDescription:  listing.description?.length > 50,
  hasYear:         listing.year != null,
  hasHours:        listing.workingHours != null,
  hasPhone:        listing.sellerPhone != null,
  hasSpecs:        listing.condition || listing.province || listing.city,
  verified:        listing.verified,
]
score = round(checklist.filter(passed).length / checklist.length * 100)
```

| Factor | Field(s) | Schema location | Exists? |
|---|---|---|---|
| Image | `Listing.images ListingImage[]` (relation count) | `schema.prisma:505, 535-543` | ✅ |
| Price | `Listing.price BigInt?` | `schema.prisma:450` | ✅ |
| Brand | `Listing.brandId String?` + `Listing.brand Brand?` | `schema.prisma:483-484` | ✅ |
| Category | `Listing.categoryId String?` + `Listing.category Category?` | `schema.prisma:485-486` | ✅ |
| Description | `Listing.description String?` (length > 50) | `schema.prisma:448` | ✅ |
| Year | `Listing.year Int?` | `schema.prisma:456` | ✅ |
| Working hours | `Listing.workingHours Int?` | `schema.prisma:457` | ✅ |
| Seller phone | `Listing.sellerPhone String?` | `schema.prisma:467` | ✅ |
| Specs (any-of) | `Listing.condition?` / `Listing.province?` / `Listing.city?` | `schema.prisma:453-455` | ✅ |
| Verified | `Listing.verified Boolean @default(false)` | `schema.prisma:460` | ✅ |

**All 10 LQS v0 fields exist. No migration needed.**

### 5.3 LQS v1 — fields and formula (spec, not implemented)

Per `STORE-ANALYTICS-BI.md` §3.2:

| # | Factor | Weight | Field(s) | Exists? |
|---|---|---|---|---|
| I1 | Spec completeness | 25 | `ListingAttributeValue` × `CategoryAttribute.required` | ✅ (G17) |
| I2 | Media coverage | 15 | `ListingImage[]` count | ✅ |
| I3 | Verification | 20 | `Company.verified` + `MachinePassport` exists | ✅ |
| I4 | Inspection freshness | 15 | `Inspection.status='COMPLETED'` + `Inspection.completedAt` | ✅ (`schema.prisma:1389, 1391`) |
| I5 | Documentation | 15 | `CompanyDocument` count where `status='VERIFIED'` | ✅ (`schema.prisma:1278-1289`) |
| I6 | Engagement | 10 | `Listing.viewCount` + `Listing.favoriteCount` | ✅ |

**All 6 LQS v1 factor source-fields exist. The score itself (`Listing.inventoryScore`) is the only thing missing** — `REQUIRES MIGRATION PR-SC-03 REVISED` (relocated from `Part` per `STORE-ANALYTICS-BI.md` §3.1). Until PR-SC-03 ships, the dashboard renders LQS v0 (the live `/api/listing-completeness` score).

### 5.4 Recommendation

Treat LQS v0 as the **ship-now** completeness score (it's live, all fields exist, no migration). Treat LQS v1 as the **ship-later** score (richer factors, but needs PR-SC-03 for the cache column + recalc job). The dashboard should render LQS v0 today and pre-wire the UI for LQS v1 with a feature flag.

---

## 6. Profile Completion (company profile completeness)

### 6.1 Definition

A 0–100 completeness score for a seller's `Company` profile, computed from the presence of core identity fields.

### 6.2 Fields and formula

| # | Item | Field | Schema location | Exists? |
|---|---|---|---|---|
| 1 | Company name | `Company.name String` | `schema.prisma:1210` | ✅ (NOT NULL) |
| 2 | Logo | `Company.logoUrl String?` | `schema.prisma:1213` | ✅ |
| 3 | Cover image | `Company.coverImage String?` | `schema.prisma:1214` | ✅ |
| 4 | Description | `Company.description String?` | `schema.prisma:1212` | ✅ |
| 5 | Phone | `Company.phone String?` | `schema.prisma:1216` | ✅ |
| 6 | Email | `Company.email String?` | `schema.prisma:1217` | ✅ |
| 7 | Address | `Company.address String?` | `schema.prisma:1218` | ✅ |
| 8 | City | `Company.city String?` | `schema.prisma:1219` | ✅ |
| 9 | Province | `Company.province String?` | `schema.prisma:1220` | ✅ |
| 10 | Website | `Company.website String?` | `schema.prisma:1215` | ✅ |
| 11 | Verified | `Company.verified Boolean @default(false)` | `schema.prisma:1221` | ✅ |
| 12 | ≥1 verified document | `Company.documents CompanyDocument[]` where `status='VERIFIED'` (count ≥ 1) | `schema.prisma:1233, 1278-1289` | ✅ |
| 13 | ≥1 branch | `Company.branches CompanyBranch[]` (count ≥ 1) | `schema.prisma:1234, 1291-1304` | ✅ |

**Formula (v0, all fields exist):**

```
checklist = [
  hasName:        company.name != null && company.name.trim().length > 0,  // always true (NOT NULL)
  hasLogo:        company.logoUrl != null,
  hasCover:       company.coverImage != null,
  hasDescription: company.description != null && company.description.trim().length >= 50,
  hasPhone:       company.phone != null && phoneRegex.test(company.phone),
  hasEmail:       company.email != null && emailRegex.test(company.email),
  hasAddress:     company.address != null && company.address.trim().length > 0,
  hasCity:        company.city != null,
  hasProvince:    company.province != null,
  hasWebsite:     company.website != null,
  isVerified:     company.verified === true,
  hasVerifiedDoc: company.documents.some(d => d.status === 'VERIFIED'),
  hasBranch:      company.branches.length > 0,
]
score = round(checklist.filter(passed).length / checklist.length * 100)
```

**All 13 Profile Completion fields exist. No migration needed.**

### 6.3 Aggregates

- Per-company: the 0–100 score + the missing-items list (drives the "complete your profile" CTA).
- Seller roll-up: not applicable (each seller's company has one profile).
- Admin roll-up: `db.company.groupBy({ by: [band], ... })` where band = `[0-25, 26-50, 51-75, 76-100]` — shows the distribution of profile completeness across all sellers.

### 6.4 Caveats

- `Company.name` is `String` (NOT NULL) — `hasName` is always true; it's in the checklist for symmetry but never fails. Consider dropping it from the denominator (12 items instead of 13) so the score isn't artificially inflated by a guaranteed item.
- `Company.verified` is admin-controlled (not seller-self-served); the seller cannot directly raise their score by checking a box. The dashboard should distinguish "seller-controllable items" (10 of 13) from "admin-controlled items" (verified, hasVerifiedDoc — both flow through `CompanyVerification`/`CompanyDocument` moderation).

---

## 7. AI Performance Metrics

### 7.1 What's measurable today (from `AIGatewayLog`)

| Metric | Formula (Prisma shape, main DB) | Field(s) | Status |
|---|---|---|---|
| **Cost per task** (avg, by taskType) | `db.aIGatewayLog.groupBy({ by: ['taskType'], _avg: { cost: true }, _sum: { cost: true }, _count: true, where: { createdAt: { gte: windowStart } } })` | `taskType`, `cost`, `createdAt` (`schema.prisma:759, 765, 769`) | ✅ computable |
| **Total AI spend** (sum, by day) | `db.aIGatewayLog.groupBy({ by: [dateTrunc('day', createdAt)], _sum: { cost: true } })` | `cost`, `createdAt` | ✅ computable |
| **Latency p50/p95** (by taskType) | service-layer: `db.aIGatewayLog.findMany({ select: { latencyMs: true }, where: { taskType, createdAt: { gte: windowStart }, latencyMs: { not: null } }, orderBy: { latencyMs: 'asc' } })` → percentile from sorted array | `latencyMs` (`schema.prisma:763`) | ✅ computable |
| **Error rate** (by taskType) | `failed = count(where: { taskType, success: false, ... }); total = count(where: { taskType, ... }); errorRate = failed / total` | `success` (`schema.prisma:766`) | ✅ computable |
| **Tokens used** (by taskType, by model) | `db.aIGatewayLog.groupBy({ by: ['taskType','model'], _sum: { tokensUsed: true } })` | `tokensUsed` (`schema.prisma:764`) | ✅ computable |
| **Budget burn** (vs `AIBudget`) | `db.aIBudget.findUnique({ where: { id: 'main' } })` → `dailySpendUsd / dailyLimitUsd`, `monthlySpendUsd / monthlyLimitUsd` | `AIBudget` singleton (`schema.prisma:783-796`) | ✅ computable |

### 7.2 What needs new tracking (the `AISuggestion` model)

| Metric | Formula | Required schema | Status |
|---|---|---|---|
| **Suggestion acceptance rate** | `count(AISuggestion where status IN ['ACCEPTED','ACTED_ON']) / count(AISuggestion where status IN ['PROPOSED','ACCEPTED','REJECTED','DISMISSED','ACTED_ON'])` | `AISuggestion` model: `aiGatewayLogId`, `status`, `decidedAt`, `decidedById`, `actionEntityType`, `actionEntityId` | 🚧 `REQUIRES MIGRATION — new PR-SC-11 / Phase 6` |
| **Per-suggestion-type acceptance** | same, grouped by `AIGatewayLog.taskType` (join via `AISuggestion.aiGatewayLogId`) | same + `AIGatewayLog.taskType` | 🚧 same |
| **Time-to-decision** | `decidedAt - AIGatewayLog.createdAt` | `AISuggestion.decidedAt` + `AIGatewayLog.createdAt` | 🚧 same |
| **Suggestion→action conversion** | `count(AISuggestion where status='ACTED_ON' AND actionEntityType IS NOT NULL) / count(AISuggestion)` | `AISuggestion.actionEntityType`, `actionEntityId` | 🚧 same |

### 7.3 What's NOT measurable today (and needs design, not just a model)

| Metric | Why blocked | Design decision needed |
|---|---|---|
| **AI-driven revenue attribution** | No link from `AIGatewayLog` → `Deal` or `ListingOffer`. A seller uses the AI price suggestion, sets a price, gets a lead, closes a deal — the chain is untraceable. | Decide whether to add `Listing.aiSuggestedPrice Bool` + `Deal.aiAssisted Bool` flags (additive columns) or accept that AI revenue attribution is **qualitative** for v1. |
| **AI quality (output correctness)** | `AIGatewayLog.output` is text; there's no ground-truth label. | Out of scope for KPI-8. Track via human-review sampling (moderation flow) instead. |
| **Per-user AI cost attribution** | `AIGatewayLog.userId` exists, but anonymous users (search) have `userId = null`. | Acceptable: anonymous cost is platform overhead; attribute to the user only when `userId != null`. |

### 7.4 AI performance — what ships today vs later

| Component | Ships today? | Card label |
|---|---|---|
| Cost per task (by taskType) | ✅ YES | "AI cost per task" |
| Total AI spend (30d) | ✅ YES | "AI spend (30d)" |
| Latency p50/p95 | ✅ YES | "AI latency (p50/p95)" |
| Error rate | ✅ YES | "AI error rate" |
| Budget burn | ✅ YES | "AI budget burn (daily/monthly)" |
| Suggestion acceptance rate | 🚧 NO | "blocked — requires AISuggestion migration (PR-SC-11)" |
| AI revenue attribution | 🚧 NO | "qualitative only — needs design decision" |

---

## 8. 30-Day Baseline (mandatory before any growth claim)

### 8.1 Hard rule

**No target number, no "X% increase" claim, no before/after comparison may appear on the dashboard or in any report without a captured 30-day baseline.** This is the single rule that separates product success from apparent activity.

### 8.2 Definition

A **30-day baseline** for a KPI is the measured value of that KPI over a contiguous 30-day window ending on the day before the change being evaluated. For example, if a conversion-rate optimization ships on 2026-11-01, the baseline is the measured conversion rate over 2026-10-02 → 2026-10-31.

### 8.3 How to capture (v1 — no migration)

For every KPI in §2, the baseline is computed **on-demand** by shifting the rolling window back 30 days:

```
currentWindow = [now - 30d, now]
baselineWindow = [now - 60d, now - 30d]

currentValue = computeKPI(currentWindow)
baselineValue = computeKPI(baselineWindow)

growthRate = baselineValue != null && baselineValue != 0
  ? (currentValue - baselineValue) / baselineValue
  : null
```

The dashboard renders `currentValue`, `baselineValue`, and `growthRate` (only if both are non-null). If `baselineValue` is null (insufficient data — e.g., seller had no listings 60 days ago), the growth-rate card shows "insufficient historical data — baseline unavailable" and the growth rate is NOT rendered.

### 8.4 How to capture (v2 — persisted baselines)

For point-in-time baselines that survive data retention expiry (e.g., a baseline captured at launch that must remain referenceable 12 months later even after `AnalyticsEvent` rows older than 90d are purged), persist a snapshot in `Setting` (NO migration — `Setting` exists, G18):

```
key = `kpi:baseline:${kpiId}:${sellerId ?? 'global'}:${ISO date}`
value = JSON.stringify({ kpiId, windowStart, windowEnd, value, computedAt, version })
```

A nightly job writes one snapshot per KPI per seller per day. The dashboard reads the most recent snapshot for "baseline at launch" comparisons.

A dedicated `KpiBaseline` model (cleaner schema, queryable) is `REQUIRES MIGRATION — new PR-SC-XX follow-up` and is NOT required for v1.

### 8.5 Which KPIs need a 30-day baseline before any growth claim

| KPI | Baseline required for | Source |
|---|---|---|
| KPI-1 | "spec-completeness improved by X%" | `ListingAttributeValue` history (need 60d of data) |
| KPI-2 | "DOM decreased by X days" | `Listing.publishedAt` (lifetime — always available) |
| KPI-3 | "un-followed-up leads dropped by X%" | `Lead` history (need 60d of leads; pre-PR-SC-01 leads have status backfilled to `NEW`, so the `status` dimension is only valid from PR-SC-01 merge date forward) |
| KPI-4 | "conversion rate up X%" | `AnalyticsEvent` + `Lead` (need 60d of events; respect 90d raw retention) |
| KPI-5 | (blocked — no baseline until `Showroom` ships) | — |
| KPI-6 | (snapshot — no growth claim) | — |
| KPI-7 | "median response time dropped X%" | `Message`/`DealMessage` history (need 60d) |
| KPI-8 | "AI cost per task down X%" | `AIGatewayLog` (need 60d) |

### 8.6 KPI-3 baseline caveat (PR-SC-01 cutover)

`Lead.status` was added in PR-SC-01 (merged `c66e060`). Pre-merge leads have `status` backfilled to `'NEW'` via the column default. Therefore:

- The "new / qualified / un-followed-up" split is **only meaningful for leads created after the PR-SC-01 merge**.
- A 30-day baseline that spans the merge date is **contaminated** — pre-merge leads all show as `NEW` even if they were actually closed.
- **Rule:** the KPI-3 baseline window must start AFTER the PR-SC-01 merge date. If the merge is <30 days ago, the baseline is `null` ("insufficient post-migration history") and no growth claim is rendered until 30 post-merge days have elapsed.

---

## 9. KPIs That Don't Need New Data vs KPIs That Need New Tracking

### 9.1 Computable end-to-end today (NO new tracking, NO migration)

| KPI | What's measurable today | Notes |
|---|---|---|
| **KPI-1** Active listings + spec-completeness | ✅ Full KPI | All fields exist (`Listing`, `ListingAttributeValue`, `CategoryAttribute`). |
| **KPI-2** Slow-moving inventory + DOM (machines) | ✅ Full KPI | All fields exist (`Listing.status/soldAt/publishedAt/createdAt/viewCount/favoriteCount/sellerId`). |
| **KPI-2b** Slow-moving Parts (store) | ✅ Full KPI (DOM approximate) | `⚠ CROSS-DB` — separate query via `storeDb`. |
| **KPI-3** New / qualified / un-followed-up leads | ✅ Full KPI (post PR-SC-01) | `Lead.status` + `Lead.assignedToId` exist. |
| **KPI-4 (contact variant)** View→Contact conversion | ✅ Full KPI | `AnalyticsEvent('LISTING_VIEW')` + `Lead(leadType IN [...])` both exist. |
| **KPI-7 (response time)** Seller response time + assignee grouping | ✅ Full KPI | `Lead` + `Message` + `Conversation` + `DealMessage` all exist. `Lead.assignedToId` exists. |
| **KPI-8 (cost+latency+error)** AI cost per task + latency + error rate | ✅ Full KPI | `AIGatewayLog` has all needed fields. |
| **LQS v0** Listing quality score (10-item) | ✅ Full KPI | `/api/listing-completeness` route is live. |
| **Profile Completion v0** Company profile completeness (13-item) | ✅ Full KPI | All `Company` fields + `CompanyDocument` + `CompanyBranch` exist. |

### 9.2 Partially computable today (some sub-metrics need new tracking or migration)

| KPI | What's measurable | What's blocked | Migration / tracking needed |
|---|---|---|---|
| **KPI-4 (RFQ variant)** View→RFQ conversion | Buyer-funnel (buyerId match) | Per-listing RFQ conversion | `RFQ.listingId` FK (`REQUIRES MIGRATION — follow-up`) OR persist `phone` in `AnalyticsEvent.metadata` (new tracking call) |
| **KPI-6** Passport doc count + status | docCount, hasSerial, inspectionResult, inspectionFreshness | Passport Score (5-factor) | 10 fields on `MachinePassport` (`REQUIRES MIGRATION PR-SC-03`) |
| **KPI-8 (acceptance)** AI suggestion acceptance rate | (nothing) | Full sub-metric | `AISuggestion` model (`REQUIRES MIGRATION — new PR-SC-11`) |
| **Lead→Deal conversion** | Deal counts by listingId (approximate) | Exact lead→deal attribution | `Deal.leadId` FK (`REQUIRES MIGRATION — ASC-083 NEEDS DECISION`) |
| **LQS v1** Listing quality score (6-factor weighted) | (LQS v0 is the live proxy) | Cache + recalc job | `Listing.inventoryScore` + version + scoredAt + breakdown (`REQUIRES MIGRATION PR-SC-03 REVISED`) |

### 9.3 Fully blocked (need new model migration before any computation)

| KPI | What's blocked | Migration needed |
|---|---|---|
| **KPI-5** Showroom page performance | Entire KPI | `Showroom` model (`REQUIRES MIGRATION PR-SC-02`) + `ShowroomAnalytics` model (`REQUIRES MIGRATION ASC-074 / new PR-SC-10`) |
| **KPI-7 (SalesTeamMember dimension)** Sales-team performance with role/title | Richer per-member display (role, title, active flag) | `SalesTeamMember` model (`REQUIRES MIGRATION PR-SC-02`) — NOT a blocker; `Lead.assignedToId → User` works today for the basic grouping |

### 9.4 Summary count

- **KPIs computable end-to-end today (no migration, no new tracking):** 9 distinct metrics (8 KPIs minus blocked KPI-5, plus LQS v0 and Profile Completion v0).
- **KPIs partially computable (some sub-metrics blocked):** 5 (KPI-4 RFQ, KPI-6 Passport Score, KPI-8 acceptance, Lead→Deal, LQS v1).
- **KPIs fully blocked:** 1 (KPI-5 Showroom).
- **Fields/models requiring migration (counted):** see §10.

---

## 10. Fields Requiring Migration (consolidated, deduplicated against PR-SC-01 merge)

PR-SC-01 (PR #9, merged `c66e060`) shipped 10 Lead columns + 3 indexes + 2 User back-relations. Those are now `EXISTS` and are removed from the migration list below. The remaining items, grouped by unblocking PR:

| # | Field / Model | Model | DB | Unblocking PR | Used by | Status |
|---|---|---|---|---|---|---|
| 1 | `Listing.inventoryScore` | Listing | main | PR-SC-03 REVISED | LQS v1 cache | MIGRATION |
| 2 | `Listing.inventoryScoreVersion` | Listing | main | PR-SC-03 REVISED | LQS v1 version | MIGRATION |
| 3 | `Listing.inventoryScoredAt` | Listing | main | PR-SC-03 REVISED | LQS v1 recalc | MIGRATION |
| 4 | `Listing.inventoryScoreBreakdown` | Listing | main | PR-SC-03 REVISED | LQS v1 explain | MIGRATION |
| 5 | `MachinePassport.specsVerifiedAt` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 6 | `MachinePassport.specsVerifiedBy` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 7 | `MachinePassport.ownershipVerifiedAt` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 8 | `MachinePassport.ownershipVerifiedBy` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 9 | `MachinePassport.inspectionVerifiedAt` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 10 | `MachinePassport.inspectionVerifiedBy` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 11 | `MachinePassport.serviceHistoryVerifiedAt` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 12 | `MachinePassport.serviceHistoryVerifiedBy` | MachinePassport | main | PR-SC-03 | KPI-6 Passport Score | MIGRATION |
| 13 | `MachinePassport.passportScore` | MachinePassport | main | PR-SC-03 or PR-SC-03a | KPI-6 cache | MIGRATION |
| 14 | `MachinePassport.passportScoreVersion` | MachinePassport | main | PR-SC-03 or PR-SC-03a | KPI-6 version | MIGRATION |
| 15 | `Showroom` model (new) | Showroom | main | PR-SC-02 | KPI-5 | MIGRATION |
| 16 | `ShowroomAnalytics` model (new) | ShowroomAnalytics | main | ASC-074 / PR-SC-10 | KPI-5 | MIGRATION |
| 17 | `SalesTeamMember` model (new) | SalesTeamMember | main | PR-SC-02 | KPI-7 (richer display, non-blocking) | MIGRATION |
| 18 | `AISuggestion` model (new) | AISuggestion | main | new PR-SC-11 / Phase 6 | KPI-8 acceptance | MIGRATION |
| 19 | `RFQ.listingId` FK | RFQ | main | follow-up (not in PR-SC plan) | KPI-4 RFQ exact conversion | MIGRATION |
| 20 | `Deal.leadId` FK | Deal | main | ASC-083 NEEDS DECISION | Lead→Deal exact attribution | MIGRATION |
| 21 | `Lead.firstRepliedAt` cache | Lead | main | PR-SC-06 | KPI-7 response-time perf | MIGRATION |
| 22 | `Lead.firstResponseMs` cache | Lead | main | PR-SC-06 | KPI-7 response-time perf | MIGRATION |
| 23 | `Part.firstListedAt` | Part | store | P2 follow-up | KPI-2b DOM for Parts | MIGRATION |
| 24 | `Part.partCatalogScore` + version | Part | store | P2 follow-up | Future Part Catalog Score | MIGRATION |
| 25 | `Part.oemNumber` | Part | store | P2 follow-up | Future Part Catalog Score | MIGRATION |
| 26 | `Part.documents` relation (new) | Part | store | P2 follow-up | Future Part Catalog Score | MIGRATION |
| 27 | `Company.bannerUrl` / `brandColor` / `storeDescription` / `storeSlug` | Company | main | PR-SC-02 (note: `logoUrl` + `slug` already exist per G20/F7) | Showroom branding | MIGRATION |
| 28 | `KpiBaseline` model (optional — `Setting` JSON works for v1) | (new) | main | new PR-SC-XX follow-up | Persisted baselines (§8.4) | MIGRATION (OPTIONAL) |

**Count of distinct migration items:** 27 required + 1 optional = **28 total** (vs. 26 in `STORE-ANALYTICS-BI.md` Appendix A — the delta is +4 newly-identified items: `Deal.leadId` FK, `Lead.firstRepliedAt`, `Lead.firstResponseMs`, optional `KpiBaseline`; the -2 is PR-SC-01's `Lead.status` + `Lead.assignedToId` which are now `EXISTS`).

---

## 11. Hard-Rule Compliance Checklist

| Hard rule | Compliance |
|---|---|
| Every formula references a REAL field | ✅ §0 grounds every field against `schema.prisma` on `main` `f597562`; §10 lists the 28 fields/models requiring migration with explicit PR refs. |
| No display numbers or fake data as real statistics | ✅ No sample numbers appear in any KPI formula or card label. Every "X%" reference is explicitly a formula placeholder, not a displayed value. |
| 30-day baseline required before any growth claim | ✅ §8 mandates it; §8.5 enumerates which KPIs need it; §8.6 documents the PR-SC-01 cutover caveat for KPI-3. |
| Cross-DB (main↔store) queries flag the ADR-003 limitation | ✅ KPI-2b marked `⚠ CROSS-DB (ADR-003 §5)`; §0 G19 documents the limitation; §9 references it for KPI-2b. |
| Do NOT modify code, schema, or PRs | ✅ This document is documentation only. No `.ts`, `.prisma`, `.sql`, or `.json` file was modified. |

---

## 12. Lead Score v1 Validation — Final Verdict

**Lead Score v1 is VALID and ships-ready as an algorithm.** The implementation is deterministic, versioned (`v1`), explainable (6-factor breakdown + top-2 reason string), clamped to `[0, 100]`, pure-function (no DB), and permitted-data-only (all inputs seller-owned). All 6 factors map to fields that exist on `main` `f597562`; no v1 factor requires migration. The 40 unit tests pin every weight and boundary with zero drift.

**Two non-blocking follow-ups (both PR-SC-06, not Lead Score v1 itself):**
1. The recalc job that populates `Lead.score/scoreVersion/scoreBreakdown/scoredAt` is not yet shipped — until PR-SC-06, production leads have `Lead.score = NULL` and the dashboard must render "score not yet computed".
2. The override PATCH handler (audited via `auditMutationTransactional` per ADR-003 §2) is not yet shipped — until PR-SC-06, the override columns sit unused.

**One roadmap decision (not a defect):** the v1.1 L7 pipeline-stage bonus (`+10 if status=QUALIFIED, +5 if CONTACTED`) remains deferred. `Lead.status` now EXISTS, so v1.1 is technically unblocked; shipping it is a roadmap call, not a schema dependency.

---

**End of document.**
