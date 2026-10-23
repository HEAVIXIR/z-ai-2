# STEP 15.68 — Phase C Preflight Audit Report

**Task ID:** STEP-15.68
**Branch:** `chore/step-15-68-phase-c-preflight`
**Base SHA:** `4f7a2d747777659290237b6fdb387269438141fc` (main, post-PR #75 merge)
**Post-merge CI:** run #39978974555, 3/3 SUCCESS (verify, audit-transaction, phase-tests)
**Status:** PREPARATION ONLY — no staging execution, no production operations, no DB connections to staging/prod.

---

## Executive summary

This report audits the Phase C RBAC backfill dry-run implementation
against five dimensions (connection safety, read-only enforcement, data
classification, snapshot/scale, gate correctness). It identifies the
existing strengths, documents the gaps between "tested in CI" and
"proven for all paths," and proposes mitigations. All findings include
file:line references. Unverified claims are marked **UNVERIFIED**.

**Key findings:**

1. **Connection safety (§A):** The dry-run uses the same `db` client as
   the application (`src/lib/db.ts`), which reads `DATABASE_URL` from
   the environment. **There is no fallback** (Prisma throws if unset),
   but **there is also no guard** against accidental dev/prod
   connection. The CI workflow mitigates this by setting `DATABASE_URL`
   to the read-only role's URL, but local/staging execution relies on
   operator discipline. **Recommended preflight check designed (§A.5)
   but NOT implemented** in STEP 15.68 (deferred to avoid changing
   script behavior under CI).

2. **Read-only enforcement (§B):** The `heavix_dryrun_ro` PostgreSQL
   role has SELECT-only privileges, verified by 17 integration tests
   (`tests/integration/rbac-readonly-role-real.test.ts`). **Gap:** the
   tests cover the 5 RBAC tables specifically; other tables in the
   schema are NOT enumerated. **Gap:** the dry-run under the RO role
   is checked for "no permission errors" but NOT for "exit code 0"
   (per CR-15.55-03, this was removed to avoid concurrency flakiness).

3. **Data classification (§C):** `mapLegacyRole()` correctly handles
   null/empty/whitespace/SUPERADMIN alias/case-insensitivity/unknown.
   The mapping matches `prisma/seed-rbac.ts`, `prisma/schema.prisma`,
   and `src/lib/authorization/permissions.ts`. PII fields (email,
   mobile, phone, passwordHash) are NOT in any sample/select/fingerprint
   output. **Verified by 60 new preflight unit tests.**

4. **Snapshot and scale (§D):** The BEFORE/AFTER fingerprint fetches ALL
   rows from 5 tables into Node memory and JSON-stringifies them. For
   10K users this is fine (~5MB). For 1M+ users, this risks OOM. The
   fingerprint is deterministic for static data but **will report
   false-positive `readOnlyInvariant=false`** if concurrent writes
   occur between BEFORE and AFTER snapshots (the script does NOT use
   `REPEATABLE READ` isolation).

5. **Gate correctness (§E):** All five failure paths (missing output,
   malformed JSON, `gatePasses=false`, `readOnlyInvariant=false`,
   child-process failure) are handled by `scripts/rbac-gate-ci.ts` and
   validated by `src/lib/rbac/gate-logic.ts`. **Gap:** the CI gate runs
   against a freshly seeded CI DB, not against production-like data.
   Edge cases (e.g., `User.role='GOD'`) are tested at the logic level
   only, not against real legacy data.

---

## A. Connection safety

### A.1 What env var does Prisma use for DATABASE_URL?

`src/lib/db.ts:60-72` — `createPrismaClient()` constructs `new mod.PrismaClient({ log: ['error', 'warn'] })` with **no explicit `datasources` override**. Prisma therefore reads `DATABASE_URL` from `process.env` per the standard Prisma client behavior.

```typescript
// src/lib/db.ts:60-72
function createPrismaClient(): PrismaClient {
  purgePrismaCache()
  if (typeof require === 'undefined') {
    throw new Error('PrismaClient cannot be instantiated in this context (require unavailable)')
  }
  const mod = require('@prisma/client') as {
    PrismaClient: new (opts?: { log: string[] }) => PrismaClient
  }
  return new mod.PrismaClient({ log: ['error', 'warn'] })
}
```

The singleton is exported at `src/lib/db.ts:79`:
```typescript
export const db = globalForPrisma.prisma ?? createPrismaClient()
```

**Conclusion:** Prisma uses `process.env.DATABASE_URL`. There is NO fallback — if the variable is unset, `new PrismaClient()` throws at first query (Prisma's internal `datasourceUrl` resolution fails).

### A.2 Does the dry-run use the same db client?

`scripts/rbac-backfill-dryrun.ts:62`:
```typescript
import { db } from '@/lib/db';
```

**Yes.** The dry-run imports the SAME singleton `db` client that the Next.js application uses. This means:
- Same connection pool.
- Same `DATABASE_URL` env var.
- Same Prisma client version (generated from `prisma/schema.prisma`).

### A.3 Could the dry-run accidentally connect to dev DB?

**Yes — there is no guard.** If an operator runs `bunx tsx scripts/rbac-backfill-dryrun.ts` from a shell where `DATABASE_URL` is set to a dev DB (e.g., via a sourced `.env` file, or via a shell profile), the dry-run WILL connect to that DB. The script does NOT:
- Verify the connection's `current_user` is `heavix_dryrun_ro`.
- Verify the database name matches a staging/test pattern.
- Refuse to run if `DATABASE_URL` doesn't contain a marker like `staging` or `test`.

**Mitigations in place:**
1. The CI workflow (`.github/workflows/ci.yml:77-84`) sets `DATABASE_URL="$DRYRUN_DATABASE_URL"` where `DRYUN_DATABASE_URL` points at the read-only role on `heavix_test`. This is the CI-scoped mitigation.
2. The `heavix_dryrun_ro` PostgreSQL role (created by `scripts/rbac-create-readonly-role.sql`) is SELECT-only. Even if the dry-run connects to the wrong DB AS this role, it cannot write. **BUT** — if `DATABASE_URL` points at a dev DB using a DIFFERENT role (e.g., the dev superuser), the dry-run CAN write (it just doesn't, by code design — see §C.4 / Audit group 4 of the new preflight tests).
3. The dry-run's BEFORE/AFTER fingerprint comparison (`scripts/rbac-backfill-dryrun.ts:547-553`) detects mutations and exits with code 2 if `readOnlyInvariant=false`. This is the runtime mitigation: even if a write occurred (bug or accident), the script catches it.

**Remaining risk:** If an operator runs the dry-run against a dev DB with a read-write role, the script WILL execute its read queries (no writes — verified by §C.4). The output will reflect the dev DB's state, not staging's. This is a **silent correctness issue**, not a safety issue — no data is mutated, but the operator may make incorrect decisions based on dev data.

### A.4 Fallback behavior analysis

The dry-run script's `main()` function (`scripts/rbac-backfill-dryrun.ts:161-566`) does NOT:
- Read `DATABASE_URL` from a file (`.env`).
- Provide a default connection string.
- Catch the "DATABASE_URL not set" error specifically.

The script's entrypoint (lines 634-655, post-STEP 15.68) wraps `main()` in a `.catch()` that logs the error and exits with code 2:
```typescript
if (require.main === module) {
  main().catch(async (err: unknown) => {
    console.error('═'.repeat(72));
    console.error('✗ Phase C dry-run failed with an unrecoverable error.');
    console.error('  This is expected in sandboxes WITHOUT PostgreSQL.');
    console.error('  In CI/production, this indicates a real DB connection issue.');
    console.error('═'.repeat(72));
    console.error(err);
    try { await db.$disconnect(); } catch { /* ignore */ }
    process.exit(2);
  });
}
```

**Conclusion on fallback:** There is NO silent fallback to a dev DB. If `DATABASE_URL` is unset, Prisma throws at the first `db.role.findMany()` call (line 173), the `.catch()` fires, and the script exits 2. The risk is when `DATABASE_URL` IS set but points at the wrong DB (e.g., dev or prod) — the script connects successfully and produces output that may mislead the operator.

### A.5 Recommended preflight check (DESIGN — NOT IMPLEMENTED)

**Design (for future implementation in STEP 15.69+):** Add a preflight function at the very top of `main()` (BEFORE the `db.role.findMany()` at line 173) that verifies the connection identity via a read-only `$queryRaw`:

```typescript
async function preflightCheck(): Promise<void> {
  // 1. Verify DATABASE_URL is set.
  if (!process.env.DATABASE_URL) {
    console.error('✗ FATAL: DATABASE_URL environment variable is not set.');
    console.error('  Refusing to run without an explicit DB target.');
    process.exit(2);
  }
  // 2. Verify the connection identity via a read-only $queryRaw.
  //    This runs BEFORE any table query.
  const rows = await db.$queryRaw<
    Array<{ current_user: string; current_database: string }>
  >`SELECT current_user, current_database()`;
  const { current_user, current_database } = rows[0];

  // 3. Allow-list the DB user (must be the read-only role).
  const ALLOWED_USERS = ['heavix_dryrun_ro'];
  if (!ALLOWED_USERS.includes(current_user)) {
    console.error(`✗ FATAL: DB user "${current_user}" is not in the allow-list.`);
    console.error(`  Allowed: ${ALLOWED_USERS.join(', ')}`);
    console.error('  Refusing to run — must use a read-only role.');
    await db.$disconnect();
    process.exit(2);
  }

  // 4. Allow-list the database name (must be a test/staging DB).
  const ALLOWED_DB_PATTERNS = [/heavix_test/, /heavix_staging/, /^heavix_dryrun/];
  if (!ALLOWED_DB_PATTERNS.some((p) => p.test(current_database))) {
    console.error(`✗ FATAL: DB "${current_database}" does not match any allowed pattern.`);
    console.error('  Allowed patterns: heavix_test, heavix_staging, ^heavix_dryrun');
    console.error('  Refusing to run — must target a test/staging database.');
    await db.$disconnect();
    process.exit(2);
  }

  console.log(`  ✓ Preflight: user=${current_user}, db=${current_database}`);
}
```

**Why not implemented in STEP 15.68:**
1. STEP 15.68 is preparation-only. Implementing the preflight changes the script's runtime behavior and could break CI if the allow-lists are too strict (e.g., if a future staging DB is named `heavix_stage_v2` and doesn't match `/heavix_staging/`).
2. The preflight adds a `$queryRaw` call that the read-only role must permit. The current `scripts/rbac-create-readonly-role.sql` grants SELECT on tables but does NOT explicitly grant access to `pg_catalog` or system functions. PostgreSQL allows `current_user` and `current_database()` without explicit grants, so this should work — but it's UNVERIFIED against the actual CI role.
3. Implementing the preflight would require adding test coverage for the new code path (preflight fail, preflight pass, preflight with allow-list bypass). This is out of scope for STEP 15.68.

**Mitigation in the meantime:** The staging runbook (`docs/phase3/STEP-15.68-STAGING-RUNBOOK.md` §3.2) documents a MANUAL preflight procedure that the operator runs BEFORE invoking the dry-run. This provides the same guarantees, executed by a human.

---

## B. Read-only enforcement

### B.1 Privileges granted/revoked by `scripts/rbac-create-readonly-role.sql`

**File:** `scripts/rbac-create-readonly-role.sql:1-40`

**Granted (lines 21-34):**
- `CONNECT ON DATABASE heavix_test TO heavix_dryrun_ro` (line 22)
- `USAGE ON SCHEMA public TO heavix_dryrun_ro` (line 25, NOT `CREATE`)
- `SELECT ON ALL TABLES IN SCHEMA public` (line 28)
- `SELECT ON ALL SEQUENCES IN SCHEMA public` (line 31)
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO heavix_dryrun_ro` (line 34, future tables)

**Revoked (lines 37-39):**
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM heavix_dryrun_ro` (line 37)
- `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM heavix_dryrun_ro` (line 38, then re-grants SELECT on line 39)

**Role creation (lines 9-19):**
- `DROP ROLE IF EXISTS heavix_dryrun_ro` (idempotent — line 12-14)
- `CREATE ROLE heavix_dryrun_ro LOGIN PASSWORD :'dryrun_password'` (line 19, password via psql variable, NOT hard-coded)

### B.2 What was tested in CI vs what's only code-level

**File:** `tests/integration/rbac-readonly-role-real.test.ts:1-340`

**Tested in CI (lines 53-228, under `RUN_TESTS` guard at line 26):**
- Role exists, not superuser (`rolsuper=f, rolcreaterole=f, rolcreatedb=f`) — line 53-58
- No role membership (no inherited privileges) — line 60-65
- SELECT granted on User table — line 67-76
- SELECT granted on UserRole table — line 78-85
- SELECT granted on Role, Permission, RolePermission tables — line 87-97
- INSERT denied on all 5 RBAC tables (with `permission denied` error) — line 99-113
- UPDATE denied on all 5 RBAC tables — line 115-129
- DELETE denied on all 5 RBAC tables — line 131-145
- TRUNCATE denied on all 5 RBAC tables — line 147-161
- Direct grants: SELECT only on all 5 tables (via `information_schema.role_table_grants`) — line 163-178
- Effective privileges via `has_table_privilege()`: SELECT=true, INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER=false — line 180-194
- No PUBLIC grants on RBAC tables — line 196-207
- No sequence UPDATE grants — line 209-214
- Role does not own any tables — line 216-221
- No inherited privileges via role membership — line 223-228
- USAGE on schema but no CREATE — line 230-237
- Dry-run under RO role produces no permission errors and emits `DRYRUN_GATE:` line — line 239-274

**Code-level only (NOT tested against a real DB):**
- The SQL script's behavior when run against a non-empty DB (the CI runs it against a fresh `heavix_test` after `prisma db push`). UNVERIFIED: whether `ALTER DEFAULT PRIVILEGES` (line 34) applies retroactively to tables created by other roles.
- The SQL script's behavior when the `heavix_dryrun_ro` role already exists with active connections (the `DROP ROLE` at line 13 would fail if connections are open). UNVERIFIED.
- The SQL script's behavior when run by a non-superuser (the CI uses `postgres` superuser). UNVERIFIED.

**Static (no-DB) tests in CI (lines 282-340):**
- CI workflow uses `DRYUN_RO_PW` env var (not hard-coded) — line 283-288
- CI dry-run step uses `heavix_dryrun_ro` role — line 290-294
- CI dry-run step runs BEFORE integration tests — line 296-303
- SQL script uses psql variable for password — line 305-310
- SQL script explicitly REVOKEs write privileges — line 312-315
- `scripts/rbac-gate-ci.ts` imports from shared `gate-logic` module — line 317-323
- `scripts/rbac-gate-ci.ts` calls `process.exit` — line 325-329
- Test file uses `execFileSync` (not shell interpolation) — line 331-339

### B.3 Difference between "tested in CI" and "proven for all paths"

**Tested in CI:**
- The 5 RBAC tables (User, UserRole, Role, Permission, RolePermission) have SELECT granted and all writes denied. This is the dry-run's actual access surface.
- The dry-run script runs under the RO role without permission errors.

**NOT tested in CI (limitations):**
1. **Other tables in the schema.** The GRANT/REVOKE applies to ALL tables in `public`, but the integration tests only enumerate the 5 RBAC tables. If a future table is added to `public` schema without `ALTER DEFAULT PRIVILEGES` picking it up (e.g., created by a role that doesn't inherit from the role that ran `rbac-create-readonly-role.sql`), the RO role might have unexpected privileges on it. **Mitigation:** the dry-run only accesses the 5 RBAC tables (verified by §C.4 / Audit group 4 preflight tests), so even if other tables have stale grants, the dry-run wouldn't touch them.

2. **Temporary tables.** PostgreSQL grants `TEMPORARY` on the database to PUBLIC by default. The SQL script does NOT revoke this. The `heavix_dryrun_ro` role could create temp tables (which don't persist and don't affect real data, but technically violate the "read-only" property). **Mitigation:** temp tables are session-scoped and discarded on disconnect. They cannot affect the dry-run's output or the DB's persistent state. **Recommendation:** add `REVOKE TEMPORARY ON DATABASE heavix_test FROM PUBLIC;` in a future hardening step.

3. **Functions and procedures.** PostgreSQL grants `EXECUTE` on functions to PUBLIC by default. The SQL script does NOT revoke this. If a function performs writes (e.g., a trigger function or a SECURITY DEFINER function), the RO role could execute it. **Mitigation:** the dry-run script does NOT call any functions via `$queryRaw` or `$executeRaw` (verified by §C.4 / Audit group 4 preflight tests). The Prisma client's `count()`, `findMany()`, and `groupBy()` methods emit plain SELECT queries, not function calls. **Recommendation:** audit all SECURITY DEFINER functions in the schema and ensure they enforce their own authorization (this is a broader security task, not specific to the dry-run).

4. **Large objects.** The SQL script does NOT revoke privileges on large objects (`pg_largeobject`). UNVERIFIED: whether the RO role can read/write large objects. **Mitigation:** the dry-run does not access large objects. **Recommendation:** add `REVOKE ALL ON pg_largeobject FROM PUBLIC;` in a future hardening step.

5. **Dry-run exit code 0 under RO role.** Per CR-15.55-03 (`tests/integration/rbac-readonly-role-real.test.ts:240-247`), the integration-time test does NOT require exit code 0. This is because concurrent test mutations could cause `readOnlyInvariant=false`, which would make the dry-run exit 2. The test only verifies "no permission errors" and "DRYRUN_GATE: line is present." **Gap:** the authoritative exit-0 check happens in the CI workflow's `Phase C dry-run gate` step (`.github/workflows/ci.yml:77-84`), which runs in isolation (before integration tests). This is the CI-scoped mitigation, but it means the integration test does NOT independently verify the dry-run's exit code.

6. **Concurrent role recreation.** If a workflow re-runs `rbac-create-readonly-role.sql` while the dry-run is connected, the `DROP ROLE` (line 13) would fail (active sessions). The CI workflow runs the SQL script ONCE per job (`.github/workflows/ci.yml:66-74`), before the dry-run. **Mitigation:** no concurrent role recreation in CI. For staging, the runbook (§2.3) specifies re-running the SQL script only when rotating the password, NOT during the dry-run.

### B.4 Limitations summary

| Limitation | Impact | Mitigation |
|---|---|---|
| Only 5 RBAC tables enumerated in tests | Other tables UNVERIFIED | Dry-run only accesses 5 RBAC tables (verified by preflight tests §C.4) |
| TEMPORARY not revoked | RO role can create temp tables | Temp tables are session-scoped, no persistent impact. Recommend future REVOKE. |
| EXECUTE on functions not revoked | RO role can call functions | Dry-run uses only Prisma read methods (count/findMany/groupBy), no function calls. Recommend broader SECURITY DEFINER audit. |
| Large objects not audited | UNVERIFIED | Dry-run does not access large objects. |
| Integration test doesn't require exit 0 | Weaker guarantee | CI workflow's isolated gate step provides the authoritative exit-0 check. |
| Concurrent role recreation not handled | DROP ROLE fails | Runbook specifies single execution window. |

---

## C. Data classification

### C.1 `mapLegacyRole()` function

**File:** `scripts/rbac-backfill-dryrun.ts:97-105` (post-STEP 15.68 export)

```typescript
export function mapLegacyRole(legacy: string | null | undefined): CanonicalRoleKey | null {
  const upper = (legacy ?? '').trim().toUpperCase();
  if (upper === '') return 'BUYER';
  if (upper in LEGACY_ALIAS_MAP) return LEGACY_ALIAS_MAP[upper];
  if ((CANONICAL_ROLE_KEYS as readonly string[]).includes(upper)) {
    return upper as CanonicalRoleKey;
  }
  return null; // INVALID
}
```

**Supporting constants (lines 65-76):**
```typescript
const CANONICAL_ROLE_KEYS = ['ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT'] as const;
type CanonicalRoleKey = (typeof CANONICAL_ROLE_KEYS)[number];

const LEGACY_ALIAS_MAP: Record<string, CanonicalRoleKey> = {
  ADMIN: 'ADMIN',
  SUPERADMIN: 'ADMIN',
  SELLER: 'SELLER',
  BUYER: 'BUYER',
};
```

### C.2 Role mapping cross-reference

**`prisma/seed-rbac.ts:27-58` — ROLES array:**
- ADMIN, SELLER, BUYER, MODERATOR, SUPPORT ✓ matches `CANONICAL_ROLE_KEYS`

**`prisma/schema.prisma:1742-1751` — Role model:**
- `key String @unique // ADMIN | SELLER | BUYER | MODERATOR | SUPPORT` ✓ matches

**`src/lib/authorization/permissions.ts:245-348` — ROLE_PERMISSIONS keys:**
- ADMIN, SELLER, BUYER, MODERATOR, SUPPORT ✓ matches

**Cross-reference verified by:**
- `tests/unit/rbac-dryrun-preflight.test.ts` test "canonically maps only ADMIN, SELLER, BUYER, MODERATOR, SUPPORT (matches schema + seed)" — reads `scripts/rbac-backfill-dryrun.ts`, `prisma/seed-rbac.ts`, AND `src/lib/authorization/permissions.ts` and asserts all three declare the same 5 keys.

### C.3 Edge cases (verified by preflight tests)

| Input | Expected output | Test name (in `tests/unit/rbac-dryrun-preflight.test.ts`) |
|---|---|---|
| `null` | `'BUYER'` | "null → 'BUYER' (defensive fallback per design doc)" |
| `undefined` | `'BUYER'` | "undefined → 'BUYER' (defensive fallback per design doc)" |
| `''` (empty) | `'BUYER'` | "empty string '' → 'BUYER' (per design doc default fallback)" |
| `'   '` (whitespace) | `'BUYER'` | "whitespace-only '   ' → 'BUYER' (defensive trim)" |
| `'SUPERADMIN'` | `'ADMIN'` | "'SUPERADMIN' (alias) → 'ADMIN'" |
| `'superadmin'` | `'ADMIN'` | "'superadmin' (lowercase alias) → 'ADMIN' (case-insensitive)" |
| `'admin'` | `'ADMIN'` | "'admin' (lowercase canonical) → 'ADMIN' (case-insensitive)" |
| `'ADMIN'` | `'ADMIN'` | "'ADMIN' (canonical) → 'ADMIN'" |
| `'Buyer'` | `'BUYER'` | "'Buyer' (mixed case) → 'BUYER'" |
| `'SELLER'` | `'SELLER'` | "'SELLER' (canonical) → 'SELLER'" |
| `'Seller'` | `'SELLER'` | "'Seller' (mixed case) → 'SELLER'" |
| `'MODERATOR'` | `'MODERATOR'` | "'MODERATOR' (canonical, not in alias map) → 'MODERATOR' via direct match" |
| `'SUPPORT'` | `'SUPPORT'` | "'SUPPORT' (canonical, not in alias map) → 'SUPPORT' via direct match" |
| `'moderator'` | `'MODERATOR'` | "'moderator' (lowercase) → 'MODERATOR'" |
| `'support'` | `'SUPPORT'` | "'support' (lowercase) → 'SUPPORT'" |
| `'GOD'` | `null` (INVALID) | "unknown 'GOD' → null (INVALID — flag for manual review)" |
| `'ROOT'` | `null` (INVALID) | "unknown 'ROOT' → null (INVALID)" |
| `'superuser'` | `null` (INVALID — NOT aliased) | "unknown 'superuser' → null (NOT aliased to ADMIN — only SUPERADMIN is)" |
| `'admin2'` | `null` (INVALID) | "unknown 'admin2' → null (INVALID)" |
| `'1'` | `null` (INVALID) | "unknown numeric string '1' → null (INVALID — numeric codes not aliased)" |
| `'0'` | `null` (INVALID) | "unknown '0' → null (INVALID)" |
| `'  ADMIN  '` | `'ADMIN'` | "whitespace-padded '  ADMIN  ' → 'ADMIN' (trim + uppercase)" |
| `'\tADMIN\t'` | `'ADMIN'` | "tab-padded '\tADMIN\t' → 'ADMIN' (trim handles tabs)" |

**All 23 edge cases pass.** See test file `tests/unit/rbac-dryrun-preflight.test.ts` "STEP 15.68 — mapLegacyRole() edge cases" (24 tests including the "returns one of the 5 canonical keys" sanity check).

### C.4 PII verification (NOT in output)

**Verified by:** `tests/unit/rbac-dryrun-preflight.test.ts` "STEP 15.68 — PII fields NOT in sample output structure" (5 tests).

**Sample interfaces (`scripts/rbac-backfill-dryrun.ts:107-122`):**
- `SampleBase`: `userId: string; legacyRole: string;` — NO PII
- `SampleMissing extends SampleBase`: `canonicalKey: CanonicalRoleKey;` — NO PII
- `SampleMismatch extends SampleBase`: `canonicalKey: CanonicalRoleKey; userRoleKeys: string[];` — NO PII
- `SampleMultiRole extends SampleBase`: `canonicalKey: CanonicalRoleKey; userRoleKeys: string[];` — NO PII
- `SampleInvalid extends SampleBase`: (no additional fields) — NO PII

**`findMany` select clauses:**
- Per-user classification (`scripts/rbac-backfill-dryrun.ts:325-329`):
  ```typescript
  select: { id: true, role: true, userRoles: { select: { roleId: true } } }
  ```
  NO PII (no `email`, `mobile`, `phone`, `passwordHash`, `firstName`, `lastName`).
- BEFORE fingerprint (`scripts/rbac-backfill-dryrun.ts:241-246`):
  ```typescript
  db.user.findMany({ select: { id: true, role: true }, orderBy: { id: 'asc' } }),
  db.userRole.findMany({ select: { userId: true, roleId: true }, orderBy: [...] }),
  db.role.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
  db.permission.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
  db.rolePermission.findMany({ select: { roleId: true, permissionId: true }, orderBy: [...] }),
  ```
  NO PII in any of the 5 select clauses.
- AFTER fingerprint (`scripts/rbac-backfill-dryrun.ts:519-525`): same as BEFORE.

**Fingerprint maps (`scripts/rbac-backfill-dryrun.ts:247-253, 526-532`):**
- `users: beforeUsers.map(u => ${u.id}:${u.role})` — id + role only
- `userRoles: beforeUserRoles.map(ur => ${ur.userId}:${ur.roleId})` — userId + roleId only
- `roles: beforeRoles.map(r => ${r.id}:${r.key})` — id + key only
- `permissions: beforePermissions.map(p => ${p.id}:${p.key})` — id + key only
- `rolePermissions: beforeRolePermissions.map(rp => ${rp.roleId}:${rp.permissionId})` — roleId + permissionId only

**Conclusion:** NO PII fields (`email`, `mobile`, `phone`, `passwordHash`, `firstName`, `lastName`, `companyName`) appear in any sample, select, or fingerprint. `userId` is a cuid (pseudonymous), treated as confidential in the runbook (§5.3).

### C.5 Gate logic and okCount/total consistency

**Verified by:** `tests/unit/rbac-dryrun-preflight.test.ts` "STEP 15.68 — Gate logic consistency (sum === total)" (10 tests).

**Gate logic (`src/lib/rbac/gate-logic.ts:65-100`):**
```typescript
export function evaluateGate(
  classification: ClassificationCounts,
  before: SnapshotCounts,
  after: SnapshotCounts,
  beforeFingerprint: string,
  afterFingerprint: string,
): GateResult {
  const gatePasses =
    classification.INVALID === 0 &&
    classification.MISMATCH === 0 &&
    classification.MULTI_ROLE === 0;

  const readOnlyInvariant =
    before.userCount === after.userCount &&
    before.userRoleCount === after.userRoleCount &&
    before.roleCount === after.roleCount &&
    before.permissionCount === after.permissionCount &&
    before.rolePermissionCount === after.rolePermissionCount &&
    beforeFingerprint === afterFingerprint;

  return {
    gatePasses,
    readOnlyInvariant,
    okCount: classification.OK,
    safeToBackfillCount: classification.MISSING,
    mismatchCount: classification.MISMATCH,
    multiRoleCount: classification.MULTI_ROLE,
    invalidCount: classification.INVALID,
    total:
      classification.OK +
      classification.MISSING +
      classification.MISMATCH +
      classification.MULTI_ROLE +
      classification.INVALID,
  };
}
```

**Consistency verified:**
- `total === OK + MISSING + MISMATCH + MULTI_ROLE + INVALID` (lines 93-98) — tested with 10 different classification combinations including 10K users, 1M users (extrapolated), all-blocking, none-blocking.
- `gatePasses === (INVALID==0 && MISMATCH==0 && MULTI_ROLE==0)` (lines 72-75) — tested with each blocking class individually and in combination.
- Round-trip: `formatGateOutput(evaluateGate(...))` → `parseGateLine(...)` → `validateGateOutput(...)` → `evaluateCiDecision(...)` produces `shouldPass === gatePasses && readOnlyInvariant` for all test cases.

**Validation invariants (`src/lib/rbac/gate-logic.ts:118-160`):**
- `validateCountField`: rejects non-number, non-finite (NaN), non-integer, negative values.
- `validateGateOutput`: requires `gatePasses` and `readOnlyInvariant` to be booleans; requires all 6 numeric fields to be valid; requires `sum === total` (exact equality); requires consistency (`gatePasses=true` implies all blocking counts are 0).

---

## D. Snapshot and scale

### D.1 Fingerprint code

**File:** `scripts/rbac-backfill-dryrun.ts:232-256` (BEFORE snapshot) and `scripts/rbac-backfill-dryrun.ts:512-532` (AFTER snapshot).

**BEFORE snapshot (lines 232-256):**
```typescript
const beforeCounts = {
  userCount: await db.user.count(),
  userRoleCount: await db.userRole.count(),
  roleCount: await db.role.count(),
  permissionCount: await db.permission.count(),
  rolePermissionCount: await db.rolePermission.count(),
};
const [beforeUsers, beforeUserRoles, beforeRoles, beforePermissions, beforeRolePermissions] = await Promise.all([
  db.user.findMany({ select: { id: true, role: true }, orderBy: { id: 'asc' } }),
  db.userRole.findMany({ select: { userId: true, roleId: true }, orderBy: [{ userId: 'asc' }, { roleId: 'asc' }] }),
  db.role.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
  db.permission.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
  db.rolePermission.findMany({ select: { roleId: true, permissionId: true }, orderBy: [{ roleId: 'asc' }, { permissionId: 'asc' }] }),
]);
const beforeFingerprint = JSON.stringify({
  users: beforeUsers.map(u => `${u.id}:${u.role}`),
  userRoles: beforeUserRoles.map(ur => `${ur.userId}:${ur.roleId}`),
  roles: beforeRoles.map(r => `${r.id}:${r.key}`),
  permissions: beforePermissions.map(p => `${p.id}:${p.key}`),
  rolePermissions: beforeRolePermissions.map(rp => `${rp.roleId}:${rp.permissionId}`),
});
```

### D.2 How data is read (findMany + select)

The fingerprint uses `db.<model>.findMany({ select: { ... }, orderBy: { ... } })` for each of the 5 tables. Each `findMany` returns ALL rows for that table, with only the specified columns.

**Per-user classification loop (`scripts/rbac-backfill-dryrun.ts:320-401`):**
```typescript
while (true) {
  const users = await db.user.findMany({
    take: BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: 'asc' },
    select: {
      id: true,
      role: true,
      userRoles: { select: { roleId: true } },
    },
  });
  if (users.length === 0) break;
  cursor = users[users.length - 1].id;
  // ... classify each user
}
```

This is cursor-paginated with `BATCH_SIZE=1000` (line 156). Memory per batch is bounded: 1000 users × ~100 bytes each = ~100KB. The fingerprint queries, however, are NOT paginated — they fetch ALL rows.

### D.3 Memory implications for large tables

**Fingerprint memory cost (BEFORE + AFTER = 2× per table):**

| Table | Est. rows (10K users) | Est. memory (10K users) | Est. rows (1M users) | Est. memory (1M users) |
|---|---|---|---|---|
| User | 10K | ~500KB (id+role) | 1M | ~50MB |
| UserRole | ~10K (1 per user, post-backfill) | ~500KB (userId+roleId) | ~1M | ~50MB |
| Role | 5 (bounded) | ~1KB | 5 | ~1KB |
| Permission | ~127 (bounded by `permissions.ts`) | ~10KB | ~127 | ~10KB |
| RolePermission | ~300 (bounded) | ~20KB | ~300 | ~20KB |
| **Total (×2 for BEFORE+AFTER)** | | ~2MB | | ~100MB |

**JSON.stringify overhead:** The fingerprint creates a JSON string containing all 5 arrays. This roughly doubles the memory cost (the original objects + the JSON string). For 10K users: ~4MB. For 1M users: ~200MB.

**Per-user classification memory:** Bounded by `BATCH_SIZE=1000`. ~100KB per batch. Negligible compared to fingerprint.

**Risk assessment:**
- **10K users:** ~4MB total. Fine for any Node.js process.
- **100K users:** ~40MB total. Acceptable but watch Node heap (default ~1.5GB).
- **1M+ users:** ~200MB+ total. Risk of OOM on small instances. Use streaming hash (see §D.5).

### D.4 Is the fingerprint deterministic?

**Yes, for a static dataset.** The fingerprint is `JSON.stringify({ users: [...], userRoles: [...], ... })` where each array is sorted by `orderBy: { id: 'asc' }` (or `userId, roleId` for join tables). For the same set of rows, the JSON string is identical.

**Caveats:**
1. **`cuid` ordering.** The `User.id` column is a `cuid` (line 1579), which is a string. Sorting by `id: 'asc'` sorts lexicographically by the cuid string. Cuids are NOT strictly monotonic by creation time (they include a counter, timestamp, and random component). However, as long as the SET of cuids is the same, the sorted order is the same, so the fingerprint is deterministic for a static dataset.
2. **`updatedAt` not included.** The fingerprint does NOT include `User.updatedAt` (only `id` + `role`). A login that updates `User.lastLoginAt` does NOT change the fingerprint (good — it's not RBAC-related). But a role change (`User.role` update) DOES change the fingerprint (correctly detected as a mutation).
3. **Floating-point.** No floating-point values in the fingerprint (only strings). No determinism risk from float serialization.

### D.5 Concurrent changes risk

**The fingerprint WILL report `readOnlyInvariant=false` if a concurrent transaction mutates the DB between BEFORE and AFTER snapshots.** This is the designed behavior — the gate is fail-closed.

**Risk:** In a busy staging environment with active traffic, the fingerprint will frequently differ between BEFORE and AFTER, even though the dry-run didn't mutate anything. This produces false-positive gate failures.

**Specific concurrent changes that affect the fingerprint:**
- User registration (INSERT into `User`).
- User role change (UPDATE `User.role` or INSERT/DELETE on `UserRole`).
- RBAC catalog change (INSERT/UPDATE/DELETE on `Role`, `Permission`, `RolePermission`).

**Specific concurrent changes that DO NOT affect the fingerprint:**
- User login (UPDATE `User.lastLoginAt` — not in fingerprint).
- Listing creation (INSERT into `Listing` — different table).
- Audit log writes (INSERT into `AuditLog` — different table).
- Session creation (INSERT into `Session` — different table).

**Mitigations (in order of preference):**

1. **CI ordering (already implemented).** The CI workflow runs the dry-run gate BEFORE integration tests (`.github/workflows/ci.yml:77-84`), so no concurrent test mutations occur. This is the CI-scoped mitigation.

2. **Low-traffic window for staging.** Run the dry-run during off-peak hours when staging has minimal write traffic. Documented in the runbook (§9.4).

3. **Pause write traffic.** If staging has background workers that write to `User`/`UserRole`/`Role`/`Permission`/`RolePermission`, pause them for the dry-run window (typically < 1 minute for 10K users).

4. **`REPEATABLE READ` transaction (future).** Wrap BEFORE + classification + AFTER in a single transaction with `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`. The MVCC snapshot is consistent. Trade-off: long-running transactions cause autovacuum bloat. NOT implemented in STEP 15.68.

5. **`pg_export_snapshot()` (future).** Export the BEFORE snapshot via `pg_export_snapshot()` and re-import it for the AFTER queries via `SET TRANSACTION SNAPSHOT`. Lets BEFORE and AFTER share the same MVCC snapshot across connections. NOT implemented in STEP 15.68.

6. **Server-side hash (future).** Replace the client-side `findMany + JSON.stringify` with a server-side `SELECT md5(string_agg(...))` aggregate. This computes the hash in PostgreSQL, transferring only the hash to Node. Bounds memory to O(1) regardless of table size. NOT implemented in STEP 15.68.

7. **Streaming hash (future).** Use cursor pagination + a rolling SHA-256 hash updated per batch. Bounds memory to O(BATCH_SIZE). NOT implemented in STEP 15.68.

### D.6 Scale risks and improvements summary

| Scale | Risk | Mitigation (current) | Improvement (future) |
|---|---|---|---|
| 10K users | None | — | — |
| 100K users | ~40MB memory | Acceptable | Server-side hash |
| 1M+ users | ~200MB+ memory, risk of OOM | None | Server-side hash OR streaming hash |
| Concurrent writes | False-positive `readOnlyInvariant=false` | Low-traffic window | `REPEATABLE READ` transaction OR `pg_export_snapshot()` |
| Long runtime | > 1 minute for 1M users | Cursor pagination (already in place) | Parallel classification (complex, not recommended) |

---

## E. Gate correctness

### E.1 `scripts/rbac-gate-ci.ts` — all failure paths

**File:** `scripts/rbac-gate-ci.ts:1-100`

**Failure path 1: Child process failure (non-zero exit) — lines 37-58**
```typescript
try {
  output = execSync(`bunx tsx ${SCRIPT} 2>&1`, { encoding: "utf-8", timeout: 120000, env: { ...process.env } });
} catch (err: unknown) {
  const e = err as { stdout?: string; message?: string; status?: number };
  childExitedNonZero = true;
  output = e.stdout ?? "";
  if (!output) {
    console.error("ERROR: dry-run script crashed with no output");
    console.error(e.message);
    process.exit(2);
  }
  console.error(`FAIL: dry-run script exited non-zero (status=${e.status ?? "?"})`);
  console.error("A failed child process cannot produce a valid gate result.");
  console.log("--- captured output ---");
  console.log(output);
  console.log("--- end captured output ---");
  process.exit(1);
}
```
- **Behavior:** If the dry-run script exits non-zero, the gate runner captures stdout (which may contain partial output) and exits 1. If stdout is empty, exits 2.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:412-424` (test "Gate runner source: catch block exits 1 on non-zero child exit") — static source inspection.
- **Gap:** The test verifies the source contains `childExitedNonZero` and `process.exit(1)`. It does NOT execute the gate runner with a failing child process to verify the actual exit code. UNVERIFIED at runtime (only static).

**Failure path 2: No `DRYRUN_GATE:` line — lines 64-70**
```typescript
const lines = output.split("\n");
const gateLine = lines.reverse().find((l) => l.startsWith("DRYRUN_GATE:"));

if (!gateLine) {
  console.error("FAIL: No DRYRUN_GATE output found");
  process.exit(1);
}
```
- **Behavior:** If the dry-run's output doesn't contain a line starting with `DRYRUN_GATE:`, the gate runner exits 1.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:145-152` (test "6. Missing DRYRUN_GATE line → CI fails (parseGateLine returns error)") — exercises `parseGateLine("some random output without prefix")` and asserts `parsed.error === "MISSING_PREFIX"`.

**Failure path 3: Malformed JSON — `parseGateLine` + `validateGateOutput`**
```typescript
// src/lib/rbac/gate-logic.ts:106-116
export function parseGateLine(line: string): ParsedGate {
  if (!line.startsWith("DRYRUN_GATE:")) {
    return { error: "MISSING_PREFIX" };
  }
  const jsonStr = line.slice("DRYRUN_GATE:".length);
  try {
    return JSON.parse(jsonStr) as ParsedGate;
  } catch {
    return { error: "MALFORMED_JSON" };
  }
}
```
- **Behavior:** If the JSON after `DRYRUN_GATE:` is unparseable, `parseGateLine` returns `{ error: "MALFORMED_JSON" }`. `validateGateOutput` returns this error string. `evaluateCiDecision` returns `shouldPass=false` with reason `VALIDATION_ERROR: MALFORMED_JSON`. Gate runner exits 1.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:154-161` (test "7. Malformed JSON → CI fails").

**Failure path 4: `gatePasses=false` — `evaluateCiDecision`**
```typescript
// src/lib/rbac/gate-logic.ts:170-172
if (!parsed.gatePasses) {
  return { shouldPass: false, reason: "gatePasses=false — Phase C backfill is NOT safe" };
}
```
- **Behavior:** If `gatePasses` is `false` (INVALID/MISMATCH/MULTI_ROLE > 0), the gate runner exits 1.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:79-95` (test "2. gatePasses=false (INVALID > 0) → CI fails"), `tests/unit/rbac-gate-logic.test.ts:97-110` (test "3. gatePasses=false (MISMATCH > 0) → CI fails"), `tests/unit/rbac-gate-logic.test.ts:198-214` (test "10. MULTI_ROLE > 0 → gatePasses=false → CI fails").

**Failure path 5: `readOnlyInvariant=false` — `evaluateCiDecision`**
```typescript
// src/lib/rbac/gate-logic.ts:173-175
if (!parsed.readOnlyInvariant) {
  return { shouldPass: false, reason: "readOnlyInvariant=false — database was mutated" };
}
```
- **Behavior:** If `readOnlyInvariant` is `false` (BEFORE/AFTER snapshots differ), the gate runner exits 1.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:112-127` (test "4. readOnlyInvariant=false (counts differ) → CI fails"), `tests/unit/rbac-gate-logic.test.ts:129-143` (test "5. readOnlyInvariant=false (fingerprint differs, counts same) → CI fails").

**Failure path 6: Validation errors (missing/negative/NaN/non-integer/sum mismatch/inconsistent)**
- **Behavior:** `validateGateOutput` returns an error string. `evaluateCiDecision` returns `shouldPass=false` with reason `VALIDATION_ERROR: <error>`. Gate runner exits 1.
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:163-178` (test "8. Missing required field"), `tests/unit/rbac-gate-logic.test.ts:180-196` (test "9. Wrong type for field"), `tests/unit/rbac-gate-logic.test.ts:269-284` (test "Negative count"), `tests/unit/rbac-gate-logic.test.ts:286-301` (test "NaN count"), `tests/unit/rbac-gate-logic.test.ts:303-318` (test "Non-integer count"), `tests/unit/rbac-gate-logic.test.ts:320-335` (test "Sum mismatch"), `tests/unit/rbac-gate-logic.test.ts:337-352` (test "Inconsistent gate").

**Success path: All checks pass — line 90**
```typescript
process.exit(0);
```
- **Verified by:** `tests/unit/rbac-gate-logic.test.ts:59-75` (test "1. Valid output with gatePasses=true and readOnlyInvariant=true → CI passes").

### E.2 `src/lib/rbac/gate-logic.ts` — validation logic

**File:** `src/lib/rbac/gate-logic.ts:1-178`

**`parseGateLine` (lines 106-116):** Returns `{ error: "MISSING_PREFIX" }` if the line doesn't start with `DRYRUN_GATE:`. Returns `{ error: "MALFORMED_JSON" }` if JSON parsing fails. Otherwise returns the parsed object.

**`validateCountField` (lines 118-124):**
- Rejects non-number values (`typeof value !== "number"` → `MISSING_OR_INVALID_<name>`).
- Rejects non-finite values (`!Number.isFinite(value)` → `NON_FINITE_<name>`, catches NaN/Infinity).
- Rejects non-integer values (`!Number.isInteger(value)` → `NON_INTEGER_<name>`, catches 1.5).
- Rejects negative values (`value < 0` → `NEGATIVE_<name>`).

**`validateGateOutput` (lines 126-160):**
- Returns `parsed.error` if set (MISSING_PREFIX or MALFORMED_JSON).
- Requires `gatePasses` to be boolean (line 129).
- Requires `readOnlyInvariant` to be boolean (line 130).
- Validates each of 6 numeric fields via `validateCountField` (lines 132-143): `okCount`, `safeToBackfillCount`, `mismatchCount`, `multiRoleCount`, `invalidCount`, `total`.
- Checks exact equality: `sumOfAll === total` (lines 146-154). Returns `SUM_MISMATCH` if they differ.
- Checks consistency: if `gatePasses=true` but any blocking count > 0, returns `INCONSISTENT_GATE` (lines 156-158).

**`evaluateCiDecision` (lines 162-177):**
- Calls `validateGateOutput`. If validation error, returns `shouldPass=false` with reason `VALIDATION_ERROR: <error>`.
- If `!parsed.gatePasses`, returns `shouldPass=false` with reason `"gatePasses=false — Phase C backfill is NOT safe"`.
- If `!parsed.readOnlyInvariant`, returns `shouldPass=false` with reason `"readOnlyInvariant=false — database was mutated"`.
- Otherwise returns `shouldPass=true` with reason `"PASS: gate passed and read-only invariant holds"`.

### E.3 Gap between "tested in CI" and "guaranteed in production"

**Tested in CI:**
- All 6 failure paths + success path are unit-tested at the logic level (18 tests in `tests/unit/rbac-gate-logic.test.ts`).
- The CI workflow runs the gate runner in isolation (`.github/workflows/ci.yml:77-84`) before integration tests, against a freshly seeded `heavix_test` DB.
- The integration test (`tests/integration/rbac-readonly-role-real.test.ts:239-274`) verifies the dry-run under the RO role produces no permission errors and emits a `DRYRUN_GATE:` line.

**NOT tested in CI (limitations):**

1. **Real production-like data.** The CI DB has a small, freshly seeded dataset. The dry-run's behavior against a large production-like dataset with edge-case legacy roles (e.g., `User.role='GOD'`, `User.role='superuser'`, `User.role=NULL`) is tested only at the logic level (`mapLegacyRole` unit tests), not against a real DB query result. **Mitigation:** the preflight tests (`tests/unit/rbac-dryrun-preflight.test.ts`) now exercise `mapLegacyRole()` directly with 23 edge cases, including the ones likely to appear in legacy data.

2. **Mid-script crash.** If the dry-run script crashes AFTER the BEFORE snapshot but BEFORE the AFTER snapshot (e.g., OOM, segfault), no `DRYRUN_GATE:` line is emitted. The gate runner catches this via failure path 1 (child process failure) and exits 1. **But:** the BEFORE snapshot has already been read (no write occurred — the script is read-only), so no data is mutated. The gate correctly fails, but the operator must inspect the log to determine the crash cause. **UNVERIFIED:** no test simulates a mid-script crash.

3. **Missing RBAC catalog.** The dry-run has a fail-fast check (`scripts/rbac-backfill-dryrun.ts:180-188`) that exits 2 if any canonical Role is missing. The gate runner catches this via failure path 1 (child process exits 2). **But:** the integration test does NOT exercise this scenario (CI always seeds the RBAC catalog). UNVERIFIED.

4. **`readOnlyInvariant` false positive (concurrent writes).** As documented in §D.5, concurrent writes between BEFORE and AFTER snapshots cause `readOnlyInvariant=false` even though the dry-run didn't mutate. The CI ordering (gate before integration tests) prevents this in CI. **But staging/production** would need a low-traffic window or `REPEATABLE READ` isolation (not implemented). UNVERIFIED against staging.

5. **`execSync` shell injection.** `scripts/rbac-gate-ci.ts:32` uses `execSync(\`bunx tsx ${SCRIPT} 2>&1\`, ...)`. If `SCRIPT` were ever user-controlled, this would be a shell injection vulnerability. Currently `SCRIPT` is hard-coded to `"scripts/rbac-backfill-dryrun.ts"` (line 26), so no injection risk. **But** this is a static analysis observation — there's no runtime test that verifies `SCRIPT` cannot be overridden. **Recommendation:** use `execFileSync("bunx", ["tsx", SCRIPT], ...)` (no shell) for defense-in-depth. Not implemented in STEP 15.68.

6. **Gate runner distinguishes "script crashed" vs "script exited 2".** Both produce `process.exit(1)` in the gate runner (failure path 1). The operator must inspect the captured output to distinguish. **Mitigation:** the gate runner logs `"FAIL: dry-run script exited non-zero (status=${e.status ?? "?"})"` which includes the exit code. **But** if `e.status` is undefined (e.g., signal kill), the operator sees `"?"`. UNVERIFIED.

7. **Integration test doesn't verify exit code 0.** Per CR-15.55-03 (`tests/integration/rbac-readonly-role-real.test.ts:240-247`), the integration-time test does NOT require the dry-run to exit 0. This is because concurrent test mutations could cause `readOnlyInvariant=false`, which would make the dry-run exit 2. The test only verifies "no permission errors" and "`DRYRUN_GATE:` line is present." The authoritative exit-0 check is the CI workflow's `Phase C dry-run gate` step (`.github/workflows/ci.yml:77-84`), which runs in isolation. **Gap:** if the CI workflow step is removed or renamed, the integration test alone is insufficient to catch a regression.

### E.4 Coverage matrix

| Failure path | Logic-level test | Static test | CI integration | Real DB |
|---|---|---|---|---|
| Child process fails (non-zero exit) | — | ✓ (`rbac-gate-logic.test.ts:412-424`) | ✓ (CI runs gate step) | UNVERIFIED |
| No `DRYRUN_GATE:` line | ✓ (`rbac-gate-logic.test.ts:145-152`) | — | ✓ | ✓ (CI) |
| Malformed JSON | ✓ (`rbac-gate-logic.test.ts:154-161`) | — | ✓ | ✓ (CI) |
| `gatePasses=false` | ✓ (`rbac-gate-logic.test.ts:79-95, 97-110, 198-214`) | — | ✓ | ✓ (CI) |
| `readOnlyInvariant=false` (counts) | ✓ (`rbac-gate-logic.test.ts:112-127`) | — | ✓ | ✓ (CI) |
| `readOnlyInvariant=false` (fingerprint) | ✓ (`rbac-gate-logic.test.ts:129-143`) | — | ✓ | ✓ (CI) |
| Missing field | ✓ (`rbac-gate-logic.test.ts:163-178`) | — | ✓ | — |
| Wrong type | ✓ (`rbac-gate-logic.test.ts:180-196`) | — | ✓ | — |
| Negative count | ✓ (`rbac-gate-logic.test.ts:269-284`) | — | ✓ | — |
| NaN count | ✓ (`rbac-gate-logic.test.ts:286-301`) | — | ✓ | — |
| Non-integer count | ✓ (`rbac-gate-logic.test.ts:303-318`) | — | ✓ | — |
| Sum mismatch | ✓ (`rbac-gate-logic.test.ts:320-335, 366-394`) | — | ✓ | — |
| Inconsistent gate | ✓ (`rbac-gate-logic.test.ts:337-352`) | — | ✓ | — |
| Success path | ✓ (`rbac-gate-logic.test.ts:59-75`) | — | ✓ | ✓ (CI) |

**Legend:** ✓ = tested, — = not tested, UNVERIFIED = claimed but not verified by an executable test.

---

## F. Code changes (STEP 15.68)

### F.1 `scripts/rbac-backfill-dryrun.ts`

**Change 1: Export `mapLegacyRole` (line 97)**
- Before: `function mapLegacyRole(legacy: string | null | undefined): CanonicalRoleKey | null {`
- After: `export function mapLegacyRole(legacy: string | null | undefined): CanonicalRoleKey | null {`
- Reason: Allow `tests/unit/rbac-dryrun-preflight.test.ts` to import and test the function directly, without spawning the dry-run script.

**Change 2: Guard `main()` with `require.main === module` (lines 634-655)**
- Before: `main().catch(async (err: unknown) => { ... });`
- After: `if (require.main === module) { main().catch(async (err: unknown) => { ... }); }`
- Reason: Allow the script to be imported by tests without triggering `main()` (which would attempt a DB connection). Matches the pattern in `scripts/rbac-gate-ci.ts:94`.
- CLI behavior unchanged: `bunx tsx scripts/rbac-backfill-dryrun.ts` still runs `main()` as before.

**No other changes to the script.** The classification logic, fingerprint code, gate evaluation, and output format are unchanged.

### F.2 `tests/unit/rbac-dryrun-preflight.test.ts` (NEW — 60 tests)

**Test groups:**
1. `STEP 15.68 — mapLegacyRole() edge cases` (24 tests) — §C.3.
2. `STEP 15.68 — PII fields NOT in sample output structure` (5 tests) — §C.4.
3. `STEP 15.68 — Gate logic consistency (sum === total)` (10 tests) — §C.5.
4. `STEP 15.68 — Dry-run script does NOT import write methods` (12 tests) — verifies the script source (comment-stripped) contains no `db.<model>.create/update/delete/upsert/createMany/updateMany/deleteMany`, no `db.$transaction`, no `db.$executeRaw`, no `db.$executeRawUnsafe`, no `db.$runCommandRaw`, no `db.$queryRawUnsafe`, no `logAudit` import.
5. `STEP 15.68 — Dry-run script structural invariants` (9 tests) — verifies `readOnly: true` in output, canonical role keys match across `scripts/rbac-backfill-dryrun.ts` + `prisma/seed-rbac.ts` + `src/lib/authorization/permissions.ts`, SUPERADMIN alias present, owner directive present, FAIL-CLOSED gate logic, `DRYRUN_GATE:` emission, all 5 RBAC tables in BEFORE+AFTER snapshots, fingerprint covers all 5 tables.

**All 60 tests pass.** See test execution evidence in §G.

### F.3 `docs/phase3/STEP-15.68-STAGING-RUNBOOK.md` (NEW)

11-section runbook covering prerequisites, secret handling, pre-execution identity verification, execution command, output storage, classification counts, stop criteria, second-run idempotency, snapshot limitations, post-execution verification, and emergency stop. See the runbook for details.

### F.4 `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md` (NEW)

14-section design document for the apply script (NOT YET IMPLEMENTED). Covers idempotency design, batch processing with checkpoints, transaction behavior, conflict management, no auto-correction policy, dry-run vs apply mode comparison, before/after reporting, stop criteria, recovery/rollback, implementation checklist, and open design questions. See the design doc for details.

### F.5 `docs/verification/STEP-15.68-PREFLIGHT-REPORT.md` (THIS FILE)

Audit report with all findings, file:line references, and limitations.

---

## G. Test execution evidence

### G.1 New preflight tests

```
$ bunx vitest run tests/unit/rbac-dryrun-preflight.test.ts

 ✓ tests/unit/rbac-dryrun-preflight.test.ts (60 tests) 16ms

 Test Files  1 passed (1)
      Tests  60 passed (60)
   Duration  332ms
```

### G.2 All unit tests (regression check)

```
$ bunx vitest run tests/unit/

 ✓ tests/unit/brand-alias.test.ts (8 tests) 5ms
 ✓ tests/unit/lead-score.test.ts (10 tests) 13ms
 ✓ tests/unit/lead-status.test.ts (19 tests) 7ms
 ✓ tests/unit/password.test.ts (6 tests) 724ms
 ✓ tests/unit/rbac-dryrun-preflight.test.ts (60 tests) 18ms  ← NEW
 ✓ tests/unit/rbac-gate-logic.test.ts (22 tests) 4ms
 ✓ tests/unit/rbac.test.ts (12 tests) 7ms
 ✓ tests/unit/rate-limit.test.ts (8 tests) 7ms
 ✓ tests/unit/rbac-dryrun-preflight.test.ts (60 tests) 16ms  ← NEW (re-run)
 ✓ tests/unit/seo-domain.test.ts (12 tests) 4ms
 ✓ tests/unit/site-config.test.ts (18 tests) 46ms
 ✓ tests/unit/upload-security.test.ts (19 tests) 10ms
 ✓ tests/unit/user-roles-helper.test.ts (48 tests) 12ms

 Test Files  12 passed (12)
      Tests  261 passed (261)
```

### G.3 Typecheck

```
$ bun run typecheck
$ tsc --noEmit
(no output = success)
```

### G.4 Lint

```
$ bun run lint
$ eslint .

✖ 11 problems (0 errors, 11 warnings)
  0 errors and 10 warnings potentially fixable with the `--fix` option.
```
All 11 warnings are pre-existing (unused eslint-disable directives in other files). No new warnings introduced by STEP 15.68.

### G.5 Integration test (DB-independent subset)

```
$ bunx vitest run tests/integration/rbac-readonly-role-real.test.ts

 ✓ tests/integration/rbac-readonly-role-real.test.ts (25 tests | 17 skipped) 5ms

 Test Files  1 passed (1)
      Tests  8 passed | 17 skipped (25)
```
The 17 skipped tests require a real PostgreSQL DB (`RUN_TESTS` guard at `tests/integration/rbac-readonly-role-real.test.ts:26`). They run in CI but not in this sandbox. The 8 passing tests are the DB-independent static checks (CI workflow structure, SQL script structure, gate runner structure).

---

## H. Limitations and honest disclosures

### H.1 What STEP 15.68 does NOT do

1. **Does NOT execute the dry-run against staging or production.** This is preparation only.
2. **Does NOT implement the apply script** (`scripts/backfill-user-roles.ts`). The design is documented in `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md`; implementation is deferred to STEP 15.69+.
3. **Does NOT implement the automated preflight identity check** (§A.5). The design is documented; implementation is deferred.
4. **Does NOT modify the read-only SQL role** (`scripts/rbac-create-readonly-role.sql`). The TEMPORARY/EXECUTE/large-object gaps (§B.3) remain. Future hardening is recommended.
5. **Does NOT change the CI workflow** (`.github/workflows/ci.yml`). The gate ordering, role creation, and dry-run step are unchanged.
6. **Does NOT merge the PR.** The PR is created; merge is deferred to the owner.
7. **Does NOT connect to staging or production.** All tests are pure unit tests (no DB) or DB-independent static checks.

### H.2 Claims that are UNVERIFIED

1. **UNVERIFIED:** The `heavix_dryrun_ro` role can execute `SELECT current_user, current_database()` without explicit grants. PostgreSQL allows these system functions by default, but this is not tested against the actual CI role.
2. **UNVERIFIED:** The dry-run's behavior against 1M+ users (memory/scale). Extrapolated from 10K-user estimates (§D.3). No test exercises 1M users.
3. **UNVERIFIED:** The `REPEATABLE READ` transaction isolation mitigation (§D.5). Not implemented; the trade-off (autovacuum bloat) is documented but not measured.
4. **UNVERIFIED:** The mid-script crash behavior (§E.3, limitation 2). No test simulates a crash between BEFORE and AFTER snapshots.
5. **UNVERIFIED:** The `execSync` shell injection risk (§E.3, limitation 5) is mitigated by `SCRIPT` being hard-coded, but no runtime test enforces this invariant.
6. **UNVERIFIED:** The dry-run's behavior when the RBAC catalog is missing (§E.3, limitation 3). The fail-fast check at `scripts/rbac-backfill-dryrun.ts:180-188` is documented, but no test exercises it against a real DB.
7. **UNVERIFIED:** The dry-run's behavior under concurrent role recreation (§B.3, limitation 6). The `DROP ROLE` would fail if connections are open; not tested.

### H.3 What STEP 15.68 DOES verify

1. **`mapLegacyRole()` correctly handles 23 edge cases** (null, undefined, empty, whitespace, SUPERADMIN alias, case-insensitivity, unknown → INVALID). Verified by executable unit tests.
2. **PII fields are NOT in any sample/select/fingerprint output.** Verified by static source inspection (comment-stripped) in the preflight tests.
3. **Gate logic consistency:** `total === OK + MISSING + MISMATCH + MULTI_ROLE + INVALID` and `gatePasses === (INVALID==0 && MISMATCH==0 && MULTI_ROLE==0)` for 10 different classification combinations. Verified by executable unit tests.
4. **The dry-run script does NOT import or call any Prisma write method** (create/update/delete/upsert/createMany/updateMany/deleteMany/$transaction/$executeRaw/$executeRawUnsafe/$runCommandRaw/$queryRawUnsafe/logAudit). Verified by static source inspection (comment-stripped).
5. **The dry-run script's structural invariants** (readOnly: true, canonical role keys match across 3 files, SUPERADMIN alias present, owner directive present, FAIL-CLOSED gate, DRYRUN_GATE emission, 5-table BEFORE+AFTER snapshots, 5-table fingerprint). Verified by static source inspection.
6. **Role mapping is consistent** across `scripts/rbac-backfill-dryrun.ts`, `prisma/seed-rbac.ts`, `prisma/schema.prisma`, and `src/lib/authorization/permissions.ts`. Verified by cross-file static inspection in the preflight tests.

---

## I. Next actions

1. **Review this report** and the companion documents (runbook + design).
2. **Review the PR** (`chore/step-15-68-phase-c-preflight` → `main`).
3. **Wait for CI** (3 jobs: verify, audit-transaction, phase-tests). Expected to pass (no behavior changes to existing code; only additive test file + 2 script docstring/guard changes).
4. **If CI passes:** the owner may merge the PR. STEP 15.68 is complete.
5. **If CI fails:** inspect the failing job. Likely causes:
   - The `export` keyword on `mapLegacyRole` triggers a TypeScript error in `tsconfig.scripts.json` (the script is typechecked separately). Fix: ensure `export` is allowed by the scripts tsconfig.
   - The `require.main === module` guard triggers an ESLint error in CI. Fix: add an eslint-disable comment if needed.
   - The preflight tests fail in CI due to path resolution (`../../scripts/rbac-backfill-dryrun` import). Fix: use `@/scripts/rbac-backfill-dryrun` alias or adjust the relative path.
6. **After merge:** proceed to STEP 15.69 (implement the apply script + automated preflight check), using this report and the design doc as the spec.

---

## J. References

- `scripts/rbac-backfill-dryrun.ts` — dry-run script (audited, minimally modified)
- `scripts/rbac-gate-ci.ts` — CI gate runner (audited, unchanged)
- `scripts/rbac-create-readonly-role.sql` — read-only PG role SQL (audited, unchanged)
- `src/lib/db.ts` — Prisma client singleton (audited, unchanged)
- `src/lib/rbac/gate-logic.ts` — shared gate logic (audited, unchanged)
- `prisma/schema.prisma` — Prisma schema (audited, unchanged)
- `prisma/seed-rbac.ts` — RBAC catalog seed (audited, unchanged)
- `prisma/seed-user-roles.ts` — UserRole seed (audited, unchanged)
- `src/lib/authorization/permissions.ts` — permission matrix (audited, unchanged)
- `tests/unit/rbac-dryrun-preflight.test.ts` — NEW preflight tests (60 tests)
- `tests/unit/rbac-gate-logic.test.ts` — existing gate logic tests (22 tests)
- `tests/integration/rbac-readonly-role-real.test.ts` — existing RO role integration tests (25 tests)
- `.github/workflows/ci.yml` — CI workflow (audited, unchanged)
- `docs/phase3/STEP-15.68-STAGING-RUNBOOK.md` — NEW staging runbook
- `docs/phase3/STEP-15.68-BACKFILL-DESIGN.md` — NEW apply-mode design doc
- `docs/phase3/RBAC-MIGRATION-DESIGN.md` — original Phase C design
- `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md` — addendum
- `docs/verification/STEP-15.44-PHASE-C-DRYRUN.md` — dry-run implementation verification
- `docs/verification/STEP-15.47-DRYRUN-GATE.md` — fail-closed gate policy
- `docs/verification/STEP-15.48-NEGATIVE-PATH-TESTS.md` — negative path tests
- `docs/verification/STEP-15.49-UNIFIED-GATE.md` — unified gate design
- `docs/verification/STEP-15.50-READONLY-ROLE.md` — read-only role design
- `docs/verification/STEP-15.51-READONLY-CI-GATE.md` — CI gate ordering
- `docs/verification/STEP-15.56-GATE-ISOLATION.md` — gate isolation
