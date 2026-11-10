# HEAVIX Preview Workerd Runtime Proof — 2026-11-10

## Status

**PASS — independently verified from GitHub Actions run #42872987144, attempt 2.**

This record documents the Preview-only App + Store Prisma runtime proof. It is evidence of read-only database connectivity and Workerd execution; it is **not** authorization or evidence for Production deployment.

## Immutable run identity

| Field | Value |
|---|---|
| Repository | `HEAVIXIR/z-ai-2` |
| Workflow | `Prisma Preview Workerd Runtime Proof` |
| Run | [#42872987144](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42872987144) |
| Attempt | `2` |
| Conclusion | `completed / success` |
| Branch | `infra/prisma6-cloudflare-runtime` |
| Exact tested commit | `07b6de155284dd7813335201552acf4efbb6ad90` |
| Job | `Read-only App + Store Workerd proof` |
| Job ID | `130034313396` |
| Runtime | Workerd via Wrangler / Miniflare |

All 11 job steps completed successfully, including exact-commit/branch validation, locked dependency installation, App and Store Worker Prisma Client generation, fail-closed validation of two distinct Preview inputs, and execution of the read-only Workerd proof.

## Database identity evidence

The workflow output reported:

| Target | PostgreSQL system identifier | Server | Schema | Result |
|---|---:|---|---|---|
| App Preview | `7701427422680793119` | `17.2` | `public` | PASS |
| Store Preview | `7701425043360235551` | `17.2` | `public` | PASS |

The system identifiers match the previously inventoried Preview resource identities. The proof also reported `current_database() = postgres` for both resources. That internal database name is shared and is **not** used as the unique resource identity; the system identifier is the decisive identity fingerprint.

Migration fingerprints observed:

- App: `20261025081255_init_postgresql_baseline`, `20261025193000_add_auditlog_idempotency_key`
- Store: `0001_init_store_baseline`, `0002_add_audit_outbox`

Connection input values were masked in GitHub Actions logs. The log confirms that both Preview inputs were present and distinct; no connection string is recorded in this document.

## Checks reported PASS

- Exact App and Store Preview migration fingerprints
- Same-request Prisma client reuse
- Sequential request isolation
- Concurrent request isolation
- Transaction-scoped read-only proof using `current_setting('transaction_read_only')::boolean`
- Fail-closed behavior when required secrets are missing

Read-only evidence:

| Target | Observed setting | Proven |
|---|---|---|
| App | `true` | yes |
| Store | `true` | yes |

The runner output explicitly reported:

- `writesPerformed: false`
- `productionAccessed: false`
- `readOnlyProven.app.proven: true`
- `readOnlyProven.store.proven: true`

No migration, seed, database write, Production access, Worker deployment, or DNS change was performed by this workflow.

## Evidence limitations

- The run has no separately uploaded GitHub Actions artifact; the authoritative machine-readable result is present in the job log.
- This proves the Preview-only Workerd Prisma harness and both database identities. It does not, by itself, prove that the public application routes are healthy in a newly deployed Worker.
- It does not prove a new Cloudflare Preview Worker was deployed.
- It does not establish Production readiness.
- The current Cloudflare Workers Builds configuration was separately observed with `previews_enabled: false`; therefore Continuous Preview remains disabled until its own explicit, gated configuration/deployment step is completed.

## Next gates toward a usable Preview

1. Complete and independently review the real OpenNext application-module integration path, including App/Store DB imports and the Cloudflare request-context binding path.
2. Reconcile the exact Worker artifact/build for the selected commit and inspect its module graph and deployment inputs.
3. Confirm the Preview build/deploy configuration is isolated from Production and that the deployment command cannot target Production.
4. Only then create/update an isolated non-production Preview Worker, followed by browser E2E checks for public routes, authentication/session, RBAC, Persian RTL, responsive layout, assets, and error paths.
5. Keep Production, DNS, migrations, seeds, and customer-facing Worker deployment unchanged until all release gates pass.

## Governance

This evidence record is documentation-only. It does not change application code, database state, secrets, Cloudflare configuration, DNS, or any deployed Worker. The source PR remains subject to independent review on its current exact HEAD; earlier approvals on older commits are not approval of a newer HEAD.
