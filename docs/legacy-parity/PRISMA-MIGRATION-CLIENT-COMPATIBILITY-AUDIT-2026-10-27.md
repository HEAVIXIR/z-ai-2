# Prisma Comparative Audit — Migration History, Model Decisions, and Client Compatibility

**Audit date:** 2026-10-27  
**Target repository:** `HEAVIXIR/z-ai-2`  
**Target main commit reviewed:** `0a24fcbd7a86e8f19b6b6750812211d1612b10d0`  
**Legacy source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Method:** read-only inspection of checked-in Prisma schemas, migration SQL, lockfiles, package manifests, and existing parity documents.

## 1. Executive decision

**No schema change or migration is recommended from this audit alone.** Keep the two current PostgreSQL schemas and their independent migration histories. Do not restore the legacy SQLite baseline, merge the main and store schemas, revive `PriceRecord`, or run a migration/backfill based on schema differences alone.

The prior field-level audit in `docs/legacy-parity/ISSUE-144-PRISMA-FIELD-PARITY-2026-10-27.md` already covers model/field deltas. This report adds migration-history review, a per-model disposition matrix, and generated-client configuration findings rather than repeating the full parity tables.

## 2. Pinned schema and migration inventory

Active schema files:
- `prisma/schema.prisma` — PostgreSQL datasource using `DATABASE_URL`; default generated client `@prisma/client`.
- `prisma/store/schema.prisma` — PostgreSQL datasource using `STORE_DATABASE_URL`; generated client output `src/lib/generated/store-client`.

Archived schema evidence:
- `prisma/legacy-sqlite/schema.prisma`
- `prisma/legacy-sqlite/store-schema.prisma`

The static model-block count in the checked-in files is:
| Schema | Legacy SQLite | Current PostgreSQL | Delta |
|---|---:|---:|---:|
| Main | 110 | 120 | +10 |
| Store | 20 | 34 | +14 |

**Independent count verification:** literal top-level `model Name {` declaration counts were computed from the exact checked-in schema files on `main` (`0a24fcbd7a86e8f19b6b6750812211d1612b10d0`): legacy main 110, current main 120, legacy Store 20, current Store 34. All declaration names are unique in each file. The prior parity document's legacy main count of 110 is consistent; the earlier apparent discrepancy was an audit counting error. These static counts do not establish live database contents or migration state.

Canonical migration files currently present:
- Main: `prisma/migrations/20261025081255_init_postgresql_baseline/migration.sql`
- Main follow-up: `prisma/migrations/20261025193000_add_auditlog_idempotency_key/migration.sql`
- Store: `prisma/store/migrations/0001_init_store_baseline/migration.sql`
- Store follow-up: `prisma/store/migrations/0002_add_audit_outbox/migration.sql`

Both active migration lock files declare `provider = "postgresql"`. The historical lock under `prisma/migrations-sqlite-archive/migration_lock.toml` declares `provider = "sqlite"`; `prisma/migrations-sqlite-archive/README.md` marks that history as archived and explicitly not canonical.

## 3. Migration-history comparison

| History | Observed purpose | Compatibility decision |
|---|---|---|
| Archived SQLite `0_init/migration.sql` | Historical SQLite baseline; contains SQLite-specific SQL/types such as `DATETIME` and `AUTOINCREMENT` per archive README | **REJECT for PostgreSQL execution.** Preserve only as historical evidence. |
| Main PostgreSQL baseline | Establishes the current main schema as PostgreSQL tables, indexes, and constraints | **KEEP canonical.** Do not replace it with the old SQLite baseline. |
| Main `add_auditlog_idempotency_key` | Adds nullable `AuditLog.idempotencyKey` and a unique index; null values preserve compatibility for older writers | **KEEP.** This is a real, targeted PostgreSQL migration, not a legacy import. |
| Store PostgreSQL baseline | Establishes the separate Store schema | **KEEP canonical.** Never apply it to the main database. |
| Store `add_audit_outbox` | Adds `AuditOutbox` plus status/created/locked indexes for transactional outbox delivery | **KEEP.** Its operational pairing with main `AuditLog.idempotencyKey` must remain explicit. |

The repository records two distinct database boundaries. A matching model name does not imply a shared table or interchangeable entity: `Payment`, `Part`, and `Order` exist in both schemas with different business contracts. A migration must always name its target schema/database.

This was a static comparison of tracked SQL and lockfiles. It did **not** inspect a live database's `_prisma_migrations`, catalog, data, or applied migration checksums. Therefore it does not prove that any deployed database has applied these files or matches the checked-in schema.

## 4. Per-model disposition matrix

These are decisions about the **legacy-to-current transfer**, not instructions to alter the current database. “No schema change now” means the current checked-in schema is authoritative unless a separate live-drift check proves otherwise.

| Model / schema | Observed difference already recorded | Disposition | Reason / gate |
|---|---|---|---|
| Main `Lead` | Current adds status, assignment, scoring/version/breakdown, and override metadata | **NO_CHANGE** | Keep current workflow fields. Any future data backfill needs explicit mapping, defaults/nullability review, and fixture tests. |
| Main `CompanyVerification` | Current adds verification type, evidence, expiry, revocation timestamp/actor/reason | **NO_CHANGE** | Preserve current expiry/revocation semantics; do not replace with legacy relation/field definitions. |
| Main `AuditLog` | Current adds `idempotencyKey`; PostgreSQL follow-up migration creates a unique index | **NO_CHANGE** | Preserve the current idempotent audit contract and nullable compatibility behavior. Do not rerun or recreate the migration manually. |
| Main `Payment` | Current adds order linkage and provider/idempotency references | **NO_CHANGE** | Current main payment contract is authoritative; no legacy overwrite. |
| Store `Payment` | No legacy-only or current-only fields detected by the prior field-level comparison; it remains a separate Store payment model | **NO_CHANGE** | Same name does not make this equivalent to Main `Payment`; keep the Store database boundary. |
| Main `Part` | No field delta in the prior comparison; it is a product/part relation in the main domain | **NO_CHANGE** | Do not conflate it with Store inventory `Part`. |
| Store `Part` | Current adds relations to stock movements, inventory balances, and purchase-order items | **NO_CHANGE** | Keep current inventory/procurement relationships. Any data transformation is a separate proposal. |
| Store `Order` | Current adds `returns` relation | **NO_CHANGE** | Preserve return workflow; do not transplant the Main `Order` model into Store. |
| Store `Shipment` | Current adds pickup date, proof URL, and shipment-tracking relation | **NO_CHANGE** | Keep current tracking/proof contract. |
| Store `AdminUser` | Legacy `auditLogs` relation is absent; current design routes audit writes to Main PostgreSQL via outbox | **REWRITE_FEATURE only if reintroducing legacy behavior is proven necessary** | Do not restore the cross-database relation. The current outbox/audit ownership design is the baseline. No rewrite is proposed now. |
| Main `Listing` / `Product` and legacy `PriceRecord` | Current design uses `PriceObservation`; legacy `PriceRecord` is legacy-only | **REJECT_LEGACY** | Do not resurrect the deprecated model or import its migration/data without a separately approved mapping and product need. |

### General decision rule

- **ADD_FIELD_MIGRATION** is not recommended by a schema-file diff alone. Use it only after a specific missing field is demonstrated in the live non-production database/catalog, the field is approved in the current schema, and migration/rollback tests pass.
- **REWRITE_FEATURE** is appropriate only where a useful legacy behavior is absent but its old implementation violates current contracts/security/architecture.
- **REJECT_LEGACY** applies to incompatible SQLite migration history, deprecated `PriceRecord`, and schema definitions that collapse the main/store boundary.
- **NO_CHANGE** is the current outcome for all listed models unless new evidence establishes a concrete gap.

## 5. Generated-client compatibility review

### Static configuration findings

- Package manifest declares `@prisma/client: ^6.11.1`; the repository uses the Prisma 6 generation workflow.
- The package `postinstall` command generates both clients: `prisma generate --schema=prisma/schema.prisma` and `prisma generate --schema=prisma/store/schema.prisma`.
- Main client is imported from `@prisma/client`; Store client is generated at `src/lib/generated/store-client` and imported by `src/lib/store-db.ts`.
- `src/lib/db.ts` has Node-oriented runtime `require()` and `require.cache` handling to refresh the main generated client during development. This is not evidence that this implementation works in Edge/Workers runtimes.
- `src/lib/store-db.ts` statically imports the separately generated Store client.
- The dependency manifest inspection found no `@prisma/extension-accelerate` dependency. This alone does not prove that a runtime database URL does not use Accelerate; actual connection-string schemes and deployment secrets were not read or printed.
- No `cacheStrategy` runtime configuration was identified in the inspected client setup. This is a repository-code observation, not a provider-account audit.

### Compatibility status

| Check | Result | Meaning |
|---|---|---|
| Main and Store schema/client paths distinct | **PASS — static config** | Paths are separated in the checked-in schemas and code. |
| Postinstall generation commands for both clients | **PASS — static config** | Both generation commands are declared; this is not by itself a successful execution record. |
| Runtime client generation/validation in this audit | **NOT RUN** | No claim that `prisma validate`, `prisma generate`, typecheck, or DB connection succeeded as part of this read-only audit. |
| Accelerate dependency in package manifest | **NOT FOUND** | Does not establish whether any environment URL routes through Accelerate. |
| Edge/Workers runtime compatibility | **NOT PROVEN** | Node-oriented `require.cache` behavior and DB drivers need separate runtime-specific tests. |
| Live database migration state | **NOT CHECKED** | Requires secure, read-only inspection of each non-production database and its migration table. |

## 6. Prisma Console account versus application connectivity

The existence of a Prisma Console workspace is not evidence that either current database is hosted by Prisma Postgres or routed through Accelerate. The current repository declares two environment variables, `DATABASE_URL` and `STORE_DATABASE_URL`, but this audit did not inspect their values.

Before making any provider change, inspect only the **scheme/provider classification** through secure secret metadata (never print full connection strings), identify the actual database owner for each URL, and verify project/environment, region, plan/billing, backups, and restore path. Prisma Accelerate retirement information is a reason to verify actual use, not a reason to migrate an app that does not use it.

## 7. Separate follow-up proposals (no execution authorized)

If later evidence establishes a real issue, open a focused PR for exactly one of these scopes:
1. **Client generation/validation CI:** run `prisma validate` and `prisma generate` for both schemas in an isolated CI job, then typecheck against the generated outputs.
2. **Live migration-state reconciliation:** read-only compare each non-production database's `_prisma_migrations` and catalog to its corresponding migration history; do not repair or apply migrations in this step.
3. **Runtime compatibility:** test both clients in the intended Node/Workers runtime with disposable databases and explicit connection limits; do not infer Workers support from a successful Next.js build.
4. **Data migration proposal:** only after a concrete product need and source/target mapping are approved, with idempotency, referential integrity, rollback, and rehearsal evidence.

## 8. Safety boundary

This report is documentation-only and did not itself invoke Prisma CLI or connect to any database. The PR's standard CI workflow may generate both Prisma clients and exercise schema operations only against its disposable test databases; those CI checks are separate from this static audit and are not evidence of production migration state. No Prisma project/resource was provisioned, no connection string or credential was read or printed, and no production database, DNS, Worker, or deployment operation was changed. Production remains **NO-GO** pending independent release gates.
