# OpenNext Runtime Integration Proof

Status: Draft PR #200; refreshed after exact-HEAD CI run 42109029726, OpenNext run 42109029734, and Cloudflare Build 409720f3-6545-4676-8b6d-e9578b0e84e7 on 2026-11-06. Current code HEAD before this documentation refresh: 4a55350c5a0d3de90828b81c4c4f68c089062909. CI and OpenNext smoke passed; Cloudflare Build passed without upload/deploy. This document refresh creates a new HEAD and therefore requires fresh CI and independent review.

## Objective

Prove the production application import path for both Prisma databases inside the actual OpenNext-generated Cloudflare Worker. The App Router proof route imports db from @/lib/db and storeDb from @/lib/store-db; it does not import resolver factories directly and does not mock getCloudflareContext().

## Baseline and isolation

- Work branch: test/opennext-runtime-integration.
- Draft PR: #200, base infra/prisma6-cloudflare-runtime (PR #191 head), not main.
- PR #191 base at the last verified snapshot: 3bf2333fde4f81473ce0d14c99cbd653a386c2e2. Re-check the live PR base SHA before relying on this value.
- Keep PR #200 Draft and unmerged. Do not retarget, merge, deploy, or modify main as part of this proof.
- Keep the direct-resolver Workerd test as a lower-level test; do not mislabel it as the OpenNext integration proof.

## Implemented harness

1. Temporary App Router route: src/app/api/opennext-runtime-proof/route.ts.
2. The route imports the real aliases @/lib/db and @/lib/store-db; Cloudflare build aliases resolve them to src/lib/db.worker.ts and src/lib/store-db.worker.ts.
3. The route returns 404 unless HEAVIX_OPENNEXT_PROOF_MODE is explicitly SMOKE_ONLY or PREVIEW_ONLY. The deployed wrangler.jsonc does not set either mode.
4. The default CI driver scripts/run-opennext-runtime-proof.mjs removes database and Cloudflare credential variables from child environments, builds with bun run build:cloudflare, creates a temporary Wrangler config outside the repository, and starts OpenNext preview against the generated Worker.
5. The temporary preview config sets only SMOKE_ONLY, contains no DB bindings/secrets, and runs from an isolated temporary directory so repository-local .dev.vars cannot be loaded accidentally.
6. Smoke requests invoke both real application proxies. They must fail with the exact missing-binding errors before any database network connection.
7. The separate PREVIEW_ONLY branch requires a bearer token and two distinct DB bindings; it checks App/Store system identifiers, migration names, PostgreSQL 17, and transaction read-only state. CI never enables this mode, and it has not been executed.
8. Shared guard functions now live in src/lib/opennext-proof-guards.ts. The Route and unit tests import the same production implementations for PostgreSQL-version detection, bearer extraction, and token comparison.
9. The RO-1 result field transactionReadOnlyEnforced is now derived from the transaction's observed transaction_read_only state rather than hard-coded true.

## Database-contact and read-only semantics

The identity query uses pg_control_system() and contacts the target database. Therefore:

- SMOKE_ONLY is the zero-database-contact proof.
- PREVIEW_ONLY is a database-contacting identity/schema/migration/transaction proof; it is not zero-contact.
- The identity and migration queries are read-only SELECT statements. The first statement in each separate Prisma transaction is a prepared-statement-compatible SELECT set_config('transaction_read_only', 'on', true), with is_local=true so the setting is transaction-scoped. A second SELECT verifies current_setting('transaction_read_only').
- The local PGlite test prepares and executes SELECT set_config('transaction_read_only', 'on', true), verifies the read-only flag becomes true, and confirms an INSERT is rejected. This specifically exercises a SELECT-shaped prepared statement rather than a SET utility command. It still does not prove that Prisma's PPG adapter/Cloudflare Worker driver executes the query correctly in the target runtime.
- Do not claim end-to-end PPG/Worker enforcement until that adapter/runtime behavior is independently proven. Do not use Preview or Production to obtain that proof without the required destination verification and separate authorization.

## Unit and integration test scope

tests/unit/opennext-runtime-proof-guards.test.ts now imports the production guard module instead of reimplementing its regexes and comparison function. It covers PostgreSQL 17 detection, bearer-token extraction, constant-time comparison behavior, route wiring/order for RO-1, and local PGlite prepared-statement/read-only SQL semantics.

The route-wiring checks remain structural. The OpenNext proof workflow now explicitly runs this test file with Vitest before the Worker smoke. The test file contains 26 cases, including the PGlite transaction check. PGlite is a local PostgreSQL-compatible engine, not the production Prisma PPG adapter. The OpenNext smoke remains a real Worker request-path test, but it deliberately runs with no database credentials and cannot prove Preview connectivity or transaction enforcement against the target PPG service.

## CI and deployment evidence

### Latest evidence at the pre-documentation-update code HEAD

- CI #17, run 42077068051, passed for source HEAD aa6d9b3.
- CI #18, run 42079121452, passed for the branch update containing bc51ea5; its log showed .open-next/worker.js generated and the real route returned HTTP 200 with SMOKE_ONLY PASS.
- CI #20, run 42082922256, passed for exact HEAD 05276b7ed7030fe2c9aeb7caaf5071651f216ef9; this validates the pre-refactor code, not later guard extraction/PGlite commits.
- Cloudflare Workers Build dd552bdc-b060-4d91-b9b1-f5860c5a24ba succeeded for exact commit bc51ea5769c8f33026c98913802fa43ddd4ee0ef. Its deploy command was a deliberate no-op marker; it was not a deployment.
- A Vercel Preview deployment was reported Ready in a PR comment for an earlier branch revision. A separate Vercel Free-plan rate-limit failure was also reported. Neither is current exact-HEAD Cloudflare runtime evidence.
- CI #33, run 42085473744, completed SUCCESS. GitHub executed the PR merge ref commit 205d61db5b8321ec64ba1cd670b3324cac40b50d, which explicitly merges PR HEAD 6a6e7a551bfb796ec19b0f679638ae5793cba41a into base 3bf2333fde4f81473ce0d14c99cbd653a386c2e2. The run completed the 26-case guard/PGlite test step and the OpenNext Worker smoke step.
- CI #33 log confirms `.open-next/worker.js` was generated; the actual App Router route imported both production aliases and ran in local Wrangler/workerd. Both proxies failed closed without DB bindings; the route returned HTTP 200 with `SMOKE_ONLY PASS`, with no database connection or write attempted. The runner terminated the local preview process in cleanup; shutdown stderr did not change the successful job conclusion.
- Cloudflare Workers Build 0179afc0-07ef-4880-a673-489b749a4df3 completed with `build_outcome: success`, source commit f039c028e8c91ce303f25e7f8e26560384a9c02d. GitHub comparison confirms the only commit between f039c02 and pre-documentation HEAD 6a6e7a5 is a documentation-only change, so runtime code was identical. The configured deploy command is an explicit no-op marker, not a deployment.
- Live Cloudflare version/deployment inventory still shows `heavix-preview` at Version #14, 100% traffic, created 2026-10-29. No Worker version was uploaded or deployed by the build.
- Independent review ID 5790120207 (review API record PRR_kwDOUoOaW88AAAABWR45Dw) approved exact pre-documentation HEAD 6a6e7a551bfb796ec19b0f679638ae5793cba41a. It does not automatically approve this later documentation-only commit.
- Earlier CI #28 failure (25/26 due malformed Tab fixture), CI #30, and CI #32 remain historical evidence. CI #33 supersedes them for the code snapshot described above. A green smoke/build is not Preview DB acceptance or deployment acceptance.

## Acceptance gates

- [x] Real App Router route imports both application aliases.
- [x] Route is disabled by default and guarded by explicit mode; Preview mode also requires bearer authentication.
- [x] Smoke driver strips DB/Cloudflare credentials and uses an isolated temporary Wrangler config/cwd.
- [x] CI workflow is wired to the stacked Draft PR.
- [x] Database-backed src/app/sitemap.ts is request-time only (dynamic = force-dynamic, revalidate = 0).
- [x] Production guard functions are shared between route and unit tests.
- [x] RO-1 result reporting derives from the observed read-only state.
- [x] Local PGlite SQL semantics test added; this is not PPG adapter/runtime proof.
- [x] CI #33 passed for PR merge ref 205d61d, containing code HEAD 6a6e7a5 and base PR #191 HEAD 3bf2333; a documentation-only update after this snapshot requires another CI run.
- [ ] Independently verify that both secret destinations are dedicated App Preview and Store Preview targets without exposing secret values.
- [ ] Only after destination verification and separate authorization, run the read-only Preview proof for exact identities, migration fingerprints, and transaction state. This contacts both databases.
- [ ] Verify Prisma PPG adapter/Cloudflare Worker compatibility for the prepared SELECT set_config path without contacting Production.
- [ ] Inspect final Worker artifact/source graph, measure bundle size, and verify Node-only TCP clients are absent from the Worker graph.
- [x] Independent review 5790120207 approved exact code HEAD 6a6e7a5; the documentation-only update after this snapshot requires a fresh approval on the new exact HEAD.

## Explicit non-goals and safety boundaries

No Production access, migration, seed, write query, backup, B2 operation, secret read/rotation, DNS change, Worker upload/deployment, PR merge, or change to main.

Never read or print secret values, database URLs, bearer tokens, or connection strings. Do not execute PREVIEW_ONLY until both secret destinations have been independently verified and separate authorization is given. Keep Production NO-GO.


## Preview resource inventory (metadata only)

A metadata-only Prisma inventory confirmed three distinct managed databases in Europe (Frankfurt): heavix-production, heavix-app-preview, and heavix-store-preview. Both Preview databases report ready status. Connection-string metadata includes a worker-named connection on each Preview project; the App Preview project also has a separately named app-worker connection. No connection-string values were requested, read, or returned.

The latest metadata inventory now shows both App Preview and Store Preview projects contain a preview branch named test/opennext-runtime-integration. This corrects an earlier inventory snapshot that did not show the Store branch. Branch-name parity alone does not prove matching database resources, Compute apps, or deployment topology. Connection-string names and database existence do not prove which encrypted Cloudflare secret value points to which database. The binding-to-resource mapping remains unverified.

Cloudflare Workers Build 0179afc0-07ef-4880-a673-489b749a4df3 for code commit f039c028e8c91ce303f25e7f8e26560384a9c02d completed successfully. The later code-HEAD 6a6e7a5 differs from f039c02 only by this architecture-document change. The configured deploy command remains an explicit no-op marker. This is a build, not an upload or deployment. Live Worker inventory remains Version #14.


## Prepared-statement compatibility decision

Prisma's raw SQL documentation states that tagged raw queries are submitted as prepared statements; PostgreSQL 17's PREPARE documentation restricts the prepared statement body to SELECT, INSERT, UPDATE, DELETE, MERGE, or VALUES. Because SET TRANSACTION is a utility command outside that list, the probe does not send SET TRANSACTION through Prisma raw SQL. Instead it calls the PostgreSQL set_config function inside a SELECT. PostgreSQL documents transaction_read_only as the current transaction's access mode and says subsequent changes are equivalent to SET TRANSACTION; set_config with is_local=true scopes the setting to the current transaction. This is the documented rationale for the prepared-safe implementation. Local PGlite coverage now explicitly prepares and executes the SELECT expression, but adapter/runtime confirmation remains a separate acceptance gate.


## Latest validation refresh

- CI #33: SUCCESS (run 42085473744); tested merge ref 205d61db5b8321ec64ba1cd670b3324cac40b50d, merging code HEAD 6a6e7a551bfb796ec19b0f679638ae5793cba41a into PR base 3bf2333fde4f81473ce0d14c99cbd653a386c2e2.
- Cloudflare Workers Build: SUCCESS (build 0179afc0-07ef-4880-a673-489b749a4df3) for code commit f039c028e8c91ce303f25e7f8e26560384a9c02d; only subsequent commit to code HEAD 6a6e7a5 was this documentation file.
- Independent review: APPROVED (review 5790120207) on code HEAD 6a6e7a551bfb796ec19b0f679638ae5793cba41a.
- Worker deployment: unchanged at Version #14; no upload or deployment occurred.
- No workflow artifact was uploaded by CI #33. Therefore, although the Worker was generated and exercised, a retained artifact-level dependency graph and reproducible bundle-size report are still unavailable. The separate bundle audit remains open.
- This document-only commit creates a new branch HEAD. Re-run CI and obtain fresh independent approval on that new exact HEAD before treating the documentation snapshot as fully accepted.


## 2026-11-05 remediation: database-scoped identity

The earlier guard compared only `pg_control_system().system_identifier`. That value is cluster-scoped, so it cannot distinguish two databases hosted on the same PostgreSQL cluster. The current implementation closes that code-level gap by requiring the pair:

- `system_identifier`: trusted PostgreSQL cluster identity.
- `pg_database.oid` for `current_database()`: trusted database identity within that cluster.

The real OpenNext Worker client factories require separate App and Store expected OIDs through `HEAVIX_APP_PREVIEW_DATABASE_OID` and `HEAVIX_STORE_PREVIEW_DATABASE_OID`. Missing, malformed, zero, or out-of-range OIDs fail before constructing a Prisma client. The first database query in each client checks both cluster and database identity; the result (including failure) is cached for that client. Raw SQL, unsafe raw SQL, model delegates, interactive/array transactions, and Prisma extensions remain behind the proxy guard. The temporary PREVIEW proof route independently reports cluster and database matches and refuses to start unless both expected OIDs are configured.

The Workerd proof runner now requires both trusted OIDs for `PREVIEW_ONLY`, writes them only into its private temporary `.dev.vars` file, and asserts the returned OID for App and Store. CI adds a zero-database-contact Workerd smoke that imports the PPG adapter/client graph and verifies missing-secret fail-closed behavior. That smoke does not establish a successful PPG database handshake or prove the prepared read-only transaction against a Preview database.

The current Wrangler configuration declares both OID values as required Worker secrets. Their values have **not** been retrieved, inferred, or configured here. The exact OIDs must be collected independently from the already-verified dedicated Preview destinations; if a Preview database is recreated, its OID must be re-inventoried. Do not run `PREVIEW_ONLY` until both secret destinations are independently verified and separate authorization for Preview database contact is recorded.

### Current acceptance state

- [x] Code now distinguishes a sibling database on the same cluster by the cluster/OID pair.
- [x] Unit coverage includes the correct-cluster/wrong-database rejection case and OID input validation.
- [x] The Workerd Preview runner requires and checks per-target OIDs.
- [x] CI workflow includes a no-DB Workerd PPG module-load smoke.
- [ ] Independently verify the Cloudflare App and Store connection-secret destinations without reading or disclosing secret values.
- [ ] Obtain each target's database OID and configure the two required Worker OID secrets.
- [ ] Run the authorized read-only Preview proof against those exact targets; this is database contact and has not been run.
- [ ] Prove the actual Prisma PPG prepared read-only transaction against the Preview Worker runtime.
- [ ] Obtain fresh independent approval on the final exact PR HEAD.

Production remains NO-GO. No Production access, Preview database contact, migrations, writes, Worker upload/deployment, DNS change, PR merge, or main-branch change was performed as part of this remediation.


## 2026-11-06 exact-HEAD validation refresh

Code HEAD `4a55350c5a0d3de90828b81c4c4f68c089062909` was independently checked:

- GitHub CI run `42109029726`: SUCCESS. Seven jobs succeeded; two intentionally skipped (legacy archive inventory and Preview-only Prisma proof); no failed jobs.
- OpenNext runtime integration run `42109029734`: SUCCESS. The real OpenNext App Router route ran in local Wrangler/Workerd with no database credentials and both actual application proxies failed closed.
- Cloudflare Build `409720f3-6545-4676-8b6d-e9578b0e84e7`: build_outcome SUCCESS. Its deploy command remains a deliberate blocked/no-op marker. No upload or deployment occurred.
- Vercel Preview check for this code revision was reported successful by the PR check.
- Bundle audit artifact `13452574498`, digest `sha256:bf0ab7ee5790fa8bd5254020dbb1d990b6611ad285cf6898d156ba697b69228c`, was downloaded and inspected. Heuristic verdict `PASS_WITH_SUPPORTED_NODE_COMPAT_IMPORTS`; 2,434 JS files; zero forbidden PostgreSQL TCP adapter/package markers; Wrangler dry-run 29,462,661 bytes (4,203,663 gzip); 622 static assets; no unsupported external Node TCP imports. Six PPG driver markers were found and zero literal adapter markers; this remains heuristic rather than complete dependency-graph proof. Local startup profile is not authoritative Cloudflare startup time.
- Cloudflare live Worker remains Version #14; latest deployment remains the 2026-10-29 deployment. The successful build did not change active traffic.
- Current PR #200 remains Open, Draft, Unmerged, and mergeable; base is still PR #191 HEAD `3bf2333fde4f81473ce0d14c99cbd653a386c2e2`.
- Current main baseline checked against `d86e3fa715d27b95477ed09eda60b2bfba8daaa6`; main is an ancestor of the PR head. No change to main was made.
- The latest independent approval found in PR history is for older HEAD `a2e5985`; it does not approve current code HEAD `4a55350`.

## 2026-11-06 Preview infrastructure metadata audit

Read-only Prisma metadata inventory confirms:

- Projects: `heavix-app-preview`, `heavix-store-preview`, `heavix-production`, and a separate `heavix-web-preview` project.
- App Preview DB `db_ew8d6duermpt125paxaqorr9`, Store Preview DB `db_cmtgxfrfwxw5mi77020tcnc3`, and Production DB `db_rc9ln1df4rwgxducp2zsge2s` are all `ready`, each in `eu-central-1` (Frankfurt).
- Both Preview projects have a metadata branch named `test/opennext-runtime-integration`.
- No Prisma Compute apps are attached to the App Preview project; no Composer topology is recorded for the App Preview test branch or Store Preview test branch.
- No Prisma Object Store buckets exist in the workspace.
- Prisma automated backup listings for App Preview, Store Preview, and Production are empty.
- Connection-string inventory was restricted to names, IDs, and timestamps. No connection-string values or credentials were retrieved.
- Active Cloudflare Worker settings expose binding metadata for `DATABASE_URL` and `STORE_DATABASE_URL` as `secret_text`, but that metadata does not identify their destination database. No secret values were accessed.
- Active Cloudflare Worker settings do not list `HEAVIX_APP_PREVIEW_DATABASE_OID` or `HEAVIX_STORE_PREVIEW_DATABASE_OID` bindings. The repository Wrangler config declares these as required secrets, so the active Worker configuration is not yet ready for PREVIEW_ONLY.
- Because the active secret destinations are not independently verifiable from non-secret metadata, no Preview database contact was made. This remains a hard safety gate even though the project owner authorized continuing operations.

## Remaining blockers — do not mark release-ready

1. Establish a safe, independently auditable mapping from the active App and Store Cloudflare secret bindings to their dedicated Preview databases without reading, printing, hashing, or comparing secret values.
2. Obtain the two expected database OIDs from a trusted, non-ambiguous source after the target mapping is established, then provision the two separate OID bindings through a secure secret-management path.
3. Only then perform the separately authorized PREVIEW_ONLY proof, checking cluster identity, per-database OID, migration fingerprints, PostgreSQL 17, and transaction-local read-only enforcement. The proof contacts both Preview databases; it must never contact Production.
4. Obtain a fresh independent review for the exact final code/documentation HEAD.
5. Define and test backup/restore, encryption, retention, and off-host recovery. Prisma automated backup metadata is currently empty; the workspace has no object-store bucket.
6. Keep PR #200 Draft and main unchanged until every acceptance gate is met. No Worker upload/deployment, DNS change, migration, seed, or Production operation is authorized by a green build.

## Explicit current decision

`SMOKE_ONLY` is proven on the current code HEAD. `PREVIEW_ONLY` is **NOT RUN**. Production remains **NO-GO**. Cloudflare Build success is not deployment success. The PR remains Draft and unmerged.
