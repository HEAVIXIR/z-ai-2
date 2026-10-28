# Prisma Migration Governance — HEAVIX

**Status:** operational guidance; not evidence of production readiness.  
**Legacy provenance:** adapted from `prisma/migrations/README.md` in `HEAVIXIR/z` at source commit `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`. The legacy SQLite baseline is preserved as reference only; it is not an active migration.

## 1. Active migration histories

HEAVIX maintains two PostgreSQL schemas and two separately configured databases:

- Main application: `prisma/schema.prisma`, connection via `DATABASE_URL`.
- Store/Outbox: `prisma/store/schema.prisma`, connection via `STORE_DATABASE_URL`.

The active main migration history currently includes:

- `20261025081255_init_postgresql_baseline/migration.sql`
- `20261025193000_add_auditlog_idempotency_key/migration.sql`

Before changing migrations, inspect both schema files and the existing migration history. Do not recreate, rewrite, reorder, or squash migrations that have already been shared or applied.

## 2. Development workflow

Create and validate a main-schema migration against a disposable, non-production PostgreSQL database:

```sh
bunx prisma validate --schema=prisma/schema.prisma
bunx prisma migrate dev --schema=prisma/schema.prisma --name <descriptive_name>
```

For Store/Outbox, use its own schema and isolated non-production database:

```sh
bunx prisma validate --schema=prisma/store/schema.prisma
bunx prisma migrate dev --schema=prisma/store/schema.prisma --name <descriptive_name>
```

Review the generated SQL before committing it. Verify constraints, indexes, nullability, defaults, foreign keys, lock behavior, and compatibility with existing rows. Test rollback/recovery procedures where applicable. Never point development migration commands at production.

## 3. Deployment and safety rules

1. **Migration files are the reviewed source of truth.** Do not use `prisma db push` as a production deployment mechanism.
2. **Never use `--accept-data-loss` against production.** A migration requiring destructive changes needs a separately reviewed plan, backup/restore evidence, and explicit release authorization.
3. Migration history is append-only once shared/applied. Correct mistakes with a new forward migration; do not silently edit an applied migration.
4. Main and Store are separate database domains. Generate, validate, apply, and verify their migration histories independently; never assume success for one proves the other.
5. Prefer additive/expand-and-contract changes for live systems. Preserve business history through explicit archival/soft-delete semantics where required by the domain; do not replace them with unreviewed destructive deletes.
6. Do not import legacy SQLite databases, backups, `.env` files, or archived migration bundles into Git or production.
7. A green CI rehearsal is not production authorization. Follow the current release checklist and Issue #81 operational Store/Outbox gate before any production database change.

## 4. Applying reviewed migrations

For a controlled deployment, first verify the target database identity, backup and restore evidence, migration drift, maintenance/lock impact, and the approved release window. Then use the project's reviewed deployment procedure to apply committed migrations (normally `prisma migrate deploy` with the correct schema and connection). Capture the applied migration list and post-deploy health checks for both databases.

Do not run deployment commands solely because this README exists. Production remains **NO-GO** until the current release gates are independently satisfied.

## 5. Historical reference

The legacy SQLite migration at `prisma/migrations/0_init/migration.sql` is not part of the active PostgreSQL migration chain. Its historical context is retained in `docs/legacy-parity/reference/prisma/legacy-sqlite-initial-migration.md`. Consult it for provenance only; do not apply it to the current databases.
