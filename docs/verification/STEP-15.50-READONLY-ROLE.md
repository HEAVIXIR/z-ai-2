# STEP 15.50 — Read-Only PG Role, okCount, Child-Process Failure, Exact Total

**Date:** 2026-10-22
**PR:** #75
**HEAD at time of step:** `6409a7ad0aaddc99c5a0fdd3da35c15ca6b23bb4`
**CI run:** #39789682458 (3/3 SUCCESS)

## What was done

### CR-15.50-01: Child-process failure handling
- `scripts/rbac-gate-ci.ts`: non-zero child exit now causes `exit(1)` immediately
- A failed dry-run script CANNOT produce a valid gate result
- Test verifies source contains the fix

### CR-15.50-02: Exact classification total
- Added `okCount` to `GateResult` + `ParsedGate` interfaces
- `validateGateOutput()`: EXACT equality check
  `total === okCount + safeToBackfillCount + mismatchCount + multiRoleCount + invalidCount`
- Tests for: sum too small, sum too large, exact equality
- Dry-run script outputs `okCount` in DRYRUN_GATE line
- Empty-DB path includes `okCount=0`

### CR-15.50-03: Database read-only role
- Created `scripts/rbac-create-readonly-role.sql`
- Role `heavix_dryrun_ro` with SELECT-only privileges
- CI step creates role before tests
- 6 tests in CI (all PASS): SELECT succeeds, INSERT/UPDATE/DELETE denied

### CR-15.50-04: Documentation reconciliation
- PR body updated with final SHA

## CI evidence
- `tests/unit/rbac-gate-logic.test.ts` (22 tests) — ALL PASS
- `tests/integration/rbac-readonly-role-real.test.ts` (6 tests) — ALL PASS
- `DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":1,...}`
- `CI DECISION: PASS`

## Limitations
- Read-only role created with hard-coded password (fixed in STEP 15.51)
- Effective privileges not fully audited (improved in STEP 15.51)
