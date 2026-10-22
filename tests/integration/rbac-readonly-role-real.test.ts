import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.51: Read-Only Role + Effective Privilege Tests
   ------------------------------------------------------------
   CR-15.51-01: The actual CI gate uses heavix_dryrun_ro (proven
     by the CI workflow step that sets DATABASE_URL to the RO role).
   CR-15.51-02: The test requires exit code 0, valid gate output,
     and readOnlyInvariant=true.
   CR-15.51-03: Effective privilege audit — checks pg_roles, pg_class,
     information_schema for any write privileges.
   CR-15.51-04: Password from env var (not hard-coded).

   These tests run ONLY in CI (postgres:17 service container).
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.51 — Read-Only Role Effective Privileges (CR-15.51-03)",
  () => {
    const DB_URL = process.env.DATABASE_URL!.split("?")[0];
    const RO_URL = DB_URL.replace(
      "postgresql://postgres:postgres@",
      "postgresql://heavix_dryrun_ro:",
    ).replace(/:heavix_dryrun_ro:[^@]*@/, ":heavix_dryrun_ro@");

    // Helper: run psql as the read-only role
    function psqlRO(sql: string): string {
      // CR-15.51-04: Use the CI-generated password from DRYUN_RO_PW env var
      const pw = process.env.DRYUN_RO_PW || "dryrun_ro_password";
      // Use PGPASSWORD env var instead of URL (avoids shell escaping issues)
      return execSync(`psql -h localhost -U heavix_dryrun_ro -d heavix_test -t -A -c "${sql.replace(/"/g, '\\"')}"`, {
        encoding: "utf-8",
        timeout: 10000,
        env: { ...process.env, PGPASSWORD: pw },
      }).trim();
    }

    // Helper: run psql as superuser
    function psqlAdmin(sql: string): string {
      return execSync(
        `PGPASSWORD=postgres psql -h localhost -U postgres -d heavix_test -t -A -c "${sql.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", timeout: 10000 },
      ).trim();
    }

    // No beforeAll — the role is created by the CI workflow step
    // "Create read-only PostgreSQL role (STEP 15.51)" which runs BEFORE tests.
    // The password is in DRYUN_RO_PW (set via GITHUB_ENV by CI workflow).

    it("Role exists and is not a superuser", () => {
      const result = psqlAdmin(
        "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='heavix_dryrun_ro'",
      );
      expect(result).toBe("f|f|f"); // not superuser, can't create roles, can't create DB
    });

    it("Role has no membership in other roles (no inherited privileges)", () => {
      const result = psqlAdmin(
        "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON m.roleid = r.oid WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname='heavix_dryrun_ro')",
      );
      expect(parseInt(result, 10)).toBe(0);
    });

    it("Role has SELECT on User table (information_schema)", () => {
      const result = psqlRO(
        "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='User' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type",
      );
      const privileges = result.split("\n").filter(Boolean);
      expect(privileges).toContain("SELECT");
      expect(privileges).not.toContain("INSERT");
      expect(privileges).not.toContain("UPDATE");
      expect(privileges).not.toContain("DELETE");
    });

    it("Role has SELECT on UserRole table", () => {
      const result = psqlRO(
        "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='UserRole' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type",
      );
      const privileges = result.split("\n").filter(Boolean);
      expect(privileges).toContain("SELECT");
      expect(privileges).not.toContain("INSERT");
    });

    it("Role has SELECT on Role, Permission, RolePermission tables", () => {
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

    it("INSERT is denied by PostgreSQL (permission denied)", () => {
      let denied = false;
      try {
        psqlRO(
          `INSERT INTO "User" (id, firstName, lastName, email, mobile, passwordHash, role, status, emailVerified, mobileVerified) VALUES ('ro-test-denied', 'T', 'R', 'ro@ex.com', '999', 'h', 'BUYER', 'ACTIVE', true, true)`,
        );
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
    });

    it("UPDATE is denied by PostgreSQL", () => {
      let denied = false;
      try {
        psqlRO(`UPDATE "User" SET role='ADMIN' WHERE id='nonexistent'`);
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
    });

    it("DELETE is denied by PostgreSQL", () => {
      let denied = false;
      try {
        psqlRO(`DELETE FROM "User" WHERE id='nonexistent'`);
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
    });

    it("TRUNCATE is denied by PostgreSQL", () => {
      let denied = false;
      try {
        psqlRO(`TRUNCATE "User"`);
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
    });
  },
);

/* ============================================================
   CR-15.51-02: Isolated read-only dry-run test
   ------------------------------------------------------------
   This test runs the dry-run script with the read-only role
   in the CI test DB. It REQUIRES:
   - exit code 0
   - valid DRYRUN_GATE output
   - gatePasses=true
   - readOnlyInvariant=true
   - no permission errors

   NOTE: This test may be affected by concurrent test mutations.
   The authoritative check is the CI step "Phase C dry-run" which
   runs BEFORE the integration test files step (isolated).
   ============================================================ */

describe.skipIf(!RUN_TESTS)(
  "STEP 15.51 — Isolated Read-Only Dry-Run (CR-15.51-02)",
  () => {
    it("Dry-run exits 0 with valid gate under read-only role", () => {
      const pw = process.env.DRYUN_RO_PW || "dryrun_ro_password";
      const roUrl = `postgresql://heavix_dryrun_ro:${pw}@localhost:5432/heavix_test?schema=public`;
      let output = "";
      let exitCode = 0;
      try {
        output = execSync("bunx tsx scripts/rbac-backfill-dryrun.ts", {
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env, DATABASE_URL: roUrl },
        });
      } catch (e: unknown) {
        const err = e as { stdout?: string; status?: number };
        output = err.stdout ?? "";
        exitCode = err.status ?? 1;
      }

      // CR-15.51-02: MUST exit 0
      expect(exitCode).toBe(0);

      // MUST NOT contain permission errors
      expect(output).not.toMatch(/permission denied/i);

      // MUST contain valid DRYRUN_GATE output
      expect(output).toContain("DRYRUN_GATE:");

      // Extract and validate the gate line
      const gateLine = output
        .split("\n")
        .reverse()
        .find((l) => l.startsWith("DRYRUN_GATE:"));
      expect(gateLine).toBeDefined();

      const gateJson = gateLine!.slice("DRYRUN_GATE:".length);
      const parsed = JSON.parse(gateJson);

      // CR-15.51-02: MUST have gatePasses=true
      expect(parsed.gatePasses).toBe(true);

      // CR-15.51-02: MUST have readOnlyInvariant=true
      // (Note: if concurrent tests mutate DB, this may be false.
      //  In that case, the test fails — which is correct behavior.
      //  The CI step runs BEFORE integration tests, so it's isolated.)
      expect(parsed.readOnlyInvariant).toBe(true);
    });
  },
);

/* ============================================================
   Non-DB tests: verify CI workflow uses read-only role (CR-15.51-01)
   ============================================================ */

describe("STEP 15.51 — CI Workflow Verification (no DB needed)", () => {
  it("CI workflow creates read-only role with env-var password (not hard-coded)", () => {
    const content = readFileSync(".github/workflows/ci.yml", "utf-8");
    expect(content).toContain("DRYUN_RO_PW");
    expect(content).toContain("openssl rand -hex 16");
    // CR-15.51-04: no hard-coded password
    expect(content).not.toContain("dryrun_ro_password");
  });

  it("CI dry-run step uses heavix_dryrun_ro role (not superuser)", () => {
    const content = readFileSync(".github/workflows/ci.yml", "utf-8");
    expect(content).toContain("heavix_dryrun_ro");
    expect(content).toContain("DRYRUN_DATABASE_URL");
  });

  it("SQL script uses env var for password (not hard-coded)", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain("current_setting('DRYRUN_RO_PASSWORD'");
    // CR-15.51-04: no hard-coded password in SQL
    expect(content).not.toContain("dryrun_ro_password");
  });

  it("SQL script explicitly REVOKEs write privileges", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE");
  });
});
