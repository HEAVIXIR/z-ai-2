# Preview Workerd proof — dedicated read-only PostgreSQL roles

Status: **design/runbook only; not applied**  
Scope: the two dedicated Preview PostgreSQL resources only. This procedure is
not for Production and must never be pointed at a Production database.

## Why separate proof identities are required

The 2026-11-09 read-only catalog audit found that the Prisma SQL-tool role
`prisma_application` has `rolreplication=true`, inherits
`pg_read_all_data` and `pg_write_all_data`, and has effective
INSERT/UPDATE/DELETE on all public tables. Both Preview resources also report
`default_transaction_read_only=off` and
`transaction_read_only=off`. The existing Workerd proof correctly refuses
to call this a read-only connection.

The proof harness only needs to:
- connect to the selected database;
- execute `pg_catalog.pg_control_system()` to compare the PostgreSQL
  `system_identifier` before any other database query;
- read the `public."_prisma_migrations"` rows to compare the exact migration
  fingerprint;
- execute harmless `SELECT 1` and read
  `current_setting('transaction_read_only')` inside a transaction.

It does not need business-table access, sequence access, DML, DDL, role
membership, replication, or `pg_monitor`. The observed
`pg_control_system()` function ACL is NULL (default ACL), and the audited
role can execute it without an explicit role grant on both Preview resources.

## Resource allowlist (do not substitute)

| Resource | Prisma project | Database | Expected PostgreSQL system identifier |
|---|---|---|---|
| App Preview | `proj_ixevv7dtzykr8qbj3xdxpcbq` | `db_ew8d6duermpt125paxaqorr9` | `7701427422680793119` |
| Store Preview | `proj_ai0qym0x93siv4oeo11bkmuy` | `db_cmtgxfrfwxw5mi77020tcnc3` | `7701425043360235551` |

The Prisma SQL tool reports the internal database name `postgres` for these
resources; do not use that name as the resource identity. Verify the system
identifier on the actual connection before reading migrations. These
identifiers are a strict allowlist, not values to update when a connection
fails.

## Role model

Create two distinct login roles, one per database:

- `heavix_app_preview_proof_ro`
- `heavix_store_preview_proof_ro`

Each role must be:
- `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOREPLICATION`, `NOBYPASSRLS`, `NOINHERIT`;
- a member of **no other role** (no inherited or SET ROLE path);
- granted only `CONNECT` on its own database, `USAGE` on `public`,
  and `SELECT` on `public."_prisma_migrations"`;
- configured with `default_transaction_read_only=on`;
- not granted access to the other Preview database.

Do not grant `pg_read_all_data`, `pg_write_all_data`, `pg_monitor`,
`pg_read_all_settings`, `pg_execute_server_program`, or any application
role. Do not grant table-wide SELECT or sequence privileges. Do not alter,
revoke, or repurpose `prisma_application` as part of this runbook.

## Provisioning — privileged operator only, not executed

Role creation requires an appropriately privileged database administrator
credential supplied through the provider's approved secure administrative
path. The current Prisma SQL-tool role is not to be assumed capable of role
administration. Never paste credentials into chat, a SQL literal, shell
history, a GitHub issue, or this repository.

For each Preview database, use its own database connection and a unique
strongly generated password. The role name and password are not shared
between App and Store. In a secure `psql` session:

```sql
CREATE ROLE heavix_app_preview_proof_ro
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
\password heavix_app_preview_proof_ro

GRANT CONNECT ON DATABASE <APP_PREVIEW_DATABASE_NAME>
  TO heavix_app_preview_proof_ro;
GRANT USAGE ON SCHEMA public TO heavix_app_preview_proof_ro;
GRANT SELECT ON TABLE public."_prisma_migrations"
  TO heavix_app_preview_proof_ro;
ALTER ROLE heavix_app_preview_proof_ro
  SET default_transaction_read_only = on;
```

Run the equivalent commands against the Store Preview database using
`heavix_store_preview_proof_ro` and a separately generated password. Do not
run both role definitions on one database. The database-name placeholders
must be replaced only with the database names confirmed by the provider for
the corresponding resource; do not guess them from the Prisma SQL tool's
`current_database()` result.

If role creation or a grant is rejected by the managed provider, stop and
document the exact redacted error. Do not compensate by granting a broader
built-in role or by weakening the Workerd proof.

## Verification gates — reconnect as each new proof role

Run these checks independently for App and Store. The connection URL must be
provided only through the protected operator/CI secret channel. Do not echo,
print, or log it.

1. **Identity first:** the first query must be
   `SELECT system_identifier::text FROM pg_catalog.pg_control_system()`.
   Compare it to the corresponding allowlisted identifier above. If it does
   not match, stop immediately; do not query migrations or continue.
2. **Role attributes:** confirm `rolsuper`, `rolcreaterole`,
   `rolcreatedb`, `rolreplication`, and `rolbypassrls` are all false,
   and `rolinherit` is false.
3. **Membership:** confirm zero rows in `pg_auth_members` where this role is
   the member. No direct or indirect membership is allowed.
4. **Minimal access:** confirm database CONNECT, public schema USAGE, and
   SELECT on `public."_prisma_migrations"`. Confirm no INSERT, UPDATE,
   DELETE, TRUNCATE, REFERENCES, or TRIGGER privilege on any public table,
   including column-level grants; confirm no sequence USAGE/SELECT/UPDATE.
5. **Read-only default:** open a fresh connection after the role setting is
   applied. Confirm `current_setting('default_transaction_read_only')`
   is `on`. Inside an explicit transaction, confirm
   `current_setting('transaction_read_only')` is `on`; then ROLLBACK.
6. **Migration fingerprint:** only after identity and role gates pass, read
   the finished, non-rolled-back migration names and compare them exactly:
   - App: `20261025081255_init_postgresql_baseline`,
     `20261025193000_add_auditlog_idempotency_key`
   - Store: `0001_init_store_baseline`, `0002_add_audit_outbox`
7. **Negative behavior:** verify that a transaction write attempt is rejected
   by PostgreSQL with read-only-transaction behavior in a disposable
   transaction that is always rolled back. This is an optional additional
   negative test; the Workerd proof's read-only GUC assertion remains
   mandatory and must not be replaced by this test.

The proof must fail if any effective DML privilege exists, even when
`default_transaction_read_only=on`. The setting is defense in depth; it
does not replace least-privilege grants.

## CI and Cloudflare secret handling

Only after both roles pass every verification gate:
- place the two distinct connection strings in the protected GitHub
  Environment intended for the Preview-only manual proof;
- keep the secret names and values separate from Production environments;
- do not trigger the Workerd workflow until its harness and workflow are
  restored/rebased into the current reviewed branch and the workflow checks
  out that exact reviewed commit;
- retain the harness's pre-query system-identifier allowlist and strict
  read-only assertion;
- independently attest Cloudflare Worker binding destinations. A successful
  GitHub Actions proof does not prove that the deployed Worker's
  `DATABASE_URL` and `STORE_DATABASE_URL` bindings target these resources.

Do not put these connection strings in repository variables, source files,
logs, artifacts, issues, or this runbook.

## Rollback

If a proof role is no longer needed, revoke only that dedicated role's
specific grants, terminate its sessions if required by the provider's
approved procedure, then drop that dedicated role after confirming it owns no
objects. Do not revoke privileges from or alter `prisma_application` as
part of this rollback.

## Current status

No role has been created, altered, or granted privileges by this runbook.
No database write, DDL, migration, secret update, Worker binding change,
deployment, DNS change, or Production operation has been performed.
Preview remains **NO-GO** until the proof identities, exact-commit CI/Workerd
evidence, Cloudflare binding destination attestation, and paired encrypted
Backblaze B2 read-back/restore proof are complete.
