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

// ─── Role catalog (canonical, from prisma/schema.prisma:1742-1751) ────────
const CANONICAL_ROLE_KEYS = ['ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT'] as const;
type CanonicalRoleKey = (typeof CANONICAL_ROLE_KEYS)[number];

// ─── Legacy alias map (per RBAC-MIGRATION-DESIGN.md §4.1) ─────────────────
// SUPERADMIN is a legacy alias that collapses into ADMIN. Any other value
// is INVALID (unrecognized) — the dry-run will NOT auto-correct it.
const LEGACY_ALIAS_MAP: Record<string, CanonicalRoleKey> = {
  ADMIN: 'ADMIN',
  SUPERADMIN: 'ADMIN',
  SELLER: 'SELLER',
  BUYER: 'BUYER',
};

/**
 * Map a legacy `User.role` value to a canonical Role.key.
 *
 * Returns:
 *   - The canonical key when the legacy value is recognized.
 *   - `null` when the legacy value is INVALID (unrecognized) — caller must
 *     flag for manual review and MUST NOT auto-correct.
 *
 * Edge cases:
 *   - empty string ("")  → "BUYER"  (per design doc default fallback)
 *   - whitespace-only    → "BUYER"  (defensive)
 *   - null/undefined     → "BUYER"  (shouldn't happen — column is NOT NULL;
 *                                   defensive in case of DB-level bypass)
 *   - lowercase          → uppercased before lookup
 */
function mapLegacyRole(legacy: string | null | undefined): CanonicalRoleKey | null {
  const upper = (legacy ?? '').trim().toUpperCase();
  if (upper === '') return 'BUYER';
  if (upper in LEGACY_ALIAS_MAP) return LEGACY_ALIAS_MAP[upper];
  // Direct canonical match (e.g., "MODERATOR", "SUPPORT" stored as User.role)
  if ((CANONICAL_ROLE_KEYS as readonly string[]).includes(upper)) {
    return upper as CanonicalRoleKey;
  }
  return null; // INVALID
}

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
    gatePasses: boolean; // true iff INVALID==0 AND MISMATCH==0
    ownerDirective: 'نقش‌های مبهم را خودکار اصلاح نکن.';
  };
}

// ─── Configuration ────────────────────────────────────────────────────────
const BATCH_SIZE = 1000; // dry-run uses larger batch than the production
                         // backfill (200) — read-only, no transactional cost.
const SAMPLE_CAP = 20; // per-classification sample size in human output

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
  const gatePasses = invalidCount === 0 && classification.MISMATCH === 0;

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
      ` (requires INVALID==0 AND MISMATCH==0)`,
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
  console.log('═'.repeat(72));
  console.log('DRY-RUN COMPLETE — NO DATABASE WRITES PERFORMED.');
  console.log('═'.repeat(72));
}

// ─── Entrypoint ───────────────────────────────────────────────────────────
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
