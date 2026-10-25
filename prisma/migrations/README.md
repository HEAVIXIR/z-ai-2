# Prisma Migrations — HEAVIX

> **Release status: BLOCKED for PostgreSQL deployment.** This directory currently contains a SQLite-era lock and a SQLite-specific initial SQL file. Do not run it against PostgreSQL.

## Current state (audited 2026-10-25)

- Active Main schema: `prisma/schema.prisma` (`provider = "postgresql"`, `DATABASE_URL`).
- Active Store schema path today: `prisma/store-schema.prisma` (`provider = "postgresql"`, `STORE_DATABASE_URL`).
- Current lock: `migration_lock.toml` says `provider = "sqlite"`.
- Current `0_init/migration.sql` includes SQLite-specific DDL such as `DATETIME`; it is **not** a valid reviewed PostgreSQL baseline.
- A separate Store migration directory and PostgreSQL lock have not yet been established.
- The active Main schema header still describes SQLite, and `.zscripts/database-runtime-build.sh` uses a SQLite `file:` URL with the Main PostgreSQL schema. These are unresolved legacy runtime/build references; do not treat that script as a validated PostgreSQL deployment path.

See [ADR-001 — Database Strategy and Migration Recovery](../../docs/ADR-001-database-strategy.md) and [Issue #80](https://github.com/HEAVIXIR/z-ai-2/issues/80).

## Rules

1. Do not apply the current `0_init/migration.sql` to PostgreSQL.
2. Do not merely change the current lock provider or hand-edit SQLite SQL to look like PostgreSQL.
3. Keep Main and Store migration histories separate.
4. Generate reviewed PostgreSQL SQL with the repository-pinned Prisma CLI and the correct schema.
5. Prove fresh-database `prisma migrate deploy` for both databases using disposable PostgreSQL 17 instances.
6. Test baseline adoption for an existing data-filled database separately. Compare the actual schema first and prove the procedure on disposable representative data; only then may `prisma migrate resolve` be considered.
7. `prisma db push --accept-data-loss` is permitted only for explicitly disposable local/CI setup. It is not a production deployment mechanism and does not prove migration history.
8. Do not perform staging, backfill, Phase D/E, production, or scheduled-worker actions under this recovery task.

## Target layout (proposed; not implemented)

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
```

The proposed Store schema move must be accompanied by a complete reference audit and updates to package scripts, CI, generator output paths, application imports where needed, deployment/build scripts, seeds, utilities, and docs. Keep legacy SQLite source schemas separate from active PostgreSQL migration histories.

## Required CI evidence

- `prisma validate` for each active schema.
- Fresh PostgreSQL 17 databases built using `prisma migrate deploy`, not `db push`.
- Migration/schema drift check for each database.
- Existing-database baseline-adoption test on disposable representative data.
- Guard that prevents production deployment paths from invoking `db push --accept-data-loss`.

This file is a status correction, not evidence that any migration has been generated, deployed, or adopted. No database operation was performed for this documentation update.