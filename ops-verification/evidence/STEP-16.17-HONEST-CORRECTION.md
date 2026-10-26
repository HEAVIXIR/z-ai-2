# STEP 16.17 — Honest Correction and Evidence Classification

**Status:** Documentation record only. This file does not claim that the raw local evidence bundle has been committed or independently reproduced.

**Date:** 2026-10-26  
**Scope:** Store / Marketplace PostgreSQL verification, AuditOutbox idempotency, and evidence classification.

## 1. Retraction: `eventHash`

The prior finding that `AuditOutbox` lacked a UNIQUE index on `eventHash` is retracted. The Store schema has no `eventHash` field; the earlier finding relied on an unverified schema assumption and was incorrect.

The current Store `AuditOutbox` model contains: `id`, `payloadJson`, `status`, `attempts`, `lastError`, `lockedAt`, `createdAt`, and `updatedAt`, with indexes on status, creation time, and status/lease time.

## 2. Idempotency contract found in application source

The source contract is:

1. `enqueueAuditOutbox()` creates an `AuditOutbox` row and returns its generated `id`.
2. `drainAuditOutbox()` passes that row ID as the idempotency key to the audit writer.
3. The sink writes to the **Main** database's `AuditLog`, where `idempotencyKey` has a UNIQUE constraint.
4. The sink uses `createMany(..., skipDuplicates: true)` so a replay after a sink-write/acknowledgement interruption is deduplicated by the database constraint.
5. The Store database's schema does not itself contain the Main database's `AuditLog` table.

This is an at-least-once delivery design with sink-side idempotency. It is not a claim of exactly-once transport.

Source file: [`src/lib/store-audit-outbox.ts`](../src/lib/store-audit-outbox.ts)  
Store schema: [`prisma/store/schema.prisma`](../prisma/store/schema.prisma)

## 3. Evidence classification — do not overstate test coverage

The operator's STEP 16.17 report states that the manually executed behavioral checks used direct SQL against deployed schemas. Those checks can establish selected database-level invariants for the SQL statements actually executed, but they **do not invoke the real application routines** such as `enqueueAuditOutbox()`, `drainAuditOutbox()`, inventory/return service methods, or price-history functions.

| Evidence class | What it can support | What it cannot support by itself |
|---|---|---|
| Manual SQL / `psql` checks | The selected SQL statements and observed database state | Correctness of the application call path, transaction boundaries, validation, or retry logic |
| Application integration tests | Behavior of the real routines included in the test and the configured test database | Uncovered runtime/environment behaviors |
| Source-contract tests | Presence/shape of expected source patterns | Runtime behavior or database concurrency guarantees |
| CI PostgreSQL gate | The exact tests that ran, on the exact commit and CI database | Production readiness, backup/restore readiness, or behavior not covered by those tests |

The report states that the existing CI suite includes OUTBOX-1 through OUTBOX-11. This document does not independently attest to their current result; use the exact-HEAD workflow record and its logs as the source of truth.

## 4. Backup/restore sentinel caveat

The operator's report states that the backup/restore check observed a sentinel Part stock value of `0` because a preceding concurrency check had reduced it to zero and the test did not reset it before backup. This is a **test-fixture/precondition defect**. It means the run does not demonstrate restoration of the intended non-zero sentinel value. The backup/restore result must remain **INCONCLUSIVE / rerun required**, not PASS, until the fixture is explicitly reset, its pre-backup value is asserted, restore is performed, and the post-restore value is compared.

## 5. Raw evidence bundle status

The operator reported these locally generated artifacts:

- `env-metadata.txt`
- `behavioral-tests-output.txt`
- `backup-restore-output.txt`
- `concurrency-test-output.txt`
- `monitoring-output.txt`
- `STEP-16.17-HONEST-CORRECTION.md`

**Repository status at the time this record was authored:** the raw files above were not available in the repository through this execution and are not included in this commit. No raw command output has been reconstructed or fabricated here. Attach the original redacted files before marking the evidence package as committed/reproducible. Verify the environment metadata contains no credentials, connection strings, internal hostnames, or other sensitive values before publishing.

## 6. Required follow-up before closing Issue #81

- [ ] Add the original redacted output files and the exact commands used to generate them.
- [ ] Record commit SHA, PostgreSQL version, schema/migration status, test command, exit code, and relevant row counts.
- [ ] Re-run backup/restore with a known, non-zero sentinel; assert it before backup and after restore.
- [ ] Run behavioral integration tests against PostgreSQL that invoke the real inventory, return/refund, enqueue/drain, retry, duplicate-delivery, stale-lease, and injected-failure paths.
- [ ] Keep manual-SQL, source-contract, CI integration, and operational rehearsal evidence in separate categories.
- [ ] Update `docs/STORE-RESOURCE-MATRIX.md` and `docs/STORE-GAP-DOMAIN-REGISTRY.md` together with distinct states for implemented, runtime-verified, and production-approved.
- [ ] Obtain independent review of the exact final commit.

## 7. Operational boundary

This document does not authorize staging or production deployment, production database mutation, backfill, Phase D/E, or worker activation. Keep `STORE_AUDIT_OUTBOX_ENABLED` disabled in operational environments until the separate release gates are satisfied.

**Current conclusion:** the `eventHash` finding is retracted; manual SQL checks are complementary schema-level evidence only; the backup/restore rehearsal is inconclusive due to a faulty sentinel precondition; Issue #81 remains open until the original evidence and real application-path PostgreSQL tests are reproducible.
