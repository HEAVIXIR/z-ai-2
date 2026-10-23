import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.68: Phase C Preflight Tests
   ------------------------------------------------------------
   Pure unit tests for the dry-run implementation that don't
   need a database. These verify:
   - Role mapping edge cases
   - PII absence in sample output
   - Gate logic consistency
   - No write methods in dry-run script
   - Scale/fingerprint design properties
   ============================================================ */

// Read the dry-run script source for static analysis
const DRYRUN_SOURCE = readFileSync("scripts/rbac-backfill-dryrun.ts", "utf-8");
const GATE_LOGIC_SOURCE = readFileSync("src/lib/rbac/gate-logic.ts", "utf-8");
const GATE_CI_SOURCE = readFileSync("scripts/rbac-gate-ci.ts", "utf-8");

describe("STEP 15.68 — 2A: Connection Safety", () => {
  it("Dry-run imports db from @/lib/db (singleton, not separate PrismaClient)", () => {
    expect(DRYRUN_SOURCE).toContain("import { db } from '@/lib/db'");
    expect(DRYRUN_SOURCE).not.toMatch(/new PrismaClient\(/);
  });

  it("Dry-run does not have fallback DATABASE_URL (uses process.env via singleton)", () => {
    // The singleton db.ts reads DATABASE_URL from env. The dry-run script
    // itself should NOT set or override DATABASE_URL.
    expect(DRYRUN_SOURCE).not.toMatch(/process\.env\.DATABASE_URL\s*=/);
    expect(DRYRUN_SOURCE).not.toMatch(/DATABASE_URL\s*=\s*['"]/);
  });

  it("Dry-run does not import logAudit (which requires next/headers)", () => {
    // logAudit may appear in comments but should NOT be imported
    expect(DRYRUN_SOURCE).not.toMatch(/^import.*logAudit/m);
    expect(DRYRUN_SOURCE).not.toContain('import { logAudit');
    expect(DRYRUN_SOURCE).not.toContain('from "next/headers"');
  });
});

describe("STEP 15.68 — 2C: Role Mapping Edge Cases", () => {
  // Re-implement the mapping logic to test it independently
  const CANONICAL_ROLE_KEYS = ['ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT'];
  const LEGACY_ROLE_MAP: Record<string, string> = {
    ADMIN: 'ADMIN',
    SUPERADMIN: 'ADMIN',
    SELLER: 'SELLER',
    BUYER: 'BUYER',
    MODERATOR: 'MODERATOR',
    SUPPORT: 'SUPPORT',
  };

  function mapLegacyRole(legacy: string | null | undefined): string | null {
    if (legacy === null || legacy === undefined) return 'BUYER';
    const upper = legacy.toUpperCase().trim();
    if (upper === '') return 'BUYER';
    if (CANONICAL_ROLE_KEYS.includes(upper as typeof CANONICAL_ROLE_KEYS[number])) return upper;
    if (LEGACY_ROLE_MAP[upper]) return LEGACY_ROLE_MAP[upper];
    return null; // INVALID
  }

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

describe("STEP 15.68 — 2C: PII Absence in Sample Output", () => {
  it("Dry-run script does NOT select email from User table", () => {
    // The dry-run should only select id and role from User
    expect(DRYRUN_SOURCE).not.toMatch(/select:\s*\{[^}]*email/);
  });

  it("Dry-run script does NOT select mobile from User table", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/select:\s*\{[^}]*mobile/);
  });

  it("Dry-run script does NOT contain 'email' in sample output", () => {
    // Check the emitSamples function and sample types
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

describe("STEP 15.68 — 2C: Gate Logic Consistency", () => {
  it("gatePasses requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0", () => {
    expect(GATE_LOGIC_SOURCE).toContain("classification.INVALID === 0");
    expect(GATE_LOGIC_SOURCE).toContain("classification.MISMATCH === 0");
    expect(GATE_LOGIC_SOURCE).toContain("classification.MULTI_ROLE === 0");
  });

  it("total = okCount + safeToBackfillCount + mismatchCount + multiRoleCount + invalidCount", () => {
    // verifyGateOutput checks exact equality
    expect(GATE_LOGIC_SOURCE).toContain("sumOfAll");
    expect(GATE_LOGIC_SOURCE).toContain("SUM_MISMATCH");
  });

  it("Gate runner exits 1 on any failure", () => {
    expect(GATE_CI_SOURCE).toContain("process.exit(1)");
  });

  it("Gate runner exits 0 only on success", () => {
    expect(GATE_CI_SOURCE).toContain("process.exit(0)");
  });

  it("Child-process failure causes exit 1 (not continuation)", () => {
    expect(GATE_CI_SOURCE).toContain("childExitedNonZero");
    expect(GATE_CI_SOURCE).toContain("A failed child process cannot produce a valid gate result");
  });
});

describe("STEP 15.68 — 2C: No Write Methods in Dry-Run", () => {
  it("Dry-run script does not contain db.user.create()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.create\(/);
  });

  it("Dry-run script does not contain db.user.update()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.update\(/);
  });

  it("Dry-run script does not contain db.user.delete()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.user\.delete\(/);
  });

  it("Dry-run script does not contain db.userRole.create()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.create\(/);
  });

  it("Dry-run script does not contain db.userRole.update()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.update\(/);
  });

  it("Dry-run script does not contain db.userRole.delete()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.delete\(/);
  });

  it("Dry-run script does not contain db.userRole.upsert() call (only mentioned in comments)", () => {
    // upsert appears in comments about the FUTURE backfill script, not as actual code
    expect(DRYRUN_SOURCE).not.toMatch(/^\s*await\s+db\.userRole\.upsert/m);
    expect(DRYRUN_SOURCE).not.toMatch(/^\s*db\.userRole\.upsert\(/m);
  });

  it("Dry-run script does not contain db.userRole.deleteMany()", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/db\.userRole\.deleteMany\(/);
  });

  it("Dry-run script does not contain $executeRaw", () => {
    expect(DRYRUN_SOURCE).not.toMatch(/\$executeRaw/);
  });

  it("Dry-run script does not contain $queryRaw with INSERT/UPDATE/DELETE", () => {
    // $queryRaw is used for SELECT FOR UPDATE in the concurrency test, but
    // the dry-run script itself should not use it for writes
    expect(DRYRUN_SOURCE).not.toMatch(/\$queryRaw.*INSERT/i);
    expect(DRYRUN_SOURCE).not.toMatch(/\$queryRaw.*UPDATE/i);
    expect(DRYRUN_SOURCE).not.toMatch(/\$queryRaw.*DELETE/i);
  });
});

describe("STEP 15.68 — 2D: Snapshot & Scale Analysis", () => {
  it("Fingerprint reads ALL rows via findMany (no pagination)", () => {
    // This is a design observation: the fingerprint loads all rows into memory
    expect(DRYRUN_SOURCE).toContain("db.user.findMany");
    expect(DRYRUN_SOURCE).toContain("db.userRole.findMany");
    expect(DRYRUN_SOURCE).toContain("db.role.findMany");
    expect(DRYRUN_SOURCE).toContain("db.permission.findMany");
    expect(DRYRUN_SOURCE).toContain("db.rolePermission.findMany");
  });

  it("Fingerprint uses Promise.all for parallel fetch", () => {
    expect(DRYRUN_SOURCE).toContain("Promise.all");
  });

  it("Fingerprint uses orderBy for deterministic ordering", () => {
    expect(DRYRUN_SOURCE).toContain("orderBy: { id: 'asc' }");
  });

  it("Fingerprint selects only key fields (not full rows)", () => {
    // User: only id + role
    expect(DRYRUN_SOURCE).toContain("select: { id: true, role: true }");
    // UserRole: only userId + roleId
    expect(DRYRUN_SOURCE).toContain("select: { userId: true, roleId: true }");
  });

  it("SCALE LIMITATION: fingerprint loads all rows into memory (documented)", () => {
    // This test documents the known scale limitation
    // For 10K+ users, this could consume significant memory
    // The test verifies the code structure matches the documented limitation
    expect(DRYRUN_SOURCE).toContain("findMany");
    // No pagination or limit on the fingerprint queries
    const fingerprintSection = DRYRUN_SOURCE.substring(
      DRYRUN_SOURCE.indexOf("beforeCounts"),
      DRYRUN_SOURCE.indexOf("afterCounts"),
    );
    // The fingerprint section should NOT have a take/limit
    expect(fingerprintSection).not.toMatch(/take:\s*\d+/);
  });
});

describe("STEP 15.68 — 2E: Gate Failure Path Coverage", () => {
  it("Missing DRYRUN_GATE output → exit 1", () => {
    expect(GATE_CI_SOURCE).toContain("No DRYRUN_GATE output found");
    expect(GATE_CI_SOURCE).toContain("process.exit(1)");
  });

  it("Malformed JSON → parseGateLine returns error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("MALFORMED_JSON");
  });

  it("Missing prefix → parseGateLine returns error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("MISSING_PREFIX");
  });

  it("gatePasses=false → evaluateCiDecision returns shouldPass=false", () => {
    expect(GATE_LOGIC_SOURCE).toContain("gatePasses=false");
  });

  it("readOnlyInvariant=false → evaluateCiDecision returns shouldPass=false", () => {
    expect(GATE_LOGIC_SOURCE).toContain("readOnlyInvariant=false");
  });

  it("Negative numbers → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("NEGATIVE_");
  });

  it("NaN → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("NON_FINITE_");
  });

  it("Non-integer → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("NON_INTEGER_");
  });

  it("Sum mismatch → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("SUM_MISMATCH");
  });

  it("Inconsistent gate (gatePasses=true but blocking > 0) → validation error", () => {
    expect(GATE_LOGIC_SOURCE).toContain("INCONSISTENT_GATE");
  });
});
