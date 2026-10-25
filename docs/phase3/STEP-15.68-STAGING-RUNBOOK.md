# HEAVIX — STEP 15.68 Staging Runbook (PREPARATION ONLY — DO NOT EXECUTE)

**Status:** PREPARATION ONLY — NOT YET AUTHORIZED FOR EXECUTION
**Date:** 2026-10-23
**Merge baseline:** `4f7a2d747777659290237b6fdb387269438141fc`

## CI Evidence Boundary (STEP 15.95)

The CI `tls-proof` job provisions a disposable local PostgreSQL 17 cluster with TLS, creates a separate `heavix_preflight_test` database, pushes the Prisma schema, seeds the RBAC catalog, grants the read-only role, and executes `scripts/rbac-gate-ci.ts` against that database. The generic `postgres:17` service in the `verify` job remains non-TLS and does not execute this gate.

This is **CI-only validation**. It is not a staging dry-run, does not inspect staging data, does not authorize backfill, and does not authorize Phase D/E or production deployment. The staging checklist and owner authorization requirements below remain unchanged.

---

## 1. Prerequisites

- [ ] Owner has explicitly authorized staging dry-run execution
- [ ] Staging PostgreSQL 17 database is accessible
- [ ] Staging database has RBAC tables (User, UserRole, Role, Permission, RolePermission)
- [ ] `DATABASE_URL` env var points to staging database (NOT production, NOT dev)
- [ ] Prisma client generated (`bunx prisma generate --schema=prisma/schema.prisma`)

## 2. Secret Handling

- `DATABASE_URL` must be set in the environment, NOT in a file
- Do NOT print `DATABASE_URL` value in any log or report
- If using a `.env` file, ensure it's in `.gitignore` and deleted after execution
- The dry-run script uses `import { db } from "@/lib/db"` which reads `DATABASE_URL` from env
- The script does NOT set or override `DATABASE_URL` — it relies on the singleton

## 3. Pre-Execution Identity Verification

Before running the dry-run, verify:

```bash
# Verify DATABASE_URL does NOT contain "production" or "prod"
echo "$DATABASE_URL" | grep -qiE "prod|staging|live|main" && echo "WARNING: Check DB name"
# Do NOT print the full URL — just check the database name
echo "$DATABASE_URL" | sed 's/.*\/\([^?]*\).*/\1/'
```

The database name should be a staging name (e.g., `heavix_staging`), NOT `heavix` or `heavix_production`.

## 4. Execution Command

```bash
# Run the dry-run script
bunx tsx scripts/rbac-backfill-dryrun.ts

# Check exit code
echo "Exit code: $?"
# Exit 0 = success (dry-run completed, gate output produced)
# Exit 2 = unrecoverable error (DB connection failure, missing Role catalog)
```

## 5. Output Storage and PII Redaction

- The script prints to stdout — capture it:
```bash
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee /tmp/dryrun-staging-$(date +%Y%m%d_%H%M%S).log
```

- PII check: the script selects ONLY `id` and `role` from User table. It does NOT select `email`, `mobile`, `firstName`, `lastName`, or `passwordHash`. Sample output contains only `userId` and `legacyRole` — no PII.

- After execution, verify no PII in the log:
```bash
grep -iE 'email|mobile|phone|password|firstName|lastName' /tmp/dryrun-staging-*.log
# Should return empty
```

## 6. Classification Counts

The output will show:
- `OK`: Users with matching UserRole (no action needed)
- `MISSING`: Users with no UserRole rows (safe to backfill)
- `MISMATCH`: Users where UserRole exists but doesn't match legacy role (DO NOT auto-correct)
- `MULTI_ROLE`: Users with canonical role + extra roles (investigate)
- `INVALID`: Users with unrecognized legacy role (manual review)

## 7. Stop Criteria

STOP and do NOT proceed to backfill if:
- `INVALID > 0` — unrecognized roles need manual investigation
- `MISMATCH > 0` — ambiguous role assignments need human decision
- `MULTI_ROLE > 0` — extra roles need investigation
- `gatePasses=false` — Phase C backfill is NOT safe
- `readOnlyInvariant=false` — database was mutated during dry-run (should never happen)
- Any error during execution (exit code ≠ 0)

## 8. Second-Run Verification (Idempotency)

Run the dry-run twice on the same data:
```bash
# First run
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee /tmp/dryrun-1.log
# Second run
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee /tmp/dryrun-2.log
# Compare classification counts (should be identical)
diff <(grep "OK\|MISSING\|MISMATCH\|MULTI_ROLE\|INVALID" /tmp/dryrun-1.log) \
     <(grep "OK\|MISSING\|MISMATCH\|MULTI_ROLE\|INVALID" /tmp/dryrun-2.log)
```

Note: The `generatedAt` timestamp will differ — that's expected. Classification counts must be identical if no data changed between runs.

## 9. Snapshot Limitations and Concurrent Changes

**KNOWN LIMITATION:** The fingerprint reads ALL rows from ALL 5 RBAC tables into memory via `findMany()` with no pagination. This has implications:

- **Memory**: For 10K+ users, each `findMany` loads all rows. Memory usage ≈ (user_count × ~50 bytes) + (userRole_count × ~40 bytes) + smaller tables. For 100K users, this is ~5MB — manageable. For 1M+ users, consider pagination.
- **Concurrent changes**: If another process modifies RBAC data between BEFORE and AFTER snapshots, `readOnlyInvariant=false` will be triggered. This is by design — it detects mutations. However, in a staging environment with active traffic, this could cause false positives.
- **Transaction isolation**: The dry-run does NOT wrap its reads in a transaction. If strict snapshot consistency is needed, the script should be modified to use `db.$transaction(async (tx) => { ... })` for all reads. This is an open design question.

## 10. Post-Execution Verification

After the dry-run completes:
```bash
# Verify exit code was 0
echo "Exit code: $?"

# Verify DRYRUN_GATE output exists
grep "DRYRUN_GATE:" /tmp/dryrun-staging-*.log

# Verify gatePasses=true (if all counts are 0 except OK and MISSING)
# If gatePasses=false, DO NOT proceed to backfill

# Verify readOnlyInvariant=true (no mutation occurred)
grep "READ-ONLY INVARIANT: PASS" /tmp/dryrun-staging-*.log
```

## 11. Emergency Stop Procedure

If the dry-run connects to the wrong database:
1. The script will still be read-only (no write methods) — no data corruption
2. Kill the process: `Ctrl+C` or `kill <pid>`
3. Check what database was accessed (from the log output's `current_database()` query)
4. If production was accidentally accessed, notify the owner immediately
5. No rollback needed — the dry-run does not modify data

## Rollback

**Rollback is NOT needed.** The dry-run script is strictly read-only:
- It uses only `db.user.count()`, `db.user.findMany()`, `db.user.groupBy()`, `db.userRole.count()`, `db.userRole.findMany()`, `db.role.findMany()`, `db.permission.findMany()`, `db.rolePermission.findMany()`
- It does NOT call any write methods (create, update, delete, upsert, deleteMany, $executeRaw)
- The read-only role `heavix_dryrun_ro` (if created on staging) further enforces this at the PostgreSQL level

**Limitation of this evidence:** The absence of write methods in source code is verified by grep and unit tests, but does not constitute a proof that no mutation is possible through indirect means (e.g., Prisma client bugs, PostgreSQL triggers, etc.). The before/after snapshot provides runtime evidence of no mutation, but only for the specific run.
