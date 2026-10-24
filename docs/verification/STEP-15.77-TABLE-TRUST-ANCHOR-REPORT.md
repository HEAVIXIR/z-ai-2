# HEAVIX — STEP 15.77 — Table-Based Trust Anchor Report (HISTORICAL / SUPERSEDED)

> **⚠ HISTORICAL DOCUMENT — SUPERSEDED.** This report described the STEP 15.77
> TABLE-based anchor. The owner subsequently identified (H-04, STEP 15.78)
> that the anchor table is cloneable — a cloned DB, restored backup, or
> logical replication target has identical table contents. This control
> CANNOT distinguish the original server from a clone. Finding D (server
> identity) is ⏳ UNVERIFIED — NOT FIXED. See
> `docs/verification/STEP-15.80-FINAL-CORRECTIONS-REPORT.md` for the
> authoritative current-state classification.

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #76 (https://github.com/HEAVIXIR/z-ai-2/pull/76)
**Reviewed HEAD (STEP 15.77, owner REQUEST_CHANGES review ID 5636470895):** `2f931d68c197c959d18423b66e805430c91755ca`
**Remediation branch:** `chore/step-15-68-phase-c-preflight`
**Date:** 2026-10-24
**Status:** LOCAL REMEDIATION COMPLETE — PUSHING (GitHub token available)

---

## Executive Summary

STEP 15.77 fixes Finding H-03 (HIGH): the STEP 15.76 trust anchor used a
PostgreSQL custom GUC (`app.server_identity`), which is **session-level
forgeable**. The connecting client can override the DBA-set database-level
default via `SET app.server_identity = '<value>'` before the preflight reads it.
ANY role can SET custom GUCs — there is no privilege check. This means
`current_setting('app.server_identity')` is NOT an independent trust anchor.

**The fix:** the anchor value is now stored in a **TABLE** (`_dryrun_anchor`),
not a GUC. Tables are NOT affected by `SET` — `SET` only changes GUCs. The
preflight verifies the read-only role has NO write privileges (no
INSERT/UPDATE/DELETE/TRUNCATE) on the anchor table. So the connecting client
CANNOT forge the table value.

**Security properties of the table-based anchor:**
1. `SET` cannot change table contents (only GUCs) — session forgery closed
2. The role has no INSERT/UPDATE/DELETE on the anchor table (verified by the preflight)
3. The anchor env var (`DRYRUN_SERVER_IDENTITY_ANCHOR`) is out-of-band — NOT from DATABASE_URL
4. An attacker who controls DATABASE_URL but not the anchor cannot reproduce the value

---

## Owner's Finding H-03 — Status: ✅ FIXED

**Owner's finding:** "DRYRUN_SERVER_IDENTITY_ANCHOR is compared by reading a
custom PostgreSQL parameter named app.server_identity. A custom PostgreSQL
parameter is not inherently an unforgeable identity; the client connection can
change its session-level value. Therefore, simply comparing these two values
does not prove the connection is to the trusted cluster."

**Remediation:**
- Replaced `SELECT current_setting('app.server_identity', true)` with
  `SELECT value FROM "_dryrun_anchor" WHERE key = 'server_identity'`
- Added `scripts/rbac-create-anchor-table.sql` for DBA setup:
  - Creates `_dryrun_anchor` table
  - Inserts the server-identity value (from psql variable, not hard-coded)
  - Grants SELECT to `heavix_dryrun_ro`
  - Explicitly REVOKEs INSERT/UPDATE/DELETE/TRUNCATE
- The preflight now performs THREE checks before trusting the anchor:
  1. The `_dryrun_anchor` table must exist (halt if not)
  2. The role must have SELECT-only on it (halt if any write privilege exists — the value would be forgeable)
  3. The table value must match the anchor (halt on mismatch — wrong server)

---

## Why the GUC Approach Was Flawed

PostgreSQL custom GUCs (Custom Options, prefixed with `app.`) have these properties:
- `ALTER DATABASE ... SET app.server_identity` sets a database-level default
- `SET app.server_identity = '<value>'` (within a session) overrides the database-level default
- ANY role can execute `SET` for custom GUCs — there is NO privilege check
- Therefore, the connecting client can forge the value before the preflight reads it

The table-based approach does NOT have this flaw:
- `SET` only affects GUCs, NOT table contents
- INSERT/UPDATE/DELETE require table privileges (which the preflight verifies are denied)
- The preflight checks `has_table_privilege(actualUser, 'public."_dryrun_anchor"', 'INSERT')` etc.
- If ANY write privilege exists → halt (the value would be forgeable)

---

## Finding-by-Finding Classification (CURRENT STATE — STEP 15.77)

| # | Finding | Directive | Current Status | Historical Note |
|---|---------|-----------|----------------|-----------------|
| A | Password-leak test coverage | 2 | ✅ FIXED | Unchanged since STEP 15.72 |
| B | Role anchored to allowlist | 3 | ✅ FIXED | Unchanged since STEP 15.72 |
| C | Extended privilege verification | 4 | ✅ FIXED (code) / ⏳ NOT TESTED (CI) | CI-only integration tests pending push |
| D | Trusted expected-host check | 5 | ✅ FIXED (code) / ⏳ NOT TESTED (CI) | 15.72→15.73→15.74→15.75→15.76 GUC (forgeable) → **15.77 TABLE-based** (not forgeable). Finding D = FIXED (code) / NOT TESTED (CI — pending push + DBA setup) |
| E | Safe categorized diagnostics | 6 | ✅ FIXED | Unchanged since STEP 15.72 |
| F | Outdated audit report | 7 | ✅ FIXED | Re-synced with actual code in STEP 15.77 |

Finding D is now **✅ FIXED (code) / ⏳ NOT TESTED (CI)**. The table-based
anchor is NOT session-forgeable. CI verification + DBA anchor-table setup
are pending.

---

## Test Results (Local)

### Unit tests (no DB required)
| Test File | Tests | Result |
|-----------|-------|--------|
| `tests/unit/rbac-preflight-logic.test.ts` | 82 | ✅ 82/82 PASS |
| `tests/unit/rbac-dryrun-preflight.test.ts` | 91 | ✅ 91/91 PASS |
| `tests/unit/rbac-gate-logic.test.ts` | 22 | ✅ 22/22 PASS |
| **RBAC subtotal** | **195** | **✅ ALL PASS** |
| Full `tests/unit/` suite | 374 | ✅ 374/374 PASS |

### Typecheck
```
tsc --noEmit -p tsconfig.json → exit 0 (0 errors)
```

### Lint
```
eslint (changed files) → exit 0 (0 errors)
```

---

## Files Changed (STEP 15.77)

### Code
| File | Change |
|------|--------|
| `scripts/rbac-backfill-dryrun.ts` | Replaced GUC-based anchor (`current_setting('app.server_identity')`) with TABLE-based anchor (`SELECT value FROM "_dryrun_anchor"`); added 3 checks: table exists, role has SELECT-only (no write), value matches |
| `scripts/rbac-create-anchor-table.sql` | NEW — DBA setup script for `_dryrun_anchor` table |

### Tests
| File | Change |
|------|--------|
| `tests/unit/rbac-dryrun-preflight.test.ts` | Updated source-level tests: GUC references removed, table-based anchor verified, SQL script verified |

### Documentation
| File | Change |
|------|--------|
| `docs/verification/STEP-15.77-TABLE-TRUST-ANCHOR-REPORT.md` | NEW — this report |
| `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` | Updated — supersession chain extended to 15.77 |
| `worklog.md` | Appended — STEP 15.77 entry |

---

## Governance

- ✅ GitHub token available — PUSH will be attempted.
- ✅ NO self-approve / branch-protection bypass / AI-comment-as-APPROVE.
- ❌ Staging dry-run / backfill / Phase D/E / production deployment: NOT AUTHORIZED.

---

## STEP 15.77 STATUS: LOCAL REMEDIATION COMPLETE — PUSHING
