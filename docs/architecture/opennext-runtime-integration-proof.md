# OpenNext Runtime Integration Proof

Status: Draft PR #200; documentation refreshed on 2026-11-05. The implementation is stacked on PR #191 and is not a deployment or Production acceptance. Consult the PR's current HEAD and exact-commit checks for the latest code validation; CI results from earlier commits are historical evidence only.

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
- The identity and migration queries are read-only SELECT statements. The explicit SET TRANSACTION READ ONLY is executed as the first statement in a separate Prisma transaction, followed by a query of transaction_read_only.
- The local PGlite test validates PostgreSQL-compatible SQL semantics: the read-only flag becomes true and an INSERT is rejected. It does not prove that Prisma's PPG adapter/Cloudflare Worker driver executes the command correctly in the target runtime.
- Do not claim end-to-end PPG/Worker enforcement until that adapter/runtime behavior is independently proven. Do not use Preview or Production to obtain that proof without the required destination verification and separate authorization.

## Unit and integration test scope

tests/unit/opennext-runtime-proof-guards.test.ts now imports the production guard module instead of reimplementing its regexes and comparison function. It covers PostgreSQL 17 detection, bearer-token extraction, constant-time comparison behavior, route wiring/order for RO-1, and local PGlite read-only SQL semantics.

The route-wiring checks remain structural. PGlite is a local PostgreSQL-compatible engine, not the production Prisma PPG adapter. The OpenNext smoke remains a real Worker request-path test, but it deliberately runs with no database credentials and cannot prove Preview connectivity or transaction enforcement against the target PPG service.

## CI and deployment evidence

Historical evidence (do not treat as exact-current-HEAD validation):

- CI #17, run 42077068051, passed for source HEAD aa6d9b3.
- CI #18, run 42079121452, passed for the branch update containing bc51ea5; its log showed .open-next/worker.js generated and the real route returned HTTP 200 with SMOKE_ONLY PASS.
- CI #20, run 42082922256, passed for exact HEAD 05276b7ed7030fe2c9aeb7caaf5071651f216ef9; this validates the pre-refactor code, not later guard extraction/PGlite commits.
- Cloudflare Workers Build dd552bdc-b060-4d91-b9b1-f5860c5a24ba succeeded for exact commit bc51ea5769c8f33026c98913802fa43ddd4ee0ef. Its deploy command was a deliberate no-op marker; it was not a deployment.
- A Vercel Preview deployment was reported Ready in a PR comment for an earlier branch revision. A separate Vercel Free-plan rate-limit failure was also reported. Neither is current exact-HEAD Cloudflare runtime evidence.
- The active heavix-preview Worker was last independently reported as Version #14 (2026-10-29); re-check its live version/deployment list before making a current claim.

The code changes after CI #20 require fresh exact-HEAD CI. A green smoke/build is not Preview DB acceptance or deployment acceptance.

## Acceptance gates

- [x] Real App Router route imports both application aliases.
- [x] Route is disabled by default and guarded by explicit mode; Preview mode also requires bearer authentication.
- [x] Smoke driver strips DB/Cloudflare credentials and uses an isolated temporary Wrangler config/cwd.
- [x] CI workflow is wired to the stacked Draft PR.
- [x] Database-backed src/app/sitemap.ts is request-time only (dynamic = force-dynamic, revalidate = 0).
- [x] Production guard functions are shared between route and unit tests.
- [x] RO-1 result reporting derives from the observed read-only state.
- [x] Local PGlite SQL semantics test added; this is not PPG adapter/runtime proof.
- [ ] Obtain fresh exact-HEAD CI after the latest code and documentation commits.
- [ ] Independently verify that both secret destinations are dedicated App Preview and Store Preview targets without exposing secret values.
- [ ] Only after destination verification and separate authorization, run the read-only Preview proof for exact identities, migration fingerprints, and transaction state. This contacts both databases.
- [ ] Verify Prisma PPG adapter/Cloudflare Worker compatibility for SET TRANSACTION READ ONLY without contacting Production.
- [ ] Inspect final Worker artifact/source graph, measure bundle size, and verify Node-only TCP clients are absent from the Worker graph.
- [ ] Obtain a fresh independent review on the final exact HEAD.

## Explicit non-goals and safety boundaries

No Production access, migration, seed, write query, backup, B2 operation, secret read/rotation, DNS change, Worker upload/deployment, PR merge, or change to main.

Never read or print secret values, database URLs, bearer tokens, or connection strings. Do not execute PREVIEW_ONLY until both secret destinations have been independently verified and separate authorization is given. Keep Production NO-GO.
