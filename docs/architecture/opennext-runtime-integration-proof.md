# OpenNext Runtime Integration Proof

Status: Draft PR #200; documentation refreshed after CI #33 and Cloudflare Build 0179afc0 on 2026-11-05. The implementation is stacked on PR #191 and is not a deployment or Production acceptance. Current branch HEAD at this documentation snapshot: 6a6e7a551bfb796ec19b0f679638ae5793cba41a. This documentation-only update will create a new HEAD and requires fresh CI/review on that new revision.

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

Branch inventory is not symmetric: the App Preview project contains a preview branch named test/opennext-runtime-integration, while the Store Preview project currently lists main (role production) and feature/prisma7-runtime-contract-proof, but no matching test/opennext-runtime-integration branch. This is a metadata discrepancy to resolve before assuming the two Worker bindings target equivalent branch contexts. Connection-string names and database existence do not prove which encrypted Cloudflare secret value points to which database. The binding-to-resource mapping remains unverified.

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
