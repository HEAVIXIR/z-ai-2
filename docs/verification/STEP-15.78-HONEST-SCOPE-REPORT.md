# HEAVIX — STEP 15.78 — Honest Scope + Non-Destructive Installation Report (H-04)

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #76
**Reviewed HEAD (STEP 15.78, owner REQUEST_CHANGES review ID 5637603933):** `92f50eb7c6a68a17b403c4f003965a36ae819ced`
**Date:** 2026-10-24

---

## Executive Summary

STEP 15.78 addresses H-04. The owner identified 3 issues:
1. The anchor table is cloneable — a cloned DB would pass the check
2. The SQL installation uses `DROP TABLE IF EXISTS` (destructive)
3. CI green ≠ server identity proven

**What I fixed:**
- ✅ Removed `DROP TABLE IF EXISTS` — now `CREATE TABLE IF NOT EXISTS` + `INSERT ON CONFLICT DO NOTHING` (idempotent, non-destructive)
- ✅ Added `scripts/rbac-rotate-anchor.sql` for explicit value rotation (UPDATE, not DROP)
- ✅ Relabeled the anchor check output: "Anchor check: PASS (wrong-DB defense, NOT server identity)" + "Server identity: UNVERIFIED ⚠ (anchor cannot detect cloned DB — requires TLS/CA, out of scope)"

**What I honestly CANNOT fix (documented as UNVERIFIED):**
- No in-database mechanism (table, GUC, content) can prove the connection reached the intended server. A cloned DB, restored backup, or logical replication target has identical contents. This is fundamental.
- TRUE server identity requires TLS with CA validation — a deployment-architecture decision outside this script's scope.

**Finding D is reclassified as ⏳ UNVERIFIED** — the anchor is a useful defense against accidental wrong-DB connection, NOT a proof of server identity.

---

## H-04 Sub-findings — Status

### H-04-1: Anchor table is cloneable
**Status: ⏳ UNVERIFIED (honest limitation documented)**

The anchor value is stored in a table. A cloned DB, restored backup, or logical replication target has identical table contents. This control CANNOT distinguish the original server from a clone. This is a fundamental limitation of in-database mechanisms — documented honestly in the preflight output and this report. TRUE server identity requires TLS/CA validation (out of scope).

### H-04-2: Destructive installation (DROP TABLE)
**Status: ✅ FIXED**

- Replaced `DROP TABLE IF EXISTS` with `CREATE TABLE IF NOT EXISTS`
- Replaced `INSERT` with `INSERT ... ON CONFLICT (key) DO NOTHING`
- Re-installation is now idempotent and non-destructive — the existing anchor value is preserved
- Added `scripts/rbac-rotate-anchor.sql` for explicit value rotation (UPDATE with `rotated_at` timestamp)

### H-04-3: CI green ≠ server identity
**Status: ✅ FIXED (honest labeling)**

- The preflight output no longer claims "Server identity: VERIFIED ✅" when the anchor matches
- Instead: "Anchor check: PASS (wrong-DB defense, NOT server identity)" + "Server identity: UNVERIFIED ⚠ (anchor cannot detect cloned DB — requires TLS/CA, out of scope)"
- Finding D classified as ⏳ UNVERIFIED in all audit reports

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
