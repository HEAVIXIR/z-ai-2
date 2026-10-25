# ADR-001 — Database Strategy and Migration Recovery

- **Status:** Accepted database target; migration release gate **BLOCKED**
- **Original date:** 2026-09-20
- **Recovery audit:** 2026-10-25
- **Decision owners:** HEAVIX core team
- **Related blocker:** [Issue #80](https://github.com/HEAVIXIR/z-ai-2/issues/80)
- **Related runtime gate:** [Issue #81](https://github.com/HEAVIXIR/z-ai-2/issues/81)

## 0. Current verified state (2026-10-25)

This section records the repository state observed on main at `727229c78e36c3ebaca862d666e35c86049edc01`. It supersedes any older statement in this document that implies a valid PostgreSQL migration baseline already exists.

- `prisma/schema.prisma` declares PostgreSQL and reads `DATABASE_URL`.
- `prisma/store-schema.prisma` declares PostgreSQL and reads `STORE_DATABASE_URL`. It is the active Store schema path today.
- `prisma/migrations/migration_lock.toml` still declares `provider = "sqlite"`.
- `prisma/migrations/0_init/migration.sql` contains SQLite-specific DDL, including `DATETIME` columns and SQLite-style table/constraint syntax. It is **not** a reviewed PostgreSQL baseline and must not be deployed to PostgreSQL.
- There is no dedicated active Store migration directory/lock in the repository tree.
- `prisma/legacy-sqlite/schema.prisma` and `prisma/legacy-sqlite/store-schema.prisma` are legacy SQLite schemas used by data-migration tooling; they are not PostgreSQL migration histories.
- CI currently prepares disposable PostgreSQL 17 databases with `prisma db push --accept-data-loss`. This validates schema-driven test setup but does not validate `prisma migrate deploy`, migration ordering, or existing-database baseline adoption.
- The repository contains historical documentation that describes a baseline/cutover as complete. That statement is not supported by the current migration artifacts.

**Conclusion:** the current committed migration history is not trustworthy for PostgreSQL deployment. No migration should be applied to staging or production until the gates in §5 pass.

## 1. Context and target

HEAVIX has two logically separate PostgreSQL databases:

| Database | Prisma schema (current path) | Connection |
|---|---|---|
| Main application | `prisma/schema.prisma` | `DATABASE_URL` |
| Store | `prisma/store-schema.prisma` | `STORE_DATABASE_URL` |

The schemas are PostgreSQL-backed, but their committed migration history is not aligned with that reality. Treating `db push` as proof of a deployable migration history would leave production schema changes unreproducible and make baseline adoption ambiguous.

## 2. Decisions

### 2.1 PostgreSQL is the target for both databases

Both active schemas must validate and generate SQL for PostgreSQL. Runtime code and deployment tooling must keep the Main and Store connection targets separate.

### 2.2 Migration history is the canonical deploy artifact

For each database, reviewed, committed PostgreSQL migration files are the source of truth. Deployments must use the correct schema-specific migration directory and `prisma migrate deploy`. A green schema-push CI setup is not a substitute for this evidence.

### 2.3 Proposed canonical repository layout

The implementation PR should establish this layout after auditing every reference:

```text
prisma/
  schema.prisma
  migrations/
    migration_lock.toml   # provider = "postgresql"
    <reviewed main migrations>
  store/
    schema.prisma
    migrations/
      migration_lock.toml # provider = "postgresql"
      <reviewed Store migrations>
  legacy-sqlite/
    schema.prisma         # temporary source schema only, if still required
    store-schema.prisma   # temporary source schema only, if still required
```

The Store schema move from `prisma/store-schema.prisma` to `prisma/store/schema.prisma` is a **proposed path change**, not yet implemented. The PR must update scripts, CI, generator output paths, application imports if affected, build/deployment scripts, seed/migration utilities, and documentation atomically. Keep the Main and Store migration histories independent.

Do not rename, relabel, or reuse the current SQLite baseline as PostgreSQL SQL. Preserve historical artifacts for reference where needed, clearly marked as non-deployable; do not leave a misleading active migration path.

### 2.4 Existing databases require a separate baseline-adoption procedure

A baseline generated from an empty schema and a baseline adopted by an already-populated database are distinct cases.

- **Fresh database:** apply the reviewed history using `prisma migrate deploy` to an empty disposable PostgreSQL 17 database.
- **Existing database:** compare its schema to the intended schema, test the proposed baseline-adoption procedure on a disposable database containing representative data, and use `prisma migrate resolve` only after proving that the baseline accurately represents the already-existing schema. Preserve row counts, constraints, indexes, and referential integrity. Never run the initial baseline against a data-filled database merely to make migration status green.
- **Incremental changes:** only after both histories and baseline-adoption paths are proven, add the schema changes from PR #79 as ordinary reviewed PostgreSQL migrations.

### 2.5 `db push` restrictions

`prisma db push --accept-data-loss` must never be used as a production migration mechanism. It may be used only for explicitly disposable local/CI setup, with target isolation verified. CI must include a guard that production/deployment paths cannot invoke this command.

## 3. Consequences

- The current migration state is a release blocker, not a documentation-only discrepancy.
- No claim of deployable migration history is valid until PostgreSQL SQL, independent histories, CI migration tests, and existing-database adoption evidence are committed and reviewed.
- SQLite-to-PostgreSQL data migration scripts are separate from schema migration history. Their existence does not establish that data migration has been run or verified.
- The Store/Marketplace runtime gate in Issue #81 remains open independently of schema-migration completion.

## 4. Required implementation work

1. Audit every reference to `prisma/store-schema.prisma`, migration paths, Prisma CLI invocations, generated clients, database scripts, CI jobs, deployment/build workflows, seeds, and database documentation.
2. Establish independent PostgreSQL migration directories and locks for Main and Store; update all references in the same reviewed PR.
3. Generate each initial migration with the repository-pinned Prisma CLI and the correct schema/dialect. Inspect the generated SQL; do not hand-convert the existing SQLite SQL.
4. Add CI jobs that run `prisma validate`, deploy each migration history to fresh PostgreSQL 17 databases, and compare schema/migration drift using a reviewed Prisma workflow.
5. Test existing-database baseline adoption independently against disposable PostgreSQL databases with representative data; record the schema comparison and `migrate resolve` procedure.
6. Add PR #79's `AuditLog.idempotencyKey` and Store `AuditOutbox` migrations only after the baseline work is merged and the migration path is proven.
7. Update operational documentation so local/CI `db push` instructions cannot be mistaken for a production deployment procedure.

## 5. Release gates and prohibited actions

Until the implementation is merged, independently reviewed, and evidence is recorded:

- No staging or production schema operation.
- No backfill, Phase D/E, or production deployment.
- No scheduled production worker activation.
- No use of `db push --accept-data-loss` against a production-shaped target.
- No approval by the PR author of their own PR and no bypass of branch protection.

The required evidence is: current commit SHA, exact Prisma version, PostgreSQL version, both migration-lock providers, successful fresh-database deploys for both histories, schema-drift results, and a separately tested existing-database adoption report. Secrets and connection strings must not be placed in issue comments or CI logs.

## 6. Compliance

This ADR defines the database target and migration release gates. The historical cutover narrative and old migration README must not be interpreted as proof that the current PostgreSQL migration histories are deployable. Any future deviation must be documented in a reviewed ADR amendment.
