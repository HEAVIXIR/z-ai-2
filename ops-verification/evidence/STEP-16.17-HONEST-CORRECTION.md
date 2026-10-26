# STEP 16.17 — Honest Correction and Evidence Classification

**Status:** Documentation and evidence bundle. The included SQL script is a manual SQL invariant check; it does not invoke application service routines. The captured output files are historical transcripts and have not been regenerated from the corrected script in this commit.

**Date:** 2026-10-26  
**Scope:** Store / Marketplace PostgreSQL verification, AuditOutbox idempotency, and evidence classification.

## 1. Retraction: eventHash

The prior finding that AuditOutbox lacked a UNIQUE index on eventHash is retracted. The Store schema has no eventHash field; the earlier finding relied on an unverified schema assumption and was incorrect.

The current Store AuditOutbox model contains: id, payloadJson, status, attempts, lastError, lockedAt, createdAt, and updatedAt, with indexes on status, creation time, and status/lease time.

The historical transcript in behavioral-tests-output.txt still contains the superseded eventHash finding because it records the earlier execution. Do not treat that line as a current finding. The corrected script intentionally omits the eventHash check.

## 2. Idempotency contract found in application source

The source contract is:

1. enqueueAuditOutbox() creates an AuditOutbox row and returns its generated id.
2. drainAuditOutbox() passes that row ID as the idempotency key to the audit writer.
3. The sink writes to the Main database's AuditLog, where idempotencyKey has a UNIQUE constraint.
4. The sink uses createMany(..., skipDuplicates: true) so a replay after the sink-write/acknowledgement interruption is deduplicated by the database constraint.
5. The Store database schema does not itself contain the Main database AuditLog table.

This is an at-least-once delivery design with sink-side idempotency. It is not a claim of exactly-once transport.

Source file: [src/lib/store-audit-outbox.ts](../../src/lib/store-audit-outbox.ts)  
Store schema: [prisma/store/schema.prisma](../../prisma/store/schema.prisma)

## 3. Evidence classification — do not overstate test coverage

The manually executed checks in this bundle use direct SQL against deployed schemas. They can establish selected database-level invariants for the SQL statements actually executed, but they do not invoke real application routines such as enqueueAuditOutbox(), drainAuditOutbox(), inventory/return service methods, or price-history functions.

| Evidence class | What it can support | What it cannot support by itself |
|---|---|---|
| Manual SQL / psql checks | The selected SQL statements and observed database state | Correctness of the application call path, transaction boundaries, validation, or retry logic |
| Application integration tests | Behavior of the real routines included in the test and the configured test database | Uncovered runtime/environment behaviors |
| Source-contract tests | Presence/shape of expected source patterns | Runtime behavior or database concurrency guarantees |
| CI PostgreSQL gate | The exact tests that ran, on the exact commit and CI database | Production readiness, backup/restore readiness, or behavior not covered by those tests |

The historical behavioral-tests-output.txt transcript corresponds to the earlier script version. In particular, its Section 1 “idempotent refund” claim is not supported by the SQL shown: it reads the same stock value twice without applying a second refund or invoking a deduplication key. Its Section 5 eventHash finding is retracted. The corrected store-outbox-behavioral-tests-real.sql file narrows the claims and uses the application’s actual PROCESSING and DELIVERED status vocabulary. The PR’s CI workflow now executes it against a fresh Store PostgreSQL 17 database created with prisma migrate deploy; consult the exact-HEAD workflow run for its result. This is still SQL-level evidence and does not invoke application routines.

The repository CI includes application integration tests, but the exact-HEAD workflow logs remain the source of truth for what ran and passed. A green CI run does not retroactively validate a separately captured manual SQL transcript.

## 4. Backup/restore sentinel caveat

The captured backup/restore output reports that the sentinel Part stock value was 0 because a preceding concurrency check had reduced it to zero and the test did not reset it before backup. The output ends with VERDICT: FAIL. This is a test-fixture/precondition defect. It does not demonstrate restoration of the intended non-zero sentinel value.

Classify the drill as **INCONCLUSIVE / rerun required**. Before a valid rerun, seed a known non-zero sentinel (for example stock=42), assert that exact value before backup, restore to a separate target, and compare the post-restore value and schema counts. Do not describe the previous run as a successful backup/restore invariant proof.

## 5. Evidence bundle status

The following files are now present in this PR:

- env-metadata.txt
- behavioral-tests-output.txt
- backup-restore-output.txt
- concurrency-test-output.txt
- monitoring-output.txt
- store-outbox-behavioral-tests-real.sql
- STEP-16.17-HONEST-CORRECTION.md

The output text files are retained as historical captures, not rewritten as if they were new command output. They must be interpreted with the caveats in this document. In particular, behavioral-tests-output.txt was captured from the superseded SQL script and does not match the corrected script currently committed. The corrected script is executed by the CI workflow against a fresh Store PostgreSQL 17 database. The committed behavioral-tests-output.txt remains a historical capture from the superseded script, not output from the corrected script. The workflow publishes a separate artifact for the current execution so historical evidence is not silently rewritten.

The environment metadata redacts connection strings, host, port, user, and local paths. Review any future evidence capture for credentials, tokens, private hostnames, and other sensitive values before publishing.

## 6. Required follow-up before closing Issue #81

- [ ] Execute the corrected SQL script against an isolated PostgreSQL 17 Store database and commit its actual output, command, exit code, commit SHA, migration status, and relevant row counts.
- [ ] Re-run backup/restore with a known non-zero sentinel; assert it before backup and after restore.
- [ ] Run application integration tests against PostgreSQL that invoke the real inventory, return/refund, enqueue/drain, retry, duplicate-delivery, stale-lease, and injected-failure paths.
- [ ] Preserve the distinction between manual-SQL, source-contract, CI integration, and operational rehearsal evidence.
- [ ] Update docs/STORE-RESOURCE-MATRIX.md and docs/STORE-GAP-DOMAIN-REGISTRY.md together with distinct states for implemented, runtime-verified, and production-approved.
- [ ] Obtain independent review of the exact final commit.

## 7. Operational boundary

This document does not authorize staging or production deployment, production database mutation, backfill, Phase D/E, or worker activation. Keep STORE_AUDIT_OUTBOX_ENABLED disabled in operational environments until separate release gates are satisfied.

**Current conclusion:** the eventHash finding is retracted; the historical manual SQL output overstates refund idempotency and contains a superseded finding; backup/restore is inconclusive; the corrected manual SQL script is not yet independently executed; Issue #81 remains open until the application-path tests and reproducible operational evidence are reviewed.
