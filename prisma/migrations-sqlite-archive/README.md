# Prisma Migrations — SQLite Archive (Historical)

**Status:** ARCHIVED — This is the old SQLite migration history, preserved
for reference only. It is NOT the canonical migration history for production.

The current canonical PostgreSQL migration histories are:
- Main: `prisma/migrations/` (provider = postgresql)
- Store: `prisma/store/migrations/` (provider = postgresql)

This archive contains the original SQLite baseline (`0_init/migration.sql`)
and its `migration_lock.toml` (provider = sqlite). These files cannot be
run on PostgreSQL — they contain SQLite-specific syntax (DATETIME,
AUTOINCREMENT, etc.).

Do NOT add new migrations to this directory. Do NOT use this history for
production deployments. See `docs/ADR-001-database-strategy.md` for the
PostgreSQL cutover plan.
