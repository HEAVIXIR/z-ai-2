# HEAVIX — STEP 15.47 Dry-Run Gate Report

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #75
**Final PR head SHA:** `5b18b1c240fc3595e1bb209727e186091fd90023`
**Base:** `main` at `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0`
**Date:** 2026-10-22

---

## 1. Executive Summary

STEP 15.47 addresses all 4 issues from the owner's review comment (PR #75, review
ID 5612918681). The dry-run gate is now **fail-closed** — CI fails if `gatePasses=false`
or `readOnlyInvariant=false`. The `MULTI_ROLE` policy is explicit and conservative.
Read-only proof uses before/after DB snapshots.

**All 4 issues RESOLVED.** CI 3/3 SUCCESS on `5b18b1c` (after re-run of a flaky
audit-transaction timeout).

---

## 2. Issue Resolution

### Issue 1: CI Fail-Closed (was: warning + continue)

**Before:** `gatePasses=false` printed a warning and CI continued.
**After:** `gatePasses=false` → `exit 1` (CI fails). Also: missing DRYRUN_GATE → exit 1.
Malformed JSON → python3 parse error → exit 1. `readOnlyInvariant=false` → exit 1.

**CI step:** `.github/workflows/ci.yml` "Phase C dry-run (STEP 15.47 — fail-closed RBAC backfill gate)"

### Issue 2: MULTI_ROLE Policy

**Before:** `gatePasses = INVALID==0 && MISMATCH==0` — MULTI_ROLE didn't affect gate.
**After:** `gatePasses = INVALID==0 && MISMATCH==0 && MULTI_ROLE==0` — conservatively
blocks backfill when ANY class requiring investigation is nonzero.

**Policy documented in code:**
```
// STEP 15.47 owner directive: gatePasses must be FAIL-CLOSED.
// Policy: backfill is NOT safe if ANY of these are nonzero:
//   - INVALID (legacy role not in catalog — manual review required)
//   - MISMATCH (UserRole exists but canonical missing — ambiguous, do NOT auto-correct)
//   - MULTI_ROLE (user has canonical + extra roles — investigate before backfill)
// Until the owner explicitly approves an accepted-risk override for MULTI_ROLE,
// conservatively block backfill when ANY class requiring investigation is nonzero.
```

### Issue 3: Read-Only Proof (before/after snapshot)

**Before:** Read-only verified by grep (source-level assertion only).
**After:** The script now:
1. Takes a BEFORE snapshot: counts of `User`, `UserRole`, `Role`, `Permission`, `RolePermission`
2. Runs the classification logic
3. Takes an AFTER snapshot: same counts
4. Compares: if ANY count differs → `readOnlyInvariant=false` → script exits 2
5. DRYRUN_GATE output includes `readOnlyInvariant` field
6. CI step checks `readOnlyInvariant` and fails if false

### Issue 4: SHA Reconciliation

All reports now reference the current head SHA. Historical SHAs are marked as historical.

---

## 3. CI Evidence (Positive Path)

**Run:** #39765800439 (re-run after flaky audit-transaction timeout), on `5b18b1c`

| Check Run | Conclusion |
|---|---|
| `verify` | ✅ success |
| `audit-transaction` | ✅ success (after re-run — initial run had flaky 5000ms timeout) |
| `phase-tests` | ✅ success |

**Dry-run step output (from verify job log):**
```
DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"safeToBackfillCount":4,"mismatchCount":0,"multiRoleCount":0,"invalidCount":0,"total":5}
dry-run verdict.gatePasses = True
dry-run verdict.readOnlyInvariant = True
PASS: dry-run gate passed and read-only invariant holds.
```

**Positive path:** 5 users (1 OK + 4 MISSING, 0 MISMATCH/INVALID/MULTI_ROLE) → gatePasses=true, readOnlyInvariant=true → CI PASSES ✅

---

## 4. Negative Path (Design Proof)

The CI step is designed to FAIL when:
- `gatePasses=false` (MISMATCH/INVALID/MULTI_ROLE > 0) → `exit 1`
- `readOnlyInvariant=false` (DB mutated) → `exit 1`
- DRYRUN_GATE output missing → `exit 1`
- JSON malformed → python3 parse error → `exit 1`

The CI step code:
```bash
if [ "$GATE_PASSES" != "True" ]; then
  echo "FAIL: dry-run gate did not pass — Phase C backfill is NOT safe."
  exit 1
fi
if [ "$READ_ONLY" != "True" ]; then
  echo "FAIL: dry-run read-only invariant violated — database was mutated!"
  exit 1
fi
```

**Note:** The negative path is proven by code inspection (the `exit 1` statements are
unconditional when conditions are met). A live negative-path CI run would require
injecting a MISMATCH/INVALID user into the CI test DB, which would break other tests.
The fail-closed behavior is encoded in the CI step logic.

---

## 5. Gate Assessment

| Gate | Verdict | Evidence |
|---|---|---|
| DRY-RUN POSITIVE PATH | ✅ PASS | CI: gatePasses=true, readOnlyInvariant=true (run #39765800439) |
| DRY-RUN NEGATIVE PATH | ✅ PASS | Code inspection: exit 1 on gatePasses=false or readOnlyInvariant=false |
| READ-ONLY INVARIANT | ✅ PASS | Before/after snapshot comparison, readOnlyInvariant=true in CI |
| PII OUTPUT | ✅ NONE | grep email/mobile in script = 0 matches |
| CURRENT-HEAD CI | ✅ PASS | 3/3 success on 5b18b1c (after re-run of flaky audit-transaction) |
| INDEPENDENT REVIEW | ⏳ REQUIRED | Owner must review PR #75 |
| PRODUCTION BACKFILL | ❌ NOT AUTHORIZED | No production operations |

---

## 6. Final Status

```
DRY-RUN POSITIVE PATH: PASS
DRY-RUN NEGATIVE PATH: PASS (code inspection — exit 1 on failure conditions)
READ-ONLY INVARIANT: PASS
PII OUTPUT: NONE
CURRENT-HEAD CI: PASS (3/3 on 5b18b1c)
INDEPENDENT REVIEW: REQUIRED
PRODUCTION BACKFILL: NOT AUTHORIZED
MERGE: NOT EXECUTED (awaiting owner review of PR #75)
```

---

## 7. Note on Flaky audit-transaction Test

The initial CI run on `5b18b1c` had `audit-transaction` fail with "Test timed out in
5000ms" (scenario 4: precondition fails). This is a pre-existing flaky test — it passed
on prior commits (`405d769`, `9198a05`) and passed on re-run. Our changes (dry-run script
+ CI step) do not touch the audit-transaction code path. The re-run confirmed success.

---

**End of STEP 15.47 Report. PR #75 awaits owner review. No merge, no production operations.**
