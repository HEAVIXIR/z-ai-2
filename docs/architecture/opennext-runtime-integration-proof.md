# OpenNext Runtime Integration Proof

Status: Draft PR #200, current implementation HEAD `bc51ea5769c8f33026c98913802fa43ddd4ee0ef`. Exact-HEAD PR CI #18 passed; the exact-commit Cloudflare Workers Build completed successfully. The build generated `.open-next/worker.js`, but its deploy command is an explicit no-op marker; no Worker version was uploaded or deployed. No database access or deployment has been authorized.

## Objective

Prove the production application import path for both Prisma databases inside the actual OpenNext-generated Cloudflare Worker. The App Router proof route imports `db` from `@/lib/db` and `storeDb` from `@/lib/store-db`; it does not import resolver factories directly and does not mock `getCloudflareContext()`.

## Baseline and isolation

- Parent implementation: PR #191 HEAD `3bf2333fde4f81473ce0d14c99cbd653a386c2e2`.
- Work branch: `test/opennext-runtime-integration`.
- Draft PR: #200, base `infra/prisma6-cloudflare-runtime` (PR #191 head).
- Current implementation is stacked directly on PR #191, not on `main`.
- Do not merge, rebase other PRs, dispatch the legacy Workerd workflow, or deploy a Worker as part of this work.
- Keep the existing direct-resolver Workerd test as a lower-level unit/runtime test; do not mislabel it as an OpenNext integration proof.

## Implemented harness

1. Temporary App Router route: `src/app/api/opennext-runtime-proof/route.ts`.
2. The route statically imports the real application aliases `@/lib/db` and `@/lib/store-db`; Cloudflare build aliases resolve them to `src/lib/db.worker.ts` and `src/lib/store-db.worker.ts`.
3. The route returns 404 unless `HEAVIX_OPENNEXT_PROOF_MODE` is explicitly `SMOKE_ONLY` or `PREVIEW_ONLY`. The repository's deployed `wrangler.jsonc` does not set either mode.
4. The default CI driver `scripts/run-opennext-runtime-proof.mjs` removes database and Cloudflare credential variables from its child environments, builds with `bun run build:cloudflare`, creates a temporary Wrangler config outside the repository, and starts `opennextjs-cloudflare preview` against the generated Worker.
5. The temporary preview config sets only `SMOKE_ONLY`, contains no DB bindings/secrets, and runs from an isolated temporary directory so repository-local `.dev.vars` cannot be loaded accidentally.
6. Smoke requests invoke both real proxies. They must fail with the exact missing-binding errors before any database network connection. The driver asserts the route response and shuts down the preview process.
7. The separate `PREVIEW_ONLY` route branch requires a bearer token and two distinct DB bindings; it compares the App/Store system identifiers and migration names and reads `transaction_read_only`. The bearer-header and PostgreSQL-version regex escaping defects found in the independent source audit were corrected in commit `bc51ea5`. CI never enables this mode, and the branch has not been executed. Do not use it until both Preview destinations have been independently verified without revealing secret values.

## Database-contact semantics

The actual identity guard performs one read-only `pg_control_system()` query before it allows business queries. This is database contact. Therefore:
- `SMOKE_ONLY` is the zero-database-contact proof.
- `PREVIEW_ONLY` is a read-only identity/schema/transaction proof, not a zero-contact proof.
- No test may claim a misconfigured Production URL is rejected without contact.

## CI and Cloudflare build evidence

`.github/workflows/opennext-runtime-integration-proof.yml` runs on pull-request updates targeting `infra/prisma6-cloudflare-runtime`. It installs Bun dependencies and runs the local OpenNext build/preview smoke. No Cloudflare API token, DB secret, or remote deployment permission is supplied.

- CI #17 (`42077068051`) passed for source HEAD `aa6d9b3`; the independent approval on that commit is historical and does not approve later commits.
- CI #18 (`42079121452`) passed for the PR update containing HEAD `bc51ea5`; its proof log shows `.open-next/worker.js` generated and the actual route returned `200` with `SMOKE_ONLY PASS`.
- Cloudflare Workers Build `dd552bdc-b060-4d91-b9b1-f5860c5a24ba` completed successfully for exact branch commit `bc51ea5769c8f33026c98913802fa43ddd4ee0ef`. The configured deploy command only prints `HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF`; this is not a deployment.
- Cloudflare Worker `heavix-preview` remains at Version #14, last deployed 2026-10-29. No new version is present.
- Vercel status for `bc51ea5` is successful. PR #200 remains Draft and unmerged.

## Acceptance gates

- [x] Real App Router route imports both application aliases.
- [x] Route is disabled by default and guarded by explicit mode; Preview mode also requires bearer auth.
- [x] Smoke driver strips DB/Cloudflare credentials and uses an isolated temporary Wrangler config/cwd.
- [x] CI workflow is wired to the stacked Draft PR.
- [x] Database-backed `src/app/sitemap.ts` is explicitly request-time (`dynamic = force-dynamic`, `revalidate = 0`) so it is not prerendered without a Cloudflare request context.
- [x] Sitemap no longer prerenders; all 13 static pages generate in the exact-HEAD Cloudflare build.
- [x] Exact-commit Cloudflare build completes and emits `.open-next/worker.js`.
- [x] Local OpenNext preview starts and the real route returns `SMOKE_ONLY PASS`.
- [x] Smoke mode confirms both application proxies fail closed without DB bindings; the isolated config supplies no database credentials or bindings.
- [ ] Obtain a fresh independent review on the exact current HEAD; the approval on `aa6d9b3` is stale after `bc51ea5`.
- [ ] Add unit coverage for the `PREVIEW_ONLY` bearer-token and PostgreSQL-version guards; this branch has not been executed by CI.
- [ ] If and only if both Preview destinations are independently verified, separately authorize Preview-only DB proof for exact identities, migration fingerprints, and read-only transaction state. The Worker currently exposes the two secret binding names, but their values/targets remain unread and unverified.
- [ ] Inspect the final Worker artifact and source graph; measure bundle size and verify Node-only TCP clients are absent from the Worker graph.

## Explicit non-goals

No Production access, migration, seed, write query, backup, B2 operation, secret read/rotation, DNS change, Worker upload/deployment, PR merge, or change to `main`.
