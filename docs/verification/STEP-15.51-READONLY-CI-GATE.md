# STEP 15.51 — Read-Only Role in CI Gate, Effective Privileges, Credential Handling

**Date:** 2026-10-22
**PR:** #75
**HEAD at time of step:** `7f1813235b4b646cedc7df2d6c93d8cc2c8999ef`
**CI run:** #39800403053 (3/3 SUCCESS)

## What was done

### CR-15.51-01: CI gate uses read-only role
- `.github/workflows/ci.yml`: Phase C dry-run step uses `DATABASE_URL` with `heavix_dryrun_ro` role
- CI gate now connects via the read-only role, NOT the superuser

### CR-15.51-02: Isolated read-only dry-run test
- Test now REQUIRES: exit code 0, valid DRYRUN_GATE, gatePasses=true, readOnlyInvariant=true
- No longer accepts exit 2 or missing gate output

### CR-15.51-03: Effective privilege audit
- Tests query `pg_roles` (rolsuper=f, rolcreaterole=f, rolcreatedb=f)
- Tests query `pg_auth_members` (0 memberships — no inherited privileges)
- Tests query `information_schema.role_table_grants` (SELECT only)
- INSERT, UPDATE, DELETE, TRUNCATE all denied

### CR-15.51-04: Credential handling
- Password via psql variable (`-v dryrun_password=...`)
- SQL uses `:'dryrun_password'` (psql variable substitution)
- CI generates random password via `openssl rand -hex 16`
- No hard-coded password in SQL or workflow

## CI evidence
- `tests/integration/rbac-readonly-role-real.test.ts` (14 tests) — ALL PASS
  - `✓ Dry-run exits 0 with valid gate under read-only role` (521ms)
  - `permission denied for table User` (INSERT/UPDATE/DELETE blocked)
- `DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":1,...}`
- `CI DECISION: PASS`

## Limitations
- Gate step ran AFTER integration tests (fixed in STEP 15.52)
- Static password fallback still existed in test code (fixed in STEP 15.52)
