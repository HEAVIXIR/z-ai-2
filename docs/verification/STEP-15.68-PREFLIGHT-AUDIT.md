# HEAVIX — STEP 15.68 — Phase C Preflight Hardening, Static Audit & Staging Execution Readiness

**Repository:** `HEAVIXIR/z-ai-2`
**Baseline merge commit:** `4f7a2d747777659290237b6fdb387269438141fc`
**Baseline branch:** `main`
**Working branch:** `chore/step-15-68-phase-c-preflight`
**Governance:** PREPARATION ONLY — NO STAGING EXECUTION — PRODUCTION NO-GO
**Date:** 2026-10-23

---

## 1. Baseline Verification (independent, via GitHub API)

| Item | Expected | Actual (API-verified) | Match |
|------|----------|----------------------|-------|
| `main` HEAD SHA | `4f7a2d747777659290237b6fdb387269438141fc` | `4f7a2d747777659290237b6fdb387269438141fc` | ✅ |
| Commit message | "Merge pull request #75 from HEAVIXIR/fix/rbac-concurrency..." | confirmed | ✅ |
| Commit date | 2026-10-23T15:31:13Z | 2026-10-23T15:31:13Z | ✅ |
| PR #75 state | closed | closed | ✅ |
| PR #75 merged | True | True | ✅ |
| PR #75 merge_commit_sha | `4f7a2d7...` | `4f7a2d747777659290237b6fdb387269438141fc` | ✅ |
| Post-merge CI on `4f7a2d7` | 3/3 SUCCESS | verify ✅ + audit-transaction ✅ + phase-tests ✅ | ✅ |

**Baseline VERIFIED.** HEAD unchanged from STEP 15.65. No drift.

---

## 2. Files Audited

| File | Lines | Audit Scope |
|------|-------|-------------|
| `scripts/rbac-backfill-dryrun.ts` | 644 | Full read (lines 1-645) — dry-run logic, classification, fingerprint, gate output |
| `scripts/rbac-gate-ci.ts` | 99 | Full read — CI gate runner, child-process handling, fail-closed |
| `src/lib/rbac/gate-logic.ts` | 177 | Full read — `evaluateGate`, `validateGateOutput`, `evaluateCiDecision`, `parseGateLine` |
| `scripts/rbac-create-readonly-role.sql` | 39 | Full read — `heavix_dryrun_ro` role definition, GRANT/REVOKE |
| `src/lib/db.ts` | 85 | Full read — Prisma client singleton, `DATABASE_URL` usage |
| `prisma/schema.prisma` | 113209 bytes | Datasource config (`url = env("DATABASE_URL")`), User/UserRole/Role/Permission/RolePermission models |
| `docs/phase3/RBAC-MIGRATION-DESIGN.md` | 63747 bytes | Design doc §4.1 (Phase C backfill spec) |
| `.github/workflows/ci.yml` | (existing) | CI workflow — gate ordering, read-only role creation, env vars |
| `tests/unit/rbac-gate-logic.test.ts` | 424 | 22+ negative-path unit tests |
| `tests/integration/rbac-readonly-role-real.test.ts` | 340 | 20 write-denial tests, effective privileges |
| `tests/integration/rbac-gate-ci-real.test.ts` | 80 | 5 real CI path tests |
| `.env.example` | (sanitized) | DB env var conventions |

---

## 3. Audit Findings (Sections A-E)

### Section A — Connection Safety

**A1. Which env var does Prisma use?**
- `prisma/schema.prisma` line ~9: `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`
- `src/lib/db.ts` line 71: `new mod.PrismaClient({ log: ['error', 'warn'] })` — uses default datasource from schema
- **The dry-run script (`scripts/rbac-backfill-dryrun.ts` line 73) imports `db` from `@/lib/db`** — which uses `DATABASE_URL` env var.

**A2. CLI code + Prisma config compatibility?**
- ✅ Compatible. The CLI uses the same `db` singleton as the Next.js app.
- ⚠️ **RISK (MEDIUM):** The CLI does NOT distinguish between "dry-run safe target" and "dev database". `DATABASE_URL` is the ONLY signal. If an operator sets `DATABASE_URL` to a dev/production database, the dry-run connects there without any preflight check.

**A3. Can dry-run inadvertently connect to default dev DB?**
- **YES (HIGH RISK finding).** If `DATABASE_URL` is unset, Prisma throws at first query (no silent fallback in Prisma itself). BUT:
  - If an operator has `DATABASE_URL` in their shell environment pointing to a dev DB (common in local dev), the dry-run will connect there without warning.
  - The dry-run script has NO preflight that says "you are about to connect to `<sanitized host/db>` — confirm this is a staging target, not dev/production."
  - The CI workflow (`.github/workflows/ci.yml`) uses a separate `DRYRUN_DATABASE_URL` env var for the read-only role — but the dry-run script itself reads `DATABASE_URL`, and CI sets `DATABASE_URL="$DRYRUN_DATABASE_URL"` inline before running the gate (ci.yml: "Phase C dry-run gate" step). This works in CI but is fragile for manual staging runs.

**A4. Preflight design recommendation:**
Add an explicit preflight to `scripts/rbac-backfill-dryrun.ts` (before any DB query):
1. Check `DATABASE_URL` is set; if not, exit 2 with clear error.
2. Parse the connection string and print a SANITIZED summary (scheme, host, port, db name — NEVER password).
3. Require an explicit env var `DRYRUN_CONFIRM_TARGET=<db-name>` that must match the db name in `DATABASE_URL`. This is a two-key confirmation: operator must set both `DATABASE_URL` AND `DRYRUN_CONFIRM_TARGET` to the same db name. Prevents accidental connection to wrong db.
4. If `DRYRUN_CONFIRM_TARGET` is missing or mismatched, exit 2 before any query.
5. Never print the password or full connection string.

**A5. No silent fallback?**
- ✅ Prisma itself does not fall back to a default — if `DATABASE_URL` is unset, `PrismaClient` constructor does not throw immediately, but the first query throws `PrismaClientInitializationError`.
- ⚠️ The dry-run script's catch block (line 631-644) prints the error and exits 2 — this is correct behavior, but the error message includes the raw `DATABASE_URL` if Prisma includes it in the error. **Recommendation:** sanitize error output before printing.

### Section B — Read-Only Enforcement

**B1. What is proven by code inspection only vs. real PostgreSQL?**

| Claim | Code Inspection | Real PG Test | Evidence |
|-------|-----------------|--------------|----------|
| Role `heavix_dryrun_ro` exists | `rbac-create-readonly-role.sql` defines it | ✅ CI test "Role exists and is not a superuser" | SQL file + test |
| Role is not superuser | SQL: no `SUPERUSER` clause | ✅ `rolsuper=false` asserted | test line ~90 |
| Role has SELECT on 5 RBAC tables | SQL: `GRANT SELECT ON ALL TABLES` | ✅ `has_table_privilege()` tests | test |
| Role has no INSERT/UPDATE/DELETE/TRUNCATE | SQL: explicit `REVOKE` | ✅ 20 write-denial tests | test |
| Role has no memberships | — | ✅ `pg_auth_members` count=0 | test |
| Role has no owned tables | — | ✅ `pg_tables` query | test |
| Role has no inherited privileges | — | ✅ membership count=0 implies no inheritance | test |
| Role has no PUBLIC grants beyond CONNECT | — | ⚠️ NOT explicitly tested | **GAP** |
| Role has no sequence writes | SQL: `REVOKE ALL ON ALL SEQUENCES` then `GRANT SELECT` | ✅ asserted | test |
| Effective privileges via `has_table_privilege()` | — | ✅ SELECT=true, writes=false | test |

**B2. Does the runtime role actually match the expected read-only role?**
- ⚠️ **MEDIUM RISK:** The CI workflow sets `DRYUN_RO_PW` (random) and passes it via `DRYRUN_DATABASE_URL` env var to the gate step. The dry-run script reads `DATABASE_URL` (which CI sets to `$DRYUN_DATABASE_URL` inline). 
- **The env var NAME is not proof of role.** An operator could set `DATABASE_URL` to a superuser connection string and the dry-run would connect as superuser. **Recommendation:** add a runtime preflight query: `SELECT current_user, current_database()` and assert `current_user = 'heavix_dryrun_ro'` before proceeding. If mismatch, exit 2.

**B3. Effective privileges, role membership, table ownership, inherited, PUBLIC grants, sequence access:**
- ✅ Effective privileges: tested via `has_table_privilege()` on all 5 tables
- ✅ Role membership: `pg_auth_members` count=0
- ✅ Table ownership: `pg_tables` query (no tables owned by role)
- ✅ Inherited: implied by membership=0
- ⚠️ **PUBLIC grants: NOT explicitly audited.** The role could inherit privileges via `PUBLIC` if someone ran `GRANT ... TO PUBLIC` on RBAC tables. **Recommendation:** add test that asserts no extra `PUBLIC` write grants on the 5 tables.
- ✅ Sequence access: `REVOKE ALL ON ALL SEQUENCES` then `GRANT SELECT ON ALL SEQUENCES`

**B4. 5-table scope limit:**
- ✅ Explicitly documented in test: "5 RBAC tables (User, UserRole, Role, Permission, RolePermission)"
- ⚠️ **This does NOT prove no mutation across the entire database.** The dry-run script reads only these 5 tables. If the script had a bug that wrote to a 6th table (e.g., AuditLog), the fingerprint would NOT detect it. **Recommendation:** add a whole-DB row-count snapshot (all tables) as a secondary invariant, OR add a test that greps the dry-run source for any `db.<model>.create/update/delete/upsert` calls and asserts none exist.

### Section C — Data Classification

**C1. User.role → Role.key mapping (per `mapLegacyRole` lines 95-112):**

| Legacy Value | Canonical Key | Classification | Notes |
|--------------|---------------|----------------|-------|
| `"ADMIN"` | `ADMIN` | OK (if matches) | Direct |
| `"SUPERADMIN"` | `ADMIN` | OK (if matches) | Legacy alias → ADMIN |
| `"SELLER"` | `SELLER` | OK (if matches) | Direct |
| `"BUYER"` | `BUYER` | OK (if matches) | Direct |
| `"MODERATOR"` | `MODERATOR` | OK (if matches) | Direct canonical match |
| `"SUPPORT"` | `SUPPORT` | OK (if matches) | Direct canonical match |
| `""` (empty) | `BUYER` | OK (if matches) | Default fallback per design §4.1 |
| `null`/`undefined` | `BUYER` | OK (if matches) | Defensive (column is NOT NULL) |
| whitespace-only | `BUYER` | OK (if matches) | Defensive `.trim()` |
| lowercase (e.g. `"admin"`) | uppercased | OK (if matches) | `.toUpperCase()` |
| anything else | `null` | INVALID | Manual review required |

**C2. Classification behavior (lines 334-395):**

| Condition | Classification | Action |
|-----------|----------------|--------|
| `mapLegacyRole` returns `null` | INVALID | Sample captured, do NOT auto-correct |
| `userRoleKeys.length === 0` | MISSING | Sample captured, safe to backfill |
| `userRoleKeys.length > 0` AND canonical NOT in list | MISMATCH | Sample captured, do NOT auto-correct (ambiguous) |
| `userRoleKeys.length > 1` AND canonical IS in list | MULTI_ROLE | Sample captured, informational (backfill is no-op) |
| `userRoleKeys.length === 1` AND canonical IS in list | OK | No action |

**C3. MULTI_ROLE policy:**
- ✅ Consistent with owner directive: «نقش‌های مبهم را خودکار اصلاح نکن.» (do NOT auto-correct ambiguous roles)
- ✅ `gatePasses` requires `MULTI_ROLE == 0` (line 454) — even though MULTI_ROLE is "informational", the gate conservatively blocks until owner accepts the risk.

**C4. PII safety in samples:**
- ✅ Samples only include: `userId`, `legacyRole` (User.role value), `canonicalKey` (Role.key), `userRoleKeys` (Role.key list)
- ⚠️ **LOW RISK:** `userId` is a UUID (not email/name), so no direct PII leak. BUT if `User.role` column ever contained a sensitive value (misconfigured), it would be printed in samples. **Recommendation:** add a PII scan on sample values — if any value matches email/phone pattern, redact.

**C5. Count + sum + fail-closed correctness:**
- ✅ `gatePasses = invalidCount === 0 && mismatchCount === 0 && multiRoleCount === 0` (line 451-454)
- ✅ `validateGateOutput` in gate-logic.ts checks: negative, NaN, non-integer, sum mismatch, inconsistent gate state
- ✅ Test #5 in `rbac-gate-logic.test.ts` covers count-preserving mutation detection (fingerprint catches it)

### Section D — Consistent Snapshot and Scale

**D1. What guarantees do counts + fingerprints have under concurrent changes?**
- ⚠️ **HIGH RISK finding:** The BEFORE/AFTER snapshots (lines 232-256, 512-532) are NOT in a transaction. They are separate `Promise.all` queries. Between the BEFORE snapshot and the AFTER snapshot, the entire dry-run classification runs (lines 259-401). If a concurrent process (e.g., integration tests in CI, or app traffic in staging) mutates any of the 5 tables during this window, `readOnlyInvariant` will be `false` and the gate will FAIL.
- ✅ This is actually the DESIRED behavior for a read-only proof — if anything changes, fail. BUT it means the dry-run is fragile in a concurrent environment.
- ✅ CI workflow mitigates this by running the gate BEFORE integration tests (CR-15.52-01).
- ⚠️ **For staging:** if staging has live traffic, the dry-run may produce false `readOnlyInvariant=false` failures. **Recommendation:** run staging dry-run during a maintenance window or quiesce staging traffic.

**D2. Fingerprint memory limit:**
- ⚠️ **HIGH RISK finding:** The fingerprint reads ALL rows from ALL 5 tables into memory (lines 240-246, 519-525):
  - `db.user.findMany({ select: { id, role } })` — all users
  - `db.userRole.findMany({ select: { userId, roleId } })` — all user-role joins
  - `db.role.findMany(...)` — small (5 rows)
  - `db.permission.findMany(...)` — small (~120 rows)
  - `db.rolePermission.findMany(...)` — small (~300 rows)
- For a production-scale DB with millions of users + tens of millions of UserRole rows, this will OOM (out of memory) or take minutes.
- **Recommendation:** switch fingerprint to a streaming hash (e.g., `ORDER BY id ASC` + `crypto.createHash('sha256')` + row-by-row `update()`) OR a SQL-side aggregate (e.g., `SELECT md5(string_agg(id || ':' || role, ',' ORDER BY id))` — but this also has scale limits). The streaming hash is safer.

**D3. Idempotency conditions:**
- ✅ Two runs on a FIXED dataset produce identical output (deterministic `orderBy: { id: 'asc' }`).
- ⚠️ **NOT idempotent under concurrent mutation:** if data changes between run 1 and run 2, the classification counts + fingerprints will differ. This is expected (dry-run is a point-in-time snapshot), but the runbook must document this.

**D4. Transaction isolation / pagination / fingerprint improvements:**
- **Recommendation (LOW RISK, staged):**
  1. Wrap BEFORE + classification + AFTER in a single read-only transaction (`db.$transaction([...], { isolationLevel: 'Serializable' })`) — but this holds locks and may block writers.
  2. Better: use a repeatable-read snapshot via `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` at the start, so all reads see a consistent view.
  3. For scale: replace `findMany` fingerprint with a streaming hash.
  4. Do NOT implement these without separate testing — they change behavior.

### Section E — Gate Correctness

**E1. Connection failure handling:**
- ✅ `main().catch()` (lines 631-644) catches, prints error, exits 2.
- ⚠️ Error output may include `DATABASE_URL` with password. **Recommendation:** sanitize.

**E2. Query error handling:**
- ✅ Caught by `main().catch()`.
- ✅ `db.$disconnect()` in finally-like pattern.

**E3. Incomplete catalog (missing Role rows):**
- ✅ Lines 185-194: checks `missingRoleKeys` after loading Roles. If incomplete, prints error + exits 2.

**E4. Child-process failure:**
- ✅ `rbac-gate-ci.ts` line 37-55: CR-15.50-01 — if child process exits non-zero, the gate FAILS regardless of output content. This is correct fail-closed behavior.

**E5. Incomplete JSON output:**
- ✅ `validateGateOutput` in gate-logic.ts checks for missing fields, malformed JSON, non-integer, negative, sum mismatch. All return errors → `evaluateCiDecision` returns `shouldPass=false` → `rbac-gate-ci.ts` exits 1.

**E6. CI verdict fail-closed?**
- ✅ `evaluateCiDecision`: returns `shouldPass=false` on ANY validation error, `gatePasses=false`, OR `readOnlyInvariant=false`.
- ✅ `rbac-gate-ci.ts`: `if (!decision.shouldPass) { process.exit(1); }` — CI job fails.

**E7. Gate ordering relative to DB-mutating tests:**
- ✅ CI workflow (`.github/workflows/ci.yml`): "Phase C dry-run gate" step runs BEFORE integration test steps (CR-15.52-01). This ensures the read-only invariant is measured in isolation, not polluted by concurrent test mutations.

**E8. "Write-denial test passed" vs. "no mutation occurred in staging":**
- ⚠️ **CRITICAL DISTINCTION:** The 20 write-denial tests (Section B) prove the `heavix_dryrun_ro` role cannot write to the 5 RBAC tables in CI. They do NOT prove that "no mutation occurred in staging" — that is what `readOnlyInvariant` (before/after fingerprint) proves, but ONLY for the 5 tables. A mutation to a 6th table (e.g., AuditLog) would NOT be detected.
- **Recommendation:** the staging runbook must explicitly state: "readOnlyInvariant proves no mutation to the 5 RBAC tables. It does NOT prove no mutation to other tables. For full proof, take a whole-DB snapshot before/after."

---

## 4. Severity Summary

| # | Finding | Severity | Section | Recommendation |
|---|---------|----------|---------|----------------|
| F-15.68-01 | No preflight target confirmation — dry-run connects to whatever `DATABASE_URL` points to | **HIGH** | A3, A4 | Add `DRYRUN_CONFIRM_TARGET` two-key confirmation |
| F-15.68-02 | Runtime role not verified — env var name is not proof of role | **MEDIUM** | B2 | Add `SELECT current_user` preflight assert |
| F-15.68-03 | PUBLIC grants not explicitly audited | **MEDIUM** | B3 | Add test asserting no PUBLIC write grants on 5 tables |
| F-15.68-04 | 5-table scope limit — does NOT prove no mutation to other tables | **MEDIUM** | B4, E8 | Document limitation in runbook; add source grep test |
| F-15.68-05 | Fingerprint reads all rows into memory — OOM risk at scale | **HIGH** | D2 | Switch to streaming hash for production-scale |
| F-15.68-06 | No transaction isolation — concurrent mutations cause false readOnlyInvariant=false | **MEDIUM** | D1 | Use REPEATABLE READ snapshot OR run during maintenance window |
| F-15.68-07 | Error output may leak DATABASE_URL with password | **LOW** | A5, E1 | Sanitize error output before printing |
| F-15.68-08 | Samples may include sensitive values if User.role is misconfigured | **LOW** | C4 | Add PII scan on sample values |
| F-15.68-09 | No whole-DB snapshot — only 5 tables fingerprinted | **MEDIUM** | B4 | Add whole-DB row-count snapshot as secondary invariant |

**No BLOCKING findings.** All findings are improvable in follow-up work. The dry-run is safe to execute on staging WITH the runbook's mitigations (maintenance window, target confirmation, role verification).

---

## 5. Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| Baseline + SHA recorded with live GitHub evidence | ✅ PASS (Section 1) |
| Audit each section tied to specific file/test | ✅ PASS (Section 2-3, all findings reference file + line) |
| Tests added — actually run + result recorded | ⏳ PENDING (tests to be added in companion file) |
| Lint + typecheck without errors | ⏳ PENDING (to be run after changes) |
| Runbook includes prerequisites, stop criteria, evidence limitations | ✅ PASS (separate runbook file) |
| Backfill design separate from dry-run + idempotency documented | ✅ PASS (separate design file) |
| All unresolved limitations + open risks explicitly recorded | ✅ PASS (Section 4) |
| No staging or production operations performed | ✅ PASS |

---

## 6. Authorization Status

- **Staging execution:** NOT AUTHORIZED ⏳ (runbook prepared, awaiting owner authorization)
- **Production backfill:** NOT AUTHORIZED ❌
- **Phase D cutover:** NOT AUTHORIZED ❌
- **Phase E drop column:** NOT AUTHORIZED ❌
- **Production deployment:** NOT AUTHORIZED ❌

**STEP 15.68 STATUS: PARTIAL** — audit complete, runbook + backfill design prepared, tests + code hardening to be added in follow-up commit. No staging/production operations performed.

---

## STEP 15.72 Addendum — Finding Reclassification (2026-10-23)

After STEP 15.71 remediation and STEP 15.72 final hardening, the findings in this audit have been reclassified as follows:

| # | Finding | Original Status (STEP 15.68) | Reclassified Status (STEP 15.72) | Evidence |
|---|---------|------------------------------|----------------------------------|----------|
| F-15.68-01 | No preflight target confirmation | OPEN | **FIXED** (STEP 15.68) | `scripts/rbac-backfill-dryrun.ts:201-217` — `DRYRUN_CONFIRM_TARGET` two-key confirmation enforced |
| F-15.68-02 | Runtime role not verified | OPEN | **FIXED** (STEP 15.68 + STEP 15.72) | STEP 15.68 added `current_user` check; STEP 15.72 added `resolveTrustedRole()` allowlist + `actualUser === trustedRole` assertion (`scripts/rbac-backfill-dryrun.ts:280-291`) |
| F-15.68-03 | PUBLIC grants not explicitly audited | OPEN | **FIXED** (STEP 15.71) | `scripts/rbac-backfill-dryrun.ts:420-437` — PUBLIC write grants check |
| F-15.68-04 | 5-table scope limit | OPEN (documented) | **OPEN** (documented limitation) | NOT TESTED — would require whole-DB row-count snapshot. Documented in runbook Section 9.1. |
| F-15.68-05 | Fingerprint reads all rows into memory — OOM risk | OPEN (documented) | **OPEN** (documented limitation) | NOT TESTED — streaming hash is future work. |
| F-15.68-06 | No transaction isolation | OPEN (documented) | **OPEN** (documented limitation) | NOT TESTED — maintenance window mitigation documented in runbook Section 9.2. |
| F-15.68-07 | Error output may leak DATABASE_URL with password | OPEN | **FIXED** (STEP 15.68 + STEP 15.71 + STEP 15.72) | STEP 15.68 added `sanitizeConnectionString()`; STEP 15.71 strengthened URL parsing; STEP 15.72 added `categorizeDbError()` for safe categorized diagnostics + fixed generic message on parse failure (`src/lib/rbac/dryrun-helpers.ts:113-118`) |
| F-15.68-08 | Samples may include sensitive `User.role` values | OPEN (documented) | **OPEN** (documented limitation) | NOT TESTED — PII scan documented in runbook Section 5.2. |
| F-15.68-09 | No whole-DB snapshot | OPEN (documented) | **OPEN** (documented limitation) | NOT TESTED — runbook Section 9.1 documents manual procedure. |

### New STEP 15.72 findings (from owner's PR #76 review):

| # | Finding | Severity | Status | Evidence |
|---|---------|----------|--------|----------|
| F-15.72-1 | Credential-sanitization regression test incomplete (asserts only `p@ss` absent, not `ss` or other fragments) | MEDIUM | **FIXED** | `tests/unit/rbac-preflight-logic.test.ts` tests 5, 7, 13, 13a–13g, 17 strengthened; `sanitizeConnectionString()` returns fixed generic message on parse failure. See `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` §3.1. |
| F-15.72-2 | `DRYRUN_EXPECTED_ROLE` remains caller-configurable (no allowlist) | HIGH | **FIXED** | `TRUSTED_READONLY_ROLE_ALLOWLIST` constant + `resolveTrustedRole()` in `src/lib/rbac/dryrun-helpers.ts:38-76`; preflight asserts `actualUser === trustedRole` in `scripts/rbac-backfill-dryrun.ts:280-291`. See `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` §3.2. |
| F-15.72-3 | Effective privilege audit incomplete (missing sequence, schema, database CREATE, table ownership) | HIGH | **FIXED** | `has_sequence_privilege` USAGE/UPDATE check, `has_schema_privilege` CREATE check, `has_database_privilege` CREATE check, `pg_class.relowner` ownership check in `scripts/rbac-backfill-dryrun.ts:439-520`. See `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` §3.3. |
| F-15.72-4 | Server/cluster identity unverified (`current_database()` alone can be spoofed) | HIGH | **FIXED** | `DRYRUN_EXPECTED_HOST` required env var + `extractHost()` in `src/lib/rbac/dryrun-helpers.ts:135-152`; preflight queries `inet_server_addr()` and compares with DNS-resolved expected host in `scripts/rbac-backfill-dryrun.ts:293-341`. See `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` §3.4. |
| F-15.72-5 | Catch path hides useful failure cause (generic "unable to parse" for all Prisma errors) | MEDIUM | **FIXED** | `categorizeDbError()` with 5 safe categories (CONNECTION_REFUSED, AUTHENTICATION_FAILED, DATABASE_NOT_FOUND, PERMISSION_DENIED, UNKNOWN) in `src/lib/rbac/dryrun-helpers.ts:181-291`; replaces `console.error(err)` in `scripts/rbac-backfill-dryrun.ts:537-546, 1038-1065`. See `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` §3.5. |
| F-15.72-6 | Audit documentation stale | LOW | **FIXED** | This addendum + `docs/verification/STEP-15.72-REMEDIATION-REPORT.md` + addendums in `STEP-15.68-FINAL-REPORT.md` and `STEP-15.68-STAGING-RUNBOOK.md`. |

### STEP 15.72 Status Summary

- **9 original STEP 15.68 findings:** 4 FIXED (F-01, F-02, F-03, F-07), 5 OPEN (documented limitations: F-04, F-05, F-06, F-08, F-09 — all out of STEP 15.72 scope).
- **6 new STEP 15.72 findings:** ALL 6 FIXED ✅
- **Test count:** 172/172 unit tests PASS (was 104 — net +68 new tests in STEP 15.72).
- **Typecheck + lint:** clean (0 errors).
- **Staging dry-run execution:** NOT AUTHORIZED ⏳
- **Production:** NO-GO ❌

**Full details:** see `docs/verification/STEP-15.72-REMEDIATION-REPORT.md`.
