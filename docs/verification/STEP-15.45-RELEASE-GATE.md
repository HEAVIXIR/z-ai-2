# HEAVIX — STEP 15.45 Release Gate Report

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #75 — `fix(rbac): STEP 15.45 — concurrency defense-in-depth + Phase C dry-run script + audit reports`
**PR URL:** https://github.com/HEAVIXIR/z-ai-2/pull/75
**PR head SHA:** `a38fa1d7a4bd5dbc8231f344f167cf0574d7a623`
**Base:** `main` at `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0`
**Date:** 2026-10-22

---

## 1. Executive Summary

STEP 15.45 closes the repository evidence gap that the owner identified in STEP 15.44.
The owner independently verified that several artifacts reported as "ready" were
**local-only** (never pushed to GitHub). This step publishes all artifacts to a real PR
(#75), verifies CI passes on the exact PR head, and confirms the concurrency fix is
tested against real PostgreSQL 17 in CI.

**Key results:**
- All artifacts (dry-run script, concurrency test, audit reports, SELECT FOR UPDATE fix)
  are now published on PR #75 at SHA `a38fa1d`.
- CI 3/3 SUCCESS on `a38fa1d` (verify + audit-transaction + phase-tests).
- The concurrency test (`rbac-concurrency-real.test.ts`) ran in CI against postgres:17
  and PASSED (6 tests, 11047ms) — including the C-2e-stress test that proves the
  SELECT FOR UPDATE fix holds across 10 iterations.
- PR #75 is `mergeable=True` but `mergeable_state=blocked` (requires 1 review;
  owner directive prohibits branch protection bypass).
- No merge executed. No production operations.

---

## 2. Repository Evidence Reconciliation (Track A)

### 2.1 Owner's Independent Finding (STEP 15.45)

The owner verified from GitHub:
- `fix/rbac-concurrency` branch: NOT FOUND on remote
- `scripts/rbac-backfill-dryrun.ts` on main: 404
- `tests/integration/rbac-concurrency-real.test.ts` on main: 404
- `docs/verification/STEP-15.44-READINESS.md` on main: 404

### 2.2 Root Cause

All STEP 15.44 artifacts were created by subagents in the local worktree
(`/home/z/heavix-15-42/z-ai-2`) but were **never committed and pushed** to GitHub.
The `fix/rbac-concurrency` branch existed locally but was not on the remote.

### 2.3 Resolution

All artifacts are now published on PR #75 (branch `fix/rbac-concurrency`, pushed to
remote at SHA `a38fa1d7a4bd5dbc8231f344f167cf0574d7a623`):

| Artifact | Path | Remote Status | Verified |
|---|---|---|---|
| Concurrency fix | `src/app/api/admin/users/[id]/route.ts` | ✅ On PR #75 | `GET /contents?ref=a38fa1d` → 200 |
| Concurrency test | `tests/integration/rbac-concurrency-real.test.ts` | ✅ On PR #75 (40059 bytes) | `GET /contents?ref=a38fa1d` → 200 |
| Dry-run script | `scripts/rbac-backfill-dryrun.ts` | ✅ On PR #75 (23568 bytes) | `GET /contents?ref=a38fa1d` → 200 |
| Audit reports | `docs/verification/STEP-15.44-*.md` (5 files) | ✅ On PR #75 | `GET /contents?ref=a38fa1d` → 200 |

---

## 3. Concurrency Fix (Track B)

### 3.1 The Fix

**File:** `src/app/api/admin/users/[id]/route.ts`
**Change:** Added `SELECT ... FOR UPDATE` at the start of the dual-write transaction:

```typescript
await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${id} FOR UPDATE`;
```

This acquires a row-level lock on the User row at the START of the transaction, before
any reads or writes. This makes safety ordering-independent — even if a future refactor
changes the operation order, the row lock prevents concurrent transactions from
interleaving.

### 3.2 CI Evidence (run #39760338369, on `a38fa1d`)

The concurrency test (`rbac-concurrency-real.test.ts`, 6 tests) ran in CI against
postgres:17 and PASSED:

| Test | Result | Evidence |
|---|---|---|
| C-2c (production-faithful) | ✅ PASS | CI log line 1215 |
| C-2c-stress (20 iters) | ✅ PASS | violations=0, pidsAllDistinct=true, winners SELLER=7/ADMIN=13 |
| C-2d (worst-case ordering) | ✅ PASS (race demonstrated) | Race 100% reproducible |
| C-2d-stress (10 iters) | ✅ PASS (race reproducible) | raceHit=10/10 |
| C-2e (worst-case + fix) | ✅ PASS | replaceableCount=1, keys=["SELLER"] |
| C-2e-stress (10 iters + fix) | ✅ PASS | violations=0, bothSucceeded=10/10 |

**Duration:** 11047ms. **No failures.**

---

## 4. PR Publication (Track C)

### 4.1 PR #75

- **URL:** https://github.com/HEAVIXIR/z-ai-2/pull/75
- **Head SHA:** `a38fa1d7a4bd5dbc8231f344f167cf0574d7a623`
- **Base:** `main` (`6c113fd`)
- **Commits:** 3
- **Changed files:** 10
- **State:** open
- **Mergeable:** true
- **Mergeable state:** blocked (requires 1 review — owner directive prohibits bypass)

### 4.2 CI on PR head SHA

| Check Run | Conclusion |
|---|---|
| `verify` | ✅ success |
| `audit-transaction` | ✅ success |
| `phase-tests` | ✅ success |

**Run:** #39760338369, event=pull_request, conclusion=success

### 4.3 No Branch Protection Bypass

Per owner directive: "از حذف یا کاهش موقت branch protection برای تسهیل merge استفاده نکن."
PR #75 is left for the owner to review and merge via normal branch protection flow
(required_reviews=1, enforce_admins=true, dismiss_stale_reviews=true).

---

## 5. Dry-Run Verification (Track D)

### 5.1 Script Location

**File:** `scripts/rbac-backfill-dryrun.ts` (564 lines, 23568 bytes)
**On PR #75:** Verified via `GET /contents?ref=a38fa1d` → 200

### 5.2 Read-Only Proof

The script uses ONLY read methods: `count`, `findMany`, `groupBy`. Verified zero matches
for `create`, `update`, `upsert`, `delete`, `deleteMany`, `$executeRaw` on any Prisma model.

### 5.3 CI Runnable

The script is designed to run in CI against postgres:17. It uses `describe.skipIf(!RUN_TESTS)`
gating (same pattern as E5 tests). In CI, `DATABASE_URL` contains "localhost" → tests run.

### 5.4 Full CI Execution

The dry-run script has NOT been added to the CI workflow as a separate step yet. It can be
run manually via `bunx tsx scripts/rbac-backfill-dryrun.ts` in CI. Adding it as a CI step
is a Track E follow-up.

---

## 6. Phase C Preparation (Track E)

### 6.1 Dry-Run Script Design

- **5-bucket classification:** OK / MISSING / MISMATCH / MULTI_ROLE / INVALID
- **Idempotency:** anchored on `@@unique([userId, roleId])` — upsert with `update: {}` no-op
- **Recovery:** 3 options (targeted DELETE, DB backup restore, leave in place)
- **Owner directive honored:** MISMATCH + INVALID excluded from `safeToBackfillCount`

### 6.2 Phase C Execution Plan

1. **Dry-run in CI** (Track D follow-up): add script to CI workflow, run against postgres:17
2. **Dry-run in staging**: run against staging DB, verify discrepancy report
3. **Implement actual backfill script** (`scripts/backfill-user-roles.ts`) per design §4.1
4. **Backfill in staging**: run, verify idempotency, verify orphans=0
5. **Production backfill**: SEPARATE owner authorization required

### 6.3 Not Authorized in STEP 15.45

- No production backfill
- No cutover (Phase D)
- No column drop (Phase E)
- No production deployment

---

## 7. Gate Assessment

| Gate | Description | Verdict | Evidence |
|---|---|---|---|
| REMOTE ARTIFACTS | All files exist on remote at verifiable SHA | ✅ VERIFIED | `GET /contents?ref=a38fa1d` for each file → 200 |
| CONCURRENCY REGRESSION | SELECT FOR UPDATE fix tested against real PG17 | ✅ PASS | CI log: C-2e-stress, 10 iters, violations=0 |
| POSTGRESQL 17 CI | CI runs against postgres:17 service container | ✅ PASS | CI workflow uses `postgres:17`; concurrency test ran (11047ms) |
| DRY-RUN READ-ONLY | Script performs zero writes | ✅ VERIFIED | Grep for write methods = 0 matches |
| DATA CLASSIFICATION | 5-bucket classification with no auto-correction | ✅ VERIFIED | Script design: OK/MISSING/MISMATCH/MULTI_ROLE/INVALID; MISMATCH+INVALID excluded from safe |
| BRANCH PROTECTION | No bypass; PR awaits normal review | ✅ VERIFIED | mergeable_state=blocked; no protection changes made |
| PHASE C READINESS | Ready for controlled staging validation | ✅ READY WITH ACCEPTED RISK | Dry-run script published; actual backfill not yet implemented; production NOT authorized |
| PRODUCTION BACKFILL | Not authorized in STEP 15.45 | ✅ NOT AUTHORIZED | No production operations performed |

---

## 8. Final Status Block

```
FINAL PR HEAD: a38fa1d7a4bd5dbc8231f344f167cf0574d7a623
REMOTE BRANCH MATCH: PASS
FINAL-HEAD CI: PASS (3/3 on a38fa1d, run #39760338369)
CONCURRENCY REGRESSION: PASS (SELECT FOR UPDATE fix, C-2e-stress 10 iters violations=0)
POSTGRESQL 17 CI: PASS (concurrency test ran, 6 tests, 11047ms)
DRY-RUN READ-ONLY: VERIFIED (zero write methods)
DATA CLASSIFICATION: VERIFIED (5-bucket, no auto-correction)
BRANCH PROTECTION: VERIFIED (no bypass; PR awaits review)
PHASE C READINESS: READY WITH ACCEPTED RISK
PRODUCTION BACKFILL: NOT AUTHORIZED IN STEP 15.45
MERGE: NOT EXECUTED (awaiting owner review of PR #75)
```

---

## 9. Recommendation

PR #75 is ready for owner review and merge. It contains:
1. The concurrency defense-in-depth fix (SELECT FOR UPDATE)
2. The real PostgreSQL concurrency test (6 tests, CI-verified)
3. The Phase C dry-run script (read-only, 564 lines)
4. All STEP 15.44 audit reports (previously local-only)

After merge, the next steps are:
1. Add dry-run script to CI workflow as a step
2. Run dry-run in CI against postgres:17 to get real discrepancy report
3. Implement actual backfill script (`scripts/backfill-user-roles.ts`)
4. Phase C staging validation (separate owner authorization)

**No merge, no production operations in STEP 15.45.**
