# HEAVIX — STEP 15.89 — Prisma TLS Configuration Correction

**Repository:** `HEAVIXIR/z-ai-2`  
**PR:** #76  
**Status:** Finding D remains OPEN / UNVERIFIED  
**Scope:** Correct the TLS configuration model and test the actual Prisma ORM v6 connection path.

## Executive finding

The STEP 15.88 probe used `sslmode=verify-full&sslrootcert=...` and concluded that Prisma ORM v6 ignored CA and hostname validation. That result is not sufficient to conclude that Prisma's TLS implementation cannot enforce verification: the tested URL used libpq-style parameters rather than Prisma ORM v6's documented PostgreSQL TLS configuration.

Prisma ORM v6 documents `sslmode` values `prefer`, `disable`, and `require`, plus `sslaccept` and `sslcert`. The strict configuration to test is:

```
sslmode=require&sslaccept=strict&sslcert=<trusted-root-CA-path>
```

Official reference: https://www.prisma.io/docs/orm/v6/overview/databases/postgresql

The previous STEP 15.88 observation is retained as historical evidence for the tested URL, but its general conclusion about Prisma's inability to verify certificates is superseded pending a test using the documented configuration.

## Changes made on the PR branch

1. `scripts/rbac-backfill-dryrun.ts` now fails closed unless the URL includes all three required Prisma v6 settings: `sslmode=require`, `sslaccept=strict`, and a non-empty `sslcert` path. Its log explicitly says configuration parsing does not prove a live handshake.
2. `tests/unit/rbac-preflight-logic.test.ts` now tests the documented strict settings, rejects missing/weak TLS configuration, and confirms the removed caller-controlled no-TLS bypass cannot override the gate.
3. `tests/integration/rbac-tls-behavioral-real.test.ts` now tests the supported URL settings through the actual Prisma subprocess. Expected outcomes: valid CA/hostname succeeds; untrusted CA, hostname mismatch, expired certificate, nonexistent CA path, and plaintext connection fail.
4. The TLS test no longer hardcodes `/home/z/z-ai-2`; its infrastructure root is configurable via `HEAVIX_TLS_PG_ROOT`, with a repository-local `.tls-pg` default.
5. `tests/integration/tls-probe.ts` no longer claims that `PGSSLROOTCERT` is the authoritative Prisma v6 configuration.
6. The CI workflow documents that the standard `postgres:17` service has no TLS configuration and that the database-backed gate is skipped, not passed.

## Verification status

- Configuration/preflight code and tests updated.
- CI workflow on the code changes was queued at the time this report was authored; final result must be checked against the exact final SHA.
- The real TLS behavioral suite requires the two local TLS-enabled PostgreSQL clusters and is skipped in ordinary CI when that infrastructure is absent. A green CI run with those tests skipped is not evidence that the TLS handshake cases passed.
- Do not close Finding D until the supported strict configuration is executed against the actual Prisma engine and all positive/negative cases are observed. If hostname mismatch or untrusted CA is accepted, Finding D stays OPEN and the connection path must be changed.

## Governance

- PR #76 remains open and unmerged.
- No staging, backfill, Phase D/E, or production authorization.
- No branch-protection bypass or self-approval.
