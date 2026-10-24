# HEAVIX — STEP 15.79 — Code Corrections + Real PostgreSQL Tests (HISTORICAL / SUPERSEDED)

> **⚠ HISTORICAL DOCUMENT — SUPERSEDED.** This report covers the STEP 15.79
> remediation. It has been superseded by STEP 15.80+ corrections.
>
> **SHA Provenance (historical chain):**
> - `1fa452a` — STEP 15.79 initial push (CI FAILED: psql var doesn't work inside DO $$)
> - `37b1bf3` — STEP 15.79 fix attempt 1 (CI FAILED: CTE division-by-zero fragile)
> - `bb1d9fa` — STEP 15.79 fix attempt 2 (CI GREEN — this was the STEP 15.80 reviewed HEAD)
> - `d9f3a29` — STEP 15.80 push (CI FAILED: \if psql guard unreliable)
> - `d83f451` — STEP 15.80 fix (CI GREEN — **current final SHA**)
>
> **Current final SHA:** `d83f451abd59e3789d5e1e705c52f1d877af5ee2`
> Finding D (server identity) is ⏳ UNVERIFIED — NOT FIXED.
> See `docs/verification/STEP-15.81-FINAL-CLAIM-AUDIT-REPORT.md` for the
> authoritative current-state classification.

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #76
**Reviewed HEAD (STEP 15.79 owner review ID 5637811302):** `bb1d9fad265bbcc3d0c634595c9eb4ae443d92b6` (historical — see SHA chain above)
**Date:** 2026-10-24

---

## Executive Summary

STEP 15.79 addresses the owner's `/detailed` directive:
1. Removed the false claim "server identity verified via independent trust anchor when configured" from runtime output
2. Fixed the invalid `\if :ROWCOUNT = 0` guard in `rbac-rotate-anchor.sql` → replaced with a DO block + GET DIAGNOSTICS
3. Clarified the policy: without `DRYRUN_SERVER_IDENTITY_ANCHOR` → diagnostic dry-run OK (UNVERIFIED logged); for operations depending on server identity → anchor must be configured
4. Updated STEP-15.78 report (removed stale `92f50eb` reference)
5. Marked STEP 15.72 report as HISTORICAL/SUPERSEDED
6. Added REAL PostgreSQL behavioral tests for the anchor SQL scripts (7 scenarios, CI-only)

---

## Corrections Made

### 1. Removed false "server identity verified" claim
**File:** `scripts/rbac-backfill-dryrun.ts` line 819

**Before:** `server identity verified via independent trust anchor when configured`

**After:** `server identity: UNVERIFIED ⚠ — anchor is wrong-DB defense only, NOT server identity proof. Requires TLS/CA, out of scope.`

### 2. Fixed rbac-rotate-anchor.sql (invalid \if :ROWCOUNT guard)
**File:** `scripts/rbac-rotate-anchor.sql`

**Before:** `\if :ROWCOUNT = 0` (not a valid psql variable — psql does not populate ROWCOUNT after DML)

**After:** DO block with `GET DIAGNOSTICS affected_rows = ROW_COUNT` + `RAISE EXCEPTION` if 0 rows affected. This works on all PostgreSQL versions (13+) and properly signals failure via psql exit code.

### 3. Clarified policy (DRYRUN_SERVER_IDENTITY_ANCHOR not set)
**File:** `scripts/rbac-backfill-dryrun.ts` preflight

- Without anchor → UNVERIFIED ⚠ logged + diagnostic dry-run CONTINUES (acceptable for diagnostic)
- For operations depending on server identity → anchor MUST be configured (policy gate, not script-enforced)
- The UNVERIFIED status in the audit report is the signal for the staging/production authorization gate

### 4. Fixed stale SHA in STEP-15.78 report
**File:** `docs/verification/STEP-15.78-HONEST-SCOPE-REPORT.md`

- Removed stale `92f50eb` reference (that was STEP 15.77 baseline, not 15.78 remediation)
- Updated to `2124015` (the actual STEP 15.78 remediation SHA)

### 5. Marked STEP 15.72 report as HISTORICAL/SUPERSEDED
**File:** `docs/verification/STEP-15.72-REMEDIATION-REPORT.md`

- Added prominent HISTORICAL/SUPERSEDED banner
- Documented the full chain: 15.72→15.73→15.74→15.75→15.76→15.77→15.78→15.79
- Finding D (server identity) = ⏳ UNVERIFIED — NOT FIXED
- The §2 table showing "All 6 findings FIXED" is retained FOR HISTORICAL REFERENCE ONLY

### 6. Added REAL PostgreSQL behavioral tests
**File:** `tests/integration/rbac-anchor-sql-real.test.ts` (NEW — 7 scenarios, CI-only)

- Scenario 1: Initial anchor installation (table + row + grants)
- Scenario 2: Re-installation preserves existing value (ON CONFLICT DO NOTHING)
- Scenario 3: Read-only role CANNOT write to anchor table (INSERT/UPDATE/DELETE denied)
- Scenario 4: Successful anchor rotation (UPDATE + rotated_at timestamp)
- Scenario 5: Rotation when row is missing → failure detected (DO block EXCEPTION)
- Scenario 6: Anchor mismatch → detected (logic verification)
- Scenario 7: Cloned DB has identical anchor (H-04 fundamental limitation documented)

These tests run ONLY in CI (when DATABASE_URL includes "localhost" — postgres:17 service container).

---

## Finding-by-Finding Classification (CURRENT STATE)

| # | Finding | Current Status |
|---|---------|----------------|
| A | Password-leak test coverage | ✅ FIXED |
| B | Role anchored to allowlist | ✅ FIXED |
| C | Extended privilege verification | ✅ FIXED (code) / ⏳ NOT TESTED (CI) |
| D | Trusted expected-host check | **⏳ UNVERIFIED** — anchor is wrong-DB defense, NOT server identity. Requires TLS/CA (out of scope). |
| E | Safe categorized diagnostics | ✅ FIXED |
| F | Outdated audit report | ✅ FIXED |

---

## Test Results

- **Typecheck:** 0 errors
- **Lint:** 0 errors
- **Unit tests:** 375/375 PASS (196 RBAC)
- **CI-only integration tests:** 7 new (rbac-anchor-sql-real.test.ts) — run in CI on push
