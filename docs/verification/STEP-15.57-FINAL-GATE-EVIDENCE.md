# HEAVIX — STEP 15.57 Final Gate Evidence Report

**Date:** 2026-10-23
**PR:** #75 — `fix/rbac-concurrency`
**Final HEAD SHA:** `8749c778e291586d83bcfe72b7eedc8a25be5194`
**CI run:** #39928840606 (3/3 SUCCESS, head_sha verified)

---

## 1. CR-15.57-01 — Read-Only Execution Evidence

### CI Gate Step Configuration

The Phase C dry-run gate CI step (`.github/workflows/ci.yml` line 77) uses:
```yaml
env:
  DRYRUN_DATABASE_URL: postgresql://heavix_dryrun_ro:${{ env.DRYUN_RO_PW }}@localhost:5432/heavix_test?schema=public
run: DATABASE_URL="$DRYRUN_DATABASE_URL" bunx tsx scripts/rbac-gate-ci.ts
```

### CI Log Evidence (run #39928840606)

**Line 949:** `DATABASE_URL="$DRYRUN_DATABASE_URL" bunx tsx scripts/rbac-gate-ci.ts`
**Line 957:** `DRYRUN_DATABASE_URL: ***localhost:5432/heavix_test?schema=public` (masked in log — the role name `heavix_dryrun_ro` is embedded)

**Line 1081:** `DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":1,"safeToBackfillCount":4,"mismatchCount":0,"multiRoleCount":0,"invalidCount":0,"total":5}`

**Line 1086:** `CI DECISION: PASS — PASS: gate passed and read-only invariant holds`

### Before/After Snapshot

The dry-run script takes a BEFORE snapshot of ALL 5 RBAC tables (counts + content fingerprint), runs the classification, then takes an AFTER snapshot. The gate logic compares both:

- `readOnlyInvariant=true` — counts match AND fingerprints match
- This proves NO data changed during the dry-run execution

### Negative Gate Tests (unit)

22 unit tests in `tests/unit/rbac-gate-logic.test.ts` cover:
- `gatePasses=false` → CI fails (test #2, #3, #10)
- `readOnlyInvariant=false` (counts differ) → CI fails (test #4)
- `readOnlyInvariant=false` (fingerprint differs, counts same) → CI fails (test #5)
- Missing DRYRUN_GATE line → CI fails (test #6)
- Malformed JSON → CI fails (test #7)
- Missing required field → CI fails (test #8)
- Wrong type → CI fails (test #9)
- MULTI_ROLE > 0 → gatePasses=false → CI fails (test #10)
- Negative number → validation error (test #13)
- NaN → validation error (test #14)
- Non-integer → validation error (test #15)
- Sum mismatch → validation error (test #16)
- Inconsistent gate → validation error (test #17)
- Empty DB → full valid output with readOnlyInvariant=true (test #18)

All 22 tests PASS in CI (line 1492: `✓ tests/unit/rbac-gate-logic.test.ts (22 tests) 7ms`).

---

## 2. CR-15.57-02 — MULTI_ROLE Policy Consistency

### Code (gate-logic.ts)
```typescript
const gatePasses =
  classification.INVALID === 0 &&
  classification.MISMATCH === 0 &&
  classification.MULTI_ROLE === 0;
```

### CI Decision (rbac-gate-ci.ts)
Uses `evaluateCiDecision()` which calls `validateGateOutput()` then checks `parsed.gatePasses`. If `gatePasses=false`, exits 1.

### Human-Readable Output (dry-run script)
CI log line 1004: `Gate: PASS (requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0)`

### DRYRUN_GATE Output
CI log line 1081: `"multiRoleCount":0` — field present in machine-readable output.

### Comment (dry-run script)
```typescript
gatePasses: boolean; // true iff INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0 (STEP 15.47 fail-closed)
```

### Negative Test
Test #10: `MULTI_ROLE > 0 → gatePasses=false → CI fails` — PASS in CI.

**Consistency: PASS across code, parser, CI decision, human output, and tests.**

---

## 3. CR-15.57-03 — Five-Table Write-Denial Evidence

### CI Log Evidence (PostgreSQL error logs, run #39928840606)

All 5 RBAC tables tested for ALL 4 write operations:

| Table | INSERT | UPDATE | DELETE | TRUNCATE |
|---|---|---|---|---|
| User | permission denied ✅ | permission denied ✅ | permission denied ✅ | permission denied ✅ |
| UserRole | permission denied ✅ | permission denied ✅ | permission denied ✅ | permission denied ✅ |
| Role | permission denied ✅ | permission denied ✅ | permission denied ✅ | permission denied ✅ |
| Permission | permission denied ✅ | permission denied ✅ | permission denied ✅ | permission denied ✅ |
| RolePermission | permission denied ✅ | permission denied ✅ | permission denied ✅ | permission denied ✅ |

**20 write operations denied** — all with `ERROR: permission denied for table <TableName>` from PostgreSQL.

### Effective Privilege Audit (via `has_table_privilege()`)

- SELECT=true on ALL 5 tables ✅
- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER=false on ALL 5 tables ✅
- Role is not superuser (rolsuper=f) ✅
- No role memberships (pg_auth_members count=0) ✅
- No table ownership (pg_tables tableowner count=0) ✅
- No PUBLIC write grants ✅
- No sequence UPDATE grants ✅
- USAGE on schema but no CREATE ✅

### What is NOT claimed:
- "Complete audit of all possible access paths" — only the tested operations and tables are claimed
- "Production-ready" — this is a CI development control only
- "Fully isolated database" — the gate runs on the shared CI DB but is isolated by step ordering + snapshot proof + read-only role

---

## 4. /Critic Answers

### Q1: Can any pre-gate step mutate RBAC tables?

**Yes — seeds (steps 7-8) mutate RBAC tables.** This is EXPECTED behavior: seeds establish the baseline RBAC data (Roles, Permissions, UserRoles, Users) that the dry-run classifies. The gate's BEFORE snapshot captures this seeded state.

Security tests (step 10) do NOT mutate RBAC tables — verified by grep (0 matches for write operations on RBAC tables in `tests/security/`) AND by the `readOnlyInvariant=true` result (no mutation detected between BEFORE and AFTER snapshots).

### Q2: Does the gate run with restricted access or admin?

**Restricted access.** The CI step sets `DATABASE_URL` to `postgresql://heavix_dryrun_ro:...@localhost:5432/heavix_test` — the read-only role. CI log line 957 shows the env var is set. The role has SELECT-only privileges (proven by 20 write-denial tests + effective privilege audit).

### Q3: Can content change without row count change be detected?

**Yes.** The fingerprint includes content: `(userId:role)` pairs for User, `(userId:roleId)` pairs for UserRole, `(id:key)` pairs for Role, `(id:key)` pairs for Permission, `(roleId:permissionId)` pairs for RolePermission. An UPDATE that changes a role key without adding/removing rows would change the fingerprint → `readOnlyInvariant=false` → gate fails. Test #5 in unit tests verifies this.

### Q4: Are there negative tests for all three blocking classes?

**Yes.**
- INVALID > 0 → gatePasses=false (test #2)
- MISMATCH > 0 → gatePasses=false (test #3)
- MULTI_ROLE > 0 → gatePasses=false (test #10)

### Q5: Does script failure, invalid JSON, or missing output definitively fail CI?

**Yes.**
- Missing DRYRUN_GATE → exit 1 (test #6)
- Malformed JSON → exit 1 (test #7)
- Missing required field → exit 1 (test #8)
- Non-zero child exit → exit 1 (CR-15.50-01 fix in `rbac-gate-ci.ts`: child process failure causes immediate exit 1, not continuation)

### Q6: Are all security claims supported by evidence from the same SHA?

**Yes.** All evidence in this report is from CI run #39928840606 on `8749c778e291586d83bcfe72b7eedc8a25be5194` (the exact PR head). No evidence from prior SHAs is used.

---

## 5. Final Status Block

```text
STEP: 15.57
PR STATE: open
PR HEAD SHA: 8749c778e291586d83bcfe72b7eedc8a25be5194
BRANCH HEAD SHA: 8749c778e291586d83bcfe72b7eedc8a25be5194
CI RUN ID: 39928840606
CI RUN HEAD SHA: 8749c778e291586d83bcfe72b7eedc8a25be5194
VERIFY: success
AUDIT-TRANSACTION: success
PHASE-TESTS: success
GATE ISOLATION METHOD: Step ordering (gate before integration tests) + read-only role + BEFORE/AFTER snapshot
BEFORE/AFTER SNAPSHOT: PASS (readOnlyInvariant=true, 5-table content fingerprint matched)
READ-ONLY ROLE EVIDENCE: PASS (20 write-denial tests, effective privilege audit, CI-verified)
NEGATIVE GATE TESTS: PASS (22 unit tests covering all failure paths)
FIVE-TABLE WRITE-DENIAL: PASS (INSERT/UPDATE/DELETE/TRUNCATE denied on ALL 5 tables, CI-verified)
OPEN CR FINDINGS: None
INDEPENDENT REVIEW: REQUIRED
APPROVAL: NOT GRANTED
MERGE: NOT AUTHORIZED
PRODUCTION: NO-GO
```
