# Prisma Postgres export and recovery decision

**Status:** Proposed architecture decision; no database access authorized  
**Date:** 2026-11-06  
**Scope:** App Preview and Store Preview only; Production is excluded  
**Related:** PR #188 (B2 archive foundation), PR #200 (OpenNext runtime proof)

## Decision summary

Keep the database archive dispatch hard-blocked. Do not put Prisma Postgres connection strings in GitHub Actions and do not run the current `pg_dump` workflow against Prisma credentials.

The current provider access model does not offer a database-enforced, custom read-only role. The repository's existing backup endpoint is a Node.js/container implementation that invokes Bash and `pg_dump`, writes plaintext SQL files to a writable local filesystem, and consumes the application's database URLs. It is not a Cloudflare Workers backup implementation. PR #200 now returns 404 from this endpoint unless `HEAVIX_BACKUP_EXECUTION_ENABLED=true`; that opt-in must remain unset for Workers and serverless deployments.

No replacement export mechanism is approved by this document. It records the options and the evidence required before one can be selected.

## Verified repository and provider facts

1. `package.json` on `main` pins `prisma` and `@prisma/client` to `^6.11.1`. Prisma documentation currently describes application-layer read filtering middleware for Prisma ORM 8; that documentation is not proof that the same control exists or behaves identically in this repository's Prisma 6 runtime.
2. The existing `src/app/api/admin/backup/route.ts` imports `node:child_process`, `node:fs/promises`, and `node:path`, invokes `bash scripts/backup.sh`, and expects files under `./backups`.
3. `scripts/backup.sh` runs paired `pg_dump` processes and writes plaintext `main.sql` and `store.sql` before producing checksums. Checksums detect accidental corruption; they do not provide confidentiality or prove a restore works.
4. PR #200 adds a default-off `HEAVIX_BACKUP_EXECUTION_ENABLED` guard and documents that this implementation requires a real Node process, Bash, `pg_dump`, and writable filesystem. Do not enable it in Cloudflare Workers.
5. Prisma's official Postgres FAQ states that custom PostgreSQL roles are not supported and recommends enforcing read-only behavior in the application when needed. The Prisma connection model gives credentials for a database the same database user/access; creating another connection string is not a least-privilege workaround.
6. Prisma's official Free-plan documentation states that automated backups are not included on Free. Paid snapshots are excluded by the project's zero-budget constraint. Do not infer the current workspace billing plan from incomplete metadata.
7. The current B2 archive workflow is manual-only, and its code-level `PRISMA_READ_ONLY_CREDENTIALS_IMPLEMENTATION=false` hard gate must remain false until a different architecture is approved and independently tested.

Official references:
- https://www.prisma.io/docs/postgres/database/connecting-to-your-database
- https://www.prisma.io/docs/postgres/faq
- https://www.prisma.io/docs/postgres/database/backups
- https://www.prisma.io/pricing

## Options considered

### A. GitHub Actions + Prisma direct connection + pg_dump

**Rejected.** The credential would be full-access under the current provider model, and would be stored in GitHub Actions. This violates the current least-privilege gate and increases the blast radius of workflow compromise. Do not add Preview database URL secrets or use repository variables to bypass the code-level hard gate.

### B. Reuse the existing admin backup endpoint on Workers

**Rejected.** The implementation requires child-process execution, Bash, `pg_dump`, and a writable local filesystem. Cloudflare Workers do not provide this execution model. A successful route smoke test with no database credentials does not prove backup capability. Keep `HEAVIX_BACKUP_EXECUTION_ENABLED` unset in Worker environments.

### C. Application-mediated logical export

**Possible only as a separate, explicitly limited recovery product. Not a full PostgreSQL backup.**

A dedicated export component could use a strict allowlist of models/fields and application-layer read-only enforcement, with bounded pagination, consistent-snapshot semantics, versioned manifests, deterministic ordering, encryption before off-host storage, and a separately tested importer. It must not expose arbitrary SQL, Prisma raw/unsafe methods, unrestricted model delegates, or caller-controlled model/field names.

Before implementation:
- Verify the exact Prisma 6.11.1 extension/middleware behavior; do not rely on Prisma ORM 8 documentation as proof.
- Prove that every export query is read-only and that write/raw/unsafe/transaction escape paths fail closed.
- Inventory both App and Store schemas and explicitly define the model/field allowlists.
- Define referential ordering, relation handling, null/enum/date/decimal/bytes serialization, pagination under concurrent writes, and idempotent import behavior.
- Record schema/migration fingerprints and export format version.
- Ensure secrets, password hashes, payment credentials, session tokens, and other sensitive fields are excluded or separately protected by an explicit data classification decision.
- Test export/import on disposable local PostgreSQL 17 fixtures with integrity checks and a complete application-level recovery rehearsal.

This option only restores the explicitly exported application data. It does not replace PostgreSQL DDL, extensions, roles, grants, triggers, arbitrary sequences, or other cluster/database state unless separately designed and tested.

### D. Operator-controlled local pg_dump

**Not approved yet; potential exception requiring a separate risk decision.**

A local, isolated runner could avoid placing full-access credentials in GitHub Actions and could encrypt output with age before any off-host transfer. However, it still uses a full-access Prisma credential and does not satisfy a strict database-enforced least-privilege requirement. It must not be treated as approved merely because it runs locally.

Any proposal must first establish both Preview destinations without exposing credential values, independently prove database identity, keep credentials out of source control and CI, avoid plaintext persistence, encrypt before upload, define bounded retention, and complete a real PostgreSQL 17 restore rehearsal. No Production endpoint or credential is in scope.

### E. Move to a provider with database-enforced read-only roles or managed recovery

**Deferred.** A provider migration changes data residency, connection semantics, operational limits, and deployment risk. It is not a zero-risk fix for this blocker and requires a separate cost/feature/restore comparison. No migration or paid service is authorized here.

## Mandatory gates before any Preview database contact

1. Independently verify that the two intended connection destinations are the dedicated App Preview and Store Preview databases. Never print, hash, compare, or expose secret values.
2. Establish durable identity evidence for each destination; a hostname/IP or postmaster start-time fingerprint alone is insufficient.
3. Confirm that the operation is read-only by design and enforceable in the selected architecture. A comment, environment variable, repository variable, or UI label is not proof.
4. Keep App Preview and Store Preview strictly separated. Production must be unreachable from the selected workflow and must remain excluded.
5. Define export scope, data classification, size/time limits, encryption, B2 retention/version caps, key custody, and recovery ownership.
6. Test decryption and restore into a disposable isolated PostgreSQL 17 target. Verify schema, row counts or equivalent integrity invariants, indexes/constraints, and application smoke tests.
7. Obtain a fresh independent review of the exact commit and its CI results before considering removal of any hard gate.

## Current state

- No database connection, SQL, introspection, migration, seed, write, dump, or restore was performed for this decision.
- No B2 object was uploaded.
- No Worker upload/deployment, DNS change, Production operation, or merge was performed.
- PR #188 remains Draft/Open/Unmerged; this document does not authorize archive dispatch.
- The B2 bucket's current `Keep all versions` lifecycle is unbounded. A bounded retention and storage cap remain required.
- The offline age private identity and its recovery copies have not yet completed an independently verified recovery rehearsal.

## Next engineering step

Build a disposable-fixture proof of the application-mediated logical export's safety boundaries against the repository's actual Prisma 6.11.1 client, without any Preview or Production connection. In parallel, document the complete App and Store model inventories and classify exportable versus excluded data. Keep the archive workflow hard-blocked throughout.
