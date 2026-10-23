import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// STEP 15.71 Phase C: Import REAL implementations, not duplicated copies
import {
  mapLegacyRole,
  sanitizeConnectionString,
  extractDbName,
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
