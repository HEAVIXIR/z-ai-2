import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// STEP 15.71 Phase C: Import REAL implementations, not duplicated copies
import {
  mapLegacyRole,
  sanitizeConnectionString,
  extractDbName,
  extractHost,
  resolveTrustedRole,
  categorizeDbError,
  redactConnectionDetails,
  TRUSTED_READONLY_ROLE_ALLOWLIST,
  CANONICAL_ROLE_KEYS,
} from "@/lib/rbac/dryrun-helpers";

/* ============================================================
   HEAVIX — STEP 15.71: Phase C Preflight Tests
   ------------------------------------------------------------
   STEP 15.71 Phase C: Tests now import the REAL implementation
   from src/lib/rbac/dryrun-helpers.ts, not a duplicated copy.
   This ensures tests catch changes in the production code.
   ============================================================ */

const DRYRUN_SOURCE = readFileSync("scripts/rbac-backfill-dryrun.ts", "utf-8");
const GATE_LOGIC_SOURCE = readFileSync("src/lib/rbac/gate-logic.ts", "utf-8");
const GATE_CI_SOURCE = readFileSync("scripts/rbac-gate-ci.ts", "utf-8");
const HELPERS_SOURCE = readFileSync("src/lib/rbac/dryrun-helpers.ts", "utf-8");

describe("STEP 15.71 — 2A: Connection Safety", () => {
  it("Dry-run imports db from @/lib/db (singleton, not separate PrismaClient)", () => {
    expect(DRYRUN_SOURCE).toContain("import { db } from '@/lib/db'");
    expect(DRYRUN_SOURCE).not.toMatch(/new PrismaClient\(/);
  });

  it("Dry-run does not have fallback DATABASE_URL (uses process.env via singleton)", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/process\.env\.DATABASE_URL\s*=/);
    expect(DRYRUN_SOURCE).not.toMatch(/DATABASE_URL\s*=\s*['"]/);
  });

  it("Dry-run does not import logAudit (which requires next/headers)", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/^import.*logAudit/m);
    expect(DRYRUN_SOURCE).not.toContain('import { logAudit');
    expect(DRYRUN_SOURCE).not.toContain('from "next/headers"');
  });

  it("Dry-run imports helpers from dryrun-helpers module (not local copies)", () => {
    expect(DRYRUN_SOURCE).toContain("from '../src/lib/rbac/dryrun-helpers'");
    expect(DRYRUN_SOURCE).toContain("mapLegacyRole");
    expect(DRYRUN_SOURCE).toContain("sanitizeConnectionString");
    expect(DRYRUN_SOURCE).toContain("extractDbName");
  });
});

describe("STEP 15.71 — 2C: Role Mapping (REAL implementation)", () => {
  it("null → BUYER (default)", () => {
    expect(mapLegacyRole(null)).toBe('BUYER');
  });

  it("undefined → BUYER (default)", () => {
    expect(mapLegacyRole(undefined)).toBe('BUYER');
  });

  it("empty string → BUYER (default)", () => {
    expect(mapLegacyRole('')).toBe('BUYER');
  });

  it("whitespace-only → BUYER (defensive)", () => {
    expect(mapLegacyRole('   ')).toBe('BUYER');
  });

  it("SUPERADMIN → ADMIN (legacy alias)", () => {
    expect(mapLegacyRole('SUPERADMIN')).toBe('ADMIN');
  });

  it("superadmin (lowercase) → ADMIN (case-insensitive)", () => {
    expect(mapLegacyRole('superadmin')).toBe('ADMIN');
  });

  it("Admin (mixed case) → ADMIN (case-insensitive)", () => {
    expect(mapLegacyRole('Admin')).toBe('ADMIN');
  });

  it("BUYER → BUYER (canonical)", () => {
    expect(mapLegacyRole('BUYER')).toBe('BUYER');
  });

  it("MODERATOR → MODERATOR (canonical)", () => {
    expect(mapLegacyRole('MODERATOR')).toBe('MODERATOR');
  });

  it("SUPPORT → SUPPORT (canonical)", () => {
    expect(mapLegacyRole('SUPPORT')).toBe('SUPPORT');
  });

  it("unknown role 'SUPERUSER' → null (INVALID)", () => {
    expect(mapLegacyRole('SUPERUSER')).toBeNull();
  });

  it("unknown role 'GUEST' → null (INVALID)", () => {
    expect(mapLegacyRole('GUEST')).toBeNull();
  });
});

describe("STEP 15.71 — Phase A: Credential Sanitization (REAL implementation)", () => {
  it("Normal URL: password stripped, host/db preserved", () => {
    const result = sanitizeConnectionString("postgresql://user:secret@host:5432/db?schema=public");
    expect(result).not.toContain("secret");
    expect(result).toContain("host");
    expect(result).toContain("5432");
    expect(result).toContain("db");
  });

  it("Password with @ character: fully stripped", () => {
    const result = sanitizeConnectionString("postgresql://user:p@ss@host:5432/db");
    expect(result).not.toContain("p@ss");
    expect(result).not.toContain("p@");
    expect(result).not.toContain("@ss");
  });

  it("Password with : character: fully stripped", () => {
    const result = sanitizeConnectionString("postgresql://user:p:ss@host:5432/db");
    expect(result).not.toContain("p:ss");
  });

  it("Password with / character: fully stripped", () => {
    const result = sanitizeConnectionString("postgresql://user:p/ss@host:5432/db");
    expect(result).not.toContain("p/ss");
  });

  it("Password with # character: fully stripped", () => {
    const result = sanitizeConnectionString("postgresql://user:p#ss@host:5432/db");
    expect(result).not.toContain("p#ss");
  });

  it("Password with % encoding: fully stripped", () => {
    const result = sanitizeConnectionString("postgresql://user:p%40ss@host:5432/db");
    expect(result).not.toContain("p%40ss");
    expect(result).not.toContain("p@ss");
  });

  it("Malformed URL: returns placeholder, never raw input", () => {
    const result = sanitizeConnectionString("not-a-valid-url");
    expect(result).not.toContain("not-a-valid-url");
    expect(result).toContain("unable to parse");
  });

  it("Empty string: returns placeholder", () => {
    const result = sanitizeConnectionString("");
    expect(result).toContain("unable to parse");
  });

  it("URL without password: still works", () => {
    const result = sanitizeConnectionString("postgresql://host:5432/db");
    expect(result).toContain("host");
    expect(result).toContain("db");
  });

  it("Username is also stripped (not just password)", () => {
    const result = sanitizeConnectionString("postgresql://myuser:secret@host:5432/db");
    expect(result).not.toContain("myuser");
    expect(result).not.toContain("secret");
  });
});

describe("STEP 15.71 — Phase A: extractDbName (REAL implementation)", () => {
  it("Normal URL: returns db name", () => {
    expect(extractDbName("postgresql://user:pass@host:5432/heavix_staging?schema=public")).toBe("heavix_staging");
  });

  it("URL without query params: returns db name", () => {
    expect(extractDbName("postgresql://user:pass@host:5432/heavix_test")).toBe("heavix_test");
  });

  it("Malformed URL: returns null", () => {
    expect(extractDbName("not-a-url")).toBeNull();
  });

  it("URL with encoded characters in db name: decodes", () => {
    expect(extractDbName("postgresql://user:pass@host:5432/heavix%20test")).toBe("heavix test");
  });
});

describe("STEP 15.71 — 2C: PII Absence in Sample Output", () => {
  it("Dry-run script does NOT select email from User table", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/select:\s*\{[^}]*email/);
  });

  it("Sample structure does not contain PII fields", () => {
    const sampleSection = DRYRUN_SOURCE.substring(
      DRYRUN_SOURCE.indexOf("interface SampleBase"),
      DRYRUN_SOURCE.indexOf("interface DryRunReport"),
    );
    expect(sampleSection).not.toContain("email");
    expect(sampleSection).not.toContain("mobile");
    expect(sampleSection).not.toContain("passwordHash");
    expect(sampleSection).not.toContain("firstName");
    expect(sampleSection).not.toContain("lastName");
  });
});

describe("STEP 15.71 — 2C: Gate Logic Consistency", () => {
  it("gatePasses requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0", () => {
    expect(GATE_LOGIC_SOURCE).toContain("classification.INVALID === 0");
    expect(GATE_LOGIC_SOURCE).toContain("classification.MISMATCH === 0");
    expect(GATE_LOGIC_SOURCE).toContain("classification.MULTI_ROLE === 0");
  });

  it("Gate runner exits 1 on any failure", () => {
    expect(GATE_CI_SOURCE).toContain("process.exit(1)");
  });

  it("Child-process failure causes exit 1", () => {
    expect(GATE_CI_SOURCE).toContain("childExitedNonZero");
    expect(GATE_CI_SOURCE).toContain("A failed child process cannot produce a valid gate result");
  });
});

describe("STEP 15.71 — No Write Methods in Dry-Run", () => {
  it("No db.user.create()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.create\(/); });
  it("No db.user.update()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.update\(/); });
  it("No db.user.delete()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.delete\(/); });
  it("No db.userRole.create()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.create\(/); });
  it("No db.userRole.update()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.update\(/); });
  it("No db.userRole.delete()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.delete\(/); });
  it("No db.userRole.upsert() call", () => { expect(DRYRUN_SOURCE).not.toMatch(/^\s*await\s+db\.userRole\.upsert/m); });
  it("No db.userRole.deleteMany()", () => { expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.deleteMany\(/); });
  it("No $executeRaw", () => { expect(DRYRUN_SOURCE).not.toMatch(/\$executeRaw/); });
});

describe("STEP 15.71 — Snapshot & Scale Analysis", () => {
  it("Fingerprint reads ALL rows via findMany (no pagination)", () => {
    expect(DRYRUN_SOURCE).toContain("db.user.findMany");
    expect(DRYRUN_SOURCE).toContain("db.userRole.findMany");
  });

  it("Fingerprint uses Promise.all", () => {
    expect(DRYRUN_SOURCE).toContain("Promise.all");
  });

  it("Fingerprint uses orderBy for deterministic ordering", () => {
    expect(DRYRUN_SOURCE).toContain("orderBy: { id: 'asc' }");
  });

  it("Fingerprint selects only key fields", () => {
    expect(DRYRUN_SOURCE).toContain("select: { id: true, role: true }");
    expect(DRYRUN_SOURCE).toContain("select: { userId: true, roleId: true }");
  });
});

describe("STEP 15.71 — Gate Failure Path Coverage", () => {
  it("Missing DRYRUN_GATE → exit 1", () => {
    expect(GATE_CI_SOURCE).toContain("No DRYRUN_GATE output found");
  });
  it("Malformed JSON → error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("MALFORMED_JSON");
  });
  it("Negative numbers → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("NEGATIVE_");
  });
  it("NaN → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("NON_FINITE_");
  });
  it("Sum mismatch → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("SUM_MISMATCH");
  });
  it("Inconsistent gate → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("INCONSISTENT_GATE");
  });
});

/* ============================================================
   STEP 15.72 — Source-level verification tests.
   These tests verify that the security-hardening constructs
   required by STEP 15.72 are present in the production source
   files. They are NOT functional tests — they are static source
   assertions that detect regressions if a future refactor
   removes the hardening.
   ============================================================ */

describe("STEP 15.72 Finding 2 — TRUSTED_READONLY_ROLE_ALLOWLIST enforcement", () => {
  it("dryrun-helpers.ts defines TRUSTED_READONLY_ROLE_ALLOWLIST as a fixed const", () => {
    expect(HELPERS_SOURCE).toContain("TRUSTED_READONLY_ROLE_ALLOWLIST");
    // Must be a `const ... = [...] as const` so the tuple shape is fixed.
    expect(HELPERS_SOURCE).toMatch(/export\s+const\s+TRUSTED_READONLY_ROLE_ALLOWLIST\s*=\s*\[[^\]]*\]\s*as\s+const/);
  });

  it("dryrun-helpers.ts exports resolveTrustedRole() with fail-closed behavior", () => {
    expect(HELPERS_SOURCE).toContain("export function resolveTrustedRole");
    // The function must use the allowlist (not just compare to a raw env var).
    expect(HELPERS_SOURCE).toMatch(/TRUSTED_READONLY_ROLE_ALLOWLIST\.includes/);
    // Must return null on mismatch (fail closed).
    expect(HELPERS_SOURCE).toMatch(/return null/);
  });

  it("rbac-backfill-dryrun.ts imports and uses resolveTrustedRole", () => {
    expect(DRYRUN_SOURCE).toContain("resolveTrustedRole");
    expect(DRYRUN_SOURCE).toMatch(/const trustedRole = resolveTrustedRole\(/);
  });

  it("rbac-backfill-dryrun.ts asserts actualUser === trustedRole (not just privileges)", () => {
    expect(DRYRUN_SOURCE).toContain("actualUser !== trustedRole");
    expect(DRYRUN_SOURCE).toContain("actualUser === trustedRole");
  });

  it("rbac-backfill-dryrun.ts does NOT read DRYRUN_EXPECTED_ROLE directly as the trusted role", () => {
    // The old pattern `process.env.DRYRUN_EXPECTED_ROLE ?? 'heavix_dryrun_ro'`
    // is no longer permitted — the value must go through resolveTrustedRole().
    expect(DRYRUN_SOURCE).not.toMatch(/expectedRole\s*=\s*process\.env\.DRYRUN_EXPECTED_ROLE\s*\?\?\s*['"]/);
  });

  it("resolveTrustedRole fails closed for 'custom_ro_role' (REAL implementation)", () => {
    expect(resolveTrustedRole("custom_ro_role")).toBeNull();
  });

  it("resolveTrustedRole accepts 'heavix_dryrun_ro' (REAL implementation)", () => {
    expect(resolveTrustedRole("heavix_dryrun_ro")).toBe("heavix_dryrun_ro");
  });
});

describe("STEP 15.72 Finding 3 — Effective privilege audit (sequences, schema, db, ownership)", () => {
  it("rbac-backfill-dryrun.ts checks sequence USAGE and UPDATE privileges", () => {
    expect(DRYRUN_SOURCE).toContain("has_sequence_privilege");
    expect(DRYRUN_SOURCE).toContain("USAGE");
    expect(DRYRUN_SOURCE).toContain("UPDATE");
    expect(DRYRUN_SOURCE).toMatch(/has_sequence_privilege\([^)]*,\s*['"]USAGE['"]\)/);
    expect(DRYRUN_SOURCE).toMatch(/has_sequence_privilege\([^)]*,\s*['"]UPDATE['"]\)/);
  });

  it("rbac-backfill-dryrun.ts checks schema CREATE privilege via has_schema_privilege", () => {
    expect(DRYRUN_SOURCE).toContain("has_schema_privilege");
    expect(DRYRUN_SOURCE).toMatch(/has_schema_privilege\([^)]*,\s*['"]public['"]\s*,\s*['"]CREATE['"]\)/);
  });

  it("rbac-backfill-dryrun.ts checks database CREATE privilege via has_database_privilege", () => {
    expect(DRYRUN_SOURCE).toContain("has_database_privilege");
    expect(DRYRUN_SOURCE).toMatch(/has_database_privilege\([^)]*,\s*current_database\(\)\s*,\s*['"]CREATE['"]\)/);
  });

  it("rbac-backfill-dryrun.ts checks table ownership via pg_class.relowner", () => {
    expect(DRYRUN_SOURCE).toContain("pg_class");
    expect(DRYRUN_SOURCE).toContain("relowner");
    expect(DRYRUN_SOURCE).toContain("pg_roles");
  });

  it("dryrun-helpers.ts exports all STEP 15.72 helpers (resolveTrustedRole, extractHost, categorizeDbError, redactConnectionDetails)", () => {
    expect(HELPERS_SOURCE).toContain("export function resolveTrustedRole");
    expect(HELPERS_SOURCE).toContain("export function extractHost");
    expect(HELPERS_SOURCE).toContain("export function categorizeDbError");
    expect(HELPERS_SOURCE).toContain("export function redactConnectionDetails");
  });
});

describe("STEP 15.72 Finding 4 — Server/cluster identity verification (DRYRUN_EXPECTED_HOST)", () => {
  it("dryrun-helpers.ts exports extractHost()", () => {
    expect(HELPERS_SOURCE).toContain("export function extractHost");
  });

  it("rbac-backfill-dryrun.ts requires DRYRUN_EXPECTED_HOST (fails closed when missing)", () => {
    expect(DRYRUN_SOURCE).toContain("DRYRUN_EXPECTED_HOST is not set");
    expect(DRYRUN_SOURCE).toContain("MANDATORY");
  });

  it("rbac-backfill-dryrun.ts compares parsedHost with expectedHost (env var vs URL host)", () => {
    expect(DRYRUN_SOURCE).toContain("parsedHost !== expectedHost");
    expect(DRYRUN_SOURCE).toContain("extractHost(databaseUrl)");
  });

  it("rbac-backfill-dryrun.ts does NOT log the connection password when establishing identity", () => {
    // The preflight must NOT print the raw DATABASE_URL — only the sanitized form.
    expect(DRYRUN_SOURCE).toMatch(/sanitizeConnectionString\(databaseUrl\)/);
    // The raw URL must not be printed directly.
    expect(DRYRUN_SOURCE).not.toMatch(/console\.(log|error)\(databaseUrl\)/);
    expect(DRYRUN_SOURCE).not.toMatch(/console\.(log|error)\(`.*\$\{databaseUrl\}/);
  });

  it("extractHost returns 'localhost' for localhost URLs (REAL implementation)", () => {
    expect(extractHost("postgresql://user:pass@localhost:5432/heavix_test")).toBe("localhost");
  });
});

describe("STEP 15.75 — Schema/seed readiness verification (replaces env-var-based CI trust)", () => {
  it("dryrun-helpers.ts no longer exports detectCiEnvironment (removed)", () => {
    // STEP 15.75: detectCiEnvironment() was removed entirely.
    // The export statement must be gone. (Comments mentioning it as a removed
    // feature are OK — they document what was deleted.)
    expect(HELPERS_SOURCE).not.toMatch(/export\s+function\s+detectCiEnvironment/);
    expect(HELPERS_SOURCE).not.toMatch(/export\s+interface\s+CiDetectionResult/);
    expect(HELPERS_SOURCE).not.toMatch(/function\s+detectCiEnvironment\s*\(/);
    expect(HELPERS_SOURCE).not.toMatch(/interface\s+CiDetectionResult\s*\{/);
  });

  it("rbac-backfill-dryrun.ts no longer imports detectCiEnvironment (removed)", () => {
    // The import statement must be gone. (Comments mentioning detectCiEnvironment
    // as a removed feature are OK — they document what was deleted.)
    expect(DRYRUN_SOURCE).not.toMatch(/import\s*\{[^}]*detectCiEnvironment[^}]*\}/);
    // The runtime use of detectCiEnvironment must be gone.
    expect(DRYRUN_SOURCE).not.toMatch(/detectCiEnvironment\(/);
    expect(DRYRUN_SOURCE).not.toMatch(/const\s+ciDetection\s*=\s*detectCiEnvironment/);
  });

  it("rbac-backfill-dryrun.ts no longer uses inet_server_addr() (removed IP check)", () => {
    // The inet_server_addr() IP comparison was removed — it was a flawed
    // signal that an operator could bypass by setting GITHUB_ACTIONS,
    // CI, AND DRYRUN_CI_HOST_CHECK_EXCEPTION on any machine.
    // Comments mentioning inet_server_addr as a removed feature are OK —
    // they document what was deleted. The actual SQL/runtime use must be gone.
    expect(DRYRUN_SOURCE).not.toMatch(/\$queryRaw[^\n]*inet_server_addr/);
    expect(DRYRUN_SOURCE).not.toMatch(/inet_server_addr\(\)\s+as\s+server_addr/);
    expect(DRYRUN_SOURCE).not.toMatch(/server_addr\s*\?\s*['"]<null>['"]/);
    // No live reference to the server_addr variable.
    expect(DRYRUN_SOURCE).not.toMatch(/\$\{serverAddr\??\}/);
  });

  it("rbac-backfill-dryrun.ts no longer imports dnsLookup (removed IP check)", () => {
    // The import statement must be gone. (Comments mentioning dnsLookup as a
    // removed feature are OK — they document what was deleted.)
    expect(DRYRUN_SOURCE).not.toMatch(/import\s*\{[^}]*dnsLookup[^}]*\}/);
    expect(DRYRUN_SOURCE).not.toContain("from 'node:dns/promises'");
    // The runtime use of dnsLookup (e.g., `await dnsLookup(...)`) must be gone.
    expect(DRYRUN_SOURCE).not.toMatch(/await\s+dnsLookup\(/);
  });

  it("rbac-backfill-dryrun.ts no longer uses IPv4-mapped IPv6 normalization (removed IP check)", () => {
    // The ::ffff: normalization logic was part of the IP comparison block
    // that has been removed entirely.
    expect(DRYRUN_SOURCE).not.toContain("::ffff:");
  });

  it("rbac-backfill-dryrun.ts halts when DRYRUN_CI_HOST_CHECK_EXCEPTION is set (deprecated fail-closed)", () => {
    // The deprecated bypass flag now halts on ANY value (including "false").
    expect(DRYRUN_SOURCE).toContain("DRYRUN_CI_HOST_CHECK_EXCEPTION is set (deprecated)");
    expect(DRYRUN_SOURCE).toContain("deprecated");
    expect(DRYRUN_SOURCE).toMatch(/DRYRUN_CI_HOST_CHECK_EXCEPTION\s*!==\s*undefined/);
  });

  it("rbac-backfill-dryrun.ts performs schema/seed readiness verification (5 RBAC tables exist)", () => {
    // STEP 15.76: renamed from "content-based identity verification" to
    // "schema/seed readiness verification" — content checks prove the
    // schema is in place, NOT server identity. The information_schema.tables
    // query still checks for ALL 5 RBAC tables.
    expect(DRYRUN_SOURCE).toContain("information_schema.tables");
    expect(DRYRUN_SOURCE).toContain("table_schema = 'public'");
    expect(DRYRUN_SOURCE).toContain("table_name IN ('User', 'UserRole', 'Role', 'Permission', 'RolePermission')");
    expect(DRYRUN_SOURCE).toContain("required RBAC tables missing");
  });

  it("rbac-backfill-dryrun.ts performs schema/seed readiness verification (5 canonical roles in catalog)", () => {
    // The Role catalog query checks for ALL 5 canonical roles via a LIVE DB query.
    // "Role" MUST be quoted (case-sensitive PostgreSQL identifier).
    // STEP 15.76: this proves SEED readiness, NOT server identity.
    expect(DRYRUN_SOURCE).toContain('SELECT key FROM "Role"');
    expect(DRYRUN_SOURCE).toContain("key IN ('ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT')");
    expect(DRYRUN_SOURCE).toContain("canonical Role catalog is incomplete");
  });

  it("rbac-backfill-dryrun.ts verifies schema/seed readiness via LIVE DB content (not env vars)", () => {
    // STEP 15.76: "Content-based identity" labels renamed to "Schema/seed
    // readiness". Schema/seed readiness verification must use $queryRaw
    // (live DB queries), not env-var checks. NOTE: schema/seed readiness
    // is NOT server identity — see the trust-anchor check below for the
    // independent server-identity verification.
    expect(DRYRUN_SOURCE).toContain("Schema/seed readiness verification");
    expect(DRYRUN_SOURCE).toContain("live DB content");
  });

  it("rbac-backfill-dryrun.ts no longer uses 'Content-based identity' labels (renamed in STEP 15.76)", () => {
    // The old labels overstated the proof: content checks prove SCHEMA
    // readiness, not server identity. The labels must be renamed.
    // Comments explaining what was renamed are OK — they document the change.
    // But the LIVE log labels must NOT contain "Content-based identity".
    // Verify by inspecting the preflight function body (before main()).
    const preflightSection = DRYRUN_SOURCE.substring(
      DRYRUN_SOURCE.indexOf("async function preflightConnectionCheck"),
      DRYRUN_SOURCE.indexOf("async function main"),
    );
    // console.log lines that previously said "Content-based identity" must
    // now say "Schema/seed readiness". The old console.log label is gone.
    expect(preflightSection).not.toMatch(/console\.log\(`\s*Content-based identity/);
    // The new label must be present.
    expect(preflightSection).toContain("Schema/seed readiness");
  });

  it("rbac-backfill-dryrun.ts no longer uses 'Host identity: PASS' overstatement (renamed in STEP 15.76)", () => {
    // STEP 15.76: the "Host identity: PASS ✅ (hostname match verified)" label
    // was an overstatement — hostname match is CONFIGURATION CONSISTENCY, not
    // server-identity proof. The label must be renamed to "Hostname consistency".
    const preflightSection = DRYRUN_SOURCE.substring(
      DRYRUN_SOURCE.indexOf("async function preflightConnectionCheck"),
      DRYRUN_SOURCE.indexOf("async function main"),
    );
    // The old "Host identity" PASS label must be gone from console.log lines.
    expect(preflightSection).not.toMatch(/console\.log\('?\s*Host identity\s+:\s*PASS/);
    // The new "Hostname consistency" label must be present and explicitly
    // state that it is NOT a server-identity proof.
    expect(preflightSection).toContain("Hostname consistency");
    expect(preflightSection).toContain("Configuration consistency — NOT a server-identity proof");
  });

  it("rbac-backfill-dryrun.ts implements the STEP 15.77 TABLE-based trust-anchor (DRYRUN_SERVER_IDENTITY_ANCHOR)", () => {
    // STEP 15.77 (H-03 fix): the GUC-based anchor was REMOVED because custom
    // GUCs are session-level forgeable (client can SET app.server_identity).
    // The anchor is now stored in a TABLE (_dryrun_anchor), which is NOT
    // affected by SET. The preflight verifies the role has SELECT-only on it.
    expect(DRYRUN_SOURCE).toContain("DRYRUN_SERVER_IDENTITY_ANCHOR");
    expect(DRYRUN_SOURCE).toContain("_dryrun_anchor");
    expect(DRYRUN_SOURCE).toContain('SELECT value FROM "_dryrun_anchor"');
    // Must NOT use the old GUC approach (current_setting/app.server_identity
    // in runtime queries — only in the historical comment block explaining
    // why it was removed)
    const preflightQueries = DRYRUN_SOURCE.split('\n').filter((l) => l.includes('$queryRaw'));
    const queryText = preflightQueries.join('\n');
    expect(queryText).not.toContain('current_setting');
    expect(queryText).not.toContain('app.server_identity');
    // The three required log messages must be present:
    // - UNVERIFIED ⚠ (anchor not set — run continues, operator informed)
    expect(DRYRUN_SOURCE).toContain("Server identity         : UNVERIFIED ⚠");
    expect(DRYRUN_SOURCE).toContain("no database-local anchor");
    // - Anchor match → "Anchor check: PASS" (wrong-DB defense, NOT server identity)
    expect(DRYRUN_SOURCE).toContain("Anchor check             : PASS ✅");
    expect(DRYRUN_SOURCE).toContain("wrong-DB defense, NOT server identity");
    // - Server identity remains UNVERIFIED even when anchor matches (H-04: clone would pass)
    expect(DRYRUN_SOURCE).toContain("anchor cannot detect cloned DB");
    // - Mismatch → halt with exit 2 (wrong server)
    expect(DRYRUN_SOURCE).toContain("server-side database-local anchor (table) does not match");
    // - Table missing → halt
    expect(DRYRUN_SOURCE).toContain("_dryrun_anchor table does not exist");
    // - Write-privilege check on anchor table (forgeable if role can write)
    expect(DRYRUN_SOURCE).toContain("has_table_privilege");
    expect(DRYRUN_SOURCE).toContain("trust-anchor table must be SELECT-only");
  });

  it("rbac-backfill-dryrun.ts does NOT query current_setting in runtime (GUC removed)", () => {
    // STEP 15.77: the GUC-based anchor was forgeable via session SET.
    // The runtime query must use the TABLE, not current_setting().
    // (Comments mentioning current_setting as the removed approach are OK.)
    const queryRawLines = DRYRUN_SOURCE.split('\n').filter((l) => l.includes('$queryRaw'));
    const queryRawText = queryRawLines.join('\n');
    expect(queryRawText).not.toContain('current_setting');
  });

  it("scripts/rbac-create-anchor-table.sql exists and creates _dryrun_anchor (non-destructive)", () => {
    const anchorSql = readFileSync("scripts/rbac-create-anchor-table.sql", "utf-8");
    expect(anchorSql).toContain('CREATE TABLE IF NOT EXISTS "_dryrun_anchor"');
    expect(anchorSql).toContain("'server_identity'");
    expect(anchorSql).toContain("GRANT SELECT ON");
    expect(anchorSql).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE");
    expect(anchorSql).toContain("heavix_dryrun_ro");
    // STEP 15.78 (H-04): MUST NOT use DROP TABLE in SQL commands (destructive)
    // Comments mentioning DROP TABLE are OK (they document the removal).
    const sqlCmds = anchorSql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlCmds).not.toMatch(/DROP\s+TABLE/i);
    // STEP 15.78: MUST use ON CONFLICT DO NOTHING (idempotent, non-overwriting)
    expect(anchorSql).toMatch(/ON\s+CONFLICT.*DO\s+NOTHING/is);
    // The SQL commands (non-comment lines) must NOT use the old GUC approach.
    const sqlCommands = anchorSql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlCommands).not.toContain("ALTER DATABASE");
    expect(sqlCommands).not.toMatch(/current_setting/);
  });

  it("scripts/rbac-rotate-anchor.sql rejects empty anchor_value BEFORE any change (STEP 15.80)", () => {
    const rotateSql = readFileSync("scripts/rbac-rotate-anchor.sql", "utf-8");
    expect(rotateSql).toContain('UPDATE "_dryrun_anchor"');
    expect(rotateSql).toContain("rotated_at");
    expect(rotateSql).toContain(":'anchor_value'");
    // STEP 15.79: plain UPDATE (psql var outside $$) + DO block for verification
    expect(rotateSql).toContain("ON_ERROR_STOP");
    expect(rotateSql).toContain("DO $$");
    expect(rotateSql).toContain("row_exists");
    expect(rotateSql).toContain("RAISE EXCEPTION");
    expect(rotateSql).toContain("server_identity row");
    // STEP 15.81: rejects empty/whitespace-only anchor_value via NULLIF(TRIM()) 1/0 BEFORE any UPDATE
    expect(rotateSql).toContain("NULLIF(TRIM(:'anchor_value'), '') IS NULL THEN 1/0");
    expect(rotateSql).toContain("empty_check");
    // MUST NOT use the invalid \if :ROWCOUNT guard in SQL commands
    const rotateCmds = rotateSql.split('\n').filter((l) => !l.trim().startsWith('--') && !l.trim().startsWith('\\')).join('\n');
    expect(rotateCmds).not.toMatch(/\\if\s+:ROWCOUNT/i);
    // MUST NOT use DROP TABLE in SQL commands (destructive)
    expect(rotateCmds).not.toMatch(/DROP\s+TABLE/i);
  });

  it("scripts/rbac-create-anchor-table.sql rejects empty/whitespace-only anchor_value (STEP 15.81)", () => {
    const installSql = readFileSync("scripts/rbac-create-anchor-table.sql", "utf-8");
    // STEP 15.81: rejects empty/whitespace-only via NULLIF(TRIM()) 1/0 BEFORE any insert
    expect(installSql).toContain("NULLIF(TRIM(:'anchor_value'), '') IS NULL THEN 1/0");
    expect(installSql).toContain("empty_check");
  });

  it("rbac-backfill-dryrun.ts no longer references GITHUB_ACTIONS or CI env vars in preflight", () => {
    // The preflight must NOT read GITHUB_ACTIONS or CI as standalone signals —
    // these were caller-controlled env vars that could not cryptographically
    // prove CI identity. (Note: DRYRUN_CI_HOST_CHECK_EXCEPTION is intentionally
    // referenced — it's the deprecated fail-closed flag, not a CI signal.)
    // Verify by inspecting the preflight function body (before main()).
    const preflightSection = DRYRUN_SOURCE.substring(
      DRYRUN_SOURCE.indexOf("async function preflightConnectionCheck"),
      DRYRUN_SOURCE.indexOf("async function main"),
    );
    // Word-boundary regex so `process.env.CI` does not match the longer
    // `process.env.DRYRUN_CI_HOST_CHECK_EXCEPTION` identifier.
    expect(preflightSection).not.toMatch(/process\.env\.GITHUB_ACTIONS\b/);
    expect(preflightSection).not.toMatch(/process\.env\.CI\b/);
    expect(preflightSection).not.toMatch(/GITHUB_ACTIONS\s*===\s*['"]true['"]/);
    expect(preflightSection).not.toMatch(/process\.env\.CI\s*===\s*['"]true['"]/);
  });
});

describe("STEP 15.72 Finding 5 — categorizeDbError replaces console.error(err)", () => {
  it("dryrun-helpers.ts exports categorizeDbError with the 5 required categories", () => {
    expect(HELPERS_SOURCE).toContain("export function categorizeDbError");
    expect(HELPERS_SOURCE).toContain("CONNECTION_REFUSED");
    expect(HELPERS_SOURCE).toContain("AUTHENTICATION_FAILED");
    expect(HELPERS_SOURCE).toContain("DATABASE_NOT_FOUND");
    expect(HELPERS_SOURCE).toContain("PERMISSION_DENIED");
    expect(HELPERS_SOURCE).toContain("UNKNOWN");
  });

  it("dryrun-helpers.ts exports redactConnectionDetails for defense-in-depth", () => {
    expect(HELPERS_SOURCE).toContain("export function redactConnectionDetails");
  });

  it("rbac-backfill-dryrun.ts imports categorizeDbError and uses it in catch blocks", () => {
    expect(DRYRUN_SOURCE).toContain("categorizeDbError");
    // The catch block in preflightConnectionCheck must use categorizeDbError(err).
    expect(DRYRUN_SOURCE).toMatch(/const cat = categorizeDbError\(err\)/);
  });

  it("rbac-backfill-dryrun.ts does NOT print raw error objects (no `console.error(err)`)", () => {
    // The old pattern `console.error(err)` leaks the raw error text — it is
    // replaced by categorized output via categorizeDbError().
    expect(DRYRUN_SOURCE).not.toMatch(/^\s*console\.error\(err\)\s*;?\s*$/m);
    expect(DRYRUN_SOURCE).not.toMatch(/^\s*console\.error\(rawMsg\)\s*;?\s*$/m);
  });

  it("rbac-backfill-dryrun.ts top-level error handler uses categorizeDbError (not raw err)", () => {
    // The top-level main().catch() handler must use categorizeDbError for safe output.
    expect(DRYRUN_SOURCE).toMatch(/main\(\)\.catch\([\s\S]*?categorizeDbError\([\s\S]*?\)/);
  });

  it("categorizeDbError returns fixed safe messages per category (REAL implementation)", () => {
    // The safe message must never contain the raw error text — only a fixed
    // human-readable diagnostic. Verify each category returns a non-empty
    // message that does not include the raw input.
    const err = new Error("connect ECONNREFUSED 127.0.0.1:5432 — secret password is hunter2");
    const result = categorizeDbError(err);
    expect(result.category).toBe("CONNECTION_REFUSED");
    expect(result.message).not.toContain("ECONNREFUSED");
    expect(result.message).not.toContain("127.0.0.1");
    expect(result.message).not.toContain("hunter2");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("redactConnectionDetails masks URLs in a string (REAL implementation)", () => {
    const input = "Error: postgresql://user:hunter2@host:5432/db";
    const output = redactConnectionDetails(input);
    expect(output).not.toContain("hunter2");
    expect(output).toContain("redacted:connection-string");
  });

  it("TRUSTED_READONLY_ROLE_ALLOWLIST is exported as a readonly tuple (REAL implementation)", () => {
    expect(Array.isArray(TRUSTED_READONLY_ROLE_ALLOWLIST)).toBe(true);
    expect(TRUSTED_READONLY_ROLE_ALLOWLIST).toContain("heavix_dryrun_ro");
  });
});

describe("STEP 15.72 Finding 1 — sanitizeConnectionString fixed generic message on parse failure", () => {
  it("dryrun-helpers.ts returns a fixed generic message for malformed URLs (no input fragments)", () => {
    // The catch block in sanitizeConnectionString must NOT print any input fragment.
    // It must return a fixed generic message.
    const output = sanitizeConnectionString("not-a-valid-url-with-credentials");
    expect(output).toContain("unable to parse");
    expect(output).not.toContain("not-a-valid-url");
    expect(output).not.toContain("credentials");
  });

  it("dryrun-helpers.ts sanitizeConnectionString does NOT print ANY URL fragment on parse failure", () => {
    // Even a single character of the input must not leak.
    const output = sanitizeConnectionString("xyzzy");
    expect(output).not.toContain("xyzzy");
    expect(output).not.toContain("xyz");
    expect(output).not.toContain("yzzy");
  });
});
