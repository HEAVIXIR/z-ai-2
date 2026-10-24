# HEAVIX — STEP 15.80 — Final Corrections Report

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #76
**Reviewed HEAD (STEP 15.80 owner review ID 5637811302):** `bb1d9fad265bbcc3d0c634595c9eb4ae443d92b6`
**Date:** 2026-10-24

---

## Executive Summary

STEP 15.80 addresses the 5 items from the owner's STEP 15.80 `REQUEST_CHANGES` review (ID `5637811302`):

1. Replaced "independent trust anchor" with "database-local anchor / wrong-DB defense" in code + docs
2. Fixed `rbac-rotate-anchor.sql` to reject empty/missing `anchor_value` BEFORE any change
3. Converted anchor mismatch test from string-comparison to REAL preflight behavioral test (exit code + halt verified)
4. Fixed STEP 15.79 report SHA (was `2124015`, correct is `bb1d9fa`)
5. Tightened test report: string-comparison vs clone-simulation clearly separated from end-to-end preflight test

---

## Corrections Made

### 1. Replaced "independent trust anchor" with "database-local anchor"
**Files:** `scripts/rbac-backfill-dryrun.ts`, all relevant docs

- Runtime output: "no database-local anchor" (was "no independent trust anchor")
- Runtime output: "database-local anchor configured" (was "independent trust anchor configured")
- Comments updated to reflect the honest scope: the anchor is a wrong-DB defense, NOT server identity proof

### 2. Rejected empty/missing anchor_value in rotation script
**File:** `scripts/rbac-rotate-anchor.sql`

- Added `\if :{?anchor_value}` guard: if the variable is unset → halt with `\quit 1`
- Added `\if '{anchor_value}' = ''` guard: if the value is empty → halt with `\quit 1`
- Both guards run BEFORE any UPDATE — the database is NOT modified if the value is invalid
- Same guards added to `scripts/rbac-create-anchor-table.sql` (install script)

### 3. Converted anchor mismatch test to REAL preflight behavioral test
**File:** `tests/integration/rbac-anchor-sql-real.test.ts` scenario 6

- **Before:** string comparison (`tableValue !== wrongExpected`) — simulated, not real
- **After:** runs the ACTUAL `scripts/rbac-backfill-dryrun.ts` as a subprocess with `DRYRUN_SERVER_IDENTITY_ANCHOR=DEFINITELY_WRONG_ANCHOR_VALUE`, asserts exit code 2, asserts "server-side trust anchor (table) does not match" in output, asserts no "DRYRUN_GATE" (preflight halted before RBAC queries)

### 4. Fixed STEP 15.79 report SHA
**File:** `docs/verification/STEP-15.79-CODE-CORRECTIONS-REPORT.md`

- Added prominent NOTE (STEP 15.80) explaining the SHA chain: `1fa452a` (initial, CI failed) → `37b1bf3` (CTE attempt, CI failed) → `bb1d9fa` (final, CI green)
- Updated reviewed HEAD to `bb1d9fad265bbcc3d0c634595c9eb4ae443d92b6`

### 5. Tightened test report — evidence separated by category
**File:** `tests/integration/rbac-anchor-sql-real.test.ts`

- Scenario 6: REAL preflight behavioral test (exit code + halt verified) — NOT a string comparison
- Scenario 7: clone simulation — clearly labeled as a fundamental limitation demonstration, NOT an end-to-end test
- Scenarios 8-9 (NEW): empty/missing anchor_value rejection — value NOT modified after rejection

---

## Test Scenarios (CI-only — REAL PostgreSQL 17)

| # | Scenario | Type | Evidence |
|---|----------|------|----------|
| 1 | Initial anchor installation | SQL script test | table + row + grants verified |
| 2 | Re-installation preserves value | SQL script test | ON CONFLICT DO NOTHING — value unchanged |
| 3 | Read-only role cannot write | privilege test | INSERT/UPDATE/DELETE denied |
| 4 | Successful rotation | SQL script test | value updated + rotated_at set |
| 5 | Rotation when row missing | SQL script test | DO block RAISE EXCEPTION |
| 6 | **REAL preflight mismatch** | **end-to-end test** | **exit code 2 + halt message** |
| 7 | Clone limitation | simulation | clone has identical anchor (H-04 documented) |
| 8 | Empty anchor_value rejected | SQL script test | value NOT modified |
| 9 | Missing anchor_value variable | SQL script test | value NOT modified |

---

## Finding-by-Finding Classification (CURRENT STATE)

| # | Finding | Current Status |
|---|---------|----------------|
| A | Password-leak test coverage | ✅ FIXED |
| B | Role anchored to allowlist | ✅ FIXED |
| C | Extended privilege verification | ✅ FIXED (code) / ✅ TESTED (CI) |
| D | Trusted expected-host check | **⏳ UNVERIFIED** — database-local anchor is wrong-DB defense, NOT server identity. Requires TLS/CA (out of scope). |
| E | Safe categorized diagnostics | ✅ FIXED |
| F | Outdated audit report | ✅ FIXED |

---

## Test Results

- **Typecheck:** 0 errors
- **Lint:** 0 errors
- **Unit tests:** 376/376 PASS (197 RBAC)
- **CI-only integration tests:** 9 scenarios (rbac-anchor-sql-real.test.ts) — run in CI on push
