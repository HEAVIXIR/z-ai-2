# HEAVIX — Preview destination and release-gate recheck (round 2)

**Audit date:** 2026-11-08  
**Repository:** `HEAVIXIR/z-ai-2`  
**Branch:** `security/active-session-hardening-2026-11-08`  
**Audited HEAD before this document:** `7f6a94763d5efa8eef0c92c2d9852d0b2f0f0344`  
**Cloudflare Worker:** `heavix-preview`  
**Workers Builds script tag:** `40270a318ea94b0a9102bc3c4b34f0cf`

## Scope and safety

This is a read-only recheck of GitHub branch/Actions metadata, Cloudflare Workers Builds configuration, Worker binding metadata, Preview inventory/deployment metadata, and Prisma Postgres resource/connection metadata. No secret values, connection-string values, access tokens, database contents, or user data were requested or read. No Cloudflare, Prisma, DNS, deployment, migration, or Production settings were changed.

## GitHub exact-HEAD state

- The canonical branch still pointed to `7f6a94763d5efa8eef0c92c2d9852d0b2f0f0344` at audit time.
- Direct Actions inventory for that exact SHA returned two push-triggered workflows:
  - CI run `42514741431`: completed, success, attempt 2.
  - Cloudflare OpenNext Edge Middleware Workerd Proof run `42514741364`: completed, success, attempt 1.
- The branch API reports `protected=false` and no required status checks. This is an access-control/process risk. No branch-protection mutation was attempted because the available connection does not establish authorized repository-administration capability.
- Vercel statuses are not accepted HEAVIX CI signals and are excluded from the release gate.

## Cloudflare control-plane findings

- Worker Builds configuration remains linked to `HEAVIXIR/z-ai-2`, with production branch `main`.
- `auto_build_enabled=true`; `previews_enabled=false`.
- Preview inventory remains empty (zero Preview objects).
- Preview Base configuration contains the variable names `HEAVIX_ENV`, `NEXT_PUBLIC_SITE_URL`, and `NODE_ENV`. No variable values were needed for this recheck.
- Preview Base deploy command remains the no-op sentinel:
  `echo HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF`.
- Production deploy command remains the no-op sentinel:
  `echo HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF`.
- The Worker version reports `nodejs_compat` and bindings `ASSETS` (assets), `DATABASE_URL` (secret_text), `STORE_DATABASE_URL` (secret_text), `HEAVIX_ENV` (plain_text), and `NODE_ENV` (plain_text).
- The secret-list endpoint returned only the two secret binding names; it did not expose or require secret material.
- The latest listed live Worker deployment is still dated `2026-10-29T21:25:26Z` (Wrangler source). Worker script metadata was modified later on `2026-11-08T15:14:51Z`. Configuration modification is not evidence of a new deployed artifact.

## Prisma resource and named-connection cross-check

All three known databases remain `ready` in Europe/Frankfurt:

| Purpose | Project | Database ID |
|---|---|---|
| Main app Preview | `heavix-app-preview` | `db_ew8d6duermpt125paxaqorr9` |
| Store Preview | `heavix-store-preview` | `db_cmtgxfrfwxw5mi77020tcnc3` |
| Production | `heavix-production` | `db_rc9ln1df4rwgxducp2zsge2s` |

Named connection metadata for the Main app Preview database includes:

- `heavix-preview-worker`: `con_qy93tzb532xw4rc2za0x18qq` (created 2026-10-28T14:12:18Z).
- `heavix-preview-app-worker`: `con_a51u3kwsg1vkhs7dhtfzyjtn` (created 2026-10-28T20:47:16Z).

The Store Preview database includes `heavix-preview-worker`: `con_deqygs8illafyr5bcw2mzkbn` (created 2026-10-28T14:12:20Z). The Production database has no named record with that label in the returned inventory.

**Critical limitation:** Prisma's named-connection inventory does not reveal which connection record a Cloudflare secret value points to. Cloudflare's secret binding metadata reveals binding names/types, not their target Prisma resource IDs. The presence of both `heavix-preview-worker` and `heavix-preview-app-worker` labels makes it especially important not to infer a binding destination from a name alone.

## Release gates and next required evidence

**NO-GO remains in force.** The following are still not proven:

1. `DATABASE_URL` resolves to the dedicated Main app Preview database.
2. `STORE_DATABASE_URL` resolves to the dedicated Store Preview database.
3. A deployable Preview artifact is isolated from Production and can be exercised without enabling public Preview builds prematurely.
4. The canonical branch has an appropriate protection/ruleset policy.

The next safe step is an authorized operator-side attestation performed locally in the Cloudflare/Prisma consoles: compare each secret's destination without copying or disclosing the value, then record only the matching Prisma database ID and a boolean match result. If the values do not match, correct them only through an explicitly authorized secret-rotation/change procedure with rollback planning.

Until those gates are evidenced: do not enable Preview builds, change bindings/secrets, deploy, run migrations, alter DNS, merge, open a PR, or touch Production.

## Follow-up: live schema and migration metadata

A read-only database-level check was added after the control-plane audit:

- Main app Preview has 121 public tables, including `_prisma_migrations`.
- Store Preview has 36 public tables, including `_prisma_migrations`.
- The Main app Preview migration table contains two completed, non-rolled-back entries: `20261025081255_init_postgresql_baseline` and `20261025193000_add_auditlog_idempotency_key`.
- The Store Preview migration table contains two completed, non-rolled-back entries: `0001_init_store_baseline` and `0002_add_audit_outbox`.
- The Production database has zero public base tables in the returned `information_schema.tables` inventory; `to_regclass('public."_prisma_migrations"')` returned false.
- The Prisma recorded-schema endpoint reports no Prisma 8 migration contract for all three resources. That result is distinct from the live PostgreSQL `_prisma_migrations` table and must not be interpreted as proof that Preview has no Prisma 6 migration history.

**Interpretation:** both Preview databases have a non-empty live schema and two completed baseline-era migrations in their PostgreSQL migration tables. Production currently appears to have no public tables in the selected Prisma database resource. This is a high-severity environment/target-attestation issue, not authorization to initialize, migrate, or otherwise modify Production. Confirm that this Production resource is the intended one before any future Production work.

The Preview schemas and migration tables are not yet proven to match the exact current repository schema. A dedicated schema-diff/compatibility gate remains required before any Preview deployment.


## Follow-up: repository schema parity and backup-runtime audit

### Live schema parity (name-level)

Compared the active repository Prisma model declarations with live PostgreSQL table names:

| Database | Prisma models | Live tables | Missing model tables | Unexpected non-system tables |
|---|---:|---:|---:|---:|
| Main app Preview | 120 | 121 | 0 | 0 |
| Store Preview | 34 | 36 | 0 | 0 |

The Main app Preview table count includes `_prisma_migrations`. Store includes `_prisma_migrations` and the expected implicit many-to-many join table `_CarModelToPart`. This is name-level parity only; column types, indexes, constraints, defaults, and full SQL drift still need a separate diff.

The source wiring agrees with the intended two-database split: `src/lib/db.ts` uses the main generated Prisma client; `src/lib/store-db.ts` uses the separately generated Store client; `prisma/schema.prisma` reads `DATABASE_URL`; and `prisma/store/schema.prisma` reads `STORE_DATABASE_URL`.

### Backup and Backblaze B2 gap

- The current admin backup route imports `node:child_process.execFile`, invokes `bash scripts/backup.sh`, and writes paired dumps under local `./backups`.
- `scripts/backup.sh` requires `pg_dump` and produces local `main.sql`, `store.sql`, and `checksums.txt`. It does not upload to remote object storage.
- Repository code and `.env.example` contain no Backblaze B2/S3 endpoint, bucket, or credential integration. The approved B2 infrastructure is therefore not yet wired into this backup path.
- Cloudflare documents `node:child_process` as a non-functional stub module in Workers; importing the stub does not provide a working process-spawning implementation. The current Worker runtime configuration has `nodejs_compat`, but that does not make `execFile`/shell execution available. See [Cloudflare Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).
- Consequently, the existing admin backup route must not be treated as a working Cloudflare Workers backup mechanism. The current local filesystem output also does not establish durable off-site backup storage.

**Recommended implementation direction (not executed):** move paired `pg_dump` execution to a controlled GitHub Actions runner or another supported job runtime, upload encrypted/checksummed artifacts to the approved Backblaze B2 bucket through its S3-compatible API, enforce retention, and prove restore from B2 into a disposable database. Keep credentials in repository/environment secrets and never print them. Do not add a workflow that targets live databases until authorized backup credentials, target identities, retention, and restore gates are confirmed.
