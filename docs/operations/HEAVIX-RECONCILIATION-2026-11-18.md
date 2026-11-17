# HEAVIX — Project Reconciliation & Preview Diagnostic Checkpoint
## 2026-11-18

**Repository:** `HEAVIXIR/z-ai-2`  
**Selected integration branch:** `integration/preview-readiness-workerd-2026-11-15`  
**Checkpoint commit:** `7a439a140acad87e4f538684fcffd4ca6722f0e6`  
**Canonical Preview:** https://heavix-preview.heavixir.workers.dev

## 1. Scope and evidence standard

This checkpoint reconciles the uploaded project-history documents with the current Integration branch, repository documentation, GitHub Issues/PRs/Actions, Cloudflare Worker versions, live Preview endpoints, and redacted Cloudflare observability events.

The repository contains **246 tracked files under `docs/`**. This checkpoint inventories the complete documentation tree and reviews the core architecture, governance, product-roadmap, operations, security, database, deployment, taxonomy, media, and verification documents relevant to the current blockers. Ten distinct uploaded source/history documents were also inspected after duplicate uploads were collapsed by content hash. This is a focused source reconciliation, not a claim that every historical document has been line-by-line re-read.

Evidence labels:
- **Verified:** directly confirmed from repository/API/runtime evidence in this checkpoint.
- **Historical:** recorded in earlier project documents or workflow runs; not a current runtime guarantee.
- **Pending:** requires another explicit approval or runtime proof.

## 2. Product and architecture direction

The governing product direction remains **Industrial Marketplace → Industrial Data/Intelligence Platform**, not a generic classifieds rewrite.

The core domain chain remains:

`Taxonomy → Attribute → Brand → Model → Product → Listing → Seller/Company → Search → Trust → Market Intelligence → Matching/Commerce → AI`

Important architectural constraints preserved from the project documents:
- Category, Industry, Transaction Type, Service, and Product remain separate domains.
- Rental is a transaction type, not a category.
- Brand and Model are independent catalog entities, not category labels or free-form UI fields.
- AI suggestions must not become the source of truth without validation and authorized approval.
- Keep the existing modular-monolith and PostgreSQL/two-client design; do not create parallel v2 domains or rewrite the product foundation.
- Preserve Backblaze B2 as the intended media object store; do not substitute R2.
- Preserve the existing 17-section homepage composition and its current design identity rather than starting a visual rewrite.

The latest uploaded Master Execution Plan V3.0 identifies Phase 6 — Price Intelligence + Compare as the next product phase after Phases 0–5. That roadmap is a product-direction statement, not proof that all Phase 0–5 acceptance gates are currently passing in the deployed Preview.

## 3. Repository documentation and historical-source reconciliation

Key documents reviewed include:
- `docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md`
- `docs/HEAVIX-PROJECT-PRINCIPLES.md`
- `docs/HEAVIX-ARCHITECTURE-OVERVIEW.md`
- `docs/HEAVIX-MASTER-EXECUTION-PLAN-V2.0.md`
- `docs/HEAVIX-COMPLETION-MASTER-SPEC-V1.0.md`
- `docs/HEAVIX-IMPLEMENTATION-GAP-AUDIT.md`
- `docs/HEAVIX-DATA-GOVERNANCE-V1.md`
- `docs/HEAVIX-SECURITY-BASELINE-V1.md`
- `docs/operations/HEAVIX-AGENT-CONTINUATION.md`
- `docs/operations/HEAVIX-CURRENT-STATE.json`
- `docs/operations/HEAVIX-WORKLOG.md`
- `docs/operations/HEAVIX-CAPABILITY-RECONCILIATION-2026-11-17.md`
- `docs/operations/HEAVIX-LEGACY-ARCHIVE-PROVENANCE-2026-11-17.md`
- `docs/operations/HEAVIX-TAXONOMY-SOURCE-RECONCILIATION-2026-11-17.md`
- `docs/operations/HEAVIX-PREVIEW-SEED-RUNBOOK.md`
- `docs/operations/HEAVIX-CLOUDFLARE-BUILD-CONTINUITY-AND-QUOTA-POLICY-2026-11-11.md`
- `docs/operations/HEAVIX-B2-MEDIA-IMPLEMENTATION-DECISION-2026-11-11.md`
- `docs/operations/HEAVIX-CI-AND-PREVIEW-BINDING-AUDIT-2026-11-11.md`
- `docs/verification/HEAVIX-WORKER-IDENTITY-AND-OPENNEXT-PROOF.md`
- `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md`
- `docs/audits/HEAVIX-GLOBAL-INDUSTRIAL-MARKETPLACE-BENCHMARK-2026-11-11.md`
- `docs/architecture/HEAVIX-CATEGORY-SPECIFICATION-COVERAGE-AUDIT-V1.md`
- `docs/architecture/HEAVIX-MACHINE-SPECIFIC-FORMS-CATALOG-V1.md`
- `docs/product/LISTING-DOMAIN-FORMS-PLAN.md`
- Store Center and homepage parity/product specifications.

The older database setup/restore guides contain destructive local-only examples such as dropping a database and using `prisma db push --accept-data-loss`. These are historical local instructions and are **not** authorized for Preview or Production execution. The current Preview seed runbook supersedes them for shared environments.

### Historical data snapshots

Older uploaded records cite 182 categories, zero brands, and zero models; a later uploaded V2 plan cites 539 categories, 629 brands, 24 models, and 33 products. These are historical snapshots from different stages and must not be treated as current Preview counts. The latest live Integration Preview checks from the prior checkpoint reported 16 root taxonomy entries, zero transaction types, zero brand-search results, zero excavator attributes, and 12 services. No seed has been run to reconcile these sources.

## 4. Issues and pull requests

Repository search snapshot:
- **32 open Issues**, **4 closed Issues**.
- **60 open PRs**: 58 Draft and 2 non-Draft.
- **247 closed PRs**: 143 merged and 104 closed without merge.

Important current/historical items:
- [Issue #337 — Preview data bootstrap](https://github.com/HEAVIXIR/z-ai-2/issues/337): taxonomy/catalog data is incomplete; seed source reconciliation remains a gate.
- [Issue #80 — database/migration history](https://github.com/HEAVIXIR/z-ai-2/issues/80): preserve database provenance and establish a safe migration baseline.
- [Issue #111 — AI Gateway boundary](https://github.com/HEAVIXIR/z-ai-2/issues/111): AI calls must remain behind the policy gateway.
- [Issue #112 — Admin API authorization](https://github.com/HEAVIXIR/z-ai-2/issues/112): authorization audit remains a security priority.
- [Issue #240 — Store inventory integrity](https://github.com/HEAVIXIR/z-ai-2/issues/240): Store inventory/consistency work remains relevant.
- [Issue #186](https://github.com/HEAVIXIR/z-ai-2/issues/186) and [Issue #190](https://github.com/HEAVIXIR/z-ai-2/issues/190): runtime proof and paired App/Store database connectivity.
- [Issue #95](https://github.com/HEAVIXIR/z-ai-2/issues/95): Price Intelligence/Compare work remains part of the Phase 6 roadmap.
- [Issue #335](https://github.com/HEAVIXIR/z-ai-2/issues/335): partnership/commercial work is not a substitute for platform readiness.

PR decisions:
- [PR #340](https://github.com/HEAVIXIR/z-ai-2/pull/340) remains Draft; its Integration head points to `main`. Do not merge until release gates and intended integration direction are explicitly resolved.
- [PR #343](https://github.com/HEAVIXIR/z-ai-2/pull/343) was merged into the selected Integration line and contains the bounded admin/login database-read optimization.
- PRs #341 and #342 were merged to `main` to register protected workflow infrastructure; this does not prove runtime identity or database health.
- PRs #317 and #313 were merged to the historical recovery line only; do not treat that fact alone as proof that their behavior is in the selected Integration Preview.
- PR #333 consolidated scraper hardening; its reviewed implementation was selectively transferred into Integration. PR #332 was closed as a duplicate/superseded item.
- Closed PRs are not automatically equivalent to merged capabilities; preserve base/head branch provenance when deciding what is actually in Integration.

## 5. Workflow history and current exact-head checks

Latest 100 Actions-run inventory contained 5,376 total repository runs. Relevant workflow totals in that 100-run window:
- CI: 48 runs (18 success, 1 failure, 29 cancelled).
- OpenNext runtime integration proof: 35 runs (8 success, 27 cancelled).
- Canonical Preview deploy: 4 runs (3 failures, 1 currently latest).
- Integration Preview: 8 runs (4 success, 1 failure, 3 cancelled).
- Owner transfer: 3 runs (2 success, 1 cancelled).
- Paired encrypted B2 backup: 2 runs, both successful.

Current exact-head checks on `7a439a140acad87e4f538684fcffd4ca6722f0e6`:
- [CI run #44189645298](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44189645298): **success**.
- [OpenNext proof #44189645381](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44189645381): **success**.
- [Canonical Preview deployment #44189632968](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44189632968): deployment succeeded, post-deploy health gate failed as expected because the App/Store OID guards rejected the current bindings. The workflow correctly did not claim the Worker healthy.

The canonical workflow is deliberately guarded to the Integration branch, `HEAVIX_ENV=preview`, Worker name `heavix-preview`, no routes, and no environment-specific Production configuration. A comment-only change to this workflow file was used to activate its existing push-path trigger after owner approval. No application behavior was changed by that trigger commit.

## 6. Canonical Preview deployment and runtime diagnosis

Canonical Worker:
- URL: https://heavix-preview.heavixir.workers.dev
- New active version: `4c92c1fb-41f6-4487-bce7-c24a8a9f39ae` (version number 24).
- 100% traffic on the new version.
- Previous version 23: `8d3e8b0e-ec2d-4f27-9f67-a716519d533e`.

Post-deployment endpoint checks:
| Endpoint | HTTP | Result |
|---|---:|---|
| `/` | 500 | App identity guard rejects query execution |
| `/login` | 200 | Login page renders |
| `/api/health` | 503 | App DB and Store DB reported down |
| `/api/taxonomy` | 500 | App DB identity guard rejects query |
| `/api/transaction-types` | 500 | App DB identity guard rejects query |

Redacted Cloudflare observability events for Worker version 24 show:
- App: `systemIdentifierMatches=true`, `databaseOidMatches=false`, actual database OID `5`.
- Store: `systemIdentifierMatches=true`, `databaseOidMatches=false`, actual database OID `5`.
- The database identity checks successfully connected and read both identity values; both connections match the expected PostgreSQL system identifier. The failing predicate is the configured expected Database OID.
- The two OID secret bindings exist by name: `HEAVIX_APP_PREVIEW_DATABASE_OID` and `HEAVIX_STORE_PREVIEW_DATABASE_OID`. Their secret values were not read. The mismatch establishes that their configured expected values do not match the runtime OID `5`; it does not justify changing connection URLs or creating databases.
- Store's previous generic error is now specifically explained by the same OID mismatch.

**Required correction, pending separate owner approval:** review and correct the two Preview OID secret values so that they represent the actual verified database OID `5`, then re-run the Preview-only deploy/health gate. Do not read, disclose, or alter secret values without explicit authorization. Do not weaken or bypass the identity guard.

The deploy workflow log also printed a warning that its GitHub runner process did not contain local `DATABASE_URL`, `STORE_DATABASE_URL`, OID, and B2 secret values. A separate Cloudflare metadata read confirms the corresponding remote Worker secret bindings exist. Do not confuse missing local runner environment variables with absence of the remote Worker secrets.

## 7. Registration, scraper, media, and data gates

### Email verification
- The current code includes the historical six-digit verification flow and Google OAuth2/Gmail API delivery implementation.
- Preview runtime binding/configuration for the Google OAuth2/Gmail credentials is not proven present. Do not substitute SMTP or invent credentials.
- The user-facing `/login` route is reachable, but a 200 response does not prove registration, email delivery, login, session, or Admin acceptance.

### Scrapers
- Marketplace scraper route uses `HEAVIX_AI_SCRAPER_ENABLED` as an explicit opt-in and performs allowlisted source fetching.
- Store scraper uses `HEAVIX_STORE_SCRAPER_ENABLED` and `HEAVIX_STORE_SCRAPER_ALLOWED_HOSTS`; manager-reviewed manual imports remain separately available.
- Keep both provider-execution gates disabled until source allowlists, SSRF controls, AI Gateway quota, provider cost, and moderation/import tests are approved and verified.
- Do not enable a paid provider or initiate bulk scraping as part of this checkpoint.

### B2 media
- Preserve `heavix-dev-assets` for media and `heavix-db-backups` for database backups; do not mix them.
- Prior B2 proof and current media design docs are not proof that the complete seller-owned staging/finalization/read-back lifecycle is active on the canonical Worker.
- The current deploy log exposes B2 non-secret configuration values only; no B2 operation was run in this checkpoint.

### Catalog bootstrap
- The Preview seed runbook remains authoritative for shared database safety.
- Taxonomy source conflicts, missing child categories/transaction types/brands/attributes, and source provenance must be reconciled before any seed.
- No migration, schema change, seed, or data write was run.

## 8. Safety boundary maintained

This checkpoint did **not**:
- deploy Production or change DNS/custom domains;
- read or change secret values;
- alter App or Store schemas;
- run migrations, seeds, or database writes;
- reset passwords, change owner identity, or weaken authentication/RBAC;
- enable scraper provider execution or initiate paid AI calls;
- move or delete B2 objects.

## 9. Next actions in order

1. Obtain separate explicit owner approval to update only the two Preview OID secret values to the verified runtime OID `5`. If approval is not given, stop at the identity guard.
2. After approved secret correction, deploy only the existing guarded canonical Preview workflow and verify `/`, `/api/health`, App DB, and Store DB.
3. Verify the historical Gmail OAuth2/Gmail API bindings and end-to-end six-digit registration flow; do not invent or substitute credentials.
4. Reconcile the taxonomy/seed sources under Issue #337 without executing a seed until the owner separately approves a specific, backed-up Preview-only data operation.
5. Complete a full seller listing lifecycle test (including media) and Admin control-panel login/RBAC/runtime acceptance.
6. Re-enable Marketplace/Store scraper provider execution only after allowlist, SSRF, quota, cost, moderation, and test gates are accepted.
7. Once Preview foundation is healthy, resume the Master Execution Plan V3.0 at Phase 6 Price Intelligence + Compare, tracked under Issue #95; then Phase 7 Wanted/RFQ/Matching and later phases.
8. Keep PR #340 Draft until the selected Integration branch, release gates, and intended merge direction are resolved.

**Current decision:** the immediate blocker is the two incorrect Preview OID secret values, not an application query bug, database schema problem, or missing PostgreSQL system. The application must continue failing closed until those values are corrected through an explicitly approved operation.
