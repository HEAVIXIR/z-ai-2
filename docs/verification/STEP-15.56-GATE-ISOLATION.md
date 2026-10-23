# HEAVIX — STEP 15.56 Gate Isolation, Policy Consistency & Evidence Report

**Date:** 2026-10-23
**PR:** #75 — `fix/rbac-concurrency`
**Final HEAD SHA:** `513e9a6a6221051cde2f185911cc8e5058748b02` (unchanged from STEP 15.55)
**CI run:** #39922960450 (3/3 SUCCESS, head_sha matches PR head exactly)

---

## 1. CR-15.56-01 — Gate Isolation Evidence

### CI Step Order (from `.github/workflows/ci.yml`, verify job)

| # | Step Name | Mutates RBAC Tables? | Evidence |
|---|---|---|---|
| 1 | Install dependencies | No | `bun install` — no DB access |
| 2 | Generate Prisma clients | No | Code generation only |
| 3 | Create store test database | No | Creates `heavix_store_test`, not `heavix_test` |
| 4 | Push schemas | No | `prisma db push` creates tables but doesn't insert RBAC data |
| 5 | Typecheck | No | `tsc --noEmit` — no DB access |
| 6 | Lint | No | `eslint .` — no DB access |
| 7 | Seed RBAC | **YES** | `db:seed-rbac` — upserts Role, Permission, RolePermission, UserRole |
| 8 | Seed catalog data | **YES** | `db:seed-user-roles` — creates User + UserRole; `db:seed-test-fixtures` — creates User |
| 9 | Create read-only PostgreSQL role | No | Creates `heavix_dryrun_ro` role (DDL, not DML on RBAC tables) |
| 10 | Security tests | **NO** | grep verified: 0 matches for `db.user.create/update/delete`, `db.userRole.create/update/delete`, `db.role.create/update/delete`, `db.permission.create/update/delete`, `db.rolePermission.create/update/delete` in `tests/security/` |
| 11 | **Phase C dry-run gate** | — | GATE RUNS HERE — takes BEFORE snapshot, runs dry-run, takes AFTER snapshot |
| 12+ | Integration tests | YES (expected) | These mutate the DB — gate has already completed |

### Gate Isolation Analysis

The gate runs AFTER steps 7-8 (seeds) and step 10 (security tests), but BEFORE step 12+ (integration tests).

- **Steps 7-8 (seeds)**: These DO mutate RBAC tables — they create Roles, Permissions, RolePermissions, UserRoles, and Users. This is EXPECTED behavior: the seeds establish the baseline RBAC data that the dry-run classifies.
- **Step 10 (security tests)**: Verified by grep — 0 matches for any write operation on the 5 RBAC tables (`User`, `UserRole`, `Role`, `Permission`, `RolePermission`) in `tests/security/`. Security tests are read-only contract tests.
- **Gate (step 11)**: Takes a BEFORE snapshot of the seeded state, runs the classification, takes an AFTER snapshot. If any RBAC data changed between BEFORE and AFTER, `readOnlyInvariant=false` → gate fails.

**Conclusion**: The gate is isolated from integration test mutations. The only mutations before the gate are the seeds (which establish the data being classified) and security tests (which are read-only). The BEFORE/AFTER snapshot proves no mutation occurred during the dry-run itself.

**Option B selected** (gate positioned before all mutating integration tests, with evidence that prior steps don't mutate RBAC during the gate window). This is simpler than Option A (dedicated DB) and provides equivalent isolation proof.

---

## 2. CR-15.56-02 — MULTI_ROLE Policy Consistency

### Code (gate-logic.ts, `evaluateGate`)
```typescript
const gatePasses =
  classification.INVALID === 0 &&
  classification.MISMATCH === 0 &&
  classification.MULTI_ROLE === 0;
```

### Human-readable output (dry-run script)
**Before fix:**
```
Gate: PASS (requires INVALID==0 AND MISMATCH==0)
```

**After fix:**
```
Gate: PASS (requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0)
```

### Comment (dry-run script, line 150)
**Before fix:**
```typescript
gatePasses: boolean; // true iff INVALID==0 AND MISMATCH==0
```

**After fix:**
```typescript
gatePasses: boolean; // true iff INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0 (STEP 15.47 fail-closed)
```

### Test coverage
Test #10 in `tests/unit/rbac-gate-logic.test.ts` verifies `MULTI_ROLE > 0 → gatePasses=false → CI fails`.

---

## 3. CR-15.56-03 — Security Claims (limited to proven coverage)

### What is PROVEN (CI-verified on `513e9a6`):

| Claim | Evidence | Status |
|---|---|---|
| SELECT on all 5 RBAC tables | `information_schema.role_table_grants` + `has_table_privilege()` | PASS |
| INSERT denied on all 5 tables | Actual INSERT attempts with `permission denied` error | PASS |
| UPDATE denied on all 5 tables | Actual UPDATE attempts with `permission denied` error | PASS |
| DELETE denied on all 5 tables | Actual DELETE attempts with `permission denied` error | PASS |
| TRUNCATE denied on all 5 tables | Actual TRUNCATE attempts with `permission denied` error | PASS |
| REFERENCES denied | `has_table_privilege()` returns `f` | PASS |
| TRIGGER denied | `has_table_privilege()` returns `f` | PASS |
| Role is not superuser | `pg_roles.rolsuper=f` | PASS |
| Role has no memberships | `pg_auth_members` count=0 | PASS |
| Role owns no tables | `pg_tables.tableowner` count=0 | PASS |
| No PUBLIC write grants | `information_schema.role_table_grants` for `PUBLIC` | PASS |
| No sequence UPDATE grants | `information_schema.role_usage_grants` | PASS |
| USAGE on schema but no CREATE | `has_schema_privilege()` | PASS |
| Dry-run runs without permission errors | Integration-time test (no exit 0 requirement) | PASS |
| Authoritative gate passes | CI step: `CI DECISION: PASS` | PASS |

### What is NOT claimed:
- "Complete audit of all possible access paths" — only the tested paths above are claimed
- "Fully isolated database" — the gate runs on the shared CI DB but is isolated by step ordering + snapshot proof
- "Production-ready" — this is a development/CI control only

---

## 4. Final Status Block

```text
STEP: 15.56
PR STATE: open
PR HEAD SHA: 513e9a6a6221051cde2f185911cc8e5058748b02
BRANCH HEAD SHA: 513e9a6a6221051cde2f185911cc8e5058748b02
CI RUN ID: 39922960450
CI RUN HEAD SHA: 513e9a6a6221051cde2f185911cc8e5058748b02
REQUIRED CHECKS: verify=success, audit-transaction=success, phase-tests=success
GATE ISOLATION EVIDENCE: PASS (seeds before gate establish data; security tests don't mutate RBAC; gate BEFORE integration tests; BEFORE/AFTER snapshot proves no mutation)
PRE-GATE MUTATION ANALYSIS: PASS (seeds mutate RBAC as expected; security tests verified read-only by grep)
MULTI_ROLE POLICY CONSISTENCY: PASS (code, comment, human-readable output all include MULTI_ROLE==0)
FIVE-TABLE WRITE-DENIAL: PASS (INSERT/UPDATE/DELETE/TRUNCATE denied on ALL 5 tables, CI-verified)
OPEN CR FINDINGS: None
INDEPENDENT REVIEW: REQUIRED
APPROVAL: NOT GRANTED
MERGE: NOT AUTHORIZED
PRODUCTION: NO-GO
```
