# STEP 15.68 — Phase C Backfill Staging Runbook

**Status:** PREPARATION ONLY — no staging execution in this step.
**Task ID:** STEP-15.68
**Branch:** `chore/step-15-68-phase-c-preflight`
**Base SHA:** `4f7a2d747777659290237b6fdb387269438141fc` (main, post-PR #75 merge)
**Companion documents:**
- `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md` — backfill design (apply mode)
- `docs/verification/STEP-15.68-PREFLIGHT-REPORT.md` — full audit findings
- `docs/phase3/RBAC-MIGRATION-DESIGN.md` §4 — original Phase C design
- `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md` — addendum

---

## 0. Purpose

This runbook describes how to execute the Phase C RBAC backfill **dry-run**
(`scripts/rbac-backfill-dryrun.ts`) against a staging database, how to
interpret its output, and how to decide whether to proceed to the apply
phase. It is a **preparation document** — no staging execution is performed
in STEP 15.68.

The dry-run is **strictly read-only**. It does not INSERT, UPDATE, DELETE,
TRUNCATE, or write to any table (verified by static source inspection in
`tests/unit/rbac-dryrun-preflight.test.ts` and by the BEFORE/AFTER
fingerprint comparison emitted by the script itself).

The apply phase (the actual backfill that creates missing `UserRole` rows)
is **out of scope** for this runbook and is described separately in
`docs/phase3/STEP-15.68-BACKFILL-DESIGN.md`.

---

## 1. Prerequisites

### 1.1 Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **YES** | Prisma connection string. Must point at the staging DB using the read-only role `heavix_dryrun_ro` (see §1.2). Example: `postgresql://heavix_dryrun_ro:<PW>@staging-host:5432/heavix_staging?schema=public`. |
| `DRYUN_RO_PW` | **YES** (only when creating the RO role) | Password for the `heavix_dryrun_ro` PostgreSQL role. Used by `scripts/rbac-create-readonly-role.sql` via the `psql -v dryrun_password="$DRYUN_RO_PW"` substitution. |
| `ADMIN_USERNAME` | NO (apply phase only) | Required by `prisma/seed-user-roles.ts`. Not needed for the dry-run. |
| `ADMIN_PASSWORD` | NO (apply phase only) | Required by `prisma/seed-user-roles.ts`. Not needed for the dry-run. |
| `NODE_ENV` | optional | If set to `production`, the `db.ts` singleton skips the `globalThis` cache. Does not affect the dry-run's read-only behavior. |

**Hard rule:** `DATABASE_URL` MUST point at a staging or test database, NEVER
at production. The pre-execution identity verification (§3) is the
defense-in-depth check that enforces this.

### 1.2 Database role

The dry-run MUST connect as the `heavix_dryrun_ro` PostgreSQL role created by
`scripts/rbac-create-readonly-role.sql`. That role has:

- `CONNECT` on the database.
- `USAGE` (NOT `CREATE`) on schema `public`.
- `SELECT` on all tables in `public` (existing + future, via
  `ALTER DEFAULT PRIVILEGES`).
- `SELECT` on all sequences.
- Explicit `REVOKE` of `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`
  on all tables.
- No role memberships (no inherited privileges).
- Not a superuser, cannot `CREATEROLE`, cannot `CREATEDB`.

Source: `scripts/rbac-create-readonly-role.sql:1-40`. Verified by integration
tests in `tests/integration/rbac-readonly-role-real.test.ts` (lines 53-228)
under the `RUN_TESTS` guard (DB present).

### 1.3 Network access

The staging PostgreSQL instance must be reachable from the host running the
dry-run. Typical setup:

- Staging DB is in a private subnet; access via bastion/jump host or
  VPN. The dry-run does NOT open SSH tunnels — operators must establish
  connectivity beforehand.
- Firewall: port 5432 (or the configured PG port) must allow inbound from
  the dry-run host's IP.
- TLS: prefer `sslmode=require` in the connection string. The dry-run does
  not enforce TLS, but staging should.

### 1.4 RBAC catalog preconditions

The staging DB MUST have the RBAC catalog seeded (Role rows for `ADMIN`,
`SELLER`, `BUYER`, `MODERATOR`, `SUPPORT`). The dry-run fails fast
(`scripts/rbac-backfill-dryrun.ts:180-188`) if any canonical Role is missing.

To seed the catalog (idempotent):
```bash
bun run db:seed-rbac
```

This uses `prisma/seed-rbac.ts` which upserts Roles, Permissions, and
RolePermission joins. It also grants `ADMIN` UserRole to existing legacy
admins (lines 197-215) — this is a WRITE operation and must be run with a
role that has INSERT on `UserRole`. The dry-run itself does NOT require
this; it only requires the Role catalog to exist.

### 1.5 Local tooling

- `bun` ≥ 1.3 (per `package.json` `devDependencies.bun-types`).
- `tsx` (via `bunx`, no separate install).
- `psql` (PostgreSQL client) — only needed if you must create the RO role
  manually; CI creates it via the workflow.

---

## 2. Secret handling

### 2.1 What counts as a secret

- The `DRYUN_RO_PW` value (the `heavix_dryrun_ro` role's password).
- The `DATABASE_URL` connection string (it embeds the password).
- Any production credentials that may exist in the operator's shell
  environment (the dry-run must NEVER use these).

### 2.2 How to set secrets securely

- **NEVER** hard-code passwords in the script, in environment files
  committed to git, or in CI workflow YAML.
- **DO** set them in the shell session immediately before running the
  dry-run, and `unset` them afterwards:
  ```bash
  # Generate a strong random password (do not reuse the CI password).
  export DRYUN_RO_PW="$(openssl rand -hex 16)"
  export DATABASE_URL="postgresql://heavix_dryrun_ro:${DRYUN_RO_PW}@staging-host:5432/heavix_staging?schema=public"

  # Run the dry-run (see §4).
  bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee dryrun-staging-$(date -u +%Y%m%dT%H%M%SZ).log

  # Clean up.
  unset DRYUN_RO_PW DATABASE_URL
  ```
- **In CI**, the password is generated per-run with `openssl rand -hex 16`
  (see `.github/workflows/ci.yml:69`) and stored in `$GITHUB_ENV` for the
  duration of the job. It is never printed.
- **NEVER** `echo "$DRYUN_RO_PW"` or `echo "$DATABASE_URL"`.
- **NEVER** redirect `set -x` output to a file (it would print the
  password).
- The dry-run script itself does NOT print `DATABASE_URL` or any password.
  It does print `current_user` and `current_database()` if you implement
  the preflight check (see §3) — these are not secrets, but the database
  name may be sensitive in some environments; mask it if needed.

### 2.3 If a secret is leaked

- Rotate the `heavix_dryrun_ro` password immediately:
  ```bash
  psql -h staging-host -U postgres -d heavix_staging \
    -v dryrun_password="$(openssl rand -hex 16)" \
    -f scripts/rbac-create-readonly-role.sql
  ```
  (The SQL script drops and recreates the role, so this also revokes the
  old password.)
- Audit access logs for any unauthorized use of the leaked credential.
- If the leak was via a committed file, force-push to remove the commit
  AND assume the credential was compromised (rotation is mandatory
  regardless of push).

---

## 3. Pre-execution identity verification

### 3.1 Why this matters

The dry-run script (`scripts/rbac-backfill-dryrun.ts:62`) imports `db` from
`@/lib/db`, which creates a `PrismaClient` using whatever `DATABASE_URL` is
in the environment. **There is no fallback** — Prisma throws if
`DATABASE_URL` is unset. But if `DATABASE_URL` is set to a dev or prod DB,
the dry-run WILL connect to it. The read-only role mitigates writes, but
the dry-run would still read from the wrong DB and produce misleading
output.

### 3.2 Manual verification procedure

Before running the dry-run, manually verify the connection target:

```bash
# 1. Confirm DATABASE_URL is set and points at staging (NOT prod).
#    Do NOT print the full URL — it contains the password.
echo "DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's#.*@([^/]+).*#\1#')"
echo "DATABASE_URL db  : $(echo "$DATABASE_URL" | sed -E 's#.*/([^?]+).*#\1#')"

# Expected output (example):
#   DATABASE_URL host: staging-host:5432
#   DATABASE_URL db  : heavix_staging

# 2. Verify the role exists and is not a superuser.
psql -h staging-host -U postgres -d heavix_staging -t -A -c \
  "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='heavix_dryrun_ro'"
# Expected: f|f|f

# 3. Verify the role has SELECT only (no writes) on the User table.
psql -h staging-host -U postgres -d heavix_staging -t -A -c \
  "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='User' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type"
# Expected: SELECT  (and nothing else)

# 4. Verify the role can connect and read one row.
PGPASSWORD="$DRYUN_RO_PW" psql -h staging-host -U heavix_dryrun_ro -d heavix_staging -t -A -c \
  "SELECT current_user, current_database(), count(*) FROM \"User\""
# Expected: heavix_dryrun_ro|heavix_staging|<row_count>
```

If ANY of these checks fails, **STOP**. Do not run the dry-run until the
role and database are correctly configured.

### 3.3 Recommended automated preflight (NOT yet implemented)

**Design (for future implementation in STEP 15.69+):** Add a preflight
function at the top of `main()` in `scripts/rbac-backfill-dryrun.ts` that
runs BEFORE any table query:

```typescript
async function preflightCheck(): Promise<void> {
  // 1. Verify DATABASE_URL is set.
  if (!process.env.DATABASE_URL) {
    console.error('✗ FATAL: DATABASE_URL not set.');
    process.exit(2);
  }
  // 2. Verify the connection identity via a read-only $queryRaw.
  const rows = await db.$queryRaw<
    Array<{ current_user: string; current_database: string }>
  >`SELECT current_user, current_database()`;
  const { current_user, current_database } = rows[0];
  const ALLOWED_USERS = ['heavix_dryrun_ro'];
  const ALLOWED_DB_PATTERNS = [/heavix_test/, /heavix_staging/, /^heavix_dryrun/];
  if (!ALLOWED_USERS.includes(current_user)) {
    console.error(`✗ FATAL: DB user "${current_user}" not in allow-list.`);
    await db.$disconnect();
    process.exit(2);
  }
  if (!ALLOWED_DB_PATTERNS.some((p) => p.test(current_database))) {
    console.error(`✗ FATAL: DB "${current_database}" not in allow-list.`);
    await db.$disconnect();
    process.exit(2);
  }
  console.log(`  ✓ Preflight: user=${current_user}, db=${current_database}`);
}
```

**Why not implemented in STEP 15.68:** Adding the check changes the
script's runtime behavior and could break CI if the allow-lists are too
strict. STEP 15.68 is preparation-only; implementing the preflight is
deferred to a follow-up step where it can be tested against CI in
isolation.

**Mitigation in the meantime:** The manual procedure in §3.2 provides the
same guarantees, executed by the operator.

---

## 4. Execution command + exit code check

### 4.1 Command

```bash
# From the repo root, with DATABASE_URL + DRYUN_RO_PW exported (see §2.2):
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee dryrun-staging-$(date -u +%Y%m%dT%H%M%SZ).log
echo "EXIT_CODE=$?"
```

### 4.2 Exit codes

| Code | Meaning | Action |
|---|---|---|
| `0` | Dry-run completed successfully. The script produced a JSON report + `DRYRUN_GATE:` line. **The exit code does NOT indicate whether the gate passed** — CI gates on `verdict.gatePasses` in the JSON, not on the exit code. | Inspect §6 classification counts and the `DRYRUN_GATE:` line. Decide whether to proceed to apply (see §7). |
| `2` | Unrecoverable error: DB connection failure, missing Role catalog rows, OR read-only invariant violated (the script detected a mutation). | Do NOT proceed to apply. Inspect the log for the error message. If `READ-ONLY INVARIANT: FAIL`, investigate what mutated the DB (see §9). |
| Other | Should not occur. If it does, treat as a script bug. | Capture the full log and report. |

### 4.3 CI gate command (for reference — NOT for staging)

CI runs a wrapper that parses the `DRYRUN_GATE:` line and exits 0/1 based
on the gate decision (see `scripts/rbac-gate-ci.ts`). For staging, run the
dry-run directly (§4.1) and inspect the output manually — do NOT use the
CI wrapper, because the CI wrapper exits 1 on `gatePasses=false`, which
would mask the diagnostic output you need to triage staging data.

---

## 5. Output storage and PII redaction

### 5.1 What the dry-run emits

The script writes to stdout (human-readable report + JSON) and stderr
(error messages). The `tee` in §4.1 captures both into a timestamped log
file.

### 5.2 PII content audit

The dry-run's output is **PII-free**. Verified by static source inspection
in `tests/unit/rbac-dryrun-preflight.test.ts` (PII test group):

- Sample structures (`SampleMissing`, `SampleMismatch`, `SampleMultiRole`,
  `SampleInvalid` in `scripts/rbac-backfill-dryrun.ts:107-122`) contain
  ONLY: `userId`, `legacyRole`, `canonicalKey`, `userRoleKeys`.
- `findMany` select clauses (lines 241-245, 321-330, 519-525) select
  ONLY: `id`, `role`, `userId`, `roleId`, `key`, `permissionId`.
- The fingerprint (lines 247-253, 526-532) hashes ONLY: `id:role`,
  `userId:roleId`, `id:key`, `roleId:permissionId`.
- **NO** `email`, `mobile`, `phone`, `passwordHash`, `firstName`,
  `lastName`, or `companyName` appears in any sample, select, or
  fingerprint.

`userId` is a cuid (pseudonymous identifier). Under GDPR/CCPA, cuids are
generally not considered direct PII but may be "pseudonymized personal
data" depending on context. Treat the log file as confidential anyway.

### 5.3 Log storage

- Store the log file in a restricted-access location (e.g., an S3 bucket
  with KMS encryption, or a secrets manager's "notes" field).
- Retain for at least 90 days for audit traceability.
- **NEVER** commit the log file to git (it may contain `userId`s that
  could be cross-referenced with production data).
- **NEVER** paste the log into a public channel (Slack, GitHub issue,
  email) without redacting `userId`s if the staging DB mirrors production
  data.

### 5.4 If PII is unexpectedly present

If you observe `email`, `mobile`, `phone`, or `passwordHash` in the
dry-run output, **STOP immediately**. This means either:
1. The script has been modified to select PII (regression — run the
   preflight unit tests to verify).
2. The log file was contaminated by another process.

In either case, treat the log as a PII leak: quarantine the file, rotate
any credentials that may have been exposed, and open an incident.

---

## 6. Classification counts

The dry-run classifies every `User` row into exactly one of five buckets.
The counts appear in the JSON report under `classification` and in the
human-readable summary under `── Classification ───`.

| Class | Definition | Backfill action | Gate effect |
|---|---|---|---|
| `OK` | User has exactly one `UserRole` row matching the mapped legacy role. | No-op. | Neutral (does not block). |
| `MISSING` | User has zero `UserRole` rows. The mapped legacy role would be created by the backfill. | Backfill creates the `UserRole` row. | Does NOT block the gate (MISSING is the backfill's target). |
| `MISMATCH` | User has `UserRole` rows but NONE match the mapped legacy role. Ambiguous — was the user demoted or promoted? | **DO NOT auto-correct.** Flag for manual investigation. | **BLOCKS** the gate (`gatePasses=false`). |
| `MULTI_ROLE` | User's mapped legacy role IS present AND there are extra `UserRole` rows (legitimate combo, e.g. ADMIN+MODERATOR). | No-op (backfill is idempotent — the canonical row already exists). | **BLOCKS** the gate (`gatePasses=false`). This is conservative — the owner may approve an override in a future step. |
| `INVALID` | `User.role` is not a recognized key or alias (e.g. `'GOD'`, `'ROOT'`, `'superuser'`). | **DO NOT auto-correct.** Flag for manual review. | **BLOCKS** the gate (`gatePasses=false`). |

Source: `scripts/rbac-backfill-dryrun.ts:13-24` (header docstring) and
`scripts/rbac-backfill-dryrun.ts:334-396` (classification logic).

### 6.1 Owner directive

> «نقش‌های مبهم را خودکار اصلاح نکن.»
> (Do not auto-correct ambiguous roles.)

The dry-run does NOT auto-correct `MISMATCH`, `MULTI_ROLE`, or `INVALID`
records. The apply phase (see `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md`)
also does NOT auto-correct them. They are flagged for manual review.

### 6.2 Verdict block

The JSON report's `verdict` object summarizes the counts:

```json
"verdict": {
  "safeToBackfillCount": <MISSING count>,
  "needsInvestigationCount": <MISMATCH + MULTI_ROLE>,
  "invalidCount": <INVALID count>,
  "gatePasses": <true iff INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0>,
  "ownerDirective": "نقش‌های مبهم را خودکار اصلاح نکن."
}
```

The `DRYRUN_GATE:` line (single-line, machine-parseable) carries the same
information plus `okCount`, `readOnlyInvariant`, and `total`:

```
DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":1234,"safeToBackfillCount":56,"mismatchCount":0,"multiRoleCount":0,"invalidCount":0,"total":1290}
```

---

## 7. Stop criteria

### 7.1 When to STOP and NOT proceed to apply

Stop and investigate if ANY of the following are true:

1. **Exit code ≠ 0** (the dry-run itself crashed).
2. **`readOnlyInvariant=false`** — the script detected a DB mutation
   between BEFORE and AFTER snapshots. This is a HARD STOP. Either the
   script has a write bug, or another process mutated the DB during the
   dry-run window.
3. **`gatePasses=false`** — at least one of `INVALID`, `MISMATCH`, or
   `MULTI_ROLE` is nonzero. The backfill is NOT safe to apply
   automatically. Review the samples in the JSON report and triage each
   record manually.
4. **`total` ≠ (sum of all 5 classes)** — the gate validator
   (`validateGateOutput`) catches this and forces `gatePasses=false`. If
   you see `SUM_MISMATCH` in the gate output, the script has a counting
   bug.
5. **`DRYRUN_GATE:` line is missing** — the script crashed before
   emitting the final gate line. Inspect the log for the error.
6. **`DRYRUN_GATE:` line is malformed JSON** — the script emitted a
   corrupted line. Inspect the log for buffer truncation or concurrent
   writes to stdout.
7. **Preflight identity check fails (§3)** — wrong DB user or wrong
   database. Do not proceed until corrected.

### 7.2 When it is SAFE to proceed to apply

ALL of the following must be true:

1. Exit code = 0.
2. `readOnlyInvariant=true` (no mutation detected).
3. `gatePasses=true` (INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0).
4. `total` matches the sum of all 5 classes (validated by
   `validateGateOutput`).
5. The `MISSING` count (`safeToBackfillCount`) is the number of
   `UserRole` rows the apply phase will create. Confirm this matches
   expectations (e.g., staging was recently seeded, so most users should
   be MISSING).
6. The dry-run was run during a low-traffic window (see §9 for concurrent
   change limitations).

### 7.3 What "proceed to apply" means

Proceeding to apply means executing the actual backfill script
(`scripts/backfill-user-roles.ts`, NOT YET IMPLEMENTED as of STEP 15.68 —
see `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md`). The apply script will:

- Iterate users classified as `MISSING`.
- For each, `db.userRole.upsert({ where: { userId_roleId: ... },
  create: { userId, roleId }, update: {} })` — idempotent.
- NOT touch `OK`, `MISMATCH`, `MULTI_ROLE`, or `INVALID` users.
- Write an `AuditLog` entry per assignment (the dry-run does NOT write
  audit logs; the apply script does).

---

## 8. Second-run verification (idempotency)

### 8.1 Why run the dry-run twice

The dry-run is read-only, so running it twice should produce identical
output. This is the idempotency check: if the second run differs from
the first, something mutated the DB between runs (either the dry-run
itself has a hidden write, or external traffic is affecting the data).

### 8.2 Procedure

```bash
# First run.
bunx tsx scripts/rbac-backfill-dryrun.ts > dryrun-1.log 2>&1
cp dryrun-1.log dryrun-1-archived.log

# Second run (immediately after, same window, same DATABASE_URL).
bunx tsx scripts/rbac-backfill-dryrun.ts > dryrun-2.log 2>&1

# Compare the DRYRUN_GATE lines (ignore timestamps).
grep '^DRYRUN_GATE:' dryrun-1.log > gate-1.txt
grep '^DRYRUN_GATE:' dryrun-2.log > gate-2.txt
diff gate-1.txt gate-2.txt && echo "IDEMPOTENT ✓" || echo "DIFFERS ✗"
```

### 8.3 Expected result

- `gate-1.txt` and `gate-2.txt` should be **byte-identical** (modulo
  timestamps, which are NOT in the `DRYRUN_GATE:` line).
- If they differ, inspect the diff:
  - Different `okCount` / `safeToBackfillCount` / `mismatchCount` /
    `multiRoleCount` / `invalidCount` → data changed between runs.
  - Different `readOnlyInvariant` → one run detected a mutation, the
    other didn't. Investigate timing.
- If `readOnlyInvariant=false` in EITHER run, the dry-run window
  overlapped with a write transaction. Re-run during a quieter window.

### 8.4 Limitations

- The idempotency check only proves the dry-run is read-only across two
  consecutive runs. It does NOT prove the dry-run is read-only across a
  longer window (e.g., if a cron job runs every 5 minutes, two runs
  within 30 seconds may both miss the mutation).
- If staging has continuous write traffic (user registrations, logins
  that update `lastLoginAt`, etc.), the fingerprint WILL differ between
  runs. This is a false positive — the dry-run didn't mutate anything,
  but the data changed. See §9 for mitigations.

---

## 9. Snapshot limitations and concurrent changes

### 9.1 What the fingerprint captures

The BEFORE and AFTER fingerprints (lines 232-256, 512-532) capture:

- `User`: `id` + `role` (sorted by `id` asc).
- `UserRole`: `userId` + `roleId` (sorted by `userId`, `roleId`).
- `Role`: `id` + `key` (sorted by `id`).
- `Permission`: `id` + `key` (sorted by `id`).
- `RolePermission`: `roleId` + `permissionId` (sorted by `roleId`,
  `permissionId`).

Each is JSON-stringified into a single fingerprint string. The
`readOnlyInvariant` is `true` iff:
1. All 5 table counts match (BEFORE vs AFTER), AND
2. The fingerprint strings match exactly.

### 9.2 What the fingerprint does NOT capture

- `User` rows' non-`role` fields (`email`, `mobile`, `lastLoginAt`,
  `firstName`, etc.). A login that updates `lastLoginAt` does NOT trigger
  `readOnlyInvariant=false` (good — it's not RBAC-related).
- Other tables (`Session`, `AuditLog`, `Listing`, etc.). Traffic on
  those tables does NOT affect the fingerprint.
- Column reordering (PostgreSQL may return rows in different orders
  without `ORDER BY`; the script always uses `orderBy`, so this is not
  an issue).

### 9.3 Concurrent change risks

The dry-run does NOT use a transaction or `REPEATABLE READ` isolation
level. The BEFORE and AFTER snapshots are independent queries. If a
concurrent transaction mutates the DB between them:

- `readOnlyInvariant` will be `false` (false positive — the dry-run
  didn't mutate, but the data changed).
- `gatePasses` may still be `true` (if no `INVALID`/`MISMATCH`/
  `MULTI_ROLE` appeared), but the CI gate fails on
  `readOnlyInvariant=false` regardless.

### 9.4 Mitigations

1. **Run during a low-traffic window.** Staging should ideally have no
   active traffic during the dry-run. If staging mirrors production
   traffic, schedule the dry-run at off-peak hours.
2. **Pause write traffic.** If staging has any cron jobs or background
   workers that write to `User`, `UserRole`, `Role`, `Permission`, or
   `RolePermission`, pause them for the duration of the dry-run (typically
   < 1 minute for 10K users).
3. **Use a transaction with `REPEATABLE READ` isolation (future).** Wrap
   BEFORE + classification + AFTER in a single transaction with
   `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`. This holds a
   consistent MVCC snapshot. Trade-off: long-running transactions cause
   autovacuum bloat. Not implemented in STEP 15.68.
4. **Use `pg_export_snapshot()` (future).** Export the BEFORE snapshot
   via `pg_export_snapshot()` and re-import it for the AFTER queries via
   `SET TRANSACTION SNAPSHOT`. This lets BEFORE and AFTER share the same
   MVCC snapshot across connections. Not implemented in STEP 15.68.

### 9.5 Scale considerations

- The BEFORE and AFTER queries fetch ALL rows from `User`, `UserRole`,
  `Role`, `Permission`, `RolePermission` into Node memory and
  JSON-stringify them.
- For 10K users: ~500KB per table × 2 snapshots = ~5MB. Fine.
- For 100K users: ~5MB per table × 2 snapshots = ~50MB. Acceptable but
  watch Node heap.
- For 1M+ users: ~50MB per table × 2 snapshots = ~500MB. Risk of OOM.
  Use the streaming-hash or server-side `md5(string_agg(...))` approach
  described in `docs/verification/STEP-15.68-PREFLIGHT-REPORT.md` §D.

The per-user classification loop (lines 320-401) is paginated
(`BATCH_SIZE=1000`) and uses cursor pagination, so it does NOT load all
users into memory at once. Memory is bounded by `BATCH_SIZE`.

---

## 10. Post-execution verification (no mutation)

### 10.1 What to verify after the dry-run

After the dry-run completes (exit 0), verify that NO data was mutated:

1. **Check the script's own `readOnlyInvariant` output.** If
   `readOnlyInvariant=true`, the script's BEFORE/AFTER snapshots
   matched. This is the primary evidence.
2. **Re-run the dry-run and compare the DRYRUN_GATE lines (see §8).**
   If they're identical, the data is unchanged.
3. **(Optional) Query the DB directly:**
   ```bash
   PGPASSWORD="$DRYUN_RO_PW" psql -h staging-host -U heavix_dryrun_ro -d heavix_staging -t -A -c \
     "SELECT count(*) FROM \"User\"; SELECT count(*) FROM \"UserRole\"; SELECT count(*) FROM \"Role\";"
   ```
   Compare to the counts in the JSON report's `totals` block.

### 10.2 What NOT to verify

- Do NOT query production to compare counts. The dry-run should never
  affect production.
- Do NOT run `prisma migrate` or `prisma db push` after the dry-run.
  Those are schema changes, not data verification.

### 10.3 If mutation is detected

If `readOnlyInvariant=false` or the second-run check differs:

1. **STOP.** Do not proceed to apply.
2. **Quarantine the staging DB.** Prevent further writes if possible.
3. **Investigate the diff.** Which table changed? Which rows? The
   script's BEFORE and AFTER fingerprints include enough detail to
   identify the affected rows (by `id`).
4. **Determine the cause.** Was it the dry-run script (a bug) or
   external traffic? Check the dry-run's source for any write calls
   (the preflight unit tests assert there are none — re-run them to
   verify).
5. **Roll back if needed.** If the dry-run DID mutate (a regression),
  restore the staging DB from the most recent backup. The dry-run
  itself does NOT take a backup; operators must have one ready.

---

## 11. Emergency stop procedure

### 11.1 When to invoke

Invoke the emergency stop if:

- The dry-run is taking unexpectedly long (> 5 minutes for 10K users).
- The dry-run's output suggests it's writing to the DB (e.g.,
  `readOnlyInvariant=false` mid-run, or unexpected audit log entries).
- Staging is being affected by the dry-run in any way.
- A misconfiguration is discovered mid-run (wrong DB, wrong role).

### 11.2 Procedure

1. **Kill the dry-run process:**
   ```bash
   # Find the process.
   pkill -f "tsx scripts/rbac-backfill-dryrun.ts"
   # Or by PID if you have it.
   kill -TERM <PID>
   # If unresponsive:
   kill -9 <PID>
   ```
2. **Disconnect the Prisma client.** Killing the process should
   suffice; Prisma's connection pool is process-local. If you used a
   bastion or VPN, those connections may persist — close them manually.
3. **Verify the DB was not mutated.** Run the verification queries in
   §10.1.
4. **Quarantine the log file.** It may contain partial output that's
   useful for diagnosing the stop.
5. **File an incident.** Even if no mutation occurred, the emergency
   stop indicates a process or configuration issue. Document the
   timeline, the trigger, and the verification result.

### 11.3 What the dry-run does NOT do on kill

- It does NOT roll back any partial writes (because it doesn't write).
- It does NOT close DB connections gracefully (the OS closes them when
  the process exits; Prisma may log a warning, which is harmless).
- It does NOT emit a final `DRYRUN_GATE:` line (the gate will report
  "No DRYRUN_GATE output found" if you re-run via the CI wrapper — this
  is expected after a kill).

### 11.4 Recovery after emergency stop

1. Verify no mutation (§10.1).
2. Identify and fix the root cause (misconfiguration, network issue,
   script bug).
3. Re-run the dry-run from scratch (it's idempotent — see §8).
4. If the dry-run cannot be re-run successfully, escalate to the
   HEAVIX on-call engineer.

---

## Appendix A: Quick reference

```bash
# 1. Set secrets (NEVER commit these).
export DRYUN_RO_PW="$(openssl rand -hex 16)"
export DATABASE_URL="postgresql://heavix_dryrun_ro:${DRYUN_RO_PW}@staging-host:5432/heavix_staging?schema=public"

# 2. (Once) Create the read-only role on staging.
psql -h staging-host -U postgres -d heavix_staging \
  -v dryrun_password="$DRYUN_RO_PW" \
  -f scripts/rbac-create-readonly-role.sql

# 3. Verify identity (§3.2).
echo "DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's#.*@([^/]+).*#\1#')"
psql -h staging-host -U postgres -d heavix_staging -t -A -c \
  "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='heavix_dryrun_ro'"
# Expected: f|f|f

# 4. Run the dry-run.
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee dryrun-staging-$(date -u +%Y%m%dT%H%M%SZ).log
echo "EXIT_CODE=$?"

# 5. Inspect the gate line.
grep '^DRYRUN_GATE:' dryrun-staging-*.log

# 6. (Optional) Second-run idempotency check (§8).
bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | tee dryrun-staging-2.log
diff <(grep '^DRYRUN_GATE:' dryrun-staging-*.log | head -1 | cut -d: -f2-) \
     <(grep '^DRYRUN_GATE:' dryrun-staging-2.log | cut -d: -f2-)

# 7. Clean up.
unset DRYUN_RO_PW DATABASE_URL
```

## Appendix B: Decision flowchart

```
EXIT_CODE=0?
├─ NO  → STOP. Inspect log. (§7.1)
└─ YES → readOnlyInvariant=true?
         ├─ NO  → STOP. Mutation detected. (§7.1, §10.3)
         └─ YES → gatePasses=true?
                  ├─ NO  → STOP. INVALID/MISMATCH/MULTI_ROLE > 0.
                  │       Triage samples manually. (§6, §7.1)
                  └─ YES → total === sum of 5 classes?
                           ├─ NO  → STOP. Counting bug. (§7.1)
                           └─ YES → SAFE TO PROCEED TO APPLY. (§7.2)
```
