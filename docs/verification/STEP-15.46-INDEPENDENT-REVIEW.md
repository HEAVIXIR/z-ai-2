# HEAVIX — STEP 15.46 Independent Review Report

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #75 — `fix(rbac): STEP 15.45 — concurrency defense-in-depth + Phase C dry-run script + audit reports`
**PR URL:** https://github.com/HEAVIXIR/z-ai-2/pull/75
**Final PR head SHA:** `9198a05f1ca7e4dfb8d490e37cd562006e5b1de1`
**Base:** `main` at `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0`
**Date:** 2026-10-22

---

## 1. Executive Summary

STEP 15.46 addressed three issues the owner identified from independent GitHub inspection:

1. **SHA mismatch:** Reports referenced `a38fa1d` but actual PR head was `bd01a7b`. Now reconciled to `9198a05` (final head after all STEP 15.46 fixes).
2. **Dry-run not in CI:** The `rbac-backfill-dryrun.ts` script was not executed as a CI step. Now added to `.github/workflows/ci.yml` as "Phase C dry-run" step, running against postgres:17, with machine-evaluated `gatePasses`.
3. **PII leak:** The dry-run script printed `email` and `mobile` in sample output. Now removed — the script no longer selects, stores, or prints any PII.

**All three issues are RESOLVED.** CI 3/3 SUCCESS on the final PR head `9198a05`.

---

## 2. Track A — Evidence Reconciliation

### 2.1 SHA History (all on PR #75)

| # | SHA | Description | CI Status |
|---|---|---|---|
| 1 | `3a327fa` | fix(rbac): SELECT FOR UPDATE in dual-write | ✅ (on prior head) |
| 2 | `1e5d5b2` | docs: concurrency audit report | ✅ |
| 3 | `a38fa1d` | docs: readiness reports + dry-run script | ✅ (run #39760338369) |
| 4 | `bd01a7b` | docs: STEP-15.45 release gate report | ✅ (run #39761193606) |
| 5 | `316e3f8` | fix: PII removal + dry-run CI step | ❌ (dry-run CI step failed — JSON parsing) |
| 6 | `806f224` | docs: reconcile SHA reference | ❌ (same CI run as #5) |
| 7 | `9198a05` | fix: dry-run CI step JSON parsing | ✅ (run #39763469692, 3/3 SUCCESS) |

**Final PR head:** `9198a05f1ca7e4dfb8d490e37cd562006e5b1de1`

### 2.2 CI on Final Head (run #39763469692)

| Check Run | Conclusion |
|---|---|
| `verify` | ✅ success |
| `audit-transaction` | ✅ success |
| `phase-tests` | ✅ success |

**Key step verified:** "Phase C dry-run (STEP 15.46)" step PASSED — output:
```
DRYRUN_GATE:{"gatePasses":true,"safeToBackfillCount":4,"mismatchCount":0,"invalidCount":0,"total":5}
dry-run verdict.gatePasses = True
```

### 2.3 Branch Protection

- `required_approving_review_count` = 1 ✅
- `dismiss_stale_reviews` = true ✅
- `enforce_admins` = true ✅
- `required_status_checks` = [verify, audit-transaction, phase-tests] ✅
- **No bypass performed.** PR #75 mergeable_state = `blocked` (requires 1 review).

### 2.4 Reviews

- 0 reviews on PR #75 (awaiting independent review).

---

## 3. Track B — Concurrency Fix Review

### 3.1 The Fix

**File:** `src/app/api/admin/users/[id]/route.ts`
**Change:** `SELECT ... FOR UPDATE` at the start of the dual-write transaction.

```typescript
// Lock the User row FOR UPDATE before any reads/writes.
// This serializes concurrent dual-write transactions on the same user,
// preventing the race where two concurrent PATCHes could leave the
// user with two replaceable UserRole rows (SELLER + ADMIN).
await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${id} FOR UPDATE`;
```

### 3.2 Lock Placement Verification

The `SELECT FOR UPDATE` is executed:
- **BEFORE** `tx.user.update` (legacy column write)
- **BEFORE** `tx.userRole.findMany` (read existing UserRoles)
- **BEFORE** `tx.userRole.deleteMany` (delete replaceable roles)
- **BEFORE** `tx.userRole.upsert` (insert new UserRole)

This guarantees the row lock is held for the ENTIRE transaction, preventing
concurrent transactions from interleaving reads and writes.

### 3.3 CI Test Evidence

The concurrency test (`tests/integration/rbac-concurrency-real.test.ts`) ran in CI
against postgres:17 and PASSED (6 tests, 11047ms):
- C-2c-stress: 20 iterations, violations=0, pidsAllDistinct=true ✅
- C-2d-stress: race demonstrated (10/10) — problem proven ✅
- C-2e-stress: with SELECT FOR UPDATE fix, violations=0 (10/10) — fix proven ✅

---

## 4. Track C — Dry-Run Safety

### 4.1 PII Removal

**Before:** The script selected `email` and `mobile` from the database and printed `email` in sample output.

**After:** 
- Removed `email` and `mobile` from Prisma `select` (not needed for role classification)
- Removed `email` and `mobile` from `SampleBase` interface
- Removed `email` from all 4 sample output lines
- Verified: `grep -n 'email\|mobile' scripts/rbac-backfill-dryrun.ts` → 0 matches

### 4.2 CI Step Added

**File:** `.github/workflows/ci.yml`
**Step name:** "Phase C dry-run (STEP 15.46 — read-only RBAC backfill analysis)"

The step:
1. Runs `bunx tsx scripts/rbac-backfill-dryrun.ts` against postgres:17
2. Extracts the `DRYRUN_GATE:{...}` single-line JSON output
3. Parses `gatePasses` via python3
4. Does NOT fail CI if `gatePasses=false` (informational — operator reviews the log)
5. Fails CI only if no `DRYRUN_GATE` output is produced (script crash)

### 4.3 CI Dry-Run Result

From CI log (run #39763469692):
```
DRYRUN_GATE:{"gatePasses":true,"safeToBackfillCount":4,"mismatchCount":0,"invalidCount":0,"total":5}
dry-run verdict.gatePasses = True
```

- Total users in CI test DB: 5
- OK: 1 (admin user seeded by db:seed-rbac)
- MISSING (need backfill): 4 (test users without UserRole)
- MISMATCH: 0
- INVALID: 0
- **gatePasses: true** ✅

### 4.4 Read-Only Proof

The script uses ONLY: `db.user.findMany`, `db.role.findMany`, `db.userRole.count`.
Verified zero matches for: `create`, `update`, `upsert`, `delete`, `deleteMany`, `$executeRaw`.

---

## 5. Track D — Data Classification

The dry-run classifies users into 5 buckets:

| Bucket | Definition | CI Result | Action |
|---|---|---|---|
| OK | Single matching UserRole | 1 | None |
| MISSING | Zero UserRole rows | 4 | Safe to backfill |
| MISMATCH | UserRole exists but canonical missing | 0 | DO NOT auto-correct |
| MULTI_ROLE | Canonical present + extra roles | 0 | Informational |
| INVALID | User.role not in catalog | 0 | DO NOT auto-correct |

**Owner directive honored:** "نقش‌های مبهم را خودکار اصلاح نکن." — MISMATCH + INVALID excluded from `safeToBackfillCount`.

---

## 6. Track E — Gate Decision

| Gate | Description | Verdict | Evidence |
|---|---|---|---|
| REMOTE ARTIFACTS | All files on remote at verifiable SHA | ✅ VERIFIED | `GET /contents?ref=9198a05` for each file → 200 |
| CONCURRENCY FIX | SELECT FOR UPDATE tested against real PG17 | ✅ PASS | CI: C-2e-stress, 10 iters, violations=0 |
| DRY-RUN CI | Dry-run runs as CI step against postgres:17 | ✅ PASS | CI step "Phase C dry-run" passed, gatePasses=true |
| DRY-RUN READ-ONLY | Script performs zero writes | ✅ VERIFIED | Grep for write methods = 0 matches |
| PII REMOVAL | No email/mobile in output | ✅ VERIFIED | Grep for email/mobile = 0 matches |
| DATA CLASSIFICATION | 5-bucket, no auto-correction | ✅ VERIFIED | CI result: 4 MISSING, 0 MISMATCH, 0 INVALID |
| BRANCH PROTECTION | No bypass; PR awaits normal review | ✅ VERIFIED | mergeable_state=blocked; no protection changes |
| SHA RECONCILIATION | Reports reference correct current SHA | ✅ VERIFIED | STEP-15.45 report updated to 9198a05 |

---

## 7. Final Status

```
FINAL PR HEAD: 9198a05f1ca7e4dfb8d490e37cd562006e5b1de1
REMOTE BRANCH MATCH: PASS
FINAL-HEAD CI: PASS (3/3 on 9198a05, run #39763469692)
CONCURRENCY FIX: PASS (SELECT FOR UPDATE, C-2e-stress violations=0)
DRY-RUN CI: PASS (gatePasses=true, 4 MISSING, 0 MISMATCH, 0 INVALID)
DRY-RUN READ-ONLY: VERIFIED (zero write methods)
PII REMOVAL: VERIFIED (zero email/mobile references)
DATA CLASSIFICATION: VERIFIED (5-bucket, no auto-correction)
BRANCH PROTECTION: VERIFIED (no bypass)
SHA RECONCILIATION: VERIFIED (9198a05)

PHASE C READINESS: READY WITH ACCEPTED RISK
PRODUCTION BACKFILL: NOT AUTHORIZED
MERGE: NOT EXECUTED (awaiting owner review of PR #75)
```

---

## 8. Recommendation

PR #75 at `9198a05` is ready for owner review. All three issues from STEP 15.46 are resolved:
1. SHA references reconciled ✅
2. Dry-run added as CI step with machine-evaluated gate ✅
3. PII (email/mobile) removed from all output ✅

After owner review and merge, the next steps are:
1. Run dry-run in staging against real data
2. Implement actual backfill script (`scripts/backfill-user-roles.ts`)
3. Phase C production backfill — separate owner authorization
4. Phase D (cutover) → Phase E (drop column) → Production

**No merge, no production operations in STEP 15.46.**
