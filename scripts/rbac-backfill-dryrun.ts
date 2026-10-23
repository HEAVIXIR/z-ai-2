/* ────────────────────────────────────────────────────────────────────────
 * HEAVIX — Phase C Backfill DRY-RUN (READ-ONLY)
 *
 * Task ID: STEP-15.44-C (Track C — Phase C Dry-Run)
 * Companion to: docs/phase3/RBAC-MIGRATION-DESIGN.md §4 (Phase C — Backfill
 *               UserRole from User.role)
 * Addendum:    docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md
 * Deliverable: docs/verification/STEP-15.44-PHASE-C-DRYRUN.md
 *
 * ── What this script DOES ───────────────────────────────────────────────
 *   • Reads every User row + its UserRole associations.
 *   • Compares the legacy `User.role` column (String, NOT NULL DEFAULT
 *     'BUYER') with the canonical RBAC `UserRole` join table.
 *   • Classifies each user into one of:
 *       OK          — single UserRole row matching the mapped legacy role
 *       MISSING     — zero UserRole rows (backfill would create one)
 *       MISMATCH    — UserRole rows exist but none match the mapped legacy
 *                     role (ambiguous; DO NOT auto-correct)
 *       MULTI_ROLE  — mapped legacy role IS present AND there are extra
 *                     UserRole rows (legitimate combo, e.g. ADMIN+MODERATOR)
 *       INVALID     — `User.role` is not a recognized key or alias
 *                     (DO NOT auto-correct; flag for manual review)
 *   • Emits a structured report (human + JSON) so CI can gate on
 *     `verdict.gatePasses`.
 *
 * ── What this script DOES NOT DO ─────────────────────────────────────────
 *   • NO database writes — no INSERT/UPDATE/DELETE on any table.
 *   • NO AuditLog writes — `logAudit()` is intentionally NOT imported
 *     (it requires `next/headers`, which is unavailable in a CLI context).
 *   • NO auto-correction of ambiguous roles (per owner directive:
 *     "نقش‌های مبهم را خودکار اصلاح نکن.").
 *   • NO network calls.
 *
 * ── Idempotency of the FUTURE backfill script (proof) ────────────────────
 *   The actual `scripts/backfill-user-roles.ts` (Phase C, NOT this dry-run)
 *   will use `db.userRole.upsert({ where: { userId_roleId: ... },
 *   create: {...}, update: {} })` against the schema's existing
 *   `@@unique([userId, roleId])` constraint (prisma/schema.prisma:1781).
 *   First run: creates missing rows. Second run: `update: {}` is a no-op.
 *   No duplicates can ever be created. See deliverable §3 (Idempotency Proof).
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   Local (no PostgreSQL available — script will exit with code 2 and a
 *   connection error; this is expected in the sandbox):
 *     bunx tsx scripts/rbac-backfill-dryrun.ts
 *
 *   CI (against postgres:17 service container):
 *     bunx tsx scripts/rbac-backfill-dryrun.ts | tee dryrun.log
 *
 *   Typecheck (the bare `tsc <file>` form does NOT respect tsconfig's
 *   `paths` alias mapping per TypeScript's CLI rules; use the dedicated
 *   tsconfig.scripts.json which extends the main config):
 *     bunx tsc --noEmit -p tsconfig.scripts.json
 *
 * ── Exit codes ───────────────────────────────────────────────────────────
 *   0 — dry-run completed successfully (regardless of classification counts;
 *       CI gates on `verdict.gatePasses` in the JSON output, not on exit).
 *   2 — unrecoverable error (e.g., DB connection failure, missing Role
 *       catalog rows).
 * ──────────────────────────────────────────────────────────────────────── */

import { db } from '@/lib/db';
import {
  mapLegacyRole,
  sanitizeConnectionString,
  extractDbName,
  CANONICAL_ROLE_KEYS,
  type CanonicalRoleKey,
} from '../src/lib/rbac/dryrun-helpers';

// ─── Role catalog and mapping imported from src/lib/rbac/dryrun-helpers.ts ──
// STEP 15.71 Phase C: mapLegacyRole, sanitizeConnectionString, extractDbName
// are now imported from a shared module so tests exercise the REAL implementation.

// ─── Classification types ─────────────────────────────────────────────────
type ClassificationKind = 'OK' | 'MISSING' | 'MISMATCH' | 'MULTI_ROLE' | 'INVALID';

interface SampleBase {
  userId: string;
  legacyRole: string;
}
interface SampleMissing extends SampleBase {
  canonicalKey: CanonicalRoleKey;
}
interface SampleMismatch extends SampleBase {
  canonicalKey: CanonicalRoleKey;
  userRoleKeys: string[];
}
interface SampleMultiRole extends SampleBase {
  canonicalKey: CanonicalRoleKey;
  userRoleKeys: string[];
}
interface SampleInvalid extends SampleBase {}

interface DryRunReport {
  script: 'rbac-backfill-dryrun';
  version: 'STEP-15.44-C';
  generatedAt: string;
  readOnly: boolean;
  totals: {
    users: number;
    usersWithLegacyRoleSet: number; // User.role != "" (and != null)
    usersWithEmptyLegacyRole: number;
    usersWithoutUserRoleRows: number; // orphans (zero UserRole)
    userRoleRows: number;
    canonicalRolesInDB: string[];
  };
  legacyRoleDistribution: Record<string, number>;
  userRoleDistribution: Record<string, number>;
  classification: Record<ClassificationKind, number>;
  samples: {
    MISSING: SampleMissing[];
    MISMATCH: SampleMismatch[];
    MULTI_ROLE: SampleMultiRole[];
    INVALID: SampleInvalid[];
  };
  verdict: {
    safeToBackfillCount: number; // MISSING — backfill would add the mapped role
    needsInvestigationCount: number; // MISMATCH + MULTI_ROLE — ambiguous
    invalidCount: number; // INVALID — manual review required
    gatePasses: boolean; // true iff INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0 (STEP 15.47 fail-closed)
    ownerDirective: 'نقش‌های مبهم را خودکار اصلاح نکن.';
  };
}

// ─── Configuration ────────────────────────────────────────────────────────
const BATCH_SIZE = 1000; // dry-run uses larger batch than the production
                         // backfill (200) — read-only, no transactional cost.
const SAMPLE_CAP = 20; // per-classification sample size in human output

// ─── STEP 15.68/15.71: Preflight helpers (imported from dryrun-helpers.ts) ──

/**
 * STEP 15.68 preflight: verify connection target + runtime role BEFORE any query.
 *
 * F-15.68-01 (HIGH): Require two-key confirmation.
 *   Operator must set BOTH `DATABASE_URL` and `DRYRUN_CONFIRM_TARGET` to the same
 *   db name. This prevents the dry-run from silently connecting to a wrong db
 *   (e.g., dev database) just because `DATABASE_URL` happened to be set in the
 *   shell environment.
 *
 * F-15.68-02 (MEDIUM): Verify the runtime role is actually `heavix_dryrun_ro`.
 *   The env var NAME is not proof of role — an operator could set `DATABASE_URL`
 *   to a superuser connection string. We query `SELECT current_user` and assert
 *   it matches the expected read-only role name. If `DRYRUN_EXPECTED_ROLE` is
 *   unset, we default to `heavix_dryrun_ro`.
 *
 * F-15.68-07 (LOW): Sanitize all connection-string output. Passwords are NEVER
 *   printed, even if Prisma includes the raw URL in an error.
 *
 * Exits with code 2 on any preflight failure.
 */
async function preflightConnectionCheck(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const confirmTarget = process.env.DRYRUN_CONFIRM_TARGET;
  const expectedRole = process.env.DRYRUN_EXPECTED_ROLE ?? 'heavix_dryrun_ro';

  console.log('── STEP 15.68 Preflight ─────────────────────────────────────');

  // F-15.68-01a: DATABASE_URL must be set
  if (!databaseUrl) {
    console.error('✗ PREFLIGHT FAIL: DATABASE_URL is not set.');
    console.error('  The dry-run refuses to proceed without an explicit connection target.');
    console.error('  No silent fallback to a default database is permitted.');
    process.exit(2);
  }

  // F-15.68-07: sanitize for display
  const sanitizedUrl = sanitizeConnectionString(databaseUrl);
  const dbName = extractDbName(databaseUrl);

  console.log(`  DATABASE_URL (sanitized): ${sanitizedUrl}`);
  console.log(`  Parsed db name          : ${dbName ?? '<unparseable>'}`);
  console.log(`  Expected read-only role : ${expectedRole}`);

  // F-15.68-01b: two-key confirmation — DRYRUN_CONFIRM_TARGET must match db name
  if (!confirmTarget) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_CONFIRM_TARGET is not set.');
    console.error('  Two-key confirmation is required to prevent wrong-db connection.');
    console.error('  Set DRYRUN_CONFIRM_TARGET to the db name in DATABASE_URL, e.g.:');
    console.error(`    DRYRUN_CONFIRM_TARGET="${dbName ?? '<db-name>'}"`);
    process.exit(2);
  }

  if (dbName !== confirmTarget) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_CONFIRM_TARGET does not match DATABASE_URL db name.');
    console.error(`    DRYRUN_CONFIRM_TARGET = ${confirmTarget}`);
    console.error(`    DATABASE_URL db name  = ${dbName ?? '<unparseable>'}`);
    console.error('  This mismatch prevents the dry-run from connecting to an unintended target.');
    process.exit(2);
  }

  console.log('  Target confirmation     : PASS ✅');
  console.log();

  // F-15.68-02: verify runtime role is the expected read-only role
  // Use a raw query via Prisma's $queryRaw to check the current user.
  try {
    const rows = await db.$queryRaw`SELECT current_user, current_database()`;
    const result = rows as Array<{ current_user: string; current_database: string }>;
    const actualUser = result[0]?.current_user;
    const actualDb = result[0]?.current_database;

    // STEP 15.71 Phase B: verify live database matches confirmed target
    if (actualDb !== confirmTarget) {
      console.error('✗ PREFLIGHT FAIL: runtime database does not match confirmed target.');
      console.error(`    current_database() = ${actualDb}`);
      console.error(`    DRYRUN_CONFIRM_TARGET = ${confirmTarget}`);
      console.error('  The dry-run connected to a different database than expected.');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.71 Phase B: verify effective privileges (not just role name)
    // Check that the role is NOT a superuser and has no write privileges
    const superuserCheck = await db.$queryRaw`
      SELECT rolsuper, rolcreaterole, rolcreatedb
      FROM pg_roles WHERE rolname = ${actualUser}
    ` as Array<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean }>;

    if (superuserCheck.length === 0) {
      console.error('✗ PREFLIGHT FAIL: could not find role in pg_roles.');
      await db.$disconnect();
      process.exit(2);
    }

    const roleInfo = superuserCheck[0];
    if (roleInfo.rolsuper) {
      console.error('✗ PREFLIGHT FAIL: role is a superuser — write access is not restricted.');
      await db.$disconnect();
      process.exit(2);
    }
    if (roleInfo.rolcreaterole || roleInfo.rolcreatedb) {
      console.error('✗ PREFLIGHT FAIL: role can create roles or databases — elevated privileges detected.');
      await db.$disconnect();
      process.exit(2);
    }

    // Check role memberships (inherited privileges)
    const membershipCheck = await db.$queryRaw`
      SELECT count(*)::int as cnt
      FROM pg_auth_members
      WHERE member = (SELECT oid FROM pg_roles WHERE rolname = ${actualUser})
    ` as Array<{ cnt: number }>;

    if (membershipCheck[0].cnt > 0) {
      console.error('✗ PREFLIGHT FAIL: role has memberships in other roles — inherited privileges possible.');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.71 Phase B (final): verify effective write privileges on ALL 5 RBAC tables.
    // Per owner directive: "Verify the actual PostgreSQL role's effective privileges
    // rather than relying only on current_user. Check write privileges on all five
    // RBAC tables, relevant sequence privileges, and effective privileges inherited
    // through PUBLIC."
    //
    // We check INSERT, UPDATE, DELETE, TRUNCATE on all 5 RBAC tables via
    // has_table_privilege(). If ANY returns true, the role has write access and
    // the preflight fails closed.
    //
    // NOTE: PostgreSQL table names are case-sensitive when quoted. Prisma creates
    // tables with quoted PascalCase names (e.g., "User", "UserRole"). We must
    // pass the table name as a quoted string literal to has_table_privilege(),
    // not as an unquoted identifier (which would be lowercased to "user").
    const rbacTables = ['User', 'UserRole', 'Role', 'Permission', 'RolePermission'];
    const writePrivileges = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];

    for (const table of rbacTables) {
      // Build the quoted table name: public."User"
      const quotedTable = `public."${table}"`;
      for (const priv of writePrivileges) {
        // Use Prisma.sql for safe identifier interpolation (no SQL injection —
        // values are hardcoded constants, not user input)
        const privCheck = await db.$queryRawUnsafe(
          `SELECT has_table_privilege($1, $2, $3) as has_priv`,
          actualUser,
          quotedTable,
          priv,
        ) as Array<{ has_priv: boolean }>;
        if (privCheck[0]?.has_priv) {
          console.error(`✗ PREFLIGHT FAIL: role has ${priv} privilege on table "${table}".`);
          console.error('  The dry-run role must have SELECT-only privileges on all RBAC tables.');
          console.error('  Check that scripts/rbac-create-readonly-role.sql REVOKE was applied correctly.');
          await db.$disconnect();
          process.exit(2);
        }
      }
    }

    // STEP 15.71 Phase B: also check PUBLIC grants on the 5 RBAC tables.
    // If PUBLIC has any write grants, the role inherits them via PUBLIC.
    for (const table of rbacTables) {
      const publicCheck = await db.$queryRaw`
        SELECT count(*)::int as cnt
        FROM information_schema.role_table_grants
        WHERE grantee = 'PUBLIC'
          AND table_name = ${table}
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      ` as Array<{ cnt: number }>;
      if (publicCheck[0].cnt > 0) {
        console.error(`✗ PREFLIGHT FAIL: PUBLIC has write grants on table "${table}".`);
        console.error('  The role may inherit write privileges via PUBLIC.');
        console.error('  REVOKE write privileges FROM PUBLIC on all RBAC tables.');
        await db.$disconnect();
        process.exit(2);
      }
    }

    console.log(`  Runtime role (current_user)   : ${actualUser}`);
    console.log(`  Runtime database               : ${actualDb}`);
    console.log(`  Superuser check                : ${roleInfo.rolsuper ? 'FAIL' : 'PASS'} (rolsuper=${roleInfo.rolsuper})`);
    console.log(`  Role memberships               : ${membershipCheck[0].cnt} (must be 0)`);
    console.log(`  Write-privilege check          : 5 RBAC tables × 4 write ops = 20 checks — all denied ✅`);
    console.log(`  PUBLIC grants check            : 5 RBAC tables — no PUBLIC write grants ✅`);
    console.log('  Role verification              : PASS ✅');
    console.log('  (Effective privileges verified — not just role name)');
  } catch (err: unknown) {
    // F-15.68-07 / STEP 15.71: sanitize error — use robust URL parsing
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitized = sanitizeConnectionString(rawMsg);
    console.error('✗ PREFLIGHT FAIL: could not query current_user/current_database().');
    console.error('  This usually means the connection failed or the role lacks SELECT on pg_catalog.');
    console.error(`  Error (sanitized): ${sanitized}`);
    await db.$disconnect();
    process.exit(2);
  }

  console.log('── Preflight complete — proceeding with dry-run ──────────────');
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const startedAt = new Date();
  console.log('═'.repeat(72));
  console.log('HEAVIX — Phase C Backfill DRY-RUN (READ-ONLY)');
  console.log('Task ID: STEP-15.44-C');
  console.log('═'.repeat(72));
  console.log(`Started   : ${startedAt.toISOString()}`);
  console.log(`Batch size: ${BATCH_SIZE} users per fetch (read-only)`);
  console.log();

  // ── STEP 15.68: PREFLIGHT — connection target + role verification ────
  // F-15.68-01: No silent fallback to wrong DB. Require explicit two-key confirmation.
  // F-15.68-02: Verify runtime role is actually heavix_dryrun_ro (not superuser).
  // F-15.68-07: Sanitize error output — never print connection string password.
  await preflightConnectionCheck();

  // ── 1. Preload canonical Roles from DB ──────────────────────────────
  // Fail fast if the RBAC catalog is missing — backfill would crash anyway.
  const roles = await db.role.findMany({
    where: { key: { in: [...CANONICAL_ROLE_KEYS] } },
    select: { id: true, key: true },
  });
  const roleByKey = new Map(roles.map((r) => [r.key, r.id] as const));
  const roleById = new Map(roles.map((r) => [r.id, r.key] as const));

  const missingRoleKeys = CANONICAL_ROLE_KEYS.filter((k) => !roleByKey.has(k));
  if (missingRoleKeys.length > 0) {
    console.error(
      `✗ RBAC catalog incomplete — missing Roles: ${missingRoleKeys.join(', ')}`,
    );
    console.error('  Run `bun run db:seed-rbac` to populate the Role/Permission catalog.');
    await db.$disconnect();
    process.exit(2);
  }
  console.log(
    `✓ Canonical Roles loaded: ${roles.length} (${roles
      .map((r) => r.key)
      .join(', ')})`,
  );

  // ── 2. Totals ────────────────────────────────────────────────────────
  const totalUsers = await db.user.count();
  const usersWithoutUserRoleRows = await db.user.count({
    where: { userRoles: { none: {} } },
  });
  const totalUserRoleRows = await db.userRole.count();

  // User.role is NOT NULL DEFAULT 'BUYER' per schema — count empties
  // defensively in case the DB was bypassed.
  const usersWithEmptyLegacyRole = await db.user.count({
    where: { role: '' },
  });

  console.log();
  console.log('── Totals ─────────────────────────────────────────────────────');
  console.log(`  Total users                     : ${totalUsers}`);
  console.log(
    `  Users with empty User.role      : ${usersWithEmptyLegacyRole}` +
      `  (defensive; column is NOT NULL DEFAULT 'BUYER')`,
  );
  console.log(
    `  Users with NO UserRole rows     : ${usersWithoutUserRoleRows}` +
      `  ← orphans (need backfill)`,
  );
  console.log(`  Total UserRole rows             : ${totalUserRoleRows}`);
  console.log();

  if (totalUsers === 0) {
    console.log('No users in DB — nothing to backfill.');
    await emitEmptyReport(roles, startedAt);
    await db.$disconnect();
    process.exit(0);
  }

  // ── STEP 15.49: Read-only proof — ALL 5 TABLES fingerprint BEFORE ─────
  // Capture counts AND content fingerprint of ALL relevant tables.
  // STEP 15.49: fingerprint now covers User, UserRole, Role, Permission, RolePermission.
  const beforeCounts = {
    userCount: await db.user.count(),
    userRoleCount: await db.userRole.count(),
    roleCount: await db.role.count(),
    permissionCount: await db.permission.count(),
    rolePermissionCount: await db.rolePermission.count(),
  };
  // Content fingerprint: sorted arrays of key fields from ALL 5 tables
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
  console.log('── Read-only proof: BEFORE snapshot (all 5 tables) ──────────');
  console.log(`  users: ${beforeCounts.userCount}, userRoles: ${beforeCounts.userRoleCount}, roles: ${beforeCounts.roleCount}, permissions: ${beforeCounts.permissionCount}, rolePermissions: ${beforeCounts.rolePermissionCount}`);
  console.log(`  fingerprint: ${beforeFingerprint.slice(0, 80)}...`);
  console.log();

  // ── 3. Distribution of User.role values (legacy column) ──────────────
  const legacyRoleGroups = await db.user.groupBy({
    by: ['role'],
    _count: { _all: true },
    orderBy: { role: 'asc' },
  });
  const legacyRoleDistribution: Record<string, number> = {};
  for (const g of legacyRoleGroups) {
    // Schema says non-nullable, but defend against DB-level NULLs.
    const raw = g.role as string | null;
    const key = raw === null ? '<null>' : raw === '' ? '<empty>' : raw;
    legacyRoleDistribution[key] = g._count._all;
  }
  console.log('── User.role distribution (legacy column) ───────────────────');
  for (const [k, v] of Object.entries(legacyRoleDistribution).sort(
    (a, b) => b[1] - a[1],
  )) {
    const mapped = mapLegacyRole(k === '<null>' ? null : k === '<empty>' ? '' : k);
    const mappedLabel = mapped ?? 'INVALID';
    console.log(
      `  ${k.padEnd(20)} → ${mappedLabel.padEnd(10)} : ${v}`,
    );
  }
  console.log();

  // ── 4. Distribution of UserRole rows (by canonical Role.key) ─────────
  const userRoleRowsWithKey = await db.userRole.findMany({
    select: { role: { select: { key: true } } },
  });
  const userRoleDistribution: Record<string, number> = {};
  for (const ur of userRoleRowsWithKey) {
    const key = ur.role.key;
    userRoleDistribution[key] = (userRoleDistribution[key] ?? 0) + 1;
  }
  console.log('── UserRole distribution (canonical join table) ─────────────');
  for (const [k, v] of Object.entries(userRoleDistribution).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${k.padEnd(20)} : ${v}`);
  }
  console.log();

  // ── 5. Per-user classification (cursor-paginated) ─────────────────────
  const classification: Record<ClassificationKind, number> = {
    OK: 0,
    MISSING: 0,
    MISMATCH: 0,
    MULTI_ROLE: 0,
    INVALID: 0,
  };
  const samples = {
    MISSING: [] as SampleMissing[],
    MISMATCH: [] as SampleMismatch[],
    MULTI_ROLE: [] as SampleMultiRole[],
    INVALID: [] as SampleInvalid[],
  };

  let cursor: string | undefined = undefined;
  let processed = 0;
  const progressInterval = Math.max(BATCH_SIZE, Math.floor(totalUsers / 10));

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

    for (const u of users) {
      processed++;
      const mapped = mapLegacyRole(u.role);

      if (mapped === null) {
        classification.INVALID++;
        if (samples.INVALID.length < SAMPLE_CAP) {
          samples.INVALID.push({
            userId: u.id,
            legacyRole: u.role,
          });
        }
        continue;
      }

      const userRoleKeys = u.userRoles.map(
        (ur) => roleById.get(ur.roleId) ?? `<unknown:${ur.roleId}>`,
      );
      const canonicalInUserRoles = userRoleKeys.includes(mapped);

      if (userRoleKeys.length === 0) {
        classification.MISSING++;
        if (samples.MISSING.length < SAMPLE_CAP) {
          samples.MISSING.push({
            userId: u.id,
            legacyRole: u.role,
            canonicalKey: mapped,
          });
        }
      } else if (!canonicalInUserRoles) {
        // User has UserRole rows but NONE of them match the mapped legacy
        // role. This is the ambiguous case (MISMATCH in the assignment):
        //   - role=SELLER, UserRole=[BUYER] → was the user demoted from
        //     SELLER to BUYER (canonical wins) or promoted from BUYER to
        //     SELLER (legacy wins, never backfilled)?
        // The dry-run cannot tell. Per owner directive: DO NOT auto-correct.
        classification.MISMATCH++;
        if (samples.MISMATCH.length < SAMPLE_CAP) {
          samples.MISMATCH.push({
            userId: u.id,
            legacyRole: u.role,
            canonicalKey: mapped,
            userRoleKeys,
          });
        }
      } else if (userRoleKeys.length > 1) {
        // Canonical is present AND there are extra UserRole rows. This is
        // legitimate (e.g., an ADMIN who also has MODERATOR). Backfill is
        // a no-op for these users. Informational only.
        classification.MULTI_ROLE++;
        if (samples.MULTI_ROLE.length < SAMPLE_CAP) {
          samples.MULTI_ROLE.push({
            userId: u.id,
            legacyRole: u.role,
            canonicalKey: mapped,
            userRoleKeys,
          });
        }
      } else {
        // Exactly one UserRole row and it matches the mapped legacy role.
        classification.OK++;
      }
    }

    if (processed % progressInterval === 0 || processed === totalUsers) {
      console.log(`  … processed ${processed}/${totalUsers} users`);
    }
  }

  // ── 6. Human-readable classification summary ────────────────────────
  console.log();
  console.log('── Classification ────────────────────────────────────────────');
  console.log(
    `  OK         (single matching UserRole)        : ${classification.OK}`,
  );
  console.log(
    `  MISSING    (zero UserRole — backfill)        : ${classification.MISSING}`,
  );
  console.log(
    `  MISMATCH   (UserRole ≠ User.role)            : ${classification.MISMATCH}` +
      `  ← INVESTIGATE (do NOT auto-correct)`,
  );
  console.log(
    `  MULTI_ROLE (canonical + extra UserRole)     : ${classification.MULTI_ROLE}` +
      `  ← informational (backfill is no-op)`,
  );
  console.log(
    `  INVALID    (legacy role not in catalog)     : ${classification.INVALID}` +
      `  ← MANUAL REVIEW (do NOT auto-correct)`,
  );
  console.log();

  emitSamples('MISSING', samples.MISSING, (s) =>
    `  • ${s.userId}  User.role="${s.legacyRole}" → ${s.canonicalKey}`,
  );
  emitSamples('MISMATCH', samples.MISMATCH, (s) =>
    `  • ${s.userId}  User.role="${s.legacyRole}" → ${s.canonicalKey}, UserRole=[${s.userRoleKeys.join(',')}]`,
  );
  emitSamples('MULTI_ROLE', samples.MULTI_ROLE, (s) =>
    `  • ${s.userId}  User.role="${s.legacyRole}" → ${s.canonicalKey}, UserRole=[${s.userRoleKeys.join(',')}]`,
  );
  emitSamples('INVALID', samples.INVALID, (s) =>
    `  • ${s.userId}  User.role="${s.legacyRole}"`,
  );

  // ── 7. Verdict ───────────────────────────────────────────────────────
  const safeToBackfillCount = classification.MISSING;
  const needsInvestigationCount =
    classification.MISMATCH + classification.MULTI_ROLE;
  const invalidCount = classification.INVALID;
  // STEP 15.47 owner directive: gatePasses must be FAIL-CLOSED.
  // Policy: backfill is NOT safe if ANY of these are nonzero:
  //   - INVALID (legacy role not in catalog — manual review required)
  //   - MISMATCH (UserRole exists but canonical missing — ambiguous, do NOT auto-correct)
  //   - MULTI_ROLE (user has canonical + extra roles — investigate before backfill)
  // Until the owner explicitly approves an accepted-risk override for MULTI_ROLE,
  // conservatively block backfill when ANY class requiring investigation is nonzero.
  const gatePasses =
    invalidCount === 0 &&
    classification.MISMATCH === 0 &&
    classification.MULTI_ROLE === 0;

  console.log('── Verdict ──────────────────────────────────────────────────');
  console.log(
    `  Safe to auto-backfill (MISSING)             : ${safeToBackfillCount}`,
  );
  console.log(
    `  Needs investigation (MISMATCH + MULTI_ROLE) : ${needsInvestigationCount}` +
      `  ← DO NOT auto-correct`,
  );
  console.log(
    `  Needs manual review (INVALID)               : ${invalidCount}` +
      `  ← DO NOT auto-correct`,
  );
  console.log(
    `  Gate: ${gatePasses ? 'PASS' : 'FAIL'}` +
      ` (requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0)`,
  );
  console.log(
    `  Owner directive: «نقش‌های مبهم را خودکار اصلاح نکن.»` +
      ` (do NOT auto-correct ambiguous roles)`,
  );
  console.log();

  // ── 8. JSON output (for CI parsing) ──────────────────────────────────
  const report: DryRunReport = {
    script: 'rbac-backfill-dryrun',
    version: 'STEP-15.44-C',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totals: {
      users: totalUsers,
      usersWithLegacyRoleSet: totalUsers - usersWithEmptyLegacyRole,
      usersWithEmptyLegacyRole,
      usersWithoutUserRoleRows,
      userRoleRows: totalUserRoleRows,
      canonicalRolesInDB: roles.map((r) => r.key).sort(),
    },
    legacyRoleDistribution,
    userRoleDistribution,
    classification,
    samples,
    verdict: {
      safeToBackfillCount,
      needsInvestigationCount,
      invalidCount,
      gatePasses,
      ownerDirective: 'نقش‌های مبهم را خودکار اصلاح نکن.',
    },
  };

  console.log('── JSON report (for CI) ─────────────────────────────────────');
  console.log(JSON.stringify(report, null, 2));
  console.log();

  // ── STEP 15.48: Read-only proof — snapshot DB state AFTER ───────────
  // Uses the gate-logic module for consistent evaluation.
  // STEP 15.49: AFTER fingerprint covers ALL 5 tables (same as BEFORE).
  const afterCounts = {
    userCount: await db.user.count(),
    userRoleCount: await db.userRole.count(),
    roleCount: await db.role.count(),
    permissionCount: await db.permission.count(),
    rolePermissionCount: await db.rolePermission.count(),
  };
  const [afterUsers, afterUserRoles, afterRoles, afterPermissions, afterRolePermissions] = await Promise.all([
    db.user.findMany({ select: { id: true, role: true }, orderBy: { id: 'asc' } }),
    db.userRole.findMany({ select: { userId: true, roleId: true }, orderBy: [{ userId: 'asc' }, { roleId: 'asc' }] }),
    db.role.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
    db.permission.findMany({ select: { id: true, key: true }, orderBy: { id: 'asc' } }),
    db.rolePermission.findMany({ select: { roleId: true, permissionId: true }, orderBy: [{ roleId: 'asc' }, { permissionId: 'asc' }] }),
  ]);
  const afterFingerprint = JSON.stringify({
    users: afterUsers.map(u => `${u.id}:${u.role}`),
    userRoles: afterUserRoles.map(ur => `${ur.userId}:${ur.roleId}`),
    roles: afterRoles.map(r => `${r.id}:${r.key}`),
    permissions: afterPermissions.map(p => `${p.id}:${p.key}`),
    rolePermissions: afterRolePermissions.map(rp => `${rp.roleId}:${rp.permissionId}`),
  });

  // Use the gate-logic module (STEP 15.49: single source of truth)
  const { evaluateGate, formatGateOutput } = await import('@/lib/rbac/gate-logic');
  const gateResult = evaluateGate(
    classification,
    beforeCounts,
    afterCounts,
    beforeFingerprint,
    afterFingerprint,
  );

  console.log('── Read-only proof: AFTER snapshot (all 5 tables) ───────────');
  console.log(`  users: ${afterCounts.userCount}, userRoles: ${afterCounts.userRoleCount}, roles: ${afterCounts.roleCount}, permissions: ${afterCounts.permissionCount}, rolePermissions: ${afterCounts.rolePermissionCount}`);
  console.log(`  fingerprint: ${afterFingerprint.slice(0, 80)}...`);
  console.log(`  READ-ONLY INVARIANT: ${gateResult.readOnlyInvariant ? 'PASS' : 'FAIL — DATA WAS MUTATED!'}`);
  if (!gateResult.readOnlyInvariant) {
    console.error('✗ FATAL: dry-run script mutated the database! Before/After snapshots or fingerprints differ.');
    console.log(formatGateOutput({ ...gateResult, gatePasses: false, readOnlyInvariant: false }));
    await db.$disconnect();
    process.exit(2);
  }

  // Single-line machine-parseable gate output (for CI step)
  console.log(formatGateOutput(gateResult));

  console.log('═'.repeat(72));
  console.log('DRY-RUN COMPLETE — NO DATABASE WRITES PERFORMED.');
  console.log('═'.repeat(72));

  await db.$disconnect();
  // Exit 0 unconditionally — dry-run is informational. CI gates on
  // `verdict.gatePasses` in the JSON output, not on the exit code.
  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function emitSamples<T>(
  label: string,
  sampleList: T[],
  formatter: (s: T) => string,
): void {
  if (sampleList.length === 0) return;
  console.log(
    `── Sample ${label} (first ${sampleList.length}, capped at ${SAMPLE_CAP}) ───`.padEnd(72, '─'),
  );
  for (const s of sampleList) {
    console.log(formatter(s));
  }
  console.log();
}

async function emitEmptyReport(
  roles: { id: string; key: string }[],
  startedAt: Date,
): Promise<void> {
  const report: DryRunReport = {
    script: 'rbac-backfill-dryrun',
    version: 'STEP-15.44-C',
    generatedAt: startedAt.toISOString(),
    readOnly: true,
    totals: {
      users: 0,
      usersWithLegacyRoleSet: 0,
      usersWithEmptyLegacyRole: 0,
      usersWithoutUserRoleRows: 0,
      userRoleRows: 0,
      canonicalRolesInDB: roles.map((r) => r.key).sort(),
    },
    legacyRoleDistribution: {},
    userRoleDistribution: {},
    classification: {
      OK: 0,
      MISSING: 0,
      MISMATCH: 0,
      MULTI_ROLE: 0,
      INVALID: 0,
    },
    samples: { MISSING: [], MISMATCH: [], MULTI_ROLE: [], INVALID: [] },
    verdict: {
      safeToBackfillCount: 0,
      needsInvestigationCount: 0,
      invalidCount: 0,
      gatePasses: true,
      ownerDirective: 'نقش‌های مبهم را خودکار اصلاح نکن.',
    },
  };
  console.log('── JSON report (for CI) ─────────────────────────────────────');
  console.log(JSON.stringify(report, null, 2));
  console.log();
  // STEP 15.49: Empty-DB path must output full valid DRYRUN_GATE with readOnlyInvariant.
  // STEP 15.50: includes okCount for exact total equality validation.
  console.log(`DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":0,"safeToBackfillCount":0,"mismatchCount":0,"multiRoleCount":0,"invalidCount":0,"total":0}`);
  console.log('═'.repeat(72));
  console.log('DRY-RUN COMPLETE — NO DATABASE WRITES PERFORMED.');
  console.log('═'.repeat(72));
}

// ─── Entrypoint ───────────────────────────────────────────────────────────
// STEP 15.68: Guard with `require.main === module` so the script can be
// imported by `tests/unit/rbac-dryrun-preflight.test.ts` for pure unit
// testing of `mapLegacyRole()` without triggering the DB-backed main()
// routine. The CLI behavior (`bunx tsx scripts/rbac-backfill-dryrun.ts`)
// is unchanged — when run directly, main() executes as before.
if (require.main === module) {
  main().catch(async (err: unknown) => {
    console.error('═'.repeat(72));
    console.error('✗ Phase C dry-run failed with an unrecoverable error.');
    console.error('  This is expected in sandboxes WITHOUT PostgreSQL.');
    console.error('  In CI/production, this indicates a real DB connection issue.');
    console.error('═'.repeat(72));
    console.error(err);
    try {
      await db.$disconnect();
    } catch {
      /* ignore — best-effort */
    }
    process.exit(2);
  });
}
