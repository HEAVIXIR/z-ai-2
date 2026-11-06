# Preview database Secret destination proof — operator runbook

**Status:** preparation only. This document does not authorize a database connection, Worker upload/deployment, migration, write, or Production access.

## Objective

Establish, with independently recorded provenance, that the two Preview-only connection strings supplied to the local Workerd proof are the exact resources intended for:

- App: Prisma project `heavix-app-preview`, database `db_ew8d6duermpt125paxaqorr9`.
- Store: Prisma project `heavix-store-preview`, database `db_cmtgxfrfwxw5mi77020tcnc3`.

Do not infer destination from the connection-string name alone. Never read, print, paste into chat, commit, screenshot, or log a connection string or bearer token.

## Current known facts (metadata only)

- Cloudflare Worker `heavix-preview` has secret-text bindings named `DATABASE_URL` and `STORE_DATABASE_URL`. Cloudflare's list-secrets API returns names/types only; it cannot prove destination.
- The dedicated App Preview and Store Preview Prisma databases are Ready in Frankfurt.
- Expected cluster identifiers recorded by prior independent inventory:
  - App Preview: `7701427422680793119`
  - Store Preview: `7701425043360235551`
- The verified current database OID is `5` for both Preview resources. Both report `current_database() = postgres`; the same OID across these two independent clusters is valid. A database OID is only unique within its own cluster, so the cluster `system_identifier` and database OID must be checked together.
- The active Cloudflare Worker does not currently expose `HEAVIX_APP_PREVIEW_DATABASE_OID` or `HEAVIX_STORE_PREVIEW_DATABASE_OID`. Do not modify it to add them as part of this runbook.

## Phase 0 — stop conditions

Do not proceed if any selected project/database name or ID differs from the exact values above. Do not select anything under `heavix-production`. Do not use a Production branch, Production credential, or generic/default connection whose source is ambiguous.

Do not change the live `heavix-preview` Worker secrets for this proof. The proof is run locally with an isolated Wrangler/Workerd process and a temporary private config; it does not upload or deploy a Worker.

## Phase 1 — independently identify the two Prisma resources (no connection-string values)

1. Sign in to Prisma Console.
2. Open the workspace containing Heavix.
3. Open **Projects**.
4. Select the project named **heavix-app-preview**. Confirm the project identity in the page before continuing.
5. Open its database **heavix-app-preview** and confirm the resource ID is `db_ew8d6duermpt125paxaqorr9`.
6. In the database's **Connection strings** section, locate the specifically named `heavix-preview-worker` entry. The App Preview and Store Preview projects both use this same connection-string label; the project and database resource IDs—not a unique label—distinguish the two resources. Do not use a generic console connection string and do not select a Production resource.
7. Separately, return to **Projects** and select **heavix-store-preview**.
8. Open database **heavix-store-preview** and confirm resource ID `db_cmtgxfrfwxw5mi77020tcnc3`.
9. In its **Connection strings** section, locate the specifically named `heavix-preview-worker` entry. This is the same label used in App Preview, but it belongs to this separately identified Store Preview database.
10. Record locally (not in chat) the source project, database name, resource ID, and connection-string label for each. The operator has visually confirmed that both entries exist and that both resource IDs match. The shared label is not an error and is not globally unique. These labels and IDs establish resource selection metadata, not the destination of the encrypted Cloudflare Secret values; the actual runtime identity test remains mandatory.

If either specifically named connection string is absent, stop. Do not create or substitute another connection without first reviewing the source and scope.

## Phase 2 — obtain the trusted database OIDs (COMPLETED)

The operator explicitly authorized Preview database contact. The assistant executed the following identity query separately against the exact App Preview and Store Preview project/database IDs through Prisma. The query was run inside `BEGIN TRANSACTION READ ONLY ... COMMIT`; both results reported `transaction_read_only = on`. Only SELECT statements were executed; no writes, migrations, or seeds were run.

For each database, open the SQL/query editor from that exact database resource page (not from the Production project) and run only:

```sql
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  (SELECT oid::text
   FROM pg_database
   WHERE datname = current_database()) AS database_oid,
  (SELECT system_identifier::text
   FROM pg_control_system()) AS system_identifier,
  current_setting('server_version') AS server_version;
```

Verified results (2026-11-06):

| Check | App Preview | Store Preview |
|---|---|---|
| Project / database ID | `proj_ixevv7dtzykr8qbj3xdxpcbq` / `db_ew8d6duermpt125paxaqorr9` | `proj_ai0qym0x93siv4oeo11bkmuy` / `db_cmtgxfrfwxw5mi77020tcnc3` |
| `current_database()` | `postgres` | `postgres` |
| `current_user` | `prisma_application` | `prisma_application` |
| Database OID | `5` | `5` |
| Cluster system identifier | `7701427422680793119` | `7701425043360235551` |
| PostgreSQL | `17.2` | `17.2` |
| Explicit read-only transaction | `on` | `on` |

Both cluster identifiers match the independently recorded expected values. OID `5` in both is valid: OIDs are local to a PostgreSQL cluster and are not globally unique. Destination identity is established by the pair `(system_identifier, database_oid)`. No credentials or connection-string values were returned or recorded.

## Phase 3 — run the local Workerd proof (requires separate explicit operator go-ahead)

Run from a trusted Windows machine with the repository checked out at the exact reviewed PR #200 code snapshot. Do not use a shared/public computer.

The runner is `scripts/run-prisma-workerd-proof.mjs`. It requires:
- `HEAVIX_RUNTIME_PROOF_TARGET=PREVIEW_ONLY`
- `HEAVIX_APP_PREVIEW_PPG_URL` and `HEAVIX_STORE_PREVIEW_PPG_URL`: two distinct Prisma Postgres (PPG) connection strings, not direct PostgreSQL URLs unless the reviewed code explicitly supports them.
- `HEAVIX_APP_PREVIEW_DATABASE_OID` and `HEAVIX_STORE_PREVIEW_DATABASE_OID`: the OIDs obtained in Phase 2.

The runner writes a temporary `.dev.vars` file with restrictive permissions, starts Wrangler in local mode bound only to `127.0.0.1`, executes the identity/migration/read-only checks, then terminates the process and removes its temporary directory. It does not upload a Worker.

**Credential-handling requirements:** do not pass connection strings as command-line arguments; do not put them in PowerShell command history, shell profiles, GitHub Actions, GitHub Secrets, chat, screenshots, or logs. Use hidden secure prompts and transient process environment variables. Ensure the local machine is not shared and the temporary directory is removed after the run. Never print environment variables.

Expected proof assertions:
- App and Store each match their independently inventoried cluster system identifier and their own database OID.
- PostgreSQL 17, `public` schema, exact expected migration-name sets.
- Separate request-scoped clients; no cross-request leakage.
- Transaction-local read-only state is observed as true.
- No writes, migrations, seeds, Production access, Cloudflare deployment, or DNS changes.

A successful test against the two locally supplied connection strings proves those strings' destinations. It does **not** prove that the already-deployed Cloudflare secret values are identical. Do not claim the live Worker secret mapping is proven unless those live values are re-established through a separately controlled, reviewed update of the live Preview Worker and a subsequent protected runtime identity check. That update is not authorized by this runbook.

## Phase 4 — evidence to report

Share only:
- App resource ID and database OID (not credentials).
- Store resource ID and database OID (not credentials).
- Whether each system identifier matched (yes/no).
- Runner result (PASS/FAIL) and non-secret assertion summary.
- Confirmation that no Production resource was selected.

Do not share connection strings, passwords, tokens, screenshots of credential panels, or full environment dumps.

## Current decision

- Prisma resource selection and direct Preview database identity: **PROVEN** for both Preview resources.
- App Preview identity pair: `(7701427422680793119, 5)`.
- Store Preview identity pair: `(7701425043360235551, 5)`.
- Cloudflare live Secret-to-database destination: **UNPROVEN**. The direct Prisma checks above do not inspect or prove the encrypted values currently bound to the Cloudflare Worker.
- Preview database contact: **AUTHORIZED AND COMPLETED**, using SELECT-only statements in explicit read-only transactions.
- Live Worker secret replacement or deployment: **NOT PERFORMED**.
- Production: **NO-GO**.
- Migrations, seeds, writes, DNS changes, and PR merge: **NOT PERFORMED**.

Next safe step: inspect whether the existing deployed Preview Worker can execute a protected identity probe without changing its current secrets. If not, prepare a separately reviewed Preview-only proof deployment/secret rotation plan; do not infer that the live secret mapping is correct from the Prisma checks.
