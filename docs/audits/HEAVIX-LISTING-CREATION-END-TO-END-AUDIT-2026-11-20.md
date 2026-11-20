# HEAVIX — Listing Creation End-to-End Audit
## 20 November 2026

### Executive decision

**Status: PARTIAL — NOT YET APPROVED for Preview acceptance or Integration release.**

The seller listing flow has a coherent implementation path across the seven-step wizard, canonical taxonomy and attribute APIs, authenticated creation endpoints, private B2 staging, durable ListingImage manifest rows, and seller retry recovery. Additional source-level safeguards have since been added: Listing idempotency receipts are now committed atomically with the Listing transaction, exact machine-serial duplicates are flagged for human moderation, empty-but-successfully-loaded category attribute forms can proceed, and canonical province selection is enforced by both supply-listing and wanted-request APIs.

This is a source-level review plus CI verification for the exact PR #357 head. CI run #4232 (`44777105704`) completed successfully on `dd58b0f36e1898e941a4bd62d8501d09ef1ed2e`, including verify, unit/contract tests, integration tests, migration proof on isolated databases, production build, Docker, TLS, and Workerd smoke. It is **not** runtime, browser E2E, live B2 integration, or Preview acceptance certification.

## 1. Scope and evidence baseline

- Repository: `HEAVIXIR/z-ai-2`
- Reviewed head branch: `feat/listing-media-recovery-retry-2026-11-20`
- Reviewed head after audit fixes: `dd58b0f36e1898e941a4bd62d8501d09ef1ed2e` (PR #357; CI run #4232 passed)
- Integration root: PR #340, branch `integration/preview-readiness-workerd-2026-11-15`
- Stacked capability PRs: #350 → #351 → #352 → #353 → #354 → #355 → #356 → #357
- All reviewed PRs remain Draft/open/unmerged.

The product contract is the HEAVIX Taxonomy V1 / Listing Creation Flow: TransactionType, Category, Brand/Model, dynamic attributes, condition/details, price, canonical location, media/documents, validation, duplicate detection, moderation, then publication. Category, Product, Brand, Model, Listing, TransactionType, Service, and Industry remain distinct concepts.

## 2. End-to-end flow review

| Stage | Current implementation | Audit result |
|---|---|---|
| Entry / authentication | `/listings/new` is protected by the auth gate in PR #356; login/register preserve a safe internal return path. Creation APIs independently authenticate and derive seller identity from the session. | IMPLEMENTED — source reviewed |
| Transaction intent | Wizard loads active transaction types and separates supply listings from demand-side BuyRequest. WANTED and SERVICE_REQUEST use `/api/wanted`; QUOTE is represented as an RFQ attached to a supply Listing; SERVICE_OFFER remains a supply/service listing. | IMPLEMENTED — source reviewed |
| Taxonomy | `GET /api/taxonomy` supplies active CATALOG/MARKETPLACE/SERVICE roots, transaction types, and service types. Wizard uses cascading category selection and clears dependent state when transaction intent changes. Server requires an active leaf category and validates its layer against transaction type. | IMPLEMENTED — source reviewed |
| Brand / model | Brand search is alias-aware and category-filtered. Model lookup is scoped to the selected brand/category. APIs reject inactive brands/models and mismatched brand/model/category combinations. Both selectors are optional in the wizard; when supplied they are validated. | IMPLEMENTED — optional by design |
| Dynamic attributes | `GET /api/categories/[id]/attributes` composes ancestor-to-leaf CategoryAttribute policy and optional model-level overrides. Client renders typed controls. Supply and demand APIs independently validate active scope, required fields, value type, and option ownership; writes are persisted atomically with the parent entity. | IMPLEMENTED — source reviewed |
| Location | Country/province/city are loaded from HEAVIX-owned location APIs. Exact WGS84 coordinates are optional and accepted only as a complete valid pair with a selected city. | HARDENED in this audit — province is now required server-side; city and exact point remain optional |
| Details / price | Wizard checks title/summary, transaction-specific budget, price, rental period, auction dates/increments, and image requirements. APIs independently validate critical price, budget, quantity, rental, and auction values. | IMPLEMENTED — source reviewed |
| Media upload | Seller uploads go through authenticated `POST /api/media/staging`, are private, owner-bound STAGED assets in B2, and use stable `/api/media/{id}` URLs. The private read gate permits the uploader to preview staged assets. | IMPLEMENTED — source reviewed; B2 runtime not re-executed |
| Listing persistence | Listing row, ListingImage manifest rows, optional Auction/RFQ child, and typed attributes are written in a database transaction. Listing begins in PENDING; seller identity is derived from session. | IMPLEMENTED — source reviewed |
| B2 finalization / recovery | Staged assets are attached after the Listing transaction. Failures retain the manifest row and return explicit pending state. Canonical seller-owned `POST /api/listings/[id]/media` retries safely and is idempotent for an asset already attached to that exact listing. Seller editor exposes recovery. | IMPLEMENTED — source reviewed; runtime unverified |
| Demand persistence | `/api/wanted` validates canonical taxonomy, demand intent, budget, location hierarchy, and required typed attributes. BuyRequest and its attribute parent/child rows are committed atomically; BuyRequest has owner-scoped database idempotency. | IMPLEMENTED — source reviewed |
| Moderation / publication | New supply listings are created as PENDING and seller edits cannot self-publish a pending listing. BuyRequest creation is also PENDING and remains outside public/matching feeds until the admin publication transition. | IMPLEMENTED — source reviewed; admin acceptance workflow not browser-tested |
| Duplicate detection | Exact case-insensitive MachinePassport serial-number matches against PENDING/PUBLISHED/ACTIVE listings are detected inside the Listing transaction and recorded in internal `adminNotes` with candidate IDs; creation is flagged for human review and is not auto-rejected. | PARTIAL — deterministic serial signal added; fuzzy/category/brand/model/year signals and moderation UI verification remain open |
| Documents | The current wizard does not demonstrate a complete seller document-upload and verification workflow for every listing type. | PARTIAL — not certified end-to-end |

## 3. Changes made during this audit

1. **Empty technical form handling:** a category whose attribute request succeeds but returns no configured attributes can now continue. Previously the wizard required `attributeDefs.length > 0`, making a valid category with no configured technical fields impossible to submit. Required fields remain enforced by the server; a failed attribute fetch still fails closed.
2. **Supply location enforcement:** `POST /api/listings` now rejects submissions without a resolved canonical Province. A supplied City must still belong to that Province. City and exact coordinates remain optional to match the current wizard.
3. **Demand location enforcement:** `POST /api/wanted` now rejects requests without a resolved canonical Province. A supplied City must still belong to that Province.
4. **Regression contract coverage:** added tests asserting the empty-attribute wizard behavior, both server-side province guards, atomic idempotency receipt wiring, and exact-serial duplicate review flag. These regression tests were executed in CI run #4232 and passed.\n5. **Durable Listing idempotency:** the listing route now hashes the caller key together with the authenticated seller ID, checks the namespaced key, and writes a strict AuditLog receipt through the same Prisma transaction as the Listing, image manifest, children, and typed attributes. The post-commit best-effort audit is skipped when a durable receipt was written. Existing globally unique `AuditLog.idempotencyKey` is reused; no schema migration is introduced. Concurrent unique/serialization conflicts attempt to resolve to the winning Listing. This is source-level implementation; CI run #4232 passed, but dedicated behavioral retry/rollback/concurrency proof remains outstanding.

## 4. Release-blocking and follow-up findings

### P0 — Listing idempotency transaction coupling: IMPLEMENTED IN SOURCE, NOT YET VERIFIED

The listing route now derives a seller-scoped SHA-256 delivery key from the authenticated seller ID and client `Idempotency-Key`. It checks that key before validation and inserts a strict AuditLog receipt through the same Prisma transaction as the Listing, image manifest, optional children, and typed attributes. If the receipt insert fails, the transaction rolls back rather than committing a Listing without a replay record. The old post-commit best-effort listing audit is retained only for callers that omit an idempotency key. Concurrent unique/serialization conflicts attempt to resolve to the already committed result.

This reuses the existing globally unique `AuditLog.idempotencyKey` column without a schema migration. The seller namespace is hashed to avoid collisions when different sellers happen to submit the same raw key.

**Remaining gate:** execute dedicated behavioral transaction tests, including sequential retry, concurrent retry, receipt-write failure rollback, and cross-seller same-raw-key isolation. General CI run #4232 passed, but these targeted cases are not yet evidenced. The UI currently sends a stable key for each submission attempt; API callers that omit the header still use legacy non-idempotent behavior.

### P1 — Duplicate detection: PARTIAL

The Listing transaction now checks exact case-insensitive MachinePassport serial-number matches against active moderation/publication statuses. A match does not reject or merge the new Listing; it adds an internal `AUTO_DUPLICATE_REVIEW` note with candidate Listing IDs and returns `duplicateReviewRequired: true`.

**Remaining gate:** extend conservative matching to category/brand/model/year/seller signals where no serial exists, ensure the moderation UI visibly surfaces the internal review marker, and execute false-positive/false-negative tests. The current exact-serial rule is a narrow deterministic first layer, not complete duplicate intelligence.

### P1 — Demand media is not yet supported by the wizard

The wizard explicitly disables image attachment for WANTED and SERVICE_REQUEST because there is no canonical BuyRequest media-association workflow. This is a known limitation, not an upload success. Decide whether demand posts require optional evidence/media; if yes, implement a separate owner-bound BuyRequest media association and moderation/read policy before enabling the UI.

### P1 — Full end-to-end proof is missing

The source-level tests and unit contracts do not prove a real browser journey across auth, database writes, B2 upload/read/attach/retry, seller edit, admin moderation, and public visibility. A Playwright or equivalent E2E journey plus isolated Preview runtime proof is still required.

## 5. Integration and Preview readiness

### GitHub state observed

- PR #340 is Draft/open/unmerged and mergeable. Its head `7492b8993207ff9bd80f6fc560ef859f8e46908e` had successful `CI` and `OpenNext runtime integration proof` workflow runs at the time of inspection.
- PR #340's Integration branch is 1 commit behind current `main` and has diverged (1,136 commits ahead, 1 behind). It must be reconciled with the current protected main head before final release review.
- PRs #350–#357 are stacked in order, all Draft/open/unmerged/mergeable at inspection.
- PR #357 head `dd58b0f36e1898e941a4bd62d8501d09ef1ed2e` has successful CI run #4232; the remaining stacked PRs still require final-head checks. The root PR #340 green checks therefore do not certify the later stacked commits.
- Current `main` is protected. Required checks observed: `verify`, `audit-transaction`, `phase-tests`, `docker-build-proof`, and `tls-proof`.

### Preview controls

PR #340 explicitly states that Cloudflare Workers Builds is disconnected, Preview builds are disabled, and reconnecting Workers Builds requires release gates plus separate owner approval. No Preview deployment, database migration/seed, Production deployment, or Worker build was performed or authorized during this audit.

### Decision

**The branch chain is prepared as a Draft integration candidate, but it is NOT approved for Preview acceptance yet.** Do not merge or deploy. Do not migrate/seed either database. Keep the PR chain Draft until the P0/P1 items, final-head CI, protected-main synchronization, and exact isolated Preview runtime/dual-database proof are complete.

## 6. Required next gates

1. Implement durable seller-scoped Listing idempotency inside the canonical transaction boundary.
2. Add non-destructive duplicate detection and moderation evidence.
3. Decide and implement (or formally defer) BuyRequest media/document support.
4. Add/execute browser E2E for supply SALE, RENT, AUCTION, QUOTE and demand WANTED/SERVICE_REQUEST paths, including negative authorization and validation cases.
5. Execute B2 staging → manifest → attach → retry → private/public read checks against isolated Preview resources.
6. Reconcile Integration branch with current protected `main`, then run all required checks on the final stacked head.
7. Obtain explicit owner approval before reconnecting Preview build infrastructure; no Production action is implied.

---
*This report distinguishes source inspection from executed verification. “Implemented” means code is present and its contract was inspected; it does not mean CI, live Preview, or Production has passed.*
