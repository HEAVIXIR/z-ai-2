# Prisma Preview Workerd exact-HEAD port plan

Date: 2026-11-09
Status: partial implementation; Workerd smoke and OpenNext request-path proof pass; Preview DB proof not dispatched
Branch: `security/active-session-hardening-2026-11-08`
Reviewed HEAD: `98cc56d5a1f25b3814d472bcfe7e5d9032c0cdb5`

## Purpose

Replace the historical-commit-only Prisma Preview Workerd proof with a proof that is built and run from the exact reviewed branch commit. The proof must remain fail-closed, read-only, and restricted to the two inventoried Preview PostgreSQL resources.

This document is a plan, not evidence of a passing database proof. No dependencies, lockfiles, workflow definitions, database roles, grants, secrets, Cloudflare bindings, or deployments were changed to produce it.

## Current compatibility boundary

The current branch's `package.json` declares Prisma and `@prisma/client` `^6.11.1`; the committed `bun.lock` resolves both to `6.19.3`. The branch now pins `@prisma/adapter-ppg` `7.10.1` and `@prisma/ppg` `1.0.1`, and the lockfile refresh workflow installed and committed both. App and Store schemas now retain their Node `prisma-client-js` generators and add separate Workerd generators. Worker client factories, request-scoped proxy, Cloudflare aliases, Worker tsconfig, Workerd proof harness, and smoke workflow have been ported. The exact-head Workerd smoke and OpenNext request-path proof are passing; Preview database identity/read-only proof remains unexecuted.

Do not transplant the historical package manifest, lockfile, or workflow as a unit. The implementation selectively ports the Worker-specific client boundary and test harness while preserving current application dependencies and Node client behavior. The exact adapter versions are now pinned and lockfile-resolved; the Workerd smoke validates imports and missing-secret behavior without touching a database.

## Follow-up audit on exact HEAD `b6971fec14bb1ec95e212e2c258f1f031ee8488e`

- The committed lockfile resolves both `prisma` and `@prisma/client` to `6.19.3`; this corrects the earlier assumption that the resolved client was still at `6.11.x` based only on the manifest range.
- The current lockfile contains no `@prisma/adapter-ppg` or `@prisma/ppg` entries. The package manifest and scripts still lack the Prisma Workerd harness.
- `.github/workflows/prisma-preview-workerd-proof.yml` remains a manual workflow that checks out fixed historical commit `b94b9d6f3540e8f4467b1d4ac051d5ef050c0994`. Its contract test explicitly asserts that pin. It has not been dispatched, and it is not exact-HEAD evidence.
- The separate `.github/workflows/open-next-middleware-workerd.yml` did run on `b6971fec14bb1ec95e212e2c258f1f031ee8488e` and passed. This is local OpenNext Edge Middleware Workerd proof only; it does not execute the Prisma App/Store database harness.
- The CI workflow also passed on this exact commit, including disposable local PostgreSQL integration and paired backup/restore checks. Those checks do not attest to Preview DB roles, Preview DB destinations, Cloudflare secret destinations, or B2 object storage.

## Implementation progress on exact HEAD `98cc56d5a1f25b3814d472bcfe7e5d9032c0cdb5`

- App and Store Prisma schemas have separate Workerd generators while retaining their existing Node generators. CI has validated schema parity, generation, schema push against disposable CI databases, and TypeScript typecheck.
- Dependencies are pinned to `@prisma/adapter-ppg@7.10.1` and `@prisma/ppg@1.0.1`; the Bun lock refresh workflow installed both and committed the lockfile.
- Added `src/lib/prisma-worker-clients.ts`, `src/lib/prisma-worker-proxy.ts`, `src/lib/db.worker.ts`, and `src/lib/store-db.worker.ts`. The App and Store clients are separate and resolved from the per-request Cloudflare execution context.
- Cloudflare-only Next.js aliases and `tsconfig.worker.json` route the Worker build to those modules without replacing the Node client path.
- Added `typecheck:worker`, `test:workerd:smoke`, the local Workerd harness, and `.github/workflows/prisma-workerd-smoke.yml`. The smoke workflow checks out `github.sha`, has no DB secrets, and verifies the Worker module graph plus fail-closed missing-secret behavior.
- Exact-head smoke passed: [run 42524898470](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42524898470). This run generated both clients, passed `typecheck:worker`, and passed local Workerd with no database credentials.
- Exact-head OpenNext build and Edge Middleware request-path proof passed: [run 42524898471](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42524898471). This validates the Cloudflare Worker artifact and request path, not database access.
- General CI run [42524898448](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42524898448) is still in progress at this review. Earlier CI jobs have passed schema parity, Prisma generation, Typecheck, Lint, Phase tests, TLS proof, and transaction audit; remaining integration/build steps must complete before claiming overall CI green.
- The manual Preview DB proof workflow now checks out and verifies the exact dispatch SHA, requires the protected `preview-proof` environment, retains `PREVIEW_ONLY` confirmation, and runs Worker typecheck before its read-only proof. It has not been dispatched.

**Important:** these are code/build/smoke validations only. No Preview database connection was made by the smoke run. The current `prisma_application` role remains writable and unsuitable for the strict read-only proof, so do not treat these passes as Preview DB acceptance.

## Upstream-supported Prisma Postgres Worker architecture (research update)

The current Prisma ORM v6 documentation describes a supported Prisma Postgres serverless-driver path for Prisma 6.19: use `@prisma/adapter-ppg` with `@prisma/ppg`, generate an engine-less client with `provider = "prisma-client"` and `engineType = "client"`, and set the generator runtime to `workerd` for Cloudflare Workers. This is a better-fit candidate for the two Prisma Postgres resources than assuming a generic TCP `pg` adapter. See:
- Prisma ORM v6 Cloudflare deployment guide: https://www.prisma.io/docs/orm/v6/prisma-client/deployment/edge/deploy-to-cloudflare
- Prisma Postgres driver / 6.19 setup: https://www.prisma.io/docs/postgres/database/switch-from-accelerate
- Prisma ORM v6 serverless driver overview: https://www.prisma.io/docs/orm/v6/overview/databases/database-drivers

The App schema and Store schema now each retain the Node-oriented `prisma-client-js` generator and define a second, Worker-specific generator:
- App output: `src/lib/generated/worker-client`
- Store output: `src/lib/generated/store-worker-client`
- Worker generator: `provider = "prisma-client"`, `engineType = "client"`, `runtime = "workerd"`

That additive dual-generator pattern is implemented. Both generated Worker clients, Worker-specific typecheck, and local Workerd smoke have passed on the reviewed branch head. Full Preview database access proof remains gated separately.

**Version rule:** current lock resolves Prisma CLI and `@prisma/client` to `6.19.3`, with `@prisma/adapter-ppg@7.10.1` and `@prisma/ppg@1.0.1` installed and locked. Prisma ORM v6 documentation supports the Prisma Postgres serverless driver path on 6.19. The dual-generator build preserves the existing Node client generator; general CI and OpenNext build remain the regression gates for the Node application path.

The current branch contains `db.worker.ts`, `store-db.worker.ts`, and a request-scoped resolver/proxy. The local smoke verifies importability and fail-closed missing-secret behavior. Full request lifecycle and database identity/read-only behavior are implemented in the proof harness but still require an approved least-privilege Preview credential to execute against the two Preview resources.

Cloudflare's current Hyperdrive/Prisma example documents `@prisma/adapter-pg` for traditional PostgreSQL over Hyperdrive, but that is a different connection architecture. Do not introduce Hyperdrive resources or bindings as a substitute for the existing Prisma Postgres serverless connection without a separate architecture decision. Reference: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/prisma-orm/

## Required implementation sequence

1. **Inventory current generated clients**
   - Inspect both Prisma generator outputs and current client initialization modules.
   - Identify the exact Prisma CLI/client versions resolved by the committed lockfile.
   - Confirm whether the current client generation target and runtime support the selected Cloudflare Workers adapter.
   - Do not infer compatibility from package names or a successful Node.js test.

2. **Select one supported adapter architecture**
   - Prefer a documented adapter/runtime combination compatible with the existing Prisma major/minor and Cloudflare Workers runtime.
   - If a Prisma upgrade is required, isolate it as a separately reviewed dependency change with lockfile regeneration and full app/store regression tests.
   - Do not mix adapter package major versions with a different Prisma client version unless upstream compatibility explicitly supports that combination.
   - Record upstream compatibility references and the exact package versions in the implementation PR/commit.

3. **Create a minimal worker-client boundary**
   - Separate App and Store client factories; do not share generated clients across the two schemas.
   - Construct clients lazily from their respective runtime bindings.
   - Reuse a client only within one request; do not retain request-scoped clients globally across requests.
   - Ensure disconnect/cleanup behavior is compatible with the chosen adapter and Workerd lifecycle.
   - Missing bindings must fail closed before a database connection is attempted.

4. **Preserve identity-first database gates**
   - The first SQL statement after connecting must query `pg_control_system()` and compare the PostgreSQL system identifier against the exact Preview allowlist.
   - App expected system identifier: `7701427422680793119`.
   - Store expected system identifier: `7701425043360235551`.
   - On mismatch, stop immediately; do not query migrations, schema, or application data.
   - Verify PostgreSQL 17, schema `public`, and exact migration-name fingerprints only after identity succeeds.

5. **Require actual read-only transaction proof**
   - Both App and Store transactions must read `current_setting('transaction_read_only')::boolean`.
   - The value must be `true` for both.
   - Do not weaken the assertion, attempt writes, use temporary-table creation as a write probe, or treat “no writes were attempted” as proof that the connection is read-only.
   - The current Prisma MCP role audit found inherited `pg_write_all_data`, `rolreplication=true`, and read-write transaction defaults. It is not an acceptable proof credential.

6. **Add safe negative and isolation tests**
   - Missing App binding fails closed.
   - Missing Store binding fails closed.
   - App binding cannot satisfy Store client construction and vice versa.
   - Wrong system identifier stops before migration queries.
   - Read-only assertion fails if the transaction GUC is false.
   - Repeated and concurrent requests verify intended client lifecycle without sharing request-scoped clients.
   - All tests use disposable local fixtures unless a protected Preview-only environment has passed the identity and role gates.

7. **Make workflow provenance exact**
   - Workflow must check out the triggering `github.sha` (or an explicitly supplied SHA that is verified to equal the reviewed branch head), never a fixed historical SHA.
   - Emit the tested commit SHA and resolved Prisma/adapter versions in non-secret logs.
   - Keep App and Store connection strings in a protected GitHub Environment; never print, echo, mask-test, or serialize secret values.
   - Require a literal Preview-only confirmation and reject identical App/Store connection strings.
   - A successful workflow proves only the GitHub-provided connection strings, not Cloudflare Worker secret destinations.

8. **Keep Cloudflare binding attestation separate**
   - Do not infer deployed Worker binding destinations from GitHub Actions success.
   - Do not add a diagnostic route or deploy a temporary Worker for this proof.
   - Require independent, non-secret destination attestation for the deployed `heavix-preview` Worker before release consideration.

## Acceptance criteria

- Exact reviewed HEAD is checked out and reported.
- Both generated Prisma clients are built from current branch schemas and compatible package versions.
- Workerd starts with the expected compatibility flags.
- Missing-secret and wrong-identity cases fail closed.
- Both Preview database identities match their allowlisted system identifiers before any migration query.
- Both App and Store transactions report `transaction_read_only=true`.
- No DML/DDL is issued; no Production resource is contacted.
- App/Store client lifecycle tests pass.
- Workflow logs contain no connection strings or other secret material.
- Workflow run is tied to the exact HEAD under review.

## Branch governance observation

At review time, GitHub reports this branch as `protected=false`, `protection.enabled=false`, with required status-check enforcement off and no repository rulesets returned by the available rulesets read. The connected GitHub App cannot access the branch-protection endpoint (HTTP 403), so the absence of protection is confirmed by the branch payload, but full administrative policy inspection is unavailable through this connection.

Do not claim branch protection was changed. Apply required checks only through an authorized repository-administration connection after confirming the intended policy and Vercel exclusion. No PR or merge should be opened while the Vercel GitHub App remains enabled as an external failing check.

## Current release decision

**Preview release: NO-GO.** This plan does not close the outstanding database-role, exact-HEAD Prisma Workerd, Cloudflare binding-destination, or Backblaze B2 backup/restore gates.
