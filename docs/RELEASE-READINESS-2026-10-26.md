# HEAVIX Release Readiness — 2026-10-26

## Decision

**Release status: NO-GO / PENDING.** This document records repository evidence and the operational evidence still required. A green CI run is not equivalent to a verified non-production rehearsal or production approval.

## Repository state observed

The following pull requests are merged:
- #85 — post-merge remediation F-01 through F-04.
- #87 — migration baseline-adoption rehearsal for Main and Store in CI.
- #89 — Preview SQLite schema parity/runtime-build gate.
- #90 — Store inventory/returns atomicity and transactional AuditOutbox on the canonical Store schema path.
- #91 — Outbox drain timeout aligned with retry budget; workflow remains manual-only.
- #92 — Fail-closed Store/Outbox PostgreSQL behavioral test gate.

PR #91 merge commit observed: `bf0f9bfba1f892fbbdb1597679c95d6de5965c38`.

These repository changes and CI rehearsals do **not** establish that an independent non-production PostgreSQL environment has been exercised, that a backup has been restored successfully, or that public-domain TLS renewal has been tested.

## Required gates

### G1 — Exact-SHA CI
- Record the current `main` SHA. As of writing (2026-10-26), `main` HEAD is `32d7f0d37259ab0ea58ed3436420d5aa47e24053`; re-check at release decision.
- Confirm all required checks pass for that SHA, not merely for an older PR head.
- Re-run checks after any code change.

### G2 — Main and Store migration safety
- Use the repository-pinned Prisma CLI and PostgreSQL 17.
- Prove `prisma migrate deploy` from empty disposable databases for Main and Store.
- Separately prove baseline adoption against representative existing-schema data, preserving sentinel rows, constraints, indexes, and referential integrity.
- Capture migration status and schema comparison output with credentials/hostnames redacted.
- Never treat `db push --accept-data-loss` as migration or production-release evidence.

### G3 — Store/Marketplace runtime invariants
In an approved, isolated non-production PostgreSQL environment, run and record:
- inventory atomicity under concurrent mutations and movement/balance invariants;
- return-state transitions and refund/payment consistency;
- transactional outbox enqueue and rollback on injected failures;
- duplicate delivery/idempotency, retry exhaustion/dead-letter behavior, and stale-lease recovery;
- worker authentication and proof that workers remain disabled unless explicitly enabled;
- monitoring queries for backlog, stale leases, failures, and integrity.

Attach the exact commit SHA, PostgreSQL version, command, test results, and redacted evidence. Contract tests, SQLite/PGlite tests, and disposable CI databases are useful but do not replace this gate.

### G4 — Backup and restore
- Create a backup from the approved non-production database.
- Restore into a separate disposable target, not over the source.
- Verify sentinel records, row counts, foreign keys, migration history, and application smoke tests.
- Record duration, failures, and corrective actions. Do not claim success until the restore has actually completed.

### G5 — Public TLS and operational path
- Verify public-domain DNS, Caddy routing, valid certificate, expired/invalid certificate handling, and renewal path in the intended environment.
- Confirm health checks, log redaction, alerts, and rollback procedure.
- No production deployment is implied by this test.

### G6 — Final release decision
Release approval requires all previous gates to pass; a review of the exact final code SHA recorded by a GitHub account other than the PR author; branch-protection requirements satisfied; an explicit release window; an operator/owner; a rollback trigger; and post-release verification steps. The owner must separately record whether delegated-AI review is sufficient for the final release decision or a human reviewer is required; a non-author account alone does not settle that governance question.

## Safety boundaries

Until a separate release authorization is recorded:
- no production deployment or production database mutation;
- no staging mutation, backfill, or Phase D/E;
- no production worker activation;
- no branch-protection bypass;
- no credentials or connection strings in issues, commits, or logs.

## Evidence status at document creation

| Evidence | Status |
|---|---|
| Repository PRs #85, #87, #89, #90, #91, #92 merged | Repository metadata observed |
| CI on the exact current `main` SHA | Must be rechecked at release decision |
| Independent non-production PostgreSQL Store/Outbox run | **PENDING** |
| Backup/restore drill completed and recorded | **PENDING** |
| Public-domain TLS/renewal test | **PENDING** |
| Final release-readiness decision | **NO-GO / PENDING** |

This is a checklist and status record, not proof that the pending operational activities have been executed.

## Related tracking
- [Issue #81 — Store/Marketplace operational audit (G3 owner)](https://github.com/HEAVIXIR/z-ai-2/issues/81)
- [Issue #88 — Release roadmap](https://github.com/HEAVIXIR/z-ai-2/issues/88)
- [Issue #80 — Database strategy tracking](https://github.com/HEAVIXIR/z-ai-2/issues/80)

