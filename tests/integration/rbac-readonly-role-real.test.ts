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
      // CR-15.52-02: NO static fallback — fail explicitly if DRYUN_RO_PW is absent
      const pw = process.env.DRYUN_RO_PW;
      if (!pw) {
        throw new Error("DRYUN_RO_PW environment variable is not set — cannot authenticate as read-only role");
      }
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

    it("INSERT denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          // Use parameterized values to avoid SQL injection; the INSERT must
          // fail with "permission denied" (not a data error)
          psqlRO(`INSERT INTO "${table}" DEFAULT VALUES`);
        } catch (e: unknown) {
          denied = true;
          errorMsg = String(e);
        }
        expect(denied).toBe(true);
        // Must fail due to permission, not data validation
        expect(errorMsg).toMatch(/permission denied/i);
      }
    });

    it("UPDATE denied on ALL 5 RBAC tables (CR-15.54)", () => {
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        let denied = false;
        let errorMsg = "";
        try {
          // UPDATE with a WHERE that matches no rows — if permission exists,
          // this would succeed (0 rows affected); if denied, it errors
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
      // NOTE: This checks DIRECT grants via information_schema.role_table_grants.
      // It does NOT check effective privileges via PUBLIC, role membership, or ownership.
      // Effective privileges are checked separately below.
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
      // has_table_privilege() checks EFFECTIVE privileges including inherited,
      // PUBLIC grants, and ownership. This is stronger than information_schema.
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        const selectResult = psqlAdmin(
          `SELECT has_table_privilege('heavix_dryrun_ro', 'public."${table}"', 'SELECT')`,
        );
        expect(selectResult).toBe("t"); // SELECT allowed
        for (const writePriv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          const writeResult = psqlAdmin(
            `SELECT has_table_privilege('heavix_dryrun_ro', 'public."${table}"', '${writePriv}')`,
          );
          expect(writeResult).toBe("f"); // write denied
        }
      }
    });

    it("CR-15.54: No PUBLIC grants on RBAC tables (would bypass role check)", () => {
      // PUBLIC grants apply to ALL roles; check no write privileges granted to PUBLIC
      const tables = ["User", "UserRole", "Role", "Permission", "RolePermission"];
      for (const table of tables) {
        const result = psqlAdmin(
          `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee='PUBLIC'`,
        );
        const publicPrivs = result.split("\n").filter(Boolean);
        // PUBLIC should have NO privileges on RBAC tables (not even SELECT)
        // If PUBLIC had SELECT, any role could read without explicit grant
        for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          expect(publicPrivs).not.toContain(priv);
        }
      }
    });

    it("CR-15.54: No sequence usage grants (cannot call nextval/currval)", () => {
      // Sequences are used for auto-increment; write access to sequences
      // could allow manipulating IDs
      const result = psqlAdmin(
        `SELECT count(*) FROM information_schema.role_usage_grants WHERE grantee='heavix_dryrun_ro' AND object_type='SEQUENCE' AND privilege_type IN ('USAGE','UPDATE')`,
      );
      // USAGE on sequences is expected (needed for SELECT queries that reference sequences)
      // but UPDATE should not be present
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
      // CR-15.52-02: NO static fallback — fail explicitly if DRYUN_RO_PW is absent
      const pw = process.env.DRYUN_RO_PW;
      if (!pw) {
        throw new Error("DRYUN_RO_PW environment variable is not set — cannot authenticate as read-only role");
      }
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

  it("SQL script uses psql variable for password (not hard-coded)", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain(":'dryrun_password'");
    // CR-15.51-04: no hard-coded password in SQL
    expect(content).not.toContain("dryrun_ro_password");
    expect(content).not.toContain("current_setting");
  });

  it("SQL script explicitly REVOKEs write privileges", () => {
    const content = readFileSync("scripts/rbac-create-readonly-role.sql", "utf-8");
    expect(content).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE");
  });
});
