import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.68: Phase C Dry-Run Preflight (Pure Unit Tests)
   ------------------------------------------------------------
   These tests harden the Phase C dry-run path BEFORE any staging
   execution. They are PURE unit tests — no DB connection, no DB
   role, no network. They cover:

     1. `mapLegacyRole()` edge cases (null, empty, SUPERADMIN alias,
        case-insensitivity, unknown → INVALID).
     2. PII fields are NOT present in the sample output structure
        (no email, mobile, phone, passwordHash in the script's
        Sample* interfaces or findMany selects).
     3. Gate logic consistency: okCount + safeToBackfillCount +
        mismatchCount + multiRoleCount + invalidCount === total,
        and gatePasses === (INVALID==0 && MISMATCH==0 && MULTI_ROLE==0).
     4. The dry-run script source does NOT import any write methods
        (no create/update/delete/upsert/createMany/updateMany/deleteMany/
        $transaction/$executeRaw).

   These complement (do NOT replace) the real-PostgreSQL integration
   tests in tests/integration/rbac-readonly-role-real.test.ts and the
   gate-logic unit tests in tests/unit/rbac-gate-logic.test.ts.
   ============================================================ */

// Strip /* ... */ block comments and // line comments from a TypeScript
// source string so static-source assertions test ACTUAL code, not docs.
function stripComments(src: string): string {
  // Remove /* ... */ block comments (non-greedy, multiline).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove // line comments (until end-of-line).
  out = out.replace(/\/\/.*$/gm, "");
  return out;
}

// Subject under test — pure function, no DB calls triggered at import
// (main() is guarded by `require.main === module`).
import { mapLegacyRole } from "../../scripts/rbac-backfill-dryrun";

// Gate logic — shared single source of truth (no DB dependency)
import {
  evaluateGate,
  formatGateOutput,
  parseGateLine,
  validateGateOutput,
  evaluateCiDecision,
  type ClassificationCounts,
  type SnapshotCounts,
} from "@/lib/rbac/gate-logic";

const SCRIPT_PATH = resolve(process.cwd(), "scripts", "rbac-backfill-dryrun.ts");

/* ============================================================
   1. mapLegacyRole() edge cases
   ============================================================ */
describe("STEP 15.68 — mapLegacyRole() edge cases", () => {
  it("null → 'BUYER' (defensive fallback per design doc)", () => {
    expect(mapLegacyRole(null)).toBe("BUYER");
  });

  it("undefined → 'BUYER' (defensive fallback per design doc)", () => {
    expect(mapLegacyRole(undefined)).toBe("BUYER");
  });

  it("empty string '' → 'BUYER' (per design doc default fallback)", () => {
    expect(mapLegacyRole("")).toBe("BUYER");
  });

  it("whitespace-only '   ' → 'BUYER' (defensive trim)", () => {
    expect(mapLegacyRole("   ")).toBe("BUYER");
  });

  it("'SUPERADMIN' (alias) → 'ADMIN'", () => {
    expect(mapLegacyRole("SUPERADMIN")).toBe("ADMIN");
  });

  it("'superadmin' (lowercase alias) → 'ADMIN' (case-insensitive)", () => {
    expect(mapLegacyRole("superadmin")).toBe("ADMIN");
  });

  it("'admin' (lowercase canonical) → 'ADMIN' (case-insensitive)", () => {
    expect(mapLegacyRole("admin")).toBe("ADMIN");
  });

  it("'ADMIN' (canonical) → 'ADMIN'", () => {
    expect(mapLegacyRole("ADMIN")).toBe("ADMIN");
  });

  it("'Buyer' (mixed case) → 'BUYER'", () => {
    expect(mapLegacyRole("Buyer")).toBe("BUYER");
  });

  it("'BUYER' (canonical) → 'BUYER'", () => {
    expect(mapLegacyRole("BUYER")).toBe("BUYER");
  });

  it("'Seller' (mixed case) → 'SELLER'", () => {
    expect(mapLegacyRole("Seller")).toBe("SELLER");
  });

  it("'SELLER' (canonical) → 'SELLER'", () => {
    expect(mapLegacyRole("SELLER")).toBe("SELLER");
  });

  it("'MODERATOR' (canonical, not in alias map) → 'MODERATOR' via direct match", () => {
    expect(mapLegacyRole("MODERATOR")).toBe("MODERATOR");
  });

  it("'SUPPORT' (canonical, not in alias map) → 'SUPPORT' via direct match", () => {
    expect(mapLegacyRole("SUPPORT")).toBe("SUPPORT");
  });

  it("'moderator' (lowercase) → 'MODERATOR'", () => {
    expect(mapLegacyRole("moderator")).toBe("MODERATOR");
  });

  it("'support' (lowercase) → 'SUPPORT'", () => {
    expect(mapLegacyRole("support")).toBe("SUPPORT");
  });

  it("unknown 'GOD' → null (INVALID — flag for manual review)", () => {
    expect(mapLegacyRole("GOD")).toBeNull();
  });

  it("unknown 'ROOT' → null (INVALID)", () => {
    expect(mapLegacyRole("ROOT")).toBeNull();
  });

  it("unknown 'superuser' → null (NOT aliased to ADMIN — only SUPERADMIN is)", () => {
    // This is intentional: only SUPERADMIN is the documented legacy alias.
    // 'superuser' is unrecognized → INVALID, no auto-correction.
    expect(mapLegacyRole("superuser")).toBeNull();
  });

  it("unknown 'admin2' → null (INVALID)", () => {
    expect(mapLegacyRole("admin2")).toBeNull();
  });

  it("unknown numeric string '1' → null (INVALID — numeric codes not aliased)", () => {
    expect(mapLegacyRole("1")).toBeNull();
  });

  it("unknown '0' → null (INVALID)", () => {
    expect(mapLegacyRole("0")).toBeNull();
  });

  it("whitespace-padded '  ADMIN  ' → 'ADMIN' (trim + uppercase)", () => {
    expect(mapLegacyRole("  ADMIN  ")).toBe("ADMIN");
  });

  it("tab-padded '\\tADMIN\\t' → 'ADMIN' (trim handles tabs)", () => {
    expect(mapLegacyRole("\tADMIN\t")).toBe("ADMIN");
  });

  it("returns one of the 5 canonical keys for every recognized input", () => {
    const recognized: Array<string | null | undefined> = [
      null,
      undefined,
      "",
      "   ",
      "ADMIN",
      "admin",
      "SUPERADMIN",
      "superadmin",
      "SELLER",
      "seller",
      "BUYER",
      "buyer",
      "MODERATOR",
      "moderator",
      "SUPPORT",
      "support",
    ];
    const CANONICAL = ["ADMIN", "SELLER", "BUYER", "MODERATOR", "SUPPORT"];
    for (const input of recognized) {
      const out = mapLegacyRole(input);
      expect(out).not.toBeNull();
      expect(CANONICAL).toContain(out);
    }
  });
});

/* ============================================================
   2. PII fields NOT in sample output structure
   ------------------------------------------------------------
   The dry-run emits per-classification samples (MISSING, MISMATCH,
   MULTI_ROLE, INVALID) and before/after snapshots. None of these
   may contain PII (email, mobile, phone, passwordHash).

   We verify by inspecting the script source — the Sample* interfaces,
   the findMany `select` clauses, and the fingerprint map MUST NOT
   reference PII fields.
   ============================================================ */
describe("STEP 15.68 — PII fields NOT in sample output structure", () => {
  const src = readFileSync(SCRIPT_PATH, "utf-8");

  it("Sample* interfaces declare only userId, legacyRole, canonicalKey, userRoleKeys (no PII)", () => {
    // The four sample interfaces must NOT declare any PII field.
    // We extract each interface body and assert the absence of PII keys.
    const piiFields = ["email", "mobile", "phone", "passwordHash", "firstName", "lastName", "companyName"];
    for (const f of piiFields) {
      // PII field names should not appear as interface members (heuristic:
      // word-boundary match on the bare identifier).
      const re = new RegExp(`\\b${f}\\b\\s*[?:]?\\s*:`, "g");
      const matches = src.match(re);
      // We tolerate matches inside COMMENTS (e.g. the docstring mentions
      // PII fields by name). To be robust, we assert that any match
      // occurs ONLY inside a /* ... */ block or // line comment.
      if (matches) {
        // Heuristic: each match line must be a comment line (starts with
        // whitespace + // or is inside a /* block). For our purposes here,
        // the script's Sample* interfaces are non-comment TypeScript, so
        // any non-comment match is a violation.
        for (const m of matches) {
          // Find the line containing this match
          const idx = src.indexOf(m);
          const lineStart = src.lastIndexOf("\n", idx) + 1;
          const lineEnd = src.indexOf("\n", idx);
          const line = src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
          // If the line is a comment, it's fine. Otherwise, fail.
          const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
          expect(isComment).toBe(true);
        }
      }
    }
  });

  it("findMany select clauses for User exclude PII fields", () => {
    // The dry-run reads users via db.user.findMany with select.
    // Verify the select does NOT include email, mobile, phone, passwordHash.
    // The script's per-user classification select is:
    //   select: { id: true, role: true, userRoles: { select: { roleId: true } } }
    // And the BEFORE/AFTER fingerprint select is:
    //   select: { id: true, role: true }
    const piiFields = ["email", "mobile", "phone", "passwordHash", "firstName", "lastName"];
    for (const f of piiFields) {
      // Look for the field as a selected key in any findMany on the user model.
      // Pattern: `select: { ... email: true ... }` inside a db.user.findMany block.
      // We approximate by asserting the field name does NOT appear with `: true`
      // in any line that also references a `select:` clause context.
      // Stricter: assert the field name never appears as `  ${f}: true` in the script.
      const re = new RegExp(`^\\s*${f}\\s*:\\s*true`, "m");
      expect(re.test(src)).toBe(false);
    }
  });

  it("fingerprint maps only id+role (User), userId+roleId (UserRole), id+key (Role/Permission), roleId+permissionId (RolePermission) — no PII", () => {
    // The fingerprint is computed from stringified arrays of key fields.
    // Verify the .map() callbacks in the fingerprint section reference only
    // the documented non-PII fields.
    const fingerprintSection = src.match(
      /const beforeFingerprint[\s\S]*?const afterFingerprint[\s\S]*?\);/,
    );
    expect(fingerprintSection).not.toBeNull();
    const section = fingerprintSection![0];
    const piiFields = ["email", "mobile", "phone", "passwordHash", "firstName", "lastName"];
    for (const f of piiFields) {
      expect(section).not.toContain(`u.${f}`);
      expect(section).not.toContain(`ur.${f}`);
      expect(section).not.toContain(`r.${f}`);
      expect(section).not.toContain(`p.${f}`);
      expect(section).not.toContain(`rp.${f}`);
    }
  });

  it("SampleMissing/Mismatch/MultiRole/Invalid interfaces do NOT include email/mobile/phone/passwordHash", () => {
    // Extract each Sample* interface body and assert absence of PII keys.
    const interfaces = [
      "SampleMissing",
      "SampleMismatch",
      "SampleMultiRole",
      "SampleInvalid",
    ];
    for (const iface of interfaces) {
      const re = new RegExp(`interface ${iface}[^{]*\\{([^}]*)\\}`);
      const m = src.match(re);
      expect(m).not.toBeNull();
      const body = m![1];
      expect(body).not.toMatch(/\bemail\b/);
      expect(body).not.toMatch(/\bmobile\b/);
      expect(body).not.toMatch(/\bphone\b/);
      expect(body).not.toMatch(/\bpasswordHash\b/);
      expect(body).not.toMatch(/\bfirstName\b/);
      expect(body).not.toMatch(/\blastName\b/);
    }
  });

  it("SampleBase declares userId + legacyRole (cuid-based, no PII)", () => {
    // Sanity: userId IS in the sample structure (it's a cuid, not direct PII).
    const sampleBaseBody = src.match(/interface SampleBase\s*\{([^}]*)\}/)![1];
    expect(sampleBaseBody).toMatch(/\buserId\s*:/);
    expect(sampleBaseBody).toMatch(/\blegacyRole\s*:/);
    // And the per-user findMany DOES select id (the userId source).
    const code = stripComments(src);
    expect(code).toMatch(/db\.user\.findMany\([\s\S]*?select:\s*\{[^}]*\bid:\s*true/);
  });
});

/* ============================================================
   3. Gate logic consistency
   ------------------------------------------------------------
   For every classification, total MUST equal ok + missing + mismatch
   + multiRole + invalid, AND gatePasses MUST equal
   (INVALID==0 && MISMATCH==0 && MULTI_ROLE==0).
   ============================================================ */
describe("STEP 15.68 — Gate logic consistency (sum === total)", () => {
  const MATCHING_SNAPSHOTS = {
    before: {
      userCount: 5,
      userRoleCount: 1,
      roleCount: 5,
      permissionCount: 120,
      rolePermissionCount: 300,
    } as SnapshotCounts,
    after: {
      userCount: 5,
      userRoleCount: 1,
      roleCount: 5,
      permissionCount: 120,
      rolePermissionCount: 300,
    } as SnapshotCounts,
    beforeFingerprint: "fp",
    afterFingerprint: "fp",
  };

  function assertConsistency(c: ClassificationCounts): void {
    const result = evaluateGate(
      c,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    const sum = c.OK + c.MISSING + c.MISMATCH + c.MULTI_ROLE + c.INVALID;
    expect(result.total).toBe(sum);
    const expectedGate =
      c.INVALID === 0 && c.MISMATCH === 0 && c.MULTI_ROLE === 0;
    expect(result.gatePasses).toBe(expectedGate);

    // Round-trip through format → parse → validate → CI decision
    const line = formatGateOutput(result);
    const parsed = parseGateLine(line);
    const validationError = validateGateOutput(parsed);
    expect(validationError).toBeNull();
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(expectedGate && result.readOnlyInvariant);
  }

  it("all OK (clean) → total === sum, gatePasses === true", () => {
    assertConsistency({ OK: 100, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 });
  });

  it("OK + MISSING → total === sum, gatePasses === true (MISSING is backfillable)", () => {
    assertConsistency({ OK: 90, MISSING: 10, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 });
  });

  it("MISMATCH > 0 → gatePasses === false", () => {
    assertConsistency({ OK: 90, MISSING: 0, MISMATCH: 10, MULTI_ROLE: 0, INVALID: 0 });
  });

  it("MULTI_ROLE > 0 → gatePasses === false", () => {
    assertConsistency({ OK: 90, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 10, INVALID: 0 });
  });

  it("INVALID > 0 → gatePasses === false", () => {
    assertConsistency({ OK: 90, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 10 });
  });

  it("all blocking classes > 0 → gatePasses === false, total === sum", () => {
    assertConsistency({ OK: 1, MISSING: 2, MISMATCH: 3, MULTI_ROLE: 4, INVALID: 5 });
  });

  it("empty DB (all zero) → total === 0, gatePasses === true", () => {
    assertConsistency({ OK: 0, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 });
  });

  it("only MISSING (10K users, all orphan) → total === 10000, gatePasses === true", () => {
    assertConsistency({ OK: 0, MISSING: 10000, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 });
  });

  it("large realistic mix → consistency holds", () => {
    assertConsistency({ OK: 8500, MISSING: 1200, MISMATCH: 200, MULTI_ROLE: 80, INVALID: 20 });
  });

  it("formatGateOutput → parseGateLine → validateGateOutput → evaluateCiDecision round-trip is consistent", () => {
    // For every classification combination, the round-tripped gate decision
    // MUST match the directly-computed gate decision.
    const cases: ClassificationCounts[] = [
      { OK: 0, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 },
      { OK: 1, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 },
      { OK: 0, MISSING: 1, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 0 },
      { OK: 0, MISSING: 0, MISMATCH: 1, MULTI_ROLE: 0, INVALID: 0 },
      { OK: 0, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 1, INVALID: 0 },
      { OK: 0, MISSING: 0, MISMATCH: 0, MULTI_ROLE: 0, INVALID: 1 },
      { OK: 5, MISSING: 5, MISMATCH: 5, MULTI_ROLE: 5, INVALID: 5 },
    ];
    for (const c of cases) {
      assertConsistency(c);
    }
  });
});

/* ============================================================
   4. Dry-run script does NOT import write methods
   ------------------------------------------------------------
   The dry-run MUST be read-only. We verify by static source
   inspection that the script source does NOT contain any Prisma
   write call (create, update, delete, upsert, createMany,
   updateMany, deleteMany, $transaction with writes, $executeRaw,
   $executeRawUnsafe, $runCommandRaw).

   We ALSO verify it DOES import only the read-side db client
   (`import { db } from '@/lib/db'`) — so any future change that
   swaps in a different client will be caught.
   ============================================================ */
describe("STEP 15.68 — Dry-run script does NOT import write methods", () => {
  // Use comment-stripped source so docstring mentions of write methods
  // (e.g. "the future backfill will use db.userRole.upsert(...)" in the
  // script's header comment) don't trigger false-positive failures.
  const src = stripComments(readFileSync(SCRIPT_PATH, "utf-8"));

  it("imports db from '@/lib/db' (the standard read client)", () => {
    expect(src).toContain("import { db } from '@/lib/db';");
  });

  it("does NOT call db.user.create / update / delete / upsert", () => {
    expect(src).not.toMatch(/db\.user\.create\s*\(/);
    expect(src).not.toMatch(/db\.user\.update\s*\(/);
    expect(src).not.toMatch(/db\.user\.delete\s*\(/);
    expect(src).not.toMatch(/db\.user\.upsert\s*\(/);
    expect(src).not.toMatch(/db\.user\.createMany\s*\(/);
    expect(src).not.toMatch(/db\.user\.updateMany\s*\(/);
    expect(src).not.toMatch(/db\.user\.deleteMany\s*\(/);
  });

  it("does NOT call db.userRole.create / update / delete / upsert", () => {
    expect(src).not.toMatch(/db\.userRole\.create\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.update\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.delete\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.upsert\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.createMany\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.updateMany\s*\(/);
    expect(src).not.toMatch(/db\.userRole\.deleteMany\s*\(/);
  });

  it("does NOT call db.role / db.permission / db.rolePermission write methods", () => {
    for (const model of ["role", "permission", "rolePermission"]) {
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.create\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.update\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.delete\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.upsert\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.createMany\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.updateMany\\s*\\(`));
      expect(src).not.toMatch(new RegExp(`db\\.${model}\\.deleteMany\\s*\\(`));
    }
  });

  it("does NOT call db.auditLog.create (NO AuditLog writes — logAudit intentionally NOT imported)", () => {
    expect(src).not.toMatch(/db\.auditLog\.create\s*\(/);
    expect(src).not.toMatch(/db\.auditLog\.createMany\s*\(/);
    expect(src).not.toMatch(/db\.auditLog\.update\s*\(/);
    expect(src).not.toMatch(/db\.auditLog\.delete\s*\(/);
  });

  it("does NOT use $transaction (could wrap writes)", () => {
    expect(src).not.toMatch(/db\.\$transaction\s*\(/);
  });

  it("does NOT use $executeRaw / $executeRawUnsafe / $runCommandRaw (raw write SQL)", () => {
    expect(src).not.toMatch(/db\.\$executeRaw\s*\(/);
    expect(src).not.toMatch(/db\.\$executeRawUnsafe\s*\(/);
    expect(src).not.toMatch(/db\.\$runCommandRaw\s*\(/);
  });

  it("does NOT use $queryRawUnsafe with INSERT/UPDATE/DELETE (raw write via $queryRawUnsafe)", () => {
    // $queryRawUnsafe is dangerous because it allows arbitrary SQL.
    // We allow $queryRaw (tagged template) but ban $queryRawUnsafe entirely.
    expect(src).not.toMatch(/db\.\$queryRawUnsafe\s*\(/);
  });

  it("does NOT import logAudit from @/lib/audit (would write AuditLog rows)", () => {
    expect(src).not.toMatch(/from\s+['"]@\/lib\/audit['"]/);
    expect(src).not.toMatch(/\blogAudit\s*\(/);
  });

  it("uses only db.user.count / findMany / groupBy (read methods)", () => {
    // Sanity: confirm the script DOES use read methods (so the above
    // assertions aren't trivially satisfied by removing db entirely).
    expect(src).toMatch(/db\.user\.count\s*\(/);
    expect(src).toMatch(/db\.user\.findMany\s*\(/);
    expect(src).toMatch(/db\.user\.groupBy\s*\(/);
    expect(src).toMatch(/db\.userRole\.count\s*\(/);
    expect(src).toMatch(/db\.userRole\.findMany\s*\(/);
    expect(src).toMatch(/db\.role\.findMany\s*\(/);
  });

  it("calls db.$disconnect (read-only cleanup, not a write)", () => {
    expect(src).toMatch(/db\.\$disconnect\s*\(\s*\)/);
  });

  it("process.exit codes are 0 (success) or 2 (unrecoverable error) — never a 'success' exit on mutation", () => {
    // The dry-run exits 0 on success (no mutation) and 2 on unrecoverable error.
    // It must NOT exit 0 after detecting a mutation (that's handled by the
    // gate runner, not the dry-run script itself).
    expect(src).toMatch(/process\.exit\(0\)/);
    expect(src).toMatch(/process\.exit\(2\)/);
    // No exit 1 in the dry-run script (the gate runner uses exit 1 for
    // gate failures, but the dry-run script itself only uses 0/2).
    // (Note: this is a design invariant; if it changes, update this test.)
    expect(src).not.toMatch(/process\.exit\(1\)/);
  });
});

/* ============================================================
   5. Static source structure invariants
   ------------------------------------------------------------
   Catch regressions in the script's structure that would weaken
   the read-only guarantee.
   ============================================================ */
describe("STEP 15.68 — Dry-run script structural invariants", () => {
  // Use comment-stripped source for structural checks too, so docstring
  // references to role keys / directives don't masquerade as code.
  const rawSrc = readFileSync(SCRIPT_PATH, "utf-8");
  const src = stripComments(rawSrc);

  it("declares readOnly: true in the DryRunReport (output invariant)", () => {
    expect(src).toMatch(/readOnly:\s*true/);
  });

  it("canonically maps only ADMIN, SELLER, BUYER, MODERATOR, SUPPORT (matches schema + seed)", () => {
    // CANONICAL_ROLE_KEYS must match prisma/schema.prisma Role.key comment
    // AND prisma/seed-rbac.ts ROLES array AND permissions.ts ROLE_PERMISSIONS.
    expect(src).toMatch(/CANONICAL_ROLE_KEYS\s*=\s*\[(['"]ADMIN['"],\s*['"]SELLER['"],\s*['"]BUYER['"],\s*['"]MODERATOR['"],\s*['"]SUPPORT['"])\]/);

    // Cross-check seed-rbac.ts declares the same 5 roles.
    const seedSrc = readFileSync(
      resolve(process.cwd(), "prisma", "seed-rbac.ts"),
      "utf-8",
    );
    for (const key of ["ADMIN", "SELLER", "BUYER", "MODERATOR", "SUPPORT"]) {
      expect(seedSrc).toContain(`key: "${key}"`);
    }

    // Cross-check src/lib/authorization/permissions.ts ROLE_PERMISSIONS keys.
    const permSrc = readFileSync(
      resolve(process.cwd(), "src", "lib", "authorization", "permissions.ts"),
      "utf-8",
    );
    for (const key of ["ADMIN", "SELLER", "BUYER", "MODERATOR", "SUPPORT"]) {
      expect(permSrc).toMatch(new RegExp(`^\\s*${key}:\\s*\\[`, "m"));
    }
  });

  it("LEGACY_ALIAS_MAP includes SUPERADMIN → ADMIN alias", () => {
    expect(src).toMatch(/SUPERADMIN:\s*['"]ADMIN['"]/);
  });

  it("owner directive (no auto-correct ambiguous roles) is present in output", () => {
    // The owner directive «نقش‌های مبهم را خودکار اصلاح نکن.» must appear
    // in the verdict output so consumers see the policy. We check the raw
    // source (not comment-stripped) because it's a string literal in code,
    // but it ALSO appears in the header comment — checking raw is fine.
    expect(rawSrc).toContain("نقش‌های مبهم را خودکار اصلاح نکن.");
  });

  it("gate is FAIL-CLOSED: gatePasses requires INVALID==0 AND MISMATCH==0 AND MULTI_ROLE==0", () => {
    // The script's verdict.gatePasses computation must use all three
    // blocking classes, not just INVALID or just MISMATCH.
    expect(src).toMatch(
      /invalidCount\s*===\s*0\s*&&\s*classification\.MISMATCH\s*===\s*0\s*&&\s*classification\.MULTI_ROLE\s*===\s*0/,
    );
  });

  it("emits DRYRUN_GATE: line for CI parsing (single source of truth)", () => {
    expect(src).toMatch(/formatGateOutput\s*\(/);
    // The empty-DB path emits a literal DRYRUN_GATE line.
    expect(rawSrc).toMatch(/DRYRUN_GATE:\{"gatePasses":true,"readOnlyInvariant":true,"okCount":0/);
  });

  it("BEFORE + AFTER snapshots both cover all 5 RBAC tables (User, UserRole, Role, Permission, RolePermission)", () => {
    // The read-only invariant must compare counts AND fingerprints for
    // all 5 tables, not just User + UserRole.
    for (const table of ["user", "userRole", "role", "permission", "rolePermission"]) {
      // Both beforeCounts and afterCounts reference each table count.
      const re = new RegExp(`\\b${table}Count:\\s*await\\s+db\\.${table}\\.count`, "g");
      const matches = src.match(re);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2); // before + after
    }
  });

  it("fingerprint covers all 5 tables (Promise.all with 5 entries × 2 = 10 findMany)", () => {
    // Count the number of findMany calls inside Promise.all blocks.
    // There should be at least 10 (5 before + 5 after).
    const promiseAllBlocks = src.match(/Promise\.all\(\[[\s\S]*?\]\)/g);
    expect(promiseAllBlocks).not.toBeNull();
    expect(promiseAllBlocks!.length).toBeGreaterThanOrEqual(2);
    for (const block of promiseAllBlocks!) {
      const findManyCount = (block.match(/db\.\w+\.findMany/g) || []).length;
      expect(findManyCount).toBe(5);
    }
  });
});
