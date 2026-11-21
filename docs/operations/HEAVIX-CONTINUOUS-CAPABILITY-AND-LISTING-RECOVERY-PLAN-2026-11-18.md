# HEAVIX Continuous Capability Recovery & Listing Journey Plan
## Baseline: 2026-11-18

Status: ACTIVE / LIVING EXECUTION PLAN  
Repository: `HEAVIXIR/z-ai-2`  
Execution branch: `integration/preview-readiness-workerd-2026-11-15`  
Baseline commit: `38cfd5e60cbb06c47e1228b3224d401513a9a51d`  
Legacy reference: `dellk00k/z` extracted snapshot at `bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`; original `HEAVIXIR/z` archive repository is also retained as provenance.  
Release boundary: Integration and isolated Preview only. PR #340 remains Draft/open. No Production merge/deploy.

> This plan is an operational ledger, not a declaration of feature completeness. A page, API route, menu item, or passing build is not evidence that a user journey works end to end. Every status requires source provenance and reproducible test/runtime evidence.

## 1. Owner priorities (binding)

### Priority A — Recover real operational capability throughout the product and Control Panel
Every currently visible capability must have its complete and coherent implementation across:
- UI and navigation;
- API contract and server-side validation;
- domain/service logic;
- database model and persistence;
- RBAC, ownership/tenant scope, CSRF and audit;
- external integrations and configuration (names only in documentation);
- loading, empty, error, retry and partial-failure behavior;
- unit/contract/integration/E2E tests;
- observable behavior in the isolated Preview.

The objective is to recover the valuable behavior of the legacy product while adapting it to the current modular-monolith, PostgreSQL, Cloudflare/OpenNext and security architecture. Do not copy legacy files or entire branches blindly. Use `KEEP / ADAPT / REBUILD / REJECT` with a reason and source SHA.

### Priority B — Make listing creation correct from the first choice through final submission
The entire listing journey is a first-class P0 workstream. Every step/tab/section must be connected to the correct data source, state transitions, validation, API and persistence. The journey must be verified from the first selection (transaction/listing intent) through taxonomy, brand/model, attributes, location, details, media, review, submission, moderation state and post-submit recovery.

A successful HTTP response alone is insufficient: verify persisted relations and values, uploaded media ownership/attachment, and the resulting seller/admin views using isolated test fixtures or explicitly approved Preview data.

## 2. Governing project decisions and constraints

- The data spine remains `Taxonomy → Attribute → Brand → Model → Product → Listing → Location → Media`.
- Keep Category, Product, Listing, TransactionType, ServiceType, Industry and Service as distinct concepts.
- Use the current canonical API/module when present; do not create parallel APIs or competing sources of truth.
- Machine/service/material forms must be taxonomy-driven, with inherited parent attributes and exact terminal-category templates. Unknown technical values remain unknown; AI-inferred values require provenance and confidence.
- Preserve Backblaze B2 as the selected media storage direction; do not substitute R2.
- Preserve authentication, RBAC, CSRF, ownership checks, rate limits, audit, safe URL handling, quotas and tenant boundaries. Never weaken security to make a screen appear functional.
- Do not expose, copy, or log secret values. Record only required binding names and whether the binding is present/absent where safely observable.
- No Production deployment, DNS change, destructive DB action, migration, seed, or real-data mutation without the required explicit approvals and database identity/backup gates.
- No unapproved paid provider calls. Document cost/quota/fallback before enabling any provider-backed execution.
- Keep PR #340 Draft/open until exact-SHA CI, Preview and owner acceptance gates are met.

## 3. Required capability state vocabulary

Each capability is scored independently across UI, API, domain logic, data, permission, configuration, tests, observability and Preview:

- `INTEGRATED_VERIFIED`: all required layers and representative Preview journey proven.
- `INTEGRATED_CODE_ONLY`: code exists; runtime behavior not proven.
- `PARTIAL`: one or more required layers/subflows missing or inconsistent.
- `UI_ONLY`: visible interface exists without a working end-to-end operation.
- `MISSING`: required capability is absent.
- `BLOCKED_CONFIG`: code exists but required binding/provider/config is unavailable.
- `BLOCKED_COST`: execution depends on unapproved or unknown paid usage.
- `BLOCKED_DATA`: verified Preview data/schema preconditions are absent.
- `SUPERSEDED`: replaced by a newer compatible implementation; provenance retained.
- `REJECTED_WITH_REASON`: unsafe, obsolete, duplicate or incompatible source with evidence.

Every inventory row must include: domain/capability, legacy source path + commit, candidate branch + SHA, current target path + SHA, API contract, data dependencies, UI entry, permission keys, configuration names, tests, Preview evidence, state, decision, next action and owner/approval gate.

## 4. Workstreams and execution order

### Workstream 0 — Baseline, source provenance and audit machinery
1. Re-read the continuation protocol, current-state checkpoint, capability reconciliation, legacy provenance, existing audits and worklog before each work batch.
2. Freeze the Integration branch and record exact HEAD.
3. Enumerate all current visible routes, admin menu items, API handlers, Prisma domains, background jobs and external integrations.
4. Enumerate the legacy snapshot and candidate recovery/fix branches.
5. Build a many-to-many capability map (one capability may depend on multiple files; one file may serve multiple capabilities).
6. Record route/file parity separately from behavioral parity.
7. Produce a prioritized issue/backlog and append evidence to the worklog after each batch.

### Workstream 1 — Listing journey end-to-end (P0; start immediately)
Audit and test these seven current wizard steps individually:

| Step | Current intended responsibility | Required evidence |
|---|---|---|
| 1 | Transaction type / user intent | Active transaction types load from the canonical API; every supported type routes to the correct domain; unavailable/empty/error states are explicit; selection resets dependent state correctly. |
| 2 | Taxonomy/category path | Correct CATALOG / MARKETPLACE / SERVICE layer; all active categories reachable at every supported depth; only valid terminal leaves can be selected; selected path and IDs agree. |
| 3 | Brand, model and basic identity | Alias-aware brand search; model filtered by selected brand/category; optionality rules for service/request flows; stale selections cleared on upstream changes. |
| 4 | Dynamic attributes | Parent-to-leaf inheritance; exact specialist form; model overlays; required/type/unit/option validation; no invented values; values preserved when navigating back/forward. |
| 5 | Location | Country → province → city consistency; requiredness per transaction/domain; canonical IDs, not opaque text, persist. |
| 6 | Details, transaction-specific fields and media | Sale/rent/request/service/auction-specific field rules; price and rental semantics; contact fields; upload progress, constraints, retry and removal; staged assets belong to the authenticated seller and are durably attached. |
| 7 | Review and final submission | Review is a faithful projection of all prior sections; back/edit works; final POST is authenticated, CSRF-protected, validated and atomic where required; success reflects actual persisted state and moderation status. |

Cross-step acceptance:
- No step can advance while its required data is loading, invalid or unavailable.
- Changing an upstream choice invalidates only dependent values and does so visibly.
- The wizard handles refresh/navigation without silently losing or corrupting data; draft/resume behavior is audited and specified.
- Every transaction type is tested: SALE, RENT, WANTED, QUOTE, AUCTION, SERVICE_REQUEST and SERVICE_OFFER where supported by the current product contract.
- Every active terminal category in CATALOG, SERVICE and material/mineral domains has the correct form coverage; no generic fallback masks missing specialist forms.
- Attributes, listing row, transaction relation, location and media links are verified after submission.
- Seller and Admin can read the resulting record with correct ownership, moderation and audit state.
- E2E tests exercise the full journey, including negative cases and partial media failure.

### Initial source-level observations (not yet runtime acceptance)
- Current UI: `src/app/listings/new/page.tsx`, seven visible steps; step 1 uses `TransactionTypePicker`, step 2 uses `CascadingCategoryPicker`, step 3 handles brand/model/basic data, step 4 uses `AttributeFields`, step 5 uses `LocationPicker`, step 6 details/media, step 7 review and POST.
- Current submission API: `src/app/api/listings/route.ts`. It derives seller identity from the session, checks CSRF, validates active transaction type and terminal category/layer, validates brand/model, enforces staged media ownership and listing image limits, checks location hierarchy and validates attribute values. It creates a pending listing. Each of these source-level controls still requires focused tests and Preview evidence.
- Current image component: `src/components/listings/ListingImageUploader.tsx` calls `POST /api/media/staging`, not the Admin upload endpoint. It expects a stable media URL and submits those URLs with the listing. Therefore the old Admin-only upload finding must not be copied forward as a current fact without checking the staging route and actual B2 object lifecycle.
- Current taxonomy endpoint: `src/app/api/taxonomy/route.ts` initially returns categories with `level <= 2` and selected machinery grandchildren. However, `CascadingCategoryPicker` lazily calls `/api/taxonomy/categories/[id]` for each selected node when children are not embedded, so the depth limit alone does not prove deeper leaves are unreachable. Verify that every active terminal path is reachable through this lazy-loading contract and that inactive/missing nodes fail safely.
- Current source files and branch history include candidate implementations `feat/listing-wizard-end-to-end-2026-11-14`, `fix/listing-persistence-integrity-2026-11-14`, and `fix/listing-attributes-atomic-2026-11-14`. These are behavior sources for file-by-file reconciliation, not candidates for blind branch merge.
- Legacy extracted snapshot contains `extracted/src/src/app/listings/new/page.tsx`; the old wizard and current wizard must be compared by behavior and contract, not filename alone.
- Not yet verified: complete POST transaction tail, media staging and B2 runtime behavior, every wizard step's exact validation, full taxonomy depth coverage, database persistence readback, and browser Preview journey.

### Workstream 2 — Control Panel capability restoration (P0, continuous)
Audit every visible Admin and Store Center navigation entry and each nested tab/action. Prioritize:
1. Dashboard / Command Center / system health.
2. Users, roles, permissions, sessions and verification.
3. Listings, moderation, review, rejection and lifecycle.
4. Taxonomy, categories, attributes, brands, models and industries.
5. Media library, B2 lifecycle and upload policy.
6. Marketplace requests, RFQ, offers, auctions, procurement and services.
7. Companies, sellers, verification, inspections and trust.
8. Store catalog, inventory, orders, customers, payments, mechanics and currency.
9. AI tools, Scrapers, AI Gateway, policies, budgets and audit.
10. CMS, homepage sections, navigation/menu, SEO, content and media.
11. Analytics, market intelligence, reports and alerts.
12. Settings, integrations, webhooks, notifications, automations, security and audit.

For every screen, test each tab and action against the actual API and database contract. Distinguish read-only, mutating and destructive actions. Ensure confirmations, optimistic state, rollback/error handling, idempotency and audit are correct. Do not report a page as complete based only on the number of routes or API handlers.

### Workstream 3 — Public marketplace journeys and shared foundations
Reconcile search/filtering, listing detail, seller/company pages, saved search/alerts, favorites, requests, services, rental, auctions, comparison, checkout/store, messaging, notifications, content/SEO, mobile/responsive behavior, performance and accessibility. Shared foundations (auth, RBAC, taxonomy, attributes, media, location, search, audit and analytics) are treated as dependencies, not duplicated per page.

### Workstream 4 — Release and operational proof
- Exact-SHA CI: typecheck, lint, security, unit, contract, integration, E2E, migrations against isolated CI DBs, Next production build, Docker/Caddy and Workerd/OpenNext.
- Isolated Preview: route/API smoke, auth/RBAC, data readback, B2 upload/readback/attachment/deletion only under approved test fixtures, and full browser journey.
- Record response status, timestamps, exact commit/deployment IDs and test artifacts.
- No claim of Preview acceptance from a CI build alone.
- Owner acceptance required for critical journeys; PR remains Draft until gates pass.

## 5. Definition of done (per capability)

A capability is complete only when:
1. The legacy behavior and intended product contract are documented.
2. The selected implementation is traced to source commit/path and adapted to current architecture.
3. UI, API, data model, domain logic, permission and configuration are coherent.
4. Positive, negative, authorization, validation, failure and retry tests pass.
5. Exact-SHA CI passes.
6. Isolated Preview proves the real user journey and persisted outcome.
7. Evidence, residual risks and follow-up are recorded in the inventory and append-only worklog.

## 6. First execution batch

1. Finish monitoring exact-head CI and OpenNext for `38cfd5e60cbb06c47e1228b3224d401513a9a51d` and the subsequent fix commit before creating a Preview deployment.
2. Audit `TransactionTypePicker`, `CascadingCategoryPicker`, `AttributeFields`, `LocationPicker`, `ListingImageUploader`, `/api/media/staging`, the full POST `/api/listings` transaction and `/api/listings/[id]/media`.
3. Compare the current wizard and API against the three named candidate branches and the legacy extracted source, preserving provenance.
4. Validate taxonomy depth and terminal leaf coverage read-only; do not seed or migrate.
5. Add focused tests for all seven steps and end-to-end persistence/media ownership before any UI-only completion claim.
6. In parallel, produce the Admin/Store navigation-to-API-to-permission inventory and start with the highest-visibility UI_ONLY/PARTIAL screens.

## 7. Execution continuity and honest limits

This is a persistent repository plan. Work can be resumed from this file and the append-only worklog in later sessions. ChatGPT cannot continue executing tools autonomously between messages or while the conversation is inactive; no unattended background work is claimed. During each active session, continue the next unchecked batch, update exact evidence, and leave a precise next action. Do not create recurring paid jobs or external automation without explicit approval.


## 8. First implementation batch — 2026-11-18

The following source changes are committed to the selected Integration branch. They are not yet declared runtime-verified; exact-head CI/OpenNext and Preview acceptance remain required.

- `034609ca979af67cc53341bff7a438b1016ad35f`: added this persistent plan.
- `66230e2d30991d8196db2fd460d2c443d280b475`: removed implicit SALE auto-selection in `TransactionTypePicker`; user must explicitly select a transaction type. Added retry when the transaction-type API fails or returns an empty list.
- `0ef323061764a49cfd1d9b0aa502dc0a74e07899`: taxonomy fetch now distinguishes loading, error and empty states; adds retry instead of leaving the category step on a permanent loading placeholder.
- `a7c6b057bf2975c022d5c7d160340c431068f942`: category child loading now exposes a retry action.
- `7a64439ce0f56912b5c9d23e8b509aaae7c18145`: dynamic attribute loading now exposes a retry action when no cached attributes are available.
- `e03cb2fbb1e76d23fa212411f7d9f7698d5ee1fc`: country/province/city loading failures are surfaced with independent retry controls.
- `df43de4848a2a719f958181e53cebb5bf6c69097` and `0f350cb36d2e8ffb4c42bbb0349ab547b2e8c05a`: added the seven-step listing wizard source-contract tests and retry assertions.
- `12e887ddcf39aa48cf613b36e0bcacdd75da5cc9`: removed duplicate taxonomy state updates from the wizard fetch effect.
- Tracking issue: [#344 — Continuous capability recovery and end-to-end listing wizard acceptance](https://github.com/HEAVIXIR/z-ai-2/issues/344).

### Remaining in the first listing batch

- Review and harden brand/model lookup failure and retry UX.
- Validate the exact attribute payload mapping and required-field behavior for every supported attribute type.
- Validate all transaction-specific fields and their persistence (including service offer/request, WANTED, QUOTE, AUCTION and RENT).
- Verify the complete media lifecycle against isolated Preview B2 storage, including upload, readback, attach, retry and cleanup; no live B2 operation is claimed here.
- Add behavioral tests that cover all seven steps, transaction variants, invalid selections, API outages, back/forward navigation and persisted readback.
- Run exact-head CI/OpenNext and then isolated Preview browser acceptance; no deployment or data write until gates pass.


## 9. Follow-up execution log — 2026-11-18 (continued)

- `afc02549cab6370b4060f00dd32d8c2dd1319ccb`: updated the stale scraper security/source-contract tests to reflect the current Integration behavior (no artificial Marketplace activation flag, auth + CSRF before AI preflight, allowlisted source validation, and the current 30-URL import bound).
- `6b0bbb69c3653423b9700b05052eab0bc6135672`: aligned the Admin mutation/CSRF contract test with the same current scraper authorization contract. These are test expectation changes only; they do not weaken runtime authorization or source URL validation.
- OpenNext run `44330599937` failed after the Worker bundle was successfully generated. The failure was in the local preview readiness probe: the script accepted the first HTTP response (including transient non-ready responses) as ready and immediately attempted JSON parsing. The observed body was plain `Forbidden`, which caused a misleading JSON parse exception.
- `b51bda6e530a65061026ddfa2d44e4fa695ffde7`: changed the OpenNext smoke runner to keep polling until an HTTP 200 response, retain bounded diagnostics for non-200 responses, and report non-JSON response details without exposing the ephemeral token. Exact-head CI/OpenNext reruns are pending/in progress; this change is not yet considered verified.
- Listing wizard source audit confirmed the current POST handler persists `transactionTypeId`, `listingType`, category, optional brand/model, canonical location IDs, validated typed attributes, and staged image relations atomically; moderation status remains PENDING. This is source inspection, not runtime acceptance.
- **Data-model blocker found:** Prisma has a standalone `ServiceType` model and the taxonomy endpoint returns active `serviceTypes`, but `Listing` has no `serviceTypeId` relation/field. The wizard currently routes service transactions through SERVICE-layer categories and stores SERVICE_OFFER/SERVICE_REQUEST in `transactionTypeId`; it does not persist a selected ServiceType. Do not silently encode this into an unrelated field. Classify service-type selection/persistence as `BLOCKED_DATA` pending an explicitly approved schema/migration decision. No migration or database write was performed.
- Additional audit still required: transaction-specific validation for WANTED/QUOTE/AUCTION/SERVICE_OFFER/SERVICE_REQUEST/RENT; required-field and serialization matrix for all dynamic attribute types; brand/model retry; media staging/readback/attach/retry/cleanup; browser-based Preview acceptance.
- Current Integration branch head at this log entry: `b51bda6e530a65061026ddfa2d44e4fa695ffde7`.

## 10. Owner authorization and domain-relation implementation — 2026-11-18

The project owner explicitly authorized preparing Prisma Schema and migration changes on the Integration branch. This approval does **not** authorize applying migrations to Preview, Production, or any operational database, nor seeding or mutating real data.

### Domain decisions grounded in the existing code
- `SERVICE_REQUEST` and `SERVICE_OFFER`: add an optional, nullable `Listing.serviceTypeId` foreign key to the canonical `ServiceType` model. The API must require an active ServiceType for service transactions and reject mismatched/inactive values.
- `AUCTION`: `Listing.auctions Auction[]` and `Auction.listingId` already provide a real relation. No duplicate Auction schema relation or migration is needed. The listing POST must create one Auction record with all required commercial/date fields in the same database transaction.
- `QUOTE`: add an optional, unique `RFQ.listingId` relation to Listing. Standalone RFQs remain valid; existing RFQ rows remain null. The wizard/API must create the linked RFQ atomically with the listing and preserve the RFQ's own lifecycle.
- `WANTED`: the canonical existing demand domain is `BuyRequest` via `wanted-service.ts`, not RFQ. Do not merge WANTED and QUOTE semantics. The wizard's current WANTED routing remains a separate required follow-up to route through the BuyRequest domain and preserve structured demand data.

### Additive migration prepared
- Migration: `20261118152000_link_listing_service_rfq`
- Adds nullable `Listing.serviceTypeId` and nullable unique `RFQ.listingId`, with indexes/FKs using `ON DELETE SET NULL`.
- No existing rows are backfilled, deleted, or rewritten.
- No database command, migration apply, seed, Preview mutation, or Production mutation has been executed.
- The schema/migration still requires Prisma validation, generated-client/typecheck, isolated PostgreSQL migration rehearsal, API/UI implementation and exact-SHA CI. It is not yet runtime-verified.

## 11. Domain persistence implementation — 2026-11-18 (continued)

Source changes committed on Integration:
- `6de80f7e275bb455b77e061c27d21eb0e4f2d107`: additive Prisma relations and migration `20261118152000_link_listing_service_rfq`; migration README and owner-approved scope recorded.
- `24c949d21cdf9e090b73f51d59e9f0536b86967c`: paired Preview migration governance workflow, Workerd migration fingerprint, and contract coverage updated from six to seven Main migrations; added schema-relation contract test. The workflow remains manual and was not invoked.
- `b9516bd9718578843d467e3411cc719b133d3a67`: POST /api/listings validates active ServiceType, validates Auction configuration, and creates Auction or linked RFQ inside the same Listing database transaction; returns resulting domain IDs.
- `1819de33decaab88e4b3ce315e8d4fa5a0f4f073`: wizard receives ServiceType, Auction scheduling/increment/reserve fields, and QUOTE RFQ quantity/budget/deadline/terms; RFQ and Auction audit events are written best-effort after commit.
- `63e373da1f0397929ad708a913d793a039b0435f`: contract test added for service, auction and RFQ wizard/API contracts; UI digit normalization and client budget comparison hardened.

### Remaining / not yet verified
- WANTED in the seven-step wizard is still not routed to the canonical BuyRequest service; it remains a known gap and must not be represented as completed. It must be completed without conflating BuyRequest with RFQ and without dropping dynamic requirement data.
- Dynamic attribute and service-specific validation still needs transaction-by-transaction behavioral coverage.
- Exact-head CI, Prisma validation/typecheck, OpenNext and Preview browser acceptance have not yet been confirmed for the final code.
- The new Main migration has not been applied to any database. No Preview/Production database writes, seeds, or real listing submissions were performed.
- PR #340 remains Draft/open; no merge or Production release was performed.



## 12. Marketplace transaction architecture — owner direction and design gate (2026-11-18)

The owner explicitly directed that the marketplace transaction domain and Prisma model be designed comprehensively before expanding the listing wizard. The owner also set a hard cost policy: use free-tier tools and services only; do not incur charges, top up wallets, start paid trials, or enable paid capabilities. A paid service is not authorized merely because it is technically available. Prefer existing GitHub/Cloudflare/Vercel/Prisma integrations and free workflows; check for cost before any external execution.

### 12.1 Current-state facts verified from Integration source

- `TransactionType` is currently a small lookup model with `key/nameFa/nameEn/description/icon/active/sortOrder`; it does not encode direction, subject kind, or workflow profile.
- `prisma/seed-taxonomy-v11.ts` currently seeds six values only: `SALE`, `RENT`, `WANTED`, `QUOTE`, `AUCTION`, `SERVICE_REQUEST`. The seed header calls these the HBR V1.1 six transaction types.
- `Listing` currently has legacy `listingType` (default `SALE`), optional `transactionTypeId`, optional `serviceTypeId`, rental columns (`rentalPeriod`, `deposit`, `minimumRentalPeriod`, `operatorIncluded`, `fuelIncluded`, `transportIncluded`, `availabilityStart/End`), and relations to `Auction` and `RFQ`.
- `BuyRequest` is a separate demand-side model and `/api/wanted` + `wanted-service.ts` are its canonical workflow. It currently stores category and brand preferences as text, and quantity is recorded in audit metadata but has no persisted column. It has no normalized category/brand/model foreign keys or structured attribute relation.
- `RFQ` and `Auction` already exist as specialized models. `RFQ` has quotes and procurement requirements; `Auction` has bid rules and bids. They are not a substitute for a general-purpose request/offer intent taxonomy.
- No dedicated tender/RFP/RFI lifecycle model, rental request model, or employment/job model was found in the inspected Prisma schema.
- Existing category layers are `CATALOG`, `MARKETPLACE`, `SERVICE`, and `FALLBACK`; category describes the subject taxonomy, not the commercial intent.

### 12.2 Proposed canonical commercial intents (eight)

These are independent user intents, not eight unrelated implementations of the same concept:

| Canonical key | Persian label | Direction | Subject/workflow |
|---|---|---|---|
| `SALE_OFFER` | عرضه برای فروش | OFFER | Asset/product |
| `PURCHASE_REQUEST` | درخواست خرید | REQUEST | Asset/product |
| `RENTAL_OFFER` | عرضه برای اجاره | OFFER | Rental asset |
| `RENTAL_REQUEST` | درخواست اجاره | REQUEST | Rental asset |
| `SERVICE_OFFER` | عرضه خدمات | OFFER | Service/project |
| `SERVICE_REQUEST` | درخواست خدمات | REQUEST | Service/project |
| `JOB_OFFER` | فرصت شغلی / جذب نیرو | OFFER | Employment |
| `JOB_SEEKER` | جویای کار | REQUEST | Employment profile/request |

Do not blindly rename or delete legacy keys. Preserve a compatibility map during transition:
- `SALE` → `SALE_OFFER`
- `RENT` → `RENTAL_OFFER`
- `WANTED` → `PURCHASE_REQUEST`
- `SERVICE_OFFER` and `SERVICE_REQUEST` remain semantically aligned.
- `QUOTE` is not a commercial intent; it is a procurement/response mechanism and must be mapped to RFQ semantics only after all callers and stored rows are inventoried.
- `AUCTION` is not an intent; it is a sale/asset-disposition mechanism and must be represented as an Auction process attached to an eligible offer.
- No existing key or data row may be removed until usage, backfill, API compatibility, UI labels, analytics, SEO, and old links are mapped and tested.

### 12.3 Independent axes — prevent overlap and conflicting semantics

1. **Commercial intent**: offer/request plus business purpose, represented by canonical intent records.
2. **Subject taxonomy**: machine, spare part, mineral/material, industrial asset, transport, technical service, contractor/project, workforce, and future verticals. Categories remain independent of intent; a mineral category can be offered for sale, requested for purchase, or involved in a supply tender.
3. **Deal/procurement mechanism**: fixed price, negotiable, direct contract, RFQ, RFI, RFP, open tender, sealed tender, forward auction, reverse auction, and (where appropriate) booking/instant reservation. Mechanism must be validated against eligible intents.
4. **Fulfillment/contract terms**: delivery, rental period, availability, deposit, operator/fuel/transport inclusion, project milestones, recurring supply, workforce schedule, and service geography.
5. **Lifecycle/status**: draft, moderation, published/open, responses received, negotiation/evaluation, awarded/accepted, in execution, completed, expired, cancelled, rejected/disputed. Keep workflow-specific states in the relevant domain, not one overloaded status string.
6. **Parties and authority**: user, company, branch, buyer/requester, seller/supplier, employer, candidate, tender owner, invited bidder, evaluator, and auditor. Organization-scoped roles and confidentiality must be modeled explicitly.

### 12.4 Prisma design direction (design first; no migration or database write yet)

- Strengthen `TransactionType` into a canonical, seeded reference with stable key, direction (`OFFER/REQUEST`), subject/workflow family (`ASSET/SERVICE/EMPLOYMENT`), workflow profile, eligible category layers, required specialized terms, active/version/sort order, and explicit legacy aliases. Prefer normalized relation tables for allowed mechanisms and category layers rather than comma-separated strings.
- Keep the existing `Listing` as the offer-side aggregate and `BuyRequest` as the demand-side aggregate for the compatibility phase. Do not create a second generic classifieds table or duplicate each feature into separate ad tables without a clear lifecycle boundary. Add normalized foreign keys and structured requirements to BuyRequest; quantity must be persisted with appropriate decimal/unit semantics, not only in audit JSON.
- Add a deliberate shared set of reusable relations for category, brand, model, location, organization, typed attributes, media, documents, and audit provenance to both offer and request aggregates. Preserve legacy text columns during a staged migration; backfill and dual-read/write only after an explicit mapping and rehearsal.
- Keep `ServiceType` as the service catalogue/classification. It is not a transaction intent and must not be used as a substitute for service offer/request direction.
- Move rental-specific terms toward a dedicated rental terms/availability model with period unit, minimum/maximum duration, pricing basis, deposit, included operator/fuel/transport, availability windows/calendar, delivery/pickup, maintenance/inspection and cancellation terms. Existing Listing rental columns are legacy compatibility fields until a safe migration/backfill plan exists. Rental requests need their own required period, location, capacity/specification and desired date range.
- Keep `Auction` as a specialized process with forward/reverse direction, schedule, increments, reserve/starting rules, eligibility, deposits if ever supported, bid confidentiality, extensions, cancellation, award and immutable bid/audit history. Do not encode an auction as a category or a transaction intent.
- Expand procurement beyond a single RFQ label: a common sourcing event with explicit `RFI/RFQ/RFP/TENDER` subtype, open/sealed submission policy, lots, documents, questions/addenda, deadlines/timezone, eligibility, evaluation criteria, supplier invitations, bid/quote versions, scoring, award and audit trail. Reverse auctions remain a distinct mechanism. Supplier submissions must not be visible to competing suppliers.
- Model employment separately from generic services: employer/job opportunity, candidate/job-seeker profile, skills/certifications/experience, work location or remote/rotation, compensation range, employment type, schedule, application, screening, interview and offer. Protect candidate personal data and consent; public job-seeker exposure must be opt-in.
- Consider future-ready but not launch-blocking domains: recurring supply contracts, framework agreements, subcontracting, consignment, leasing/lease-to-own, asset disposal/scrap, inspection/valuation, transport/logistics, installation/commissioning, maintenance contracts, project tenders, and mineral offtake/supply agreements. Add them through mechanism/workflow profiles, not arbitrary one-off transaction keys unless the lifecycle is genuinely distinct.
- Use explicit decimal quantity + unit, currency-aware monetary fields, timezone-aware deadlines, country-scoped location FKs, structured JSON only for versioned domain-specific payloads (not as a replacement for queryable relational fields), and provenance/audit records for seller-entered vs verified vs imported/AI-extracted facts.
- Keep schema strings/enums consistent with the repository's Prisma/PostgreSQL/SQLite/Workerd generation constraints. Evaluate referential actions, indexes, uniqueness, nullable migration safety, query plans, generated Worker client, preview schema parity, seed idempotency, and rollback/forward-repair before implementation.

### 12.5 Required design and migration gates

Before changing the canonical seed or adding the next migration:
1. Inventory every caller, seed, API, UI component, admin taxonomy editor, analytics event, search filter, public URL, and legacy data use of `SALE/RENT/WANTED/QUOTE/AUCTION/SERVICE_REQUEST/SERVICE_OFFER`.
2. Produce a decision matrix for all eight intents × allowed subject categories × allowed mechanisms × required fields × owning API/model × permissions × lifecycle.
3. Map existing `Listing`, `BuyRequest`, `RFQ`, `Auction`, `ServiceType`, `Rental` and employment-related code; distinguish reusable behavior from dead/legacy paths.
4. Create a versioned architecture decision record and entity-relationship diagram; validate against representative scenarios: excavator sale, mineral purchase request, equipment rental offer/request, mineral analysis service, maintenance contract, workforce vacancy, job seeker profile, sealed mining-services tender, supplier RFQ, forward auction and reverse auction.
5. Generate and validate a Prisma schema diff, migration SQL, Main/Preview schema parity, seed idempotency and data-preservation tests. Rehearse on isolated disposable databases before any Preview apply.
6. Run exact-SHA CI and end-to-end workflow tests, including permissions, ownership, confidentiality, idempotency, audit, cancellation, expiration, and concurrent submissions.
7. Keep the PR Draft and Production untouched until all gates pass.

**Scope boundary:** the owner has now explicitly authorized broad project work, including Preview-only migration after the paired encrypted backup and safety workflow gates. This does not authorize Production changes. No database migration, seed, or real-data write has been run by this design step. The no-cost rule is absolute: do not top up TinyFish or use paid automation/AI/search/storage plans; if a required step is not possible on a free tier, report it and use a free/manual alternative.


## 13. Expanded industrial/mining scope and immediate wizard focus — 2026-11-18

Owner reaffirmed the zero-cost policy and requested broad future coverage for mineral sales/sourcing, mining contractors, project participation and investment, with a high-priority target of finishing the practical listing registration flow in the next focused 1–2 hour work window.

- New architecture ADR committed: `docs/architecture/HEAVIX-INDUSTRIAL-MINING-COMMERCE-DOMAIN-ADR-001-2026-11-18.md`
- Commit: `9f7cfd5eb673095aa534f8bfe1e1638d05ff6c69`
- The ADR defines separate but connected domains for commodity/lot trade, mining projects/tenements/technical reports/resource estimates, contractors/work packages, sourcing/tenders, rental, services, employment, financing and investment.
- It reuses the current Main Prisma catalog, company, location, dynamic attributes, Listing, BuyRequest, RFQ, Auction, inspection, transport and audit concepts; it also records Store's separate RentalListing/RentalBooking, ServiceProvider/ServiceRequest, ProcurementRequest and PurchaseOrder as bounded-context references. No cross-database Prisma relations are allowed.
- Historical Main SQLite schema inspection confirmed richer RFQ/RFQQuote and Auction/AuctionBid structures; they are behavior references only, not PostgreSQL migration sources.
- Existing product docs `docs/PRODUCT-MACHINERY-INVESTMENT.md` and `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` are binding design constraints: no lending, fund collection, capital pooling or participation CTA until legal gates, licensed operator, KYC, escrow/custody, disclosures and audit are verified.
- Global research patterns reviewed: Schema.org Offer/GoodRelations; World Bank RFP/RFB/RFQ/direct selection; WHO procurement method separation; MinesOnline, MINEX, MineralTrade and mining project/investment marketplaces. These are benchmark patterns, not code to copy.
- Critical immediate wizard gaps reaffirmed from source: WANTED still routes through Listing rather than canonical BuyRequest; BuyRequest loses quantity and stores category/brand as text; RENT currently represents offer only, not rental request; machine Brand/Model step must be conditional for mineral/service/project subjects; seller B2 media provider/readback/attachment still requires Preview proof.
- Next active work is the ordinary listing wizard (not investment/tender release): inventory all form/API callers, fix canonical WANTED persistence, make Brand/Model conditional, separate rental request behavior with reuse-first audit, verify media lifecycle, then run focused tests and exact-SHA CI. Do not claim the 1–2 hour target met until the seven-step browser journey passes.
- The ADR is design-gated. No new schema migration, seed, database write, Preview migration, Production action or paid tool execution was performed by this entry.
- Owner explicitly reiterated that no paid tools/services/credits are authorized. TinyFish top-up and paid automation must not be attempted. Continue only with current free/connected tools and manual workflows.


## 14. Listing wizard UX alignment — 2026-11-18

Source-only UX improvements on Integration:
- `7705b5be5af9f458f03762fe3fbc658d165d6743`: changed the wizard hero, subject/category, attribute and location copy from machine-only wording to industrial marketplace wording.
- `1eb6b35f1c900fc2f2a50daab30d621028839e10`: added source-contract assertions for the broader industrial language.
- `3acee8250062379d47f04dd9621e4dbf68ed303e`: changed the step label to generic base information and made brand/model optional in the step title/subtitle.
- `7ac35f1c31a7b57b1407a87b1ba8d31ec59703a8`: aligned the test contract with the new step label.
- `e87c9ad88b54040512ff1e11bedc1b013770fd2c`: corrected wizard comments and Step 1 explanation so it no longer implies every listing is a machine.

These changes do not add mineral assay/lot fields, canonical BuyRequest quantity/spec persistence, rental-request workflow, or project/contractor/investment journeys. Those remain explicit blockers/workstreams in ADR-001. CI #3738 and OpenNext #764 were cancelled while branch updates were arriving; no exact-SHA pass is claimed for the latest source commit. Re-run exact-head CI/OpenNext before acceptance.
