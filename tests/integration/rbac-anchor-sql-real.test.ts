import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";

/* ============================================================
   HEAVIX — STEP 15.82: REAL PostgreSQL behavioral tests for
   the anchor-table SQL scripts (install, reinstall, rotation).
   ------------------------------------------------------------
   These tests run ONLY in CI (postgres:17 service container).
   They exercise the ACTUAL SQL scripts against a real database:
     - scripts/rbac-create-anchor-table.sql (install)
     - scripts/rbac-rotate-anchor.sql (rotation)

   Test scenario index (13 scenarios, categorized by evidence type):
     1.  Initial anchor installation                      [SQL script test]
     2.  Re-installation preserves value (non-destructive) [SQL script test]
     3.  Read-only role CANNOT write to anchor table       [privilege test]
     4.  Successful anchor rotation                       [SQL script test]
     5.  Rotation when row missing → failure detected      [SQL script test]
     6.  REAL preflight: anchor mismatch → exit code 2     [end-to-end preflight test]
     7.  Cloned DB has identical anchor (H-04 limit)       [clone simulation — NOT end-to-end]
     8.  Empty anchor_value in rotation → rejected          [SQL script test]
     9.  Missing anchor_value variable in rotation          [SQL script test]
     10. Whitespace-only anchor_value in rotation → rejected[SQL script test]
     11. Empty anchor_value in install → rejected before DDL [SQL script test]
     12. Whitespace-only anchor_value in install → rejected [SQL script test]
     13. Missing anchor_value variable in install → rejected [SQL script test]

   Evidence categories (per owner's /analyst directive):
     - SQL script test: runs the SQL script, verifies DB state
     - end-to-end preflight test: runs the ACTUAL dry-run script, verifies exit code
     - clone simulation: documents the H-04 limitation (NOT an end-to-end test)
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

function psqlAdmin(sql: string): string {
  return execFileSync(
    "psql",
    ["-h", "localhost", "-U", "postgres", "-d", "heavix_test", "-t", "-A", "-c", sql],
    { encoding: "utf-8", timeout: 10000, env: { ...process.env, PGPASSWORD: "postgres" } },
  ).trim();
}

function psqlScript(scriptPath: string, vars: Record<string, string>): void {
  const args = ["-h", "localhost", "-U", "postgres", "-d", "heavix_test", "-f", scriptPath];
  for (const [k, v] of Object.entries(vars)) {
    args.push("-v", `${k}=${v}`);
  }
  execFileSync("psql", args, {
    encoding: "utf-8",
    timeout: 10000,
    env: { ...process.env, PGPASSWORD: "postgres" },
  });
}

function psqlRO(sql: string): string {
  const pw = process.env.DRYUN_RO_PW;
  if (!pw) throw new Error("DRYUN_RO_PW not set");
  return execFileSync(
    "psql",
    ["-h", "localhost", "-U", "heavix_dryrun_ro", "-d", "heavix_test", "-t", "-A", "-c", sql],
    { encoding: "utf-8", timeout: 10000, env: { ...process.env, PGPASSWORD: pw } },
  ).trim();
}

describe.skipIf(!RUN_TESTS)(
  "STEP 15.83 — Anchor SQL scripts (REAL PostgreSQL behavioral tests — 13 scenarios)",
  () => {
    const ANCHOR_VALUE_1 = "test_anchor_value_ALPHA_111";
    const ANCHOR_VALUE_2 = "test_anchor_value_BETA_222";

    beforeAll(() => {
      // Clean slate: drop the anchor table if it exists from a prior test run.
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');
    });

    afterAll(() => {
      // Cleanup: drop the anchor table after tests.
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');
    });

    // ── Scenario 1: Initial anchor installation ──────────────────────────
    it("1. Initial anchor installation creates the table + row + correct grants", () => {
      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: ANCHOR_VALUE_1 });

      // Table exists
      const tableExists = psqlAdmin(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_dryrun_anchor')",
      );
      expect(tableExists).toBe("t");

      // Row exists with the correct value
      const value = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(value).toBe(ANCHOR_VALUE_1);

      // read-only role has SELECT only (no write)
      const roPrivs = psqlAdmin(
        "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='_dryrun_anchor' AND grantee='heavix_dryrun_ro' ORDER BY privilege_type",
      );
      expect(roPrivs).toBe("SELECT");
    });

    // ── Scenario 2: Re-installation preserves existing value (non-destructive) ──
    it("2. Re-installation does NOT destroy the existing anchor value (ON CONFLICT DO NOTHING)", () => {
      // Re-run the install script with a DIFFERENT value
      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: ANCHOR_VALUE_2 });

      // The existing value (ANCHOR_VALUE_1) must be PRESERVED (not overwritten to ANCHOR_VALUE_2)
      const value = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(value).toBe(ANCHOR_VALUE_1); // ← preserved, NOT overwritten
    });

    // ── Scenario 3: Read-only role has SELECT-only (no write) on anchor table ──
    it("3. Read-only role CANNOT write to the anchor table (forgeable if it could)", () => {
      // INSERT must be denied
      let insertDenied = false;
      try {
        psqlRO("INSERT INTO \"_dryrun_anchor\" (key, value) VALUES ('forged', 'x')");
      } catch (e: unknown) {
        insertDenied = true;
        expect(String(e)).toMatch(/permission denied/i);
      }
      expect(insertDenied).toBe(true);

      // UPDATE must be denied
      let updateDenied = false;
      try {
        psqlRO("UPDATE \"_dryrun_anchor\" SET value='forged' WHERE key='server_identity'");
      } catch (e: unknown) {
        updateDenied = true;
        expect(String(e)).toMatch(/permission denied/i);
      }
      expect(updateDenied).toBe(true);

      // DELETE must be denied
      let deleteDenied = false;
      try {
        psqlRO("DELETE FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      } catch (e: unknown) {
        deleteDenied = true;
        expect(String(e)).toMatch(/permission denied/i);
      }
      expect(deleteDenied).toBe(true);

      // SELECT must work
      const selectResult = psqlRO("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(selectResult).toBe(ANCHOR_VALUE_1);
    });

    // ── Scenario 4: Successful anchor rotation ────────────────────────────
    it("4. Rotation UPDATEs the value and sets rotated_at timestamp", () => {
      const beforeRotated = psqlAdmin("SELECT rotated_at FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(beforeRotated).toBe(""); // rotated_at is NULL before first rotation

      psqlScript("scripts/rbac-rotate-anchor.sql", { anchor_value: ANCHOR_VALUE_2 });

      // Value is now ANCHOR_VALUE_2 (rotated)
      const value = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(value).toBe(ANCHOR_VALUE_2);

      // rotated_at is now set (non-NULL)
      const afterRotated = psqlAdmin("SELECT rotated_at FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(afterRotated).not.toBe("");
    });

    // ── Scenario 5: Rotation when the row is missing → failure detected ──
    it("5. Rotation when the row is missing → failure detected (DO block RAISE EXCEPTION)", () => {
      // Temporarily delete the row (as admin)
      psqlAdmin("DELETE FROM \"_dryrun_anchor\" WHERE key='server_identity'");

      // Rotation must FAIL (non-zero exit code from the DO block EXCEPTION)
      let rotationFailed = false;
      try {
        psqlScript("scripts/rbac-rotate-anchor.sql", { anchor_value: "should_fail" });
      } catch (e: unknown) {
        rotationFailed = true;
        expect(String(e)).toMatch(/server_identity row/i);
      }
      expect(rotationFailed).toBe(true);

      // Restore the row for subsequent tests
      psqlAdmin(`INSERT INTO "_dryrun_anchor" (key, value) VALUES ('server_identity', '${ANCHOR_VALUE_2}')`);
    });

    // ── Scenario 6: Anchor mismatch → detected by preflight logic ──────────
    // ── Scenario 6: REAL preflight behavioral test — anchor mismatch → halt ─
    it("6. REAL preflight: anchor mismatch → exit code 2 + halt message (NOT string comparison)", () => {
      // This test runs the ACTUAL dry-run script with a WRONG anchor value.
      // It verifies the preflight HALTS with exit code 2 and prints the
      // mismatch error — NOT a string comparison simulation.
      const pw = process.env.DRYUN_RO_PW;
      if (!pw) throw new Error("DRYUN_RO_PW not set");
      const roUrl = `postgresql://heavix_dryrun_ro:${pw}@localhost:5432/heavix_test?schema=public`;
      const wrongAnchor = "DEFINITELY_WRONG_ANCHOR_VALUE";

      let exitCode: number | null = null;
      let stdout = "";
      let stderr = "";
      try {
        stdout = execFileSync(
          "bunx",
          ["tsx", "scripts/rbac-backfill-dryrun.ts"],
          {
            encoding: "utf-8",
            timeout: 120000,
            env: {
              ...process.env,
              DATABASE_URL: roUrl,
              DRYRUN_CONFIRM_TARGET: "heavix_test",
              DRYRUN_EXPECTED_ROLE: "heavix_dryrun_ro",
              DRYRUN_EXPECTED_HOST: "localhost",
              DRYRUN_SERVER_IDENTITY_ANCHOR: wrongAnchor, // ← WRONG value
            },
          },
        );
      } catch (e: unknown) {
        const err = e as { status: number | null; stdout?: string; stderr?: string };
        exitCode = err.status;
        stdout = err.stdout ?? "";
        stderr = err.stderr ?? "";
      }

      // The preflight MUST halt with exit code 2 (mismatch detected)
      expect(exitCode).toBe(2);
      const combined = stdout + stderr;
      // The mismatch error message MUST appear
      expect(combined).toContain("server-side database-local anchor (table) does not match");
      // The preflight MUST NOT proceed to RBAC queries / gate output
      expect(combined).not.toContain("DRYRUN_GATE");
    });

    // ── Scenario 7: Cloned DB limitation (fundamental — documented) ──────
    it("7. Anchor value is cloneable — a cloned DB would pass (H-04 fundamental limitation)", () => {
      // This test DOCUMENTS the fundamental limitation: if the DB is cloned,
      // the anchor value comes with it. This is why Finding D is UNVERIFIED.
      const originalValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");

      // Simulate a "clone": create a second database with the same value
      psqlAdmin("CREATE DATABASE heavix_clone_test");
      try {
        // Install the anchor on the clone with the SAME value
        execFileSync("psql", ["-h", "localhost", "-U", "postgres", "-d", "heavix_clone_test",
          "-v", `anchor_value=${originalValue}`,
          "-f", "scripts/rbac-create-anchor-table.sql"], {
          encoding: "utf-8", timeout: 10000,
          env: { ...process.env, PGPASSWORD: "postgres" },
        });

        // The clone has the SAME anchor value — the preflight CANNOT distinguish
        // the original from the clone. This is the H-04 limitation.
        const cloneValue = execFileSync("psql", ["-h", "localhost", "-U", "postgres", "-d", "heavix_clone_test",
          "-t", "-A", "-c", "SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'"], {
          encoding: "utf-8", timeout: 10000,
          env: { ...process.env, PGPASSWORD: "postgres" },
        }).trim();

        expect(cloneValue).toBe(originalValue); // ← clone has identical value
        // This proves: the anchor CANNOT detect a clone. Finding D = UNVERIFIED.
      } finally {
        // Cleanup the clone
        psqlAdmin("DROP DATABASE heavix_clone_test");
      }
    });

    // ── Scenario 8: Empty/missing anchor_value in rotation → rejected BEFORE any change ──
    it("8. Rotation with empty anchor_value → rejected BEFORE any change (value NOT modified)", () => {
      // Record the current value before attempting rotation with empty value
      const beforeValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");

      // Attempt rotation with EMPTY anchor_value — must FAIL (non-zero exit)
      // STEP 15.80: the CASE 1/0 guard forces a division-by-zero error
      let rotationFailed = false;
      try {
        psqlScript("scripts/rbac-rotate-anchor.sql", { anchor_value: "" });
      } catch (e: unknown) {
        rotationFailed = true;
        expect(String(e)).toMatch(/division by zero|ERROR/i);
      }
      expect(rotationFailed).toBe(true);

      // The value MUST NOT have changed (rotation was rejected before UPDATE)
      const afterValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(afterValue).toBe(beforeValue); // ← unchanged
    });

    // ── Scenario 9: Missing anchor_value variable in rotation → rejected ──
    it("9. Rotation with MISSING anchor_value variable → rejected (no change)", () => {
      const beforeValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");

      // Attempt rotation WITHOUT the anchor_value variable — must FAIL
      // When the variable is unset, psql substitutes an empty string, which
      // triggers the same CASE 1/0 guard.
      let rotationFailed = false;
      try {
        execFileSync("psql", [
          "-h", "localhost", "-U", "postgres", "-d", "heavix_test",
          "-f", "scripts/rbac-rotate-anchor.sql",
          // NOTE: no -v anchor_value=... → variable is unset → psql substitutes empty
        ], {
          encoding: "utf-8", timeout: 10000,
          env: { ...process.env, PGPASSWORD: "postgres" },
        });
      } catch (e: unknown) {
        rotationFailed = true;
        expect(String(e)).toMatch(/division by zero|ERROR|syntax/i);
      }
      expect(rotationFailed).toBe(true);

      // The value MUST NOT have changed
      const afterValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(afterValue).toBe(beforeValue); // ← unchanged
    });

    // ── Scenario 10: Whitespace-only anchor_value → rejected BEFORE any change ──
    it("10. Rotation with whitespace-only anchor_value → rejected (value NOT modified)", () => {
      // Ensure the table exists + has a known value before this test
      // (prior tests may have left the DB in an inconsistent state)
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');
      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: ANCHOR_VALUE_1 });

      const beforeValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");

      // Attempt rotation with WHITESPACE-ONLY anchor_value — must FAIL
      // STEP 15.81: NULLIF(TRIM(...), '') rejects whitespace-only values
      let rotationFailed = false;
      try {
        psqlScript("scripts/rbac-rotate-anchor.sql", { anchor_value: "   " });
      } catch (e: unknown) {
        rotationFailed = true;
        expect(String(e)).toMatch(/division by zero|ERROR/i);
      }
      expect(rotationFailed).toBe(true);

      // The value MUST NOT have changed (rotation was rejected before UPDATE)
      const afterValue = psqlAdmin("SELECT value FROM \"_dryrun_anchor\" WHERE key='server_identity'");
      expect(afterValue).toBe(beforeValue); // ← unchanged
    });

    // ── Scenario 11: Install with empty anchor_value → rejected BEFORE any DDL ──
    it("11. Install with empty anchor_value → rejected BEFORE CREATE TABLE (no mutation)", () => {
      // Drop the table to verify it's NOT re-created by a rejected install
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');

      // Attempt install with EMPTY anchor_value — must FAIL
      let installFailed = false;
      try {
        psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: "" });
      } catch (e: unknown) {
        installFailed = true;
        expect(String(e)).toMatch(/division by zero|ERROR/i);
      }
      expect(installFailed).toBe(true);

      // The table MUST NOT have been created (validation ran BEFORE CREATE TABLE)
      const tableExists = psqlAdmin(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_dryrun_anchor')",
      );
      expect(tableExists).toBe("f"); // ← table NOT created

      // Re-install with a valid value for subsequent tests
      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: "restore_value_after_test" });
    });

    // ── Scenario 12: Install with whitespace-only anchor_value → rejected ──
    it("12. Install with whitespace-only anchor_value → rejected BEFORE CREATE TABLE", () => {
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');

      let installFailed = false;
      try {
        psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: "   " });
      } catch (e: unknown) {
        installFailed = true;
        expect(String(e)).toMatch(/division by zero|ERROR/i);
      }
      expect(installFailed).toBe(true);

      const tableExists = psqlAdmin(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_dryrun_anchor')",
      );
      expect(tableExists).toBe("f"); // ← table NOT created

      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: "restore_value_after_test" });
    });

    // ── Scenario 13: Missing anchor_value variable in install → rejected ──
    it("13. Install with MISSING anchor_value variable → rejected (no table created, no row)", () => {
      // Drop the table to verify it's NOT created by a rejected install
      psqlAdmin('DROP TABLE IF EXISTS "_dryrun_anchor"');

      // Attempt install WITHOUT the anchor_value variable — must FAIL.
      // We do NOT pass -v anchor_value=... — psql behavior for undefined
      // variables is to substitute an empty string (which triggers the
      // NULLIF(TRIM()) guard). This test verifies that behavior.
      let installFailed = false;
      let actualError = "";
      try {
        execFileSync("psql", [
          "-h", "localhost", "-U", "postgres", "-d", "heavix_test",
          "-f", "scripts/rbac-create-anchor-table.sql",
          // NOTE: no -v anchor_value=... → variable is unset
        ], {
          encoding: "utf-8", timeout: 10000,
          env: { ...process.env, PGPASSWORD: "postgres" },
        });
      } catch (e: unknown) {
        installFailed = true;
        actualError = String(e);
      }
      expect(installFailed).toBe(true);
      expect(actualError).toMatch(/division by zero|ERROR/i);

      // The table MUST NOT have been created (validation ran BEFORE CREATE TABLE)
      const tableExists = psqlAdmin(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_dryrun_anchor')",
      );
      expect(tableExists).toBe("f"); // ← table NOT created

      // No row exists (table doesn't exist)
      // Restore with a valid value for subsequent tests
      psqlScript("scripts/rbac-create-anchor-table.sql", { anchor_value: "restore_value_after_test" });
    });
  },
);
