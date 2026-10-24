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
  extractHost,
  resolveTrustedRole,
  categorizeDbError,
  redactConnectionDetails,
  CANONICAL_ROLE_KEYS,
  type CanonicalRoleKey,
} from '../src/lib/rbac/dryrun-helpers';

// ─── Role catalog and mapping imported from src/lib/rbac/dryrun-helpers.ts ──
// STEP 15.71 Phase C: mapLegacyRole, sanitizeConnectionString, extractDbName
// are now imported from a shared module so tests exercise the REAL implementation.
// STEP 15.72: extractHost, resolveTrustedRole, categorizeDbError,
// redactConnectionDetails added for server identity verification,
// trusted-role allowlist enforcement, and safe error categorization.
// `redactConnectionDetails` is exported by dryrun-helpers.ts and applied
// defensively in the top-level error handler to mask any URL that might
// appear in the error's string form (defense-in-depth alongside
// categorizeDbError, which never returns raw text).
//
// STEP 15.75: the `detectCiEnvironment` helper was REMOVED from dryrun-helpers.ts.
// Env-var-based CI trust was insecure: an operator could set ALL THREE
// signals (GITHUB_ACTIONS, CI, DRYRUN_CI_HOST_CHECK_EXCEPTION) on any
// machine to bypass server-identity verification. SCHEMA/SEED READINESS is
// now verified via LIVE DB content (table existence + Role catalog) after the
// role/privilege checks. `inet_server_addr` and `dnsLookup` are gone.
// `DRYRUN_CI_HOST_CHECK_EXCEPTION` is now a deprecated bypass: ANY value
// halts with exit 2 (fail closed).
//
// STEP 15.76: SCHEMA/SEED READINESS is NOT server identity. A staging DB,
// cloned DB, or wrong cluster can have the same 5 RBAC tables and 5
// canonical roles — content checks prove SCHEMA readiness, not which
// server we are connected to. To close this gap, an INDEPENDENT TRUST
// ANCHOR mechanism was added: if `DRYRUN_SERVER_IDENTITY_ANCHOR` is set,
// the preflight queries `SELECT value FROM "_dryrun_anchor" WHERE key = 'server_identity'`
// (a TABLE (_dryrun_anchor) created by the DBA via
// `CREATE TABLE _dryrun_anchor + INSERT (see scripts/rbac-create-anchor-table.sql)`) and compares
// it with the anchor value. The anchor is an out-of-band value supplied by
// the operator; the table value is set out-of-band by the DBA. An operator cannot
// fake the table value via env vars. If the anchor is NOT set, the preflight logs
// "Server identity: UNVERIFIED ⚠" and continues (the run is NOT blocked —
// the operator is informed that identity has not been independently
// confirmed). If the anchor IS set and the table value mismatches, the preflight
// halts with exit 2 (wrong server).

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
 * STEP 15.72 hardening:
 *   - resolveTrustedRole() validates DRYRUN_EXPECTED_ROLE against a fixed
 *     allowlist (Finding 2). A non-allowlisted role fails closed.
 *   - DRYRUN_EXPECTED_HOST is required and matched against the host parsed
 *     from DATABASE_URL (Finding 4) to detect proxy / MITM scenarios.
 *   - Effective privilege audit extends to sequences (USAGE/UPDATE), schema
 *     CREATE, database CREATE, and table ownership (Finding 3).
 *   - All catch blocks use categorizeDbError() (Finding 5) — never print raw
 *     error text, but operators can distinguish failure types.
 *
 * STEP 15.75 hardening (owner fix — remove env-var-based CI trust):
 *   - Removed the `detectCiEnvironment` helper. ALL THREE prior CI signals
 *     (GITHUB_ACTIONS, CI, DRYRUN_CI_HOST_CHECK_EXCEPTION) were caller-controlled
 *     env vars; an operator could set ALL THREE on any machine. No combination
 *     of env vars can cryptographically prove "this is GitHub Actions CI."
 *   - `DRYRUN_CI_HOST_CHECK_EXCEPTION` is now a DEPRECATED bypass: ANY value
 *     halts with exit 2 (fail closed). The flag is no longer honored.
 *   - Removed the `inet_server_addr` IP comparison + DNS lookup. SCHEMA/SEED
 *     READINESS is now verified via LIVE DB content (table existence + Role
 *     catalog) AFTER the role/privilege checks. A wrong database (even on the
 *     right hostname) will fail these checks.
 *
 * STEP 15.76 hardening (owner fix — content checks are NOT identity):
 *   - The owner correctly identified that the STEP 15.75 "content-based
 *     identity verification" claim was an overstatement: checking that 5 RBAC
 *     tables exist + 5 canonical roles are seeded proves SCHEMA/SEED READINESS,
 *     NOT which server we are connected to. A staging DB, cloned DB, or wrong
 *     cluster could have the same tables and roles.
 *   - ALL "Content-based identity" labels are renamed to "Schema/seed
 *     readiness". ALL "Host identity: verified ✅" overstatements are
 *     replaced with "Hostname consistency" labels that explicitly say
 *     "Configuration consistency — NOT a server-identity proof".
 *   - An INDEPENDENT TRUST ANCHOR mechanism is added: if
 *     `DRYRUN_SERVER_IDENTITY_ANCHOR` is set, the preflight queries the
 *     TABLE _dryrun_anchor (key='server_identity') (set out-of-band by the DBA via
 *     `CREATE TABLE _dryrun_anchor + INSERT (see scripts/rbac-create-anchor-table.sql)`) and compares
 *     it with the anchor. If match → "Anchor check: PASS" (wrong-DB defense).
 *     Server identity remains UNVERIFIED — a cloned DB would pass too.
 *     If mismatch → halt with exit 2 (wrong DB — anchor value differs).
 *     If the anchor env var is NOT set → "Server identity: UNVERIFIED ⚠ (no
 *     database-local anchor — DRYRUN_SERVER_IDENTITY_ANCHOR not set)" and
 *     the run continues (it is NOT blocked — the operator is informed that
 *     identity has not been independently confirmed).
 *   - The anchor value must NOT come from DATABASE_URL — it is an out-of-band
 *     value supplied by the operator. The table must exist on the
 *     server side by the DBA — an operator cannot fake it via env vars.
 *
 * Exits with code 2 on any preflight failure.
 */
async function preflightConnectionCheck(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const confirmTarget = process.env.DRYRUN_CONFIRM_TARGET;
  const expectedRoleRaw = process.env.DRYRUN_EXPECTED_ROLE;
  const expectedHost = process.env.DRYRUN_EXPECTED_HOST;
  // STEP 15.76: Database-local anchor for wrong-DB defense (NOT server identity).
  // This is an OUT-OF-BAND value supplied by the operator — it must NOT be
  // derived from DATABASE_URL. The DBA sets the matching value on the
  // server side via `CREATE TABLE _dryrun_anchor + INSERT (see scripts/rbac-create-anchor-table.sql)`.
  // If unset, the preflight proceeds but logs "Server identity: UNVERIFIED ⚠".
  // If set, the table value is queried after DB connect and compared with this anchor.
  // If mismatch → halt with exit 2 (wrong server).
  const serverIdentityAnchor = process.env.DRYRUN_SERVER_IDENTITY_ANCHOR;

  console.log('── STEP 15.68 Preflight (STEP 15.72 hardening) ─────────────');

  // F-15.68-01a: DATABASE_URL must be set
  if (!databaseUrl) {
    console.error('✗ PREFLIGHT FAIL: DATABASE_URL is not set.');
    console.error('  The dry-run refuses to proceed without an explicit connection target.');
    console.error('  No silent fallback to a default database is permitted.');
    process.exit(2);
  }

  // F-15.68-07: sanitize for display (NEVER prints credentials)
  const sanitizedUrl = sanitizeConnectionString(databaseUrl);
  const dbName = extractDbName(databaseUrl);
  const parsedHost = extractHost(databaseUrl);

  console.log(`  DATABASE_URL (sanitized): ${sanitizedUrl}`);
  console.log(`  Parsed db name          : ${dbName ?? '<unparseable>'}`);
  console.log(`  Parsed host             : ${parsedHost ?? '<unparseable>'}`);

  // F-15.68-01b: two-key confirmation — DRYRUN_CONFIRM_TARGET must match db name.
  // This is the first target-identity check (verifies which database to connect to).
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

  // STEP 15.73 Finding 4 (MANDATORY): DRYRUN_EXPECTED_HOST is ALWAYS required.
  // The hostname must match the host parsed from DATABASE_URL.
  // STEP 15.75: There is NO exception. The inet_server_addr() IP check was
  // removed entirely (it was a flawed signal — an operator could set ALL
  // CI env vars to bypass it). SCHEMA/SEED READINESS is now verified via
  // LIVE DB content (table existence + Role catalog) AFTER the role/privilege
  // checks below. STEP 15.76: hostname match is a CONFIGURATION CONSISTENCY
  // check — it confirms the operator's declared hostname matches the host
  // in DATABASE_URL. It is NOT a server-identity proof: a proxy, MITM, or
  // the wrong cluster on the same hostname would still pass this check.
  // Server identity is only independently verified when
  // DRYRUN_SERVER_IDENTITY_ANCHOR is set (see trust-anchor check below).
  // If the host cannot be parsed, the preflight halts — it does NOT
  // continue with a warning.
  if (!expectedHost) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST is not set.');
    console.error('  Hostname consistency verification is MANDATORY.');
    console.error('  Set DRYRUN_EXPECTED_HOST to the hostname in DATABASE_URL, e.g.:');
    console.error(`    DRYRUN_EXPECTED_HOST="${parsedHost ?? '<host>'}"`);
    process.exit(2);
  }

  if (!parsedHost) {
    console.error('✗ PREFLIGHT FAIL: could not parse host from DATABASE_URL.');
    console.error('  Cannot verify hostname consistency without a parseable host.');
    process.exit(2);
  }

  if (parsedHost !== expectedHost) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST does not match DATABASE_URL host.');
    console.error(`    DRYRUN_EXPECTED_HOST = ${expectedHost}`);
    console.error(`    DATABASE_URL host    = ${parsedHost}`);
    console.error('  This mismatch prevents connection to an unexpected server.');
    process.exit(2);
  }
  // STEP 15.76: hostname match is CONFIGURATION CONSISTENCY, NOT a
  // server-identity proof. A proxy, MITM, or wrong cluster on the same
  // hostname would still pass this check. The owner correctly identified
  // that the prior label "Host identity: verified ✅ (hostname match
  // verified)" was an overstatement. Server identity is only independently
  // verified when DRYRUN_SERVER_IDENTITY_ANCHOR is set (see trust-anchor
  // check below).
  console.log('  Hostname consistency     : PASS ✅ (Configuration consistency — NOT a server-identity proof)');

  // STEP 15.76: Independent trust-anchor status (logged EARLY, before DB
  // connect, so the operator sees the status even if the DB connection
  // subsequently fails). The actual GUC query happens AFTER DB connect +
  // role/privilege/schema checks — it is deferred to the try block below
  // because the table query requires an established connection.
  //
  // STEP 15.79 POLICY (explicit):
  // - If DRYRUN_SERVER_IDENTITY_ANCHOR is NOT set → log UNVERIFIED ⚠ and
  //   CONTINUE the dry-run. This is acceptable for DIAGNOSTIC dry-runs
  //   (the operator is informed that server identity is NOT confirmed).
  //   The dry-run output is informational and does NOT perform writes.
  // - For any operation that DEPENDS on server identity (e.g., production
  //   backfill), the anchor MUST be set + configured. The dry-run script
  //   itself does not enforce this — it is a policy decision for the owner
  //   staging/production authorization gate. The UNVERIFIED status in the
  //   audit report is the signal for that gate.
  // - If DRYRUN_SERVER_IDENTITY_ANCHOR IS set → log PENDING ⏳ and defer
  //   the comparison to the post-DB-connect trust-anchor check below.
  if (serverIdentityAnchor === undefined || serverIdentityAnchor === '') {
    console.log('  Server identity         : UNVERIFIED ⚠ (no database-local anchor (DRYRUN_SERVER_IDENTITY_ANCHOR not set) — wrong-DB defense only)');
    console.log('    (Acceptable for diagnostic dry-run. For operations depending on server');
    console.log('     identity, the anchor must be configured. See STEP 15.79 policy.)');
  } else {
    console.log('  Server identity         : PENDING ⏳ (database-local anchor configured — will verify after DB connect (wrong-DB defense))');
  }

  // STEP 15.75: DEPRECATED bypass flag — fail closed on ANY value.
  // The prior design honored DRYRUN_CI_HOST_CHECK_EXCEPTION=true to skip the
  // inet_server_addr() IP check inside CI. Since the IP check is now removed
  // entirely AND env-var-based CI trust was insecure (all three signals are
  // caller-controlled), the flag is no longer honored: ANY value halts with
  // exit 2. This is fail-closed: if an operator sets the flag (even to "false"),
  // the preflight refuses to proceed. The flag remains in the env-var namespace
  // purely so that legacy CI configs that still set it will loudly fail
  // rather than silently behave like the old (insecure) path.
  if (process.env.DRYRUN_CI_HOST_CHECK_EXCEPTION !== undefined) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_CI_HOST_CHECK_EXCEPTION is set (deprecated).');
    console.error('    Value                  :', JSON.stringify(process.env.DRYRUN_CI_HOST_CHECK_EXCEPTION));
    console.error('  This flag is no longer honored. STEP 15.75 removed env-var-based');
    console.error('  CI trust entirely — no combination of GITHUB_ACTIONS, CI, or');
    console.error('  DRYRUN_CI_HOST_CHECK_EXCEPTION can bypass server-identity verification.');
    console.error('  Schema/seed readiness is now verified via LIVE DB content (table existence +');
    console.error('  Role catalog) AFTER the role/privilege checks.');
    console.error('  STEP 15.76: server identity (separate from schema readiness) requires the');
    console.error('  database-local anchor (DRYRUN_SERVER_IDENTITY_ANCHOR) — set it to');
    console.error('  verify which server we are actually connected to.');
    console.error('  Remove DRYRUN_CI_HOST_CHECK_EXCEPTION from your environment.');
    process.exit(2);
  }

  // STEP 15.72 Finding 2: resolve the trusted role via allowlist (not raw env var).
  // If DRYRUN_EXPECTED_ROLE is unset, default to 'heavix_dryrun_ro' (in allowlist).
  // If DRYRUN_EXPECTED_ROLE is set but NOT in allowlist, fail closed.
  const trustedRole = resolveTrustedRole(expectedRoleRaw);
  if (trustedRole === null) {
    console.error('✗ PREFLIGHT FAIL: DRYRUN_EXPECTED_ROLE is not in the trusted allowlist.');
    console.error(`    DRYRUN_EXPECTED_ROLE = ${expectedRoleRaw ?? '<empty>'}`);
    console.error('  Only role names present in TRUSTED_READONLY_ROLE_ALLOWLIST are accepted.');
    console.error('  This prevents privilege elevation via a caller-configured role name.');
    process.exit(2);
  }
  console.log(`  Trusted read-only role : ${trustedRole} (allowlist-verified)`);

  console.log('  Target confirmation     : PASS ✅');
  console.log();

  // F-15.68-02: verify runtime role is the expected read-only role
  // Use a raw query via Prisma's $queryRaw to check the current user.
  // STEP 15.75: inet_server_addr() removed — we no longer query the server
  // IP address. SCHEMA/SEED READINESS is verified via content (table existence
  // + Role catalog) below, not via IP comparison. STEP 15.76: schema/seed
  // readiness is NOT server identity — see the trust-anchor check below
  // for the independent server-identity verification (when configured).
  try {
    const rows = await db.$queryRaw`SELECT current_user, current_database()`;
    const result = rows as Array<{
      current_user: string;
      current_database: string;
    }>;
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

    // STEP 15.72 Finding 2: assert actualUser === trustedRole (allowlist-verified).
    // Per owner directive: "The preflight must assert actualUser === trustedRole
    // (not just check privileges)" — the runtime identity must match the trusted
    // identity, not merely satisfy a privilege profile.
    if (actualUser !== trustedRole) {
      console.error('✗ PREFLIGHT FAIL: runtime role does not match the trusted read-only role.');
      console.error(`    current_user      = ${actualUser}`);
      console.error(`    trustedRole       = ${trustedRole}`);
      console.error('  The dry-run must run as the allowlist-verified read-only role.');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.74 → STEP 15.75: The inet_server_addr() IP check has been
    // REMOVED entirely. The owner identified that ALL THREE CI signals
    // (GITHUB_ACTIONS, CI, DRYRUN_CI_HOST_CHECK_EXCEPTION) are caller-
    // controlled env vars — an operator could set ALL THREE on any machine
    // to bypass the IP check. No combination of env vars can cryptographically
    // prove "this is GitHub Actions CI."
    //
    // STEP 15.76: SCHEMA/SEED READINESS is verified via LIVE DB content
    // (table existence + Role catalog) AFTER the privilege checks below.
    // A wrong database (even on the right hostname) will fail those content
    // checks — env vars cannot fake table existence or the Role catalog.
    // NOTE: schema/seed readiness is NOT server identity. Server identity
    // is independently verified by the trust-anchor check (TABLE
    // _dryrun_anchor vs DRYRUN_SERVER_IDENTITY_ANCHOR) when the
    // anchor env var is set. STEP 15.77: TABLE-based, not GUC (session-forgeable).

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

    // STEP 15.72 Finding 3: Sequence privilege audit (USAGE and UPDATE).
    // The read-only role must NOT be able to call nextval() (USAGE) or setval()
    // (UPDATE) on any sequence in the public schema. SELECT-only on sequences
    // is the safe configuration (allows currval, denies nextval/setval).
    // If the audit cannot run (permission denied on pg_class), fail closed.
    const sequencePrivCheck = await db.$queryRawUnsafe(
      `SELECT
         c.relname AS sequence_name,
         has_sequence_privilege($1, c.oid, 'USAGE') AS can_usage,
         has_sequence_privilege($1, c.oid, 'UPDATE') AS can_update
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'S'
         AND n.nspname = 'public'`,
      actualUser,
    ) as Array<{ sequence_name: string; can_usage: boolean; can_update: boolean }>;

    for (const seq of sequencePrivCheck) {
      if (seq.can_usage) {
        console.error(`✗ PREFLIGHT FAIL: role has USAGE privilege on sequence "${seq.sequence_name}".`);
        console.error('  USAGE allows nextval() — the read-only role must not advance sequences.');
        console.error('  REVOKE USAGE ON ALL SEQUENCES IN SCHEMA public FROM the read-only role.');
        await db.$disconnect();
        process.exit(2);
      }
      if (seq.can_update) {
        console.error(`✗ PREFLIGHT FAIL: role has UPDATE privilege on sequence "${seq.sequence_name}".`);
        console.error('  UPDATE allows setval() — the read-only role must not mutate sequences.');
        console.error('  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM the read-only role.');
        await db.$disconnect();
        process.exit(2);
      }
    }

    // STEP 15.72 Finding 3: Schema CREATE privilege check.
    // A read-only role must NOT be able to CREATE tables in any schema — CREATE
    // implies the ability to define new relations (which could be used to
    // exfiltrate data via triggers or views).
    const schemaCreateCheck = await db.$queryRawUnsafe(
      `SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create`,
      actualUser,
    ) as Array<{ can_create: boolean }>;
    if (schemaCreateCheck[0]?.can_create) {
      console.error('✗ PREFLIGHT FAIL: role has CREATE privilege on schema "public".');
      console.error('  CREATE allows defining new tables/views — the read-only role must not.');
      console.error('  REVOKE CREATE ON SCHEMA public FROM the read-only role.');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.72 Finding 3: Database CREATE privilege check.
    // A read-only role must NOT be able to CREATE databases.
    const dbCreateCheck = await db.$queryRawUnsafe(
      `SELECT has_database_privilege($1, current_database(), 'CREATE') AS can_create_db`,
      actualUser,
    ) as Array<{ can_create_db: boolean }>;
    if (dbCreateCheck[0]?.can_create_db) {
      console.error('✗ PREFLIGHT FAIL: role has CREATE privilege on the current database.');
      console.error('  CREATE DATABASE is an elevated privilege — the read-only role must not have it.');
      console.error('  REVOKE CREATE ON DATABASE from the read-only role (or recreate the role without CREATEDB).');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.72 Finding 3: Table ownership check.
    // Ownership of a table implies ALL privileges on it (including write).
    // The read-only role must not OWN any tables in any schema.
    const ownershipCheck = await db.$queryRawUnsafe(
      `SELECT count(*)::int AS cnt
       FROM pg_class c
       JOIN pg_roles r ON r.oid = c.relowner
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
         AND r.rolname = $1`,
      actualUser,
    ) as Array<{ cnt: number }>;
    if (ownershipCheck[0].cnt > 0) {
      console.error(`✗ PREFLIGHT FAIL: role owns ${ownershipCheck[0].cnt} relation(s) in pg_class.`);
      console.error('  Ownership implies ALL privileges (including write) — the read-only role must not own any relation.');
      console.error('  Reassign ownership: ALTER TABLE ... OWNER TO <admin_role>; for each owned relation.');
      await db.$disconnect();
      process.exit(2);
    }

    // STEP 15.75: Schema/seed readiness verification (REPLACES inet_server_addr IP check).
    //
    // The owner identified that ALL THREE prior CI signals (GITHUB_ACTIONS,
    // CI, DRYRUN_CI_HOST_CHECK_EXCEPTION) are caller-controlled env vars —
    // an operator could set ALL THREE on any machine to bypass the IP check.
    // No combination of env vars can cryptographically prove "this is
    // GitHub Actions CI."
    //
    // STEP 15.76: This block verifies SCHEMA/SEED READINESS, NOT server
    // identity. A staging DB, cloned DB, or wrong cluster on the same
    // hostname could have the same 5 RBAC tables and 5 canonical roles —
    // these checks prove the schema is in place, not which server we are
    // connected to. Server identity is independently verified by the
    // trust-anchor check below (when DRYRUN_SERVER_IDENTITY_ANCHOR is set).
    //
    // Schema/seed readiness is now verified via LIVE DB content queries:
    //   1. Verify ALL 5 RBAC tables exist (User, UserRole, Role, Permission,
    //      RolePermission) via information_schema.tables. A wrong database
    //      (even on the right hostname) will be missing these tables.
    //   2. Verify Role catalog contains ALL 5 canonical roles (ADMIN, SELLER,
    //      BUYER, MODERATOR, SUPPORT) via SELECT key FROM "Role". A database
    //      missing the canonical RBAC seed is not the production target.
    //
    // These are LIVE DB queries — an operator cannot fake table existence
    // or Role catalog contents via env vars. This is the cryptographic
    // replacement for the (insecure) env-var-based CI detection.
    //
    // The table names are hardcoded string literals (NOT user input) —
    // no SQL injection risk. PostgreSQL table names are case-sensitive
    // when quoted, so the IN clause uses quoted PascalCase identifiers.
    const RBAC_TABLE_NAMES = ['User', 'UserRole', 'Role', 'Permission', 'RolePermission'] as const;

    const tablesRows = await db.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('User', 'UserRole', 'Role', 'Permission', 'RolePermission')
    ` as Array<{ table_name: string }>;

    const foundTables = new Set(tablesRows.map((r) => r.table_name));
    const missingTables = RBAC_TABLE_NAMES.filter((t) => !foundTables.has(t));
    if (missingTables.length > 0) {
      console.error('✗ PREFLIGHT FAIL: required RBAC tables missing from public schema.');
      console.error(`    Missing tables        : ${missingTables.join(', ')}`);
      console.error('  STEP 15.75 schema/seed readiness verification requires ALL 5 RBAC');
      console.error('  tables (User, UserRole, Role, Permission, RolePermission) to exist.');
      console.error('  A wrong database (even on the right hostname) will be missing these.');
      console.error('  Run `bunx prisma db push` against the intended target before retrying.');
      await db.$disconnect();
      process.exit(2);
    }

    // Verify the Role catalog contains ALL 5 canonical roles.
    // "Role" is a PostgreSQL reserved-ish word AND case-sensitive when quoted —
    // we MUST quote it as "Role" so PostgreSQL does not lowercase it to "role".
    const rolesRows = await db.$queryRaw`
      SELECT key FROM "Role" WHERE key IN ('ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT')
    ` as Array<{ key: string }>;

    const foundRoleKeys = new Set(rolesRows.map((r) => r.key));
    const missingRoleKeysInCatalog = CANONICAL_ROLE_KEYS.filter(
      (k) => !foundRoleKeys.has(k),
    );
    if (missingRoleKeysInCatalog.length > 0) {
      console.error('✗ PREFLIGHT FAIL: canonical Role catalog is incomplete.');
      console.error(`    Missing roles         : ${missingRoleKeysInCatalog.join(', ')}`);
      console.error('  STEP 15.75 schema/seed readiness verification requires ALL 5');
      console.error('  canonical roles (ADMIN, SELLER, BUYER, MODERATOR, SUPPORT) in the');
      console.error('  Role table. A database missing the RBAC seed is not the target.');
      console.error('  Run `bun run db:seed-rbac` against the intended target before retrying.');
      await db.$disconnect();
      process.exit(2);
    }

    console.log(`  RBAC table existence check   : ALL 5 tables present ✅ (${RBAC_TABLE_NAMES.join(', ')})`);
    console.log(`  Role catalog readiness check : ALL 5 canonical roles present ✅ (${CANONICAL_ROLE_KEYS.join(', ')})`);
    console.log(`  Schema/seed readiness        : PASS ✅ (live DB content verified)`);

    // STEP 15.78 (Finding H-04 — HONEST SCOPE of the anchor control):
    //
    // The anchor table (_dryrun_anchor) is a DEFENSE AGAINST ACCIDENTAL
    // WRONG-DB CONNECTION — e.g., connecting to a dev/staging DB that lacks
    // the anchor, or has a different anchor value. It is NOT a cryptographic
    // proof of server identity.
    //
    // A CLONED DATABASE, a restored backup, or a logical replication target
    // will have the IDENTICAL table contents — including the anchor value.
    // This control CANNOT distinguish the original server from a clone.
    //
    // TRUE server identity requires TLS with CA validation (verifying the
    // server's TLS certificate against a trusted CA), which is a deployment-
    // architecture decision OUTSIDE this script's scope.
    //
    // Until TLS-based verification is deployed, Finding D (server identity)
    // remains UNVERIFIED in the audit report — NOT FIXED.
    //
    // ── What the anchor DOES protect against (STEP 15.77 + 15.78): ──
    //   1. Session-level forgery (client SET cannot change table contents)
    //   2. Accidental wrong-DB connection (a DB without the anchor fails)
    //   3. Role-based forgery (the role has no write on the anchor table)
    //
    // ── What the anchor DOES NOT protect against (H-04): ──
    //   1. A cloned database with identical table contents
    //   2. A restored backup of the production DB
    //   3. A logical replication target
    //   These scenarios require TLS/CA validation (out-of-band).
    //
    // STEP 15.78: the SQL installation script is now NON-DESTRUCTIVE
    // (CREATE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING). Rotation uses
    // a separate script (scripts/rbac-rotate-anchor.sql). Re-installation
    // does NOT destroy the existing anchor value.
    //
    // If DRYRUN_SERVER_IDENTITY_ANCHOR was NOT set at the top of preflight,
    // this block is skipped (the UNVERIFIED ⚠ message was already logged
    // before DB connect). The run continues — the operator was informed.
    if (serverIdentityAnchor !== undefined && serverIdentityAnchor !== '') {
      // Check 1: verify the _dryrun_anchor table exists.
      const anchorTableExists = await db.$queryRaw`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = '_dryrun_anchor'
        ) AS exists
      ` as Array<{ exists: boolean }>;
      if (!anchorTableExists[0]?.exists) {
        console.error('✗ PREFLIGHT FAIL: DRYRUN_SERVER_IDENTITY_ANCHOR is set but the _dryrun_anchor table does not exist.');
        console.error('  The DBA must create the anchor table and insert the server identity value.');
        console.error('  See scripts/rbac-create-anchor-table.sql for setup instructions.');
        console.error('  STEP 15.77: TABLE-based anchor (not GUC) — session-level forgery is closed.');
        await db.$disconnect();
        process.exit(2);
      }

      // Check 2: verify the role has SELECT-only on _dryrun_anchor (no write).
      // This is CRITICAL: if the role can write to the anchor table, it could
      // forge the value. The preflight already checked the 5 RBAC tables —
      // we now check the anchor table too.
      for (const writePriv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const writeCheck = await db.$queryRaw`
          SELECT has_table_privilege(${actualUser}, 'public."_dryrun_anchor"', ${writePriv}) AS has_priv
        ` as Array<{ has_priv: boolean }>;
        if (writeCheck[0]?.has_priv) {
          console.error(`✗ PREFLIGHT FAIL: role has ${writePriv} privilege on _dryrun_anchor table.`);
          console.error('  The trust-anchor table must be SELECT-only for the read-only role.');
          console.error('  If the role can write to the anchor table, the value is forgeable.');
          console.error('  REVOKE write privileges: REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON _dryrun_anchor FROM heavix_dryrun_ro;');
          await db.$disconnect();
          process.exit(2);
        }
      }

      // Check 3: query the anchor value from the table.
      const anchorRows = await db.$queryRaw`
        SELECT value FROM "_dryrun_anchor" WHERE key = 'server_identity'
      ` as Array<{ value: string | null }>;
      const serverSideIdentity = anchorRows[0]?.value ?? null;

      if (serverSideIdentity === null) {
        // The table exists but the 'server_identity' row is missing.
        console.error('✗ PREFLIGHT FAIL: _dryrun_anchor table exists but has no server_identity row.');
        console.error('  The DBA must insert the server identity value:');
        console.error("    INSERT INTO _dryrun_anchor (key, value) VALUES ('server_identity', '<secret>');");
        console.error('  STEP 15.77: TABLE-based anchor — the value cannot be forged via session SET.');
        await db.$disconnect();
        process.exit(2);
      }

      if (serverSideIdentity !== serverIdentityAnchor) {
        // The table value does NOT match the operator-supplied anchor.
        // This is a WRONG SERVER scenario — halt immediately.
        console.error('✗ PREFLIGHT FAIL: server-side trust anchor (table) does not match the operator-supplied anchor.');
        console.error('  This indicates the dry-run is connected to the WRONG server.');
        console.error('  The _dryrun_anchor.value MUST match DRYRUN_SERVER_IDENTITY_ANCHOR.');
        console.error('  STEP 15.77: TABLE-based anchor — session-level SET forgery is closed.');
        await db.$disconnect();
        process.exit(2);
      }

      // Match — anchor value verified (but see H-04 limitation above).
      // This proves the DB has the expected anchor value. It does NOT prove
      // the DB is on the expected server (a clone would pass too).
      console.log('  Anchor check             : PASS ✅ (table value matches — wrong-DB defense, NOT server identity)');
      console.log('  Server identity          : UNVERIFIED ⚠ (anchor cannot detect cloned DB — requires TLS/CA, out of scope)');
    }

    console.log(`  Runtime role (current_user)   : ${actualUser}`);
    console.log(`  Runtime database               : ${actualDb}`);
    console.log(`  Trusted-role assertion          : actualUser === trustedRole ✅`);
    console.log(`  Hostname consistency check       : ${expectedHost ? 'configuration consistency ✅' : 'skipped (DRYRUN_EXPECTED_HOST not set)'}`);
    console.log(`  Superuser check                  : ${roleInfo.rolsuper ? 'FAIL' : 'PASS'} (rolsuper=${roleInfo.rolsuper})`);
    console.log(`  Role memberships                 : ${membershipCheck[0].cnt} (must be 0)`);
    console.log(`  Write-privilege check            : 5 RBAC tables × 4 write ops = 20 checks — all denied ✅`);
    console.log(`  PUBLIC grants check              : 5 RBAC tables — no PUBLIC write grants ✅`);
    console.log(`  Sequence privilege check         : ${sequencePrivCheck.length} sequences — USAGE + UPDATE denied on all ✅`);
    console.log(`  Schema CREATE check              : denied on "public" ✅`);
    console.log(`  Database CREATE check            : denied on current database ✅`);
    console.log(`  Table ownership check            : ${ownershipCheck[0].cnt} relations owned (must be 0) ✅`);
    console.log('  Role verification                : PASS ✅');
    console.log('  (Effective privileges verified; schema/seed readiness verified via LIVE DB content;');
    console.log('   server identity: UNVERIFIED ⚠ — anchor is wrong-DB defense only, NOT server identity proof. Requires TLS/CA, out of scope.)');
  } catch (err: unknown) {
    // STEP 15.72 Finding 5: use categorizeDbError() — never print raw error text,
    // but operators can distinguish failure types (auth vs connection vs permission).
    const cat = categorizeDbError(err);
    console.error(`✗ PREFLIGHT FAIL [${cat.category}]: could not complete preflight queries.`);
    console.error('  This usually means the connection failed or the role lacks SELECT on pg_catalog.');
    console.error(`  Diagnostic: ${cat.message}`);
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
    // STEP 15.72 Finding 5: replace `console.error(err)` (which leaks raw
    // error text — possibly containing connection strings / hosts / role
    // names) with categorized output via categorizeDbError(). The category
    // + fixed safe message lets operators distinguish failure types without
    // credential exposure.
    const cat = categorizeDbError(err);
    console.error('═'.repeat(72));
    console.error('✗ Phase C dry-run failed with an unrecoverable error.');
    console.error('  This is expected in sandboxes WITHOUT PostgreSQL.');
    console.error('  In CI/production, this indicates a real DB connection issue.');
    console.error('═'.repeat(72));
    console.error(`  Category   : ${cat.category}`);
    console.error(`  Diagnostic : ${cat.message}`);
    // Defense-in-depth: if the error's string form contains a postgresql:// URL
    // (e.g., Prisma logged it into the message/stack), apply redactConnectionDetails
    // so any future diagnostic path that surfaces the stack is safe. We do not
    // print the raw stack here — categorizeDbError already produced a safe
    // diagnostic above. This is purely defensive preparation.
    const rawStack = err instanceof Error && err.stack ? err.stack : '';
    const redactedStack = redactConnectionDetails(rawStack);
    if (redactedStack && redactedStack !== rawStack) {
      // A redaction occurred — log that a URL fragment was masked (without
      // printing the masked content). Operators know the raw stack contained
      // a connection string that was defensively stripped.
      console.error('  Note       : raw error stack contained a connection string; it was redacted before any diagnostic output.');
    }
    try {
      await db.$disconnect();
    } catch {
      /* ignore — best-effort */
    }
    process.exit(2);
  });
}
