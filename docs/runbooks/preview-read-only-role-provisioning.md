# Provision dedicated Preview read-only Prisma Postgres roles

Date: 2026-11-09
Status: operator runbook; not executed

## Scope and exact resources

This procedure is for the two dedicated Preview databases only. It must not be run against Production or the existing application login.

| Resource | Prisma project | Prisma database | PostgreSQL system identifier |
|---|---|---|---|
| App Preview | `proj_ixevv7dtzykr8qbj3xdxpcbq` | `db_ew8d6duermpt125paxaqorr9` | `7701427422680793119` |
| Store Preview | `proj_ai0qym0x93siv4oeo11bkmuy` | `db_cmtgxfrfwxw5mi77020tcnc3` | `7701425043360235551` |

Both resources were inventoried as PostgreSQL 17.2. Prisma reports the internal database name `postgres` for each; use the project/database resource IDs and system identifier as the destination identity.

## Why separate credentials are required

A SELECT-only audit of both Preview resources found that the currently used `prisma_application` role:
- has `rolreplication=true`;
- is a member of and inherits `pg_write_all_data`;
- has effective write privileges on public tables;
- does not have role-level `default_transaction_read_only=on`.

Do not revoke or alter attributes, memberships, grants, defaults, or settings on `prisma_application` as part of this procedure. The normal application runtime may require its existing write access. Create separate, Preview-only login roles for the manual proof workflow.

## Provisioning procedure

Perform each operation independently in the matching Preview database using an authorized database administrator session. Do not copy the SQL to Production.

### App Preview

```sql
CREATE ROLE heavix_preview_app_ro
  LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

GRANT pg_read_all_data TO heavix_preview_app_ro;

ALTER ROLE heavix_preview_app_ro
  SET default_transaction_read_only = on;

ALTER ROLE heavix_preview_app_ro
  SET idle_session_timeout = '5min';
```

### Store Preview

```sql
CREATE ROLE heavix_preview_store_ro
  LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

GRANT pg_read_all_data TO heavix_preview_store_ro;

ALTER ROLE heavix_preview_store_ro
  SET default_transaction_read_only = on;

ALTER ROLE heavix_preview_store_ro
  SET idle_session_timeout = '5min';
```

`pg_read_all_data` is the read-only predefined role. Do not grant `pg_write_all_data`, `pg_write_server_files`, or `pg_execute_server_program`. Do not add custom write grants, schema CREATE, database CREATE, replication, or RLS bypass.

Set each login password through the provider's approved secure role/credential interface. Do not place passwords in SQL files, GitHub comments, issue text, chat, shell history, or repository variables. If the provider does not permit creating a custom login role or setting its password, stop and use the provider's supported role-management process; do not fall back to `prisma_application`.

## Verify before creating GitHub secrets

Run the following SELECT-only checks while connected as the new role in each matching resource:

1. Confirm `current_user` is the expected role name.
2. Confirm `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolreplication`, and `rolbypassrls` are all false.
3. Confirm `rolconfig` contains `default_transaction_read_only=on`.
4. Confirm the role is not a member of or inheriting `pg_write_all_data`, `pg_write_server_files`, or `pg_execute_server_program`.
5. Confirm there are no effective INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN privileges on user-schema relations.
6. Confirm there are no effective sequence USAGE/UPDATE privileges, no CREATE on user schemas, and no CREATE on the database.
7. Confirm `pg_control_system()` returns the exact system identifier in the resource table above.
8. Confirm a transaction reports `current_setting('transaction_read_only')::boolean = true`.

The canonical implementation of these checks is `inspectReadOnlyRole()` in `tests/workerd/worker.ts`. The exact SQL was executed successfully against both Preview databases using the existing role and returned the expected fail-closed findings. The current role is not an acceptable credential.

## GitHub Environment wiring

Only after both roles pass the checks above:

1. An authorized repository administrator creates/verifies GitHub Environment `preview-proof`.
2. Configure required reviewers and branch restrictions. Environment protection has not been verified by the current GitHub connection.
3. Add the App role's Preview-only connection string as environment secret `HEAVIX_APP_PREVIEW_PPG_URL`.
4. Add the Store role's Preview-only connection string as environment secret `HEAVIX_STORE_PREVIEW_PPG_URL`.
5. Do not use repository-wide secrets for these values.
6. Do not change the deployed Cloudflare Worker bindings `DATABASE_URL` or `STORE_DATABASE_URL`; those belong to the application runtime and are not the read-only proof credentials.
7. Dispatch `Prisma Preview Workerd Runtime Proof` manually with `PREVIEW_ONLY` only after the environment protections and both destination identities have been independently verified.

The workflow checks out the triggering SHA, verifies it, confirms both connection inputs are distinct, checks each database identity before migration reads, verifies App/Store request isolation, and requires both role-level and transaction-level read-only evidence. It performs no writes and has no deployment or migration step.

## Stop conditions

Stop without dispatching if:
- the provider does not support separate login roles;
- either role has any elevated attribute or inherited write role;
- any effective table/sequence/schema/database write privilege remains;
- role-level `default_transaction_read_only=on` is absent;
- system identifier or migration fingerprint differs;
- environment protection or environment-scoped secret placement cannot be verified.

Do not weaken the runtime proof to accommodate a credential that fails these checks. No Production resource, deployed Worker binding, DNS, or live application role should be modified by this procedure.
