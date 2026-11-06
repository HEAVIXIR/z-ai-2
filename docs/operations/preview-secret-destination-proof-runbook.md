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
- Expected database OIDs are not yet recorded in this runbook. They must be obtained from the explicitly selected database resources, then checked against the Workerd proof output.
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

## Phase 2 — obtain the trusted database OIDs (requires explicit operator go-ahead)

This phase contacts the selected Preview databases with read-only SELECT statements. It is intentionally separate from Phase 1. Do not perform it until the operator explicitly authorizes Preview database contact.

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

Expected values:
- App Preview system identifier must equal `7701427422680793119`.
- Store Preview system identifier must equal `7701425043360235551`.
- Both should report PostgreSQL 17.
- Save each returned `database_oid` locally. Do not post connection strings, usernames, query-editor credentials, or screenshots. If `pg_control_system()` is denied, stop and use an independently trusted Prisma support/metadata path; do not weaken permissions or try another privileged query.

The database OID is resource-specific and must not be guessed or copied from the other database. If either system identifier differs, stop immediately.

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

Until Phases 1–3 are completed and their evidence reviewed:

- Secret-to-database destination: **UNPROVEN**.
- Preview database contact: **NOT AUTHORIZED / NOT PERFORMED**.
- Live Worker secret replacement: **NOT AUTHORIZED / NOT PERFORMED**.
- Production: **NO-GO**.
- Migrations, seeds, writes, deployment, DNS changes, and PR merge: **NOT AUTHORIZED**.
