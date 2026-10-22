# STEP 15.52 — CI Ordering, Credential Fail-Closed, PR Evidence Reconciliation

**Date:** 2026-10-22
**PR:** #75
**HEAD at time of step:** `ed9e4e41c204f3af75547c1ea1539b09df6d7de1`
**CI run:** #39804541441 (3/3 SUCCESS)

## What was done

### CR-15.52-01: CI execution order
- Moved "Phase C dry-run gate" step to run AFTER "Security tests" but BEFORE all integration tests
- CI log confirms: gate at line 943 (`CI DECISION: PASS`), integration tests start at line 1084
- The gate runs in isolation — DB is seeded but not yet mutated by integration tests

### CR-15.52-02: Remove static password fallback
- Replaced both instances of `process.env.DRYUN_RO_PW || "dryrun_ro_password"` with explicit fail
- `psqlRO()`: throws `Error("DRYUN_RO_PW environment variable is not set")` if absent
- Isolated dry-run test: throws `Error` if absent
- grep for `|| "dryrun_ro_password"` returns 0 matches

### CR-15.52-03: PR body reconciliation
- PR body updated via GitHub API with correct SHA, commit count, file count, CI run URL

### CR-15.52-04: Security revalidation
- CI 3/3 SUCCESS on exact head
- Read-only gate exits 0, gatePasses=true, readOnlyInvariant=true
- INSERT/UPDATE/DELETE/TRUNCATE denied

## CI evidence
- CI step ordering (from log):
  - Line 631: Create read-only PostgreSQL role
  - Line 853-881: Security tests (PASS)
  - Line 943: Phase C dry-run gate (BEFORE integration tests)
  - Line 1078: DRYRUN_GATE output
  - Line 1083: `CI DECISION: PASS`
  - Line 1084: Integration tests start (AFTER gate)
- `tests/integration/rbac-readonly-role-real.test.ts` (14 tests) — ALL PASS
- `tests/unit/rbac-gate-logic.test.ts` (22 tests) — ALL PASS

## Limitations
- Security tests run before the gate; while they are primarily read-only contract tests, their RBAC table mutation potential was not explicitly audited (addressed in STEP 15.53)
- PR body claimed reports "STEP 15.44 through STEP 15.52" but reports 15.50-15.52 were not committed (fixed in STEP 15.53)
