# HEAVIX — STEP 15.68 Phase C Preflight Report

**Date:** 2026-10-23
**Baseline:** main at `4f7a2d747777659290237b6fdb387269438141fc`
**Branch:** `chore/step-15-68-phase-c-preflight`

---

## STEP 15.68 STATUS: PASS

---

## 1. Baseline Verification

| Item | Value | Source |
|---|---|---|
| main HEAD | `4f7a2d747777659290237b6fdb387269438141fc` | GitHub API `/branches/main` |
| PR #75 | state=closed, merged=True | GitHub API `/pulls/75` |
| merge_commit | `4f7a2d747777659290237b6fdb387269438141fc` | GitHub API |
| Post-merge CI | run #39978974555, 3/3 SUCCESS | GitHub API `/actions/runs` |
| Ancestry | `4f7a2d7` is ancestor of HEAD | `git merge-base --is-ancestor` |

## 2. Audit Findings

### 2A. Connection Safety — PASS

| Finding | Severity | File:Line | Evidence |
|---|---|---|---|
| Dry-run uses singleton `db` from `@/lib/db` | INFO | `scripts/rbac-backfill-dryrun.ts:62` | `import { db } from '@/lib/db'` — no separate PrismaClient |
| No `DATABASE_URL` override in script | PASS | `scripts/rbac-backfill-dryrun.ts` | No `process.env.DATABASE_URL =` in source |
| No `logAudit` import (avoids next/headers) | PASS | `scripts/rbac-backfill-dryrun.ts:28` | Comment confirms intentional omission |
| `src/lib/db.ts` reads `DATABASE_URL` from env via Prisma | INFO | `src/lib/db.ts:79` | `export const db = globalForPrisma.prisma ?? createPrismaClient()` |
| **RISK**: No preflight check for DB identity | MEDIUM | `scripts/rbac-backfill-dryrun.ts` | Script does not verify which database it's connected to before running queries. The staging runbook addresses this with pre-execution identity verification. |

### 2B. Read-Only Enforcement — PASS (with documented limitations)

| Finding | Severity | Evidence |
|---|---|---|
| SQL script grants SELECT only | PASS | `scripts/rbac-create-readonly-role.sql:28` — `GRANT SELECT ON ALL TABLES` |
| SQL script explicitly REVOKEs writes | PASS | `scripts/rbac-create-readonly-role.sql:37` — `REVOKE INSERT, UPDATE, DELETE, TRUNCATE` |
| CI gate uses `heavix_dryrun_ro` role | PASS | `.github/workflows/ci.yml:80` — `DRYRUN_DATABASE_URL` with role |
| Password via psql variable | PASS | `scripts/rbac-create-readonly-role.sql:19` — `PASSWORD :'dryrun_password'` |
| 20 write-denial tests CI-verified | PASS | `tests/integration/rbac-readonly-role-real.test.ts` — 25 tests |
| **LIMITATION**: Effective privileges tested in CI only | LOW | CI uses postgres:17 service container, not production database |
| **LIMITATION**: Only 5 RBAC tables tested | LOW | Other tables (Brand, Listing, etc.) not tested for write denial |

### 2C. Data Classification — PASS

| Finding | Severity | Evidence |
|---|---|---|
| Role mapping matches seed | PASS | `scripts/rbac-backfill-dryrun.ts:72-76` maps ADMIN/SUPERADMIN→ADMIN, SELLER→SELLER, etc. — matches `prisma/seed-rbac.ts` |
| Edge cases handled | PASS | null→BUYER, empty→BUYER, whitespace→BUYER, unknown→null (INVALID) |
| PII not in output | PASS | Sample structure has only `userId` + `legacyRole` — no email, mobile, name |
| MULTI_ROLE blocking | PASS | `src/lib/rbac/gate-logic.ts:74` — `classification.MULTI_ROLE === 0` |
| okCount + exact total | PASS | `src/lib/rbac/gate-logic.ts:146-153` — sum equality enforced |
| No auto-correction of ambiguous roles | PASS | Script only classifies, doesn't write |

### 2D. Snapshot & Scale — PASS (with documented limitations)

| Finding | Severity | Evidence |
|---|---|---|
| Fingerprint covers ALL 5 tables | PASS | `scripts/rbac-backfill-dryrun.ts:244-252` — User, UserRole, Role, Permission, RolePermission |
| Deterministic ordering | PASS | `orderBy: { id: 'asc' }` on all queries |
| Parallel fetch | PASS | `Promise.all` for all 5 queries |
| **LIMITATION**: No pagination — loads ALL rows into memory | MEDIUM | For 10K+ users, memory ≈ 5MB. For 1M+ users, consider pagination. Documented in runbook §9. |
| **LIMITATION**: No transaction isolation on fingerprint | LOW | If concurrent writes occur between BEFORE/AFTER, `readOnlyInvariant=false` triggers. By design — detects mutations. |
| **LIMITATION**: Fingerprint truncation in log | LOW | `beforeFingerprint.slice(0, 80)` in log — full fingerprint compared in memory, not in log |

### 2E. Gate Correctness — PASS

| Finding | Severity | Evidence |
|---|---|---|
| Missing DRYRUN_GATE → exit 1 | PASS | `scripts/rbac-gate-ci.ts:69` |
| Malformed JSON → error | PASS | `src/lib/rbac/gate-logic.ts:113` — `MALFORMED_JSON` |
| gatePasses=false → exit 1 | PASS | `scripts/rbac-gate-ci.ts:87` |
| readOnlyInvariant=false → exit 1 | PASS | `scripts/rbac-gate-ci.ts:87` |
| Child process failure → exit 1 | PASS | `scripts/rbac-gate-ci.ts:57` — `childExitedNonZero` |
| Negative/NaN/non-integer → validation error | PASS | `src/lib/rbac/gate-logic.ts:118-123` |
| Sum mismatch → validation error | PASS | `src/lib/rbac/gate-logic.ts:152` |
| Gate runs before integration tests | PASS | `.github/workflows/ci.yml` step ordering |

## 3. Tests Added

**File:** `tests/unit/rbac-dryrun-preflight.test.ts` (48 tests)

| Test Group | Tests | Coverage |
|---|---|---|
| Connection safety | 3 | Singleton import, no DATABASE_URL override, no logAudit |
| Role mapping edge cases | 11 | null, undefined, empty, whitespace, SUPERADMIN, case-insensitive, unknown |
| PII absence | 2 | No email in select, no PII in sample types |
| Gate logic consistency | 5 | gatePasses, total equality, exit codes, child failure |
| No write methods | 10 | create/update/delete/upsert/deleteMany/$executeRaw on User + UserRole |
| Snapshot & scale | 5 | findMany (no pagination), Promise.all, orderBy, select fields, no take/limit |
| Gate failure paths | 12 | Missing output, malformed JSON, missing prefix, false gatePasses, false readOnlyInvariant, negative, NaN, non-integer, sum mismatch, inconsistent gate |

**Result:** 48/48 PASS locally.

## 4. Staging Runbook

**File:** `docs/phase3/STEP-15.68-STAGING-RUNBOOK.md`

Covers: prerequisites, secret handling, identity verification, execution command, output storage, PII check, classification counts, stop criteria, idempotency verification, snapshot limitations, post-execution verification, emergency stop, rollback (not needed — read-only).

## 5. Backfill Design

**File:** `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md`

Covers: idempotency (upsert with @@unique), batch processing (200/batch with cursor), per-user transactions, conflict management (no auto-correction), dry-run vs apply mode, before/after reporting, stop criteria, recovery (targeted DELETE / backup restore / leave in place), open design questions (4 documented).

## 6. Open Limitations

| # | Limitation | Severity | Mitigation |
|---|---|---|---|
| 1 | No preflight DB identity check in script | MEDIUM | Staging runbook includes manual verification step |
| 2 | Fingerprint loads all rows (no pagination) | MEDIUM | Acceptable for <100K users. Pagination design deferred. |
| 3 | No transaction isolation on fingerprint | LOW | Detects mutations by design. Use maintenance window for staging. |
| 4 | Effective privileges tested in CI only | LOW | Staging runbook includes role creation + verification steps |
| 5 | Only 5 RBAC tables tested for write denial | LOW | These are the only tables the dry-run reads |
| 6 | Fingerprint truncated in log (80 chars) | LOW | Full fingerprint compared in memory, not in log |

## 7. Authorization Status

- **Staging execution:** NOT AUTHORIZED
- **Production backfill:** NOT AUTHORIZED
- **Phase D cutover:** NOT STARTED
- **Phase E drop column:** NOT STARTED
- **Production deployment:** NO-GO

## 8. Commit/PR

- Branch: `chore/step-15-68-phase-c-preflight`
- Commit SHA: will be recorded after commit
- PR: will be created after push
