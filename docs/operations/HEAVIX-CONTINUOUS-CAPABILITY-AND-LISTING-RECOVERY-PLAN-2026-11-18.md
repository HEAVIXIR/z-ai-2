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
