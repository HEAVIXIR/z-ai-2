# Prisma Preview Workerd exact-HEAD port plan

Date: 2026-11-09
Status: design only; not implemented or dispatched
Branch: `security/active-session-hardening-2026-11-08`
Reviewed HEAD: `73ee9c834f17de3cf8d5b76f0f66acd6c069132f`

## Purpose

Replace the historical-commit-only Prisma Preview Workerd proof with a proof that is built and run from the exact reviewed branch commit. The proof must remain fail-closed, read-only, and restricted to the two inventoried Preview PostgreSQL resources.

This document is a plan, not evidence of a passing database proof. No dependencies, lockfiles, workflow definitions, database roles, grants, secrets, Cloudflare bindings, or deployments were changed to produce it.

## Current compatibility boundary

The current branch's `package.json` declares Prisma and `@prisma/client` `^6.11.1`; the committed `bun.lock` resolves both to `6.19.3`. The current lockfile does not contain `@prisma/adapter-ppg` or `@prisma/ppg`, and the current package scripts do not define `test:workerd` or `typecheck:worker`. The historical harness commit `b94b9d6f3540e8f4467b1d4ac051d5ef050c0994` uses the same resolved Prisma/Client `6.19.3` core versions, but also carries `@prisma/adapter-ppg` `7.10.1` and `@prisma/ppg` `1.0.1`. Its worker imports `src/lib/prisma-worker-clients`, a module absent from current HEAD. The core Prisma version is therefore not itself the observed incompatibility; the missing adapter/runtime integration, worker-client module, and proof scripts are the concrete porting gaps.

Do not transplant the historical package manifest, lockfile, adapter stack, or worker source as a unit. Although the resolved Prisma core versions match, the historical adapter packages and worker integration are absent from current HEAD. First establish a supported adapter/client combination for the exact Prisma version and Cloudflare Workerd runtime used by this branch.

## Follow-up audit on exact HEAD `b6971fec14bb1ec95e212e2c258f1f031ee8488e`

- The committed lockfile resolves both `prisma` and `@prisma/client` to `6.19.3`; this corrects the earlier assumption that the resolved client was still at `6.11.x` based only on the manifest range.
- The current lockfile contains no `@prisma/adapter-ppg` or `@prisma/ppg` entries. The package manifest and scripts still lack the Prisma Workerd harness.
- `.github/workflows/prisma-preview-workerd-proof.yml` remains a manual workflow that checks out fixed historical commit `b94b9d6f3540e8f4467b1d4ac051d5ef050c0994`. Its contract test explicitly asserts that pin. It has not been dispatched, and it is not exact-HEAD evidence.
- The separate `.github/workflows/open-next-middleware-workerd.yml` did run on `b6971fec14bb1ec95e212e2c258f1f031ee8488e` and passed. This is local OpenNext Edge Middleware Workerd proof only; it does not execute the Prisma App/Store database harness.
- The CI workflow also passed on this exact commit, including disposable local PostgreSQL integration and paired backup/restore checks. Those checks do not attest to Preview DB roles, Preview DB destinations, Cloudflare secret destinations, or B2 object storage.

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
