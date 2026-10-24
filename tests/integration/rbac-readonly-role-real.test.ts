import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.55: Read-Only Role + Effective Privilege Tests
   ------------------------------------------------------------
   CR-15.55-02: The integration-time dry-run test (exit code 0
   requirement) is REMOVED from this file. The authoritative
   dry-run gate is the CI step "Phase C dry-run gate" which
   runs BEFORE integration tests in isolation.

   CR-15.55-04: SQL helpers now use execFileSync (no shell
   interpolation). SQL is passed as a separate argument, not
   embedded in a shell command string.

   CR-15.55-03: The integration-time test is replaced with a
   test that verifies the dry-run does NOT get permission errors
   under the read-only role (not that it exits 0 — concurrent
   test mutations may cause readOnlyInvariant=false, which is
   expected in the integration test context).

   These tests run ONLY in CI (postgres:17 service container).
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.55 — Read-Only Role Effective Privileges (CR-15.55-04)",
  () => {
    // CR-15.55-04: Use execFileSync (no shell interpolation)
    // SQL is passed as a separate argument to psql -c, not embedded in shell string
    function psqlRO(sql: string): string {
      const pw = process.env.DRYUN_RO_PW;
      if (!pw) {
        throw new Error("DRYUN_RO_PW environment variable is not set — cannot authenticate as read-only role");
      }
      return execFileSync(
        "psql",
        ["-h", "localhost", "-U", "heavix_dryrun_ro", "-d", "heavix_test", "-t", "-A", "-c", sql],
        { encoding: "utf-8", timeout: 10000, env: { ...process.env, PGPASSWORD: pw } },
      ).trim();
    }

    function psqlAdmin(sql: string): string {
      return execFileSync(
        "psql",
        ["-h", "localhost", "-U", "postgres", "-d", "heavix_test", "-t", "-A", "-c", sql],
        { encoding: "utf-8", timeout: 10000, env: { ...process.env, PGPASSWORD: "postgres" } },
      ).trim();
    }

    it("Role exists and is not a superuser", () => {
      const result = psqlAdmin(
        "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='heavix_dryrun_ro'",
      );
      expect(result).toBe("f|f|f");
    });

    it("Role has no membership in other roles (no inherited privileges)", () => {
      const result = psqlAdmin(
        "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON m.roleid = r.oid WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname='heavix_dryrun_ro')",
      );
      expect(parseInt(result, 10)).toBe(0);
    });

    it("Role has SELECT on User table (information_schema — direct grants)", () => {
      const result = psqlRO(
        "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='User' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type",
      );
      const privileges = result.split("\n").filter(Boolean);
      expect(privileges).toContain("SELECT");
      expect(privileges).not.toContain("INSERT");
      expect(privileges).not.toContain("UPDATE");
      expect(privileges).not.toContain("DELETE");
    });

    it("Role has SELECT on UserRole table (information_schema — direct grants)", () => {
      const result = psqlRO(
        "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='UserRole' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type",
      );
      const privileges = result.split("\n").filter(Boolean);
      expect(privileges).toContain("SELECT");
      expect(privileges).not.toContain("INSERT");
    });

    it("Role has SELECT on Role, Permission, RolePermission tables (information_schema)", () => {
      for (const table of ["Role", "Permission", "RolePermission"]) {
        const result = psqlRO(
          `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee='heavix_dryrun_ro'`,
        );
        expect(result).toContain("SELECT");
        expect(result).not.toContain("INSERT");
        expect(result).not.toContain("UPDATE");
        expect(result).not.toContain("DELETE");
      }
    });

    it("INSERT denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          psqlRO(`INSERT INTO "${table}" DEFAULT VALUES`);
        } catch (e: unknown) {
          denied = true;
          errorMsg = String(e);
        }
        expect(denied).toBe(true);
        expect(errorMsg).toMatch(/permission denied/i);
      }
    });

    it("UPDATE denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          psqlRO(`UPDATE "${table}" SET id = id WHERE id = '__nonexistent__'`);
        } catch (e: unknown) {
          denied = true;
          errorMsg = String(e);
        }
        expect(denied).toBe(true);
        expect(errorMsg).toMatch(/permission denied/i);
      }
    });

    it("DELETE denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          psqlRO(`DELETE FROM "${table}" WHERE id = '__nonexistent__'`);
        } catch (e: unknown) {
          denied = true;
          errorMsg = String(e);
        }
        expect(denied).toBe(true);
        expect(errorMsg).toMatch(/permission denied/i);
      }
    });

    it("TRUNCATE denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          psqlRO(`TRUNCATE "${table}"`);
        } catch (e: unknown) {
          denied = true;
          errorMsg = String(e);
        }
        expect(denied).toBe(true);
        expect(errorMsg).toMatch(/permission denied/i);
      }
    });

    it("CR-15.53-04: Direct grants — SELECT only on ALL 5 tables (information_schema)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        const result = psqlRO(
          `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type`,
        );
        const privileges = result.split("\n").filter(Boolean);
        expect(privileges).toContain("SELECT");
        expect(privileges).not.toContain("INSERT");
        expect(privileges).not.toContain("UPDATE");
        expect(privileges).not.toContain("DELETE");
        expect(privileges).not.toContain("TRUNCATE");
        expect(privileges).not.toContain("REFERENCES");
        expect(privileges).not.toContain("TRIGGER");
      }
    });

    it("CR-15.54: Effective table privileges via has_table_privilege() (ALL 5 tables)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        const selectResult = psqlAdmin(
          `SELECT has_table_privilege('heavix_dryrun_ro', 'public."${table}"', 'SELECT')`,
        );
        expect(selectResult).toBe("t");
        for (const writePriv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          const writeResult = psqlAdmin(
            `SELECT has_table_privilege('heavix_dryrun_ro', 'public."${table}"', '${writePriv}')`,
          );
          expect(writeResult).toBe("f");
        }
      }
    });

    it("CR-15.54: No PUBLIC grants on RBAC tables (would bypass role check)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        const result = psqlAdmin(
          `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee='PUBLIC'`,
        );
        const publicPrivs = result.split("\n").filter(Boolean);
        for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          expect(publicPrivs).not.toContain(priv);
        }
      }
    });

    it("CR-15.54: No sequence UPDATE grants (cannot manipulate IDs)", () => {
      const updateResult = psqlAdmin(
        `SELECT count(*) FROM information_schema.role_usage_grants WHERE grantee='heavix_dryrun_ro' AND object_type='SEQUENCE' AND privilege_type='UPDATE'`,
      );
      expect(parseInt(updateResult, 10)).toBe(0);
    });

    it("CR-15.53-04: Role does not own any tables (no ownership-based privileges)", () => {
      const result = psqlAdmin(
        "SELECT count(*) FROM pg_tables WHERE tableowner='heavix_dryrun_ro'",
      );
      expect(parseInt(result, 10)).toBe(0);
    });

    it("CR-15.53-04: Role has no inherited privileges via role membership", () => {
      const result = psqlAdmin(
        "SELECT count(*) FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname='heavix_dryrun_ro')",
      );
      expect(parseInt(result, 10)).toBe(0);
    });

    it("CR-15.53-04: Role has USAGE on schema but no CREATE", () => {
      const result = psqlAdmin(
        "SELECT has_schema_privilege('heavix_dryrun_ro', 'public', 'USAGE'), has_schema_privilege('heavix_dryrun_ro', 'public', 'CREATE')",
      );
      const [hasUsage, hasCreate] = result.split("|");
      expect(hasUsage).toBe("t");
      expect(hasCreate).toBe("f");
    });

    it("CR-15.55-02: Dry-run under read-only role has no permission errors", () => {
      // CR-15.55-03: This is an INTEGRATION-TIME test, not the authoritative gate.
      // The authoritative gate is the CI step "Phase C dry-run gate" which runs
      // BEFORE integration tests in isolation.
      //
      // This test verifies that the dry-run script does not get permission errors
      // when run under the read-only role during the integration test phase.
      // It does NOT require exit code 0 (readOnlyInvariant may be false due to
      // concurrent test mutations — that is expected in this context).
      const pw = process.env.DRYUN_RO_PW;
      if (!pw) {
        throw new Error("DRYUN_RO_PW environment variable is not set");
      }
      const roUrl = `postgresql://heavix_dryrun_ro:${pw}@localhost:5432/heavix_test?schema=public`;

      let output = "";
      try {
        output = execFileSync(
          "bunx",
          ["tsx", "scripts/rbac-backfill-dryrun.ts"],
          {
            encoding: "utf-8",
            timeout: 120000,
            env: {
              ...process.env,
              DATABASE_URL: roUrl,
              // STEP 15.68: preflight env vars (F-15.68-01, F-15.68-02)
              DRYRUN_CONFIRM_TARGET: "heavix_test",
              DRYRUN_EXPECTED_ROLE: "heavix_dryrun_ro",
              // STEP 15.73: MANDATORY host identity verification.
              // STEP 15.75: DRYRUN_CI_HOST_CHECK_EXCEPTION, GITHUB_ACTIONS, CI
              // have been REMOVED from the integration env block. The
              // inet_server_addr() IP check has been removed entirely;
              // identity is now verified via LIVE DB content (table existence +
              // Role catalog) inside preflightConnectionCheck. GITHUB_ACTIONS
              // and CI are no longer referenced by the preflight — they were
              // caller-controlled env vars that could not cryptographically
              // prove "this is GitHub Actions CI." DRYRUN_CI_HOST_CHECK_EXCEPTION
              // is now a deprecated bypass: ANY value halts with exit 2.
              DRYRUN_EXPECTED_HOST: "localhost",
              DRYRUN_ALLOW_NO_TLS: "true", // CI postgres:17 has no TLS
            },
          },
        );
      } catch (e: unknown) {
        const err = e as { stdout?: string };
        output = err.stdout ?? "";
      }

      // MUST NOT contain permission errors (the read-only role must allow SELECTs)
      expect(output).not.toMatch(/permission denied/i);
      // MUST contain DRYRUN_GATE output (the script ran to completion)
      expect(output).toContain("DRYRUN_GATE:");
    });
  },
);

/* ============================================================
   Non-DB tests: verify CI workflow + SQL script + runner script
   ============================================================ */

describe("STEP 15.55 — CI Workflow + Script Verification (no DB needed)", () => {
  it("CI workflow creates read-only role with env-var password (not hard-coded)", () => {
    const content = readFileSync(".github/workflows/ci.yml", "utf-8");
    expect(content).toContain("DRYUN_RO_PW");
    expect(content).toContain("openssl rand -hex 16");
    expect(content).not.toContain("dryrun_ro_password");
  });

  it("CI dry-run step uses heavix_dryrun_ro role (not superuser)", () => {
    const content = readFileSync(".github/workflows/ci.yml", "utf-8");
    expect(content).toContain("heavix_dryrun_ro");
    expect(content).toContain("DRYRUN_DATABASE_URL");
  });

  it("CI dry-run step runs BEFORE integration tests (CR-15.52-01)", () => {
    const content = readFileSync(".github/workflows/ci.yml", "utf-8");
    const gateIdx = content.indexOf("Phase C dry-run gate");
    const integrationIdx = content.indexOf("Integration — tenant-scope-real");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(integrationIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(integrationIdx);
  });

  it("SQL script uses psql variable for password (not hard-coded)", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain(":'dryrun_password'");
    expect(content).not.toContain("dryrun_ro_password");
    expect(content).not.toContain("current_setting");
  });

  it("SQL script explicitly REVOKEs write privileges", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE");
  });

  it("scripts/rbac-gate-ci.ts imports from shared gate-logic module", () => {
    const content = readFileSync("scripts/rbac-gate-ci.ts", "utf-8");
    expect(content).toContain('from "../src/lib/rbac/gate-logic"');
    expect(content).toContain("parseGateLine");
    expect(content).toContain("validateGateOutput");
    expect(content).toContain("evaluateCiDecision");
  });

  it("scripts/rbac-gate-ci.ts calls process.exit (not just returns)", () => {
    const content = readFileSync("scripts/rbac-gate-ci.ts", "utf-8");
    expect(content).toContain("process.exit(1)");
    expect(content).toContain("process.exit(0)");
  });

  it("Gate runner uses execFileSync (not shell interpolation)", () => {
    // CR-15.55-04: verify the test file uses execFileSync, not shell-embedded commands
    const content = readFileSync("tests/integration/rbac-readonly-role-real.test.ts", "utf-8");
    expect(content).toContain("execFileSync");
    // The import statement should use execFileSync, not execSync
    expect(content).toContain("import { execFileSync }");
    // No shell-based execSync import
    expect(content).not.toMatch(/import\s*\{[^}]*execSync[^}]*\}/);
  });
});
