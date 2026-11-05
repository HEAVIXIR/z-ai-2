# OpenNext Runtime Integration Proof

Status: implementation plan; no database access or deployment is authorized by this document.

## Objective

Prove the production application import path for both Prisma databases inside the actual OpenNext-generated Cloudflare Worker. The proof must import the application aliases `@/lib/db` and `@/lib/store-db`, which the Cloudflare build resolves to `src/lib/db.worker.ts` and `src/lib/store-db.worker.ts`. It must not import the resolver factories directly and must not mock `getCloudflareContext()`.

## Baseline and isolation

- Parent implementation: PR #191 HEAD `3bf2333fde4f81473ce0d14c99cbd653a386c2e2`.
- Work branch: `test/opennext-runtime-integration`.
- This branch is isolated from PRs #183, #195, and #188.
- Do not merge, rebase other PRs, dispatch the legacy Workerd workflow, or deploy a Worker as part of this work.
- Keep the existing direct-resolver Workerd test as a lower-level unit/runtime test; do not mislabel it as an OpenNext integration proof.

## Required test architecture

1. Add a temporary, non-public App Router route that imports `db` from `@/lib/db` and `storeDb` from `@/lib/store-db`. This route is included only in the Cloudflare build path and is disabled unless BOTH an explicit Preview-only enable flag and a high-entropy bearer token are present.
2. The route must call the imported application proxy, not `createAppWorkerClientResolver`, `createStoreWorkerClientResolver`, or a copied helper. This exercises the real `getCloudflareContext()` call from the route request.
3. Use a single request to check the selected target's identity and schema fingerprint. Return only allowlisted, non-secret proof fields. Never return connection strings, environment values, user rows, business rows, or arbitrary database errors.
4. Run `bun run build:cloudflare` and then `opennextjs-cloudflare preview` against the generated `.open-next/worker.js`. The test driver must wait for local readiness, call the actual route over HTTP, and terminate the local preview process reliably.
5. The default smoke mode has no DB credentials and must prove only that the generated OpenNext Worker starts and the gated route fails closed. It must make zero database connection attempts.
6. The Preview DB mode is a separate, explicit opt-in. Before enabling it, an operator must independently verify that both injected URLs point to the dedicated Preview resources. Do not read or print secret values. Do not accept a single shared URL for App and Store.
7. For each target, assert exact PostgreSQL `system_identifier`, expected migration fingerprint, and `transaction_read_only = true`. The identity guard's own read-only identity probe is database contact; document that clearly.
8. Exercise request-scoped proxy semantics through actual route requests: same-request reuse, sequential request isolation, concurrent request isolation, and both App and Store target selection. Use bounded concurrency and redacted diagnostics.
9. Include negative checks for disabled route, missing token, missing binding, and identity mismatch. Identity mismatch must fail before business queries. Never use Production credentials or resources.
10. Remove the proof route and its enablement mechanism before any release/merge unless a separate security review explicitly approves retaining it. No public deployment is part of this proof.

## Acceptance gates

- [ ] Cloudflare build completes and emits the OpenNext Worker.
- [ ] Local OpenNext preview starts with no DB secrets in smoke mode.
- [ ] Real route imports the Cloudflare aliases; generated bundle/source map confirms both worker modules are in the route's dependency graph.
- [ ] Smoke mode confirms disabled/missing-auth fail-closed behavior and zero DB connections.
- [ ] Preview-only mode confirms App and Store resource identities and migration fingerprints independently.
- [ ] Read-only transaction state is proven using `current_setting('transaction_read_only')::boolean`.
- [ ] Request-scoped reuse and isolation pass under sequential and concurrent requests.
- [ ] Wrong/missing identity blocks business queries; diagnostics contain no secret material.
- [ ] Exact commit SHA, build logs, test output, and bundle evidence are recorded.
- [ ] Independent review and CI pass on the exact final HEAD.

## Explicit non-goals

No Production access, migration, seed, write query, backup, B2 operation, secret read/rotation, DNS change, Worker upload/deployment, PR merge, or change to `main`.
