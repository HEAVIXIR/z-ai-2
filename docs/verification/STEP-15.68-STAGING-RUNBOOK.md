# HEAVIX — STEP 15.68 — Staging Dry-Run Runbook

**Repository:** `HEAVIXIR/z-ai-2`
**Baseline merge commit:** `4f7a2d747777659290237b6fdb387269438141fc`
**Working branch:** `chore/step-15-68-phase-c-preflight`
**Governance:** PREPARATION ONLY — DO NOT EXECUTE UNTIL OWNER AUTHORIZES
**Date:** 2026-10-23

> ⚠️ **THIS RUNBOOK IS NOT YET AUTHORIZED FOR EXECUTION.**
> Owner must explicitly say "execute staging dry-run" before any command in this runbook is run.
> Until then, this document is a PREPARATION artifact only.

---

## 1. Prerequisites + Verified Staging Environment Identity

Before executing the staging dry-run, verify ALL of the following:

### 1.1 Code prerequisites
- [ ] `main` branch HEAD matches `4f7a2d747777659290237b6fdb387269438141fc` (or a later approved commit)
- [ ] STEP 15.68 preflight hardening is merged to `main` (or the working branch is checked out)
- [ ] `scripts/rbac-backfill-dryrun.ts` includes the `preflightConnectionCheck()` call
- [ ] `scripts/rbac-create-readonly-role.sql` is available on the runner

### 1.2 Environment identity (must be verified by operator)
- [ ] **Staging database host**: known and reachable from the runner
- [ ] **Staging database name**: known (e.g., `heavix_staging`)
- [ ] **Staging database port**: known (e.g., `5432`)
- [ ] **Maintenance DB URL** (`E5_MAINTENANCE_DB_URL`): a superuser-equivalent connection to the staging PostgreSQL instance, used ONLY for creating the `heavix_dryrun_ro` role. This is NOT used by the dry-run script itself.
- [ ] **Read-only role password** (`DRYUN_RO_PW`): generated fresh per run via `openssl rand -hex 16`. NEVER hard-coded. NEVER printed. NEVER logged.
- [ ] **No live staging traffic**: staging app should be quiesced or in a maintenance window to avoid concurrent mutations triggering false `readOnlyInvariant=false` (F-15.68-06).

### 1.3 Fail conditions — DO NOT PROCEED if any is true
- ❌ `DATABASE_URL` points to a dev or production database
- ❌ `DRYRUN_CONFIRM_TARGET` does not match the db name in `DATABASE_URL`
- ❌ Staging has live traffic (will cause false `readOnlyInvariant=false`)
- ❌ `heavix_dryrun_ro` role does not exist or was not created with the expected privileges
- ❌ `DRYRUN_RO_PW` is missing, empty, or hard-coded
- ❌ Owner has not explicitly authorized staging dry-run execution

---

## 2. Secure Secret Provisioning (no value logging)

### 2.1 Generate the read-only role password
```bash
DRYUN_RO_PW=$(openssl rand -hex 16)
# Export to the runner environment — do NOT echo, print, or log this value.
export DRYUN_RO_PW
```

### 2.2 Set the connection strings (sanitized — operator fills in real values)
```bash
# Maintenance DB URL — used ONLY for role creation (superuser)
export E5_MAINTENANCE_DB_URL="postgresql://<admin_user>:<admin_pw>@<staging_host>:<staging_port>/<maintenance_db>?schema=public"

# Dry-run DATABASE_URL — uses the read-only role
export DATABASE_URL="postgresql://heavix_dryrun_ro:${DRYUN_RO_PW}@<staging_host>:<staging_port>/<staging_db>?schema=public"

# Two-key confirmation — must match the db name in DATABASE_URL
export DRYRUN_CONFIRM_TARGET="<staging_db>"

# Expected role name (defaults to heavix_dryrun_ro if unset)
export DRYRUN_EXPECTED_ROLE="heavix_dryrun_ro"
```

### 2.3 Verification — DO NOT print values
```bash
# Verify the variables are set (without printing values)
[ -n "$DRYUN_RO_PW" ] && echo "DRYUN_RO_PW is set (length: ${#DRYUN_RO_PW})" || echo "DRYUN_RO_PW is MISSING"
[ -n "$DATABASE_URL" ] && echo "DATABASE_URL is set" || echo "DATABASE_URL is MISSING"
[ -n "$DRYRUN_CONFIRM_TARGET" ] && echo "DRYRUN_CONFIRM_TARGET is set" || echo "DRYRUN_CONFIRM_TARGET is MISSING"
```

---

## 3. Database Identity + Effective Role Verification (before dry-run)

### 3.1 Create the read-only role on staging (via maintenance URL)
```bash
PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" \
  -v dryrun_password="$DRYUN_RO_PW" \
  -f scripts/rbac-create-readonly-role.sql
```

### 3.2 Verify the role exists + is not superuser
```bash
PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" -t -A -c \
  "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='heavix_dryrun_ro'"
# Expected output: f|f|f
```

### 3.3 Verify the role has SELECT only on the 5 RBAC tables
```bash
PGPASSWORD="$DRYUN_RO_PW" psql "$DATABASE_URL" -t -A -c \
  "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
   WHERE grantee='heavix_dryrun_ro'
   AND table_name IN ('User','UserRole','Role','Permission','RolePermission')
   ORDER BY table_name, privilege_type"
# Expected: only SELECT rows, no INSERT/UPDATE/DELETE/TRUNCATE
```

### 3.4 Verify effective privileges via `has_table_privilege()`
```bash
PGPASSWORD="$DRYUN_RO_PW" psql "$DATABASE_URL" -t -A -c \
  "SELECT table_name,
          has_table_privilege('heavix_dryrun_ro', table_name, 'SELECT') AS can_select,
          has_table_privilege('heavix_dryrun_ro', table_name, 'INSERT') AS can_insert,
          has_table_privilege('heavix_dryrun_ro', table_name, 'UPDATE') AS can_update,
          has_table_privilege('heavix_dryrun_ro', table_name, 'DELETE') AS can_delete
   FROM (VALUES ('User'),('UserRole'),('Role'),('Permission'),('RolePermission')) AS t(table_name)"
# Expected: can_select=t, can_insert=f, can_update=f, can_delete=f for ALL 5 tables
```

### 3.5 Verify role has no memberships (no inherited privileges)
```bash
PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" -t -A -c \
  "SELECT count(*) FROM pg_auth_members m
   JOIN pg_roles r ON m.roleid = r.oid
   WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname='heavix_dryrun_ro')"
# Expected: 0
```

---

## 4. Exact Execution Command + Exit Code Check

### 4.1 Run the dry-run
```bash
DATABASE_URL="$DATABASE_URL" \
DRYRUN_CONFIRM_TARGET="$DRYRUN_CONFIRM_TARGET" \
DRYRUN_EXPECTED_ROLE="$DRYRUN_EXPECTED_ROLE" \
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee staging-dryrun-$(date +%Y%m%d-%H%M%S).log
```

### 4.2 Exit code interpretation
- `0` — dry-run completed successfully. CI gates on `DRYRUN_GATE:` line, NOT on exit code.
- `2` — unrecoverable error (DB connection failure, incomplete catalog, preflight failure). Investigate before retrying.

### 4.3 Expected output markers (verify in the log)
- `── STEP 15.68 Preflight ─────────────────────────────────────`
- `  Target confirmation     : PASS ✅`
- `  Role verification       : PASS ✅`
- `  READ-ONLY INVARIANT: PASS`
- `DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,...}`

---

## 5. Report Storage + PII Redaction

### 5.1 Storage location
- Store the dry-run log in a secure, access-controlled location (e.g., `docs/verification/staging-dryrun-<date>.log` on the staging runner, NOT in the git repo unless reviewed for PII).

### 5.2 PII review before committing
- The dry-run samples include `userId` (UUID), `legacyRole` (User.role value), `canonicalKey` (Role.key), `userRoleKeys` (Role.key list).
- ✅ None of these are direct PII (no email, name, phone).
- ⚠️ If `User.role` column ever contained a sensitive value (misconfigured), it would be printed in samples. Review the log for email/phone patterns before committing:
  ```bash
  grep -E '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' staging-dryrun-*.log
  # If any matches → REDACT before committing
  ```

### 5.3 Cleanup
- After review, remove the raw log from the runner if it contains any sensitive values.
- The `DRYUN_RO_PW` is ephemeral (generated per run) — no cleanup needed beyond closing the shell.

---

## 6. OK/MISSING/MISMATCH/MULTI_ROLE/INVALID Counts

The dry-run output includes a `── Classification ───` section with counts:
- `OK` — single matching UserRole row. No action needed.
- `MISSING` — zero UserRole rows. Backfill would create one. **Safe to backfill.**
- `MISMATCH` — UserRole rows exist but none match the mapped legacy role. **DO NOT auto-correct.** Investigate manually.
- `MULTI_ROLE` — canonical role present + extra UserRole rows. **Informational.** Backfill is a no-op. Gate conservatively blocks until owner accepts risk.
- `INVALID` — `User.role` value not in catalog. **DO NOT auto-correct.** Manual review required.

### 6.1 Gate decision
- `gatePasses=true` iff `INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0`
- If `gatePasses=false`, the staging dry-run REVEALS issues that must be resolved before any backfill.

---

## 7. Stop Criteria + Escalation for Ambiguous Cases

### 7.1 Stop immediately if:
- `readOnlyInvariant=false` — the dry-run mutated the database (FATAL — investigate the script or role privileges).
- `gatePasses=false` — there are MISMATCH/MULTI_ROLE/INVALID cases requiring manual review.
- Preflight FAIL — connection target or role verification failed.
- Exit code 2 — unrecoverable error.

### 7.2 Escalation path for ambiguous cases
- For each `MISMATCH` sample: investigate the user's history (was the role changed manually? was there a bug in dual-write?).
- For each `MULTI_ROLE` sample: verify the extra UserRole rows are legitimate (e.g., ADMIN+MODERATOR is valid).
- For each `INVALID` sample: determine if the `User.role` value is a legacy alias that should be added to `LEGACY_ALIAS_MAP`, or a data corruption that must be fixed manually.
- DO NOT auto-correct any of these. Escalate to owner with the sample list.

---

## 8. Second-Run Verification on Fixed Data

### 8.1 Why run twice?
- The dry-run is a point-in-time snapshot. Running twice on a FIXED dataset (no concurrent mutations) should produce identical output.
- If output differs between run 1 and run 2 WITHOUT any data changes, there is a bug in the dry-run (non-deterministic ordering, time-dependent values, etc.).

### 8.2 How to verify
```bash
# Run 1
DATABASE_URL=... DRYRUN_CONFIRM_TARGET=... bunx tsx scripts/rbac-backfill-dryrun.ts > run1.log 2>&1
# Run 2 (immediately after, no data changes)
DATABASE_URL=... DRYRUN_CONFIRM_TARGET=... bunx tsx scripts/rbac-backfill-dryrun.ts > run2.log 2>&1
# Compare — the only expected difference is the `generatedAt` timestamp.
diff <(grep -v 'generatedAt\|Started' run1.log) <(grep -v 'generatedAt\|Started' run2.log)
# Expected: no differences (empty diff output)
```

---

## 9. Snapshot Limitations + Concurrent Changes + Resource Consumption

### 9.1 Snapshot limitations (F-15.68-04, F-15.68-05, F-15.68-09)
- The `readOnlyInvariant` proves no mutation to the **5 RBAC tables only** (User, UserRole, Role, Permission, RolePermission).
- It does NOT prove no mutation to other tables (e.g., AuditLog, sessions, other app data).
- For full proof, take a whole-DB row-count snapshot before/after:
  ```bash
  PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" -t -A -c \
    "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY schemaname, relname" > before-counts.txt
  # ... run dry-run ...
  PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" -t -A -c \
    "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY schemaname, relname" > after-counts.txt
  diff before-counts.txt after-counts.txt
  # Expected: no differences (empty diff)
  ```

### 9.2 Concurrent changes (F-15.68-06)
- The BEFORE/AFTER snapshots are NOT in a transaction. If staging has live traffic, `readOnlyInvariant` may be `false` due to concurrent app writes, NOT due to dry-run mutation.
- **Mitigation:** run the staging dry-run during a maintenance window or quiesce staging traffic.

### 9.3 Resource consumption (F-15.68-05)
- The fingerprint reads ALL rows from the 5 tables into memory. For a staging DB with millions of users, this may take minutes and consume significant memory.
- **Mitigation:** for large staging DBs, monitor memory usage during the dry-run. If OOM occurs, the fingerprint must be refactored to a streaming hash (separate PR — not in STEP 15.68 scope).

---

## 10. Independent Verification — Dry-Run Caused No Mutation

### 10.1 Primary verification (5-table fingerprint)
- The dry-run's own `readOnlyInvariant=true` output proves no mutation to the 5 RBAC tables.

### 10.2 Secondary verification (whole-DB row counts)
- Per Section 9.1, take before/after `pg_stat_user_tables` snapshots and diff them.

### 10.3 Tertiary verification (audit log)
- If staging has an audit log table, verify no new audit entries were created during the dry-run window (other than operator's own login actions).

---

## 11. Safe Shutdown on Wrong Target / Unexpected Privilege / Incomplete Data

### 11.1 Wrong target detected
- If the preflight `DRYRUN_CONFIRM_TARGET` check fails: the script exits 2 automatically. No DB query was executed.
- If the preflight role check fails (runtime role ≠ `heavix_dryrun_ro`): the script exits 2 automatically. No DB query beyond `SELECT current_user` was executed.

### 11.2 Unexpected privilege detected
- If `has_table_privilege()` (Section 3.4) shows any write privilege: STOP. Do not run the dry-run. Re-create the role with the correct `REVOKE` statements.

### 11.3 Incomplete data detected
- If the dry-run exits 2 with "RBAC catalog incomplete — missing Roles": the `Role` table is missing canonical entries. Run `bun run db:seed-rbac` against the staging DB (via maintenance URL) and retry.

### 11.4 Emergency shutdown (manual)
- If anything looks wrong during the dry-run (unexpected output, long pause, error spam): `Ctrl+C` the process.
- The dry-run is READ-ONLY — no rollback is needed. The only state change is the ephemeral `heavix_dryrun_ro` role, which can be dropped:
  ```bash
  PGPASSWORD=<admin_pw> psql "$E5_MAINTENANCE_DB_URL" -c "DROP ROLE IF EXISTS heavix_dryrun_ro;"
  ```

---

## Rollback Statement

**Rollback is NOT needed for the dry-run itself** — it is read-only by design (5-table fingerprint + classification queries). The only state change is the creation of the `heavix_dryrun_ro` role, which is ephemeral and can be dropped via `DROP ROLE IF EXISTS heavix_dryrun_ro;` after the dry-run completes.

**Evidence limitation:** the `readOnlyInvariant` proves no mutation to the 5 RBAC tables only. It does NOT prove no mutation to other tables. For full proof, use the whole-DB row-count snapshot in Section 9.1.

---

## Authorization Status

- **This runbook is NOT YET AUTHORIZED for execution.**
- Owner must explicitly say "execute staging dry-run" before any command in Section 4 is run.
- Until then, this document is a PREPARATION artifact only.
- **PRODUCTION: NO-GO ❌** — staging dry-run is preparation only; no backfill, cutover, or deployment is authorized.
