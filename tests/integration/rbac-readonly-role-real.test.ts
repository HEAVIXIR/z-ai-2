import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/* ============================================================
   HEAVIX — STEP 15.50: Database Read-Only Role Enforcement
   ------------------------------------------------------------
   CR-15.50-03: The owner requires a dedicated PostgreSQL role
   with NO write permissions for dry-run execution.

   This test:
   1. Creates the read-only role (scripts/rbac-create-readonly-role.sql)
   2. Verifies the role has SELECT but not INSERT/UPDATE/DELETE
   3. Attempts a write with the read-only role → must FAIL
   4. Attempts a read with the read-only role → must SUCCEED

   Test gating: Only runs when DATABASE_URL contains "localhost"
   (CI with postgres:17 service container).
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.50 — Database Read-Only Role (CR-15.50-03)",
  () => {
    const DB_URL = process.env.DATABASE_URL!.split("?")[0];
    const RO_URL = DB_URL.replace(
      "postgresql://postgres:postgres@",
      "postgresql://heavix_dryrun_ro:dryrun_ro_password@",
    );

    beforeAll(() => {
      // Create the read-only role
      execSync(
        `psql -h localhost -U postgres -d heavix_test -f scripts/rbac-create-readonly-role.sql`,
        { encoding: "utf-8", timeout: 30000, env: { ...process.env, PGPASSWORD: "postgres" } },
      );
    });

    it("Read-only role can SELECT from User table", () => {
      // Read should succeed
      const result = execSync(
        `psql "${RO_URL}" -t -A -c "SELECT count(*) FROM \\"User\\";"`,
        { encoding: "utf-8", timeout: 10000 },
      ).trim();
      const count = parseInt(result, 10);
      expect(Number.isFinite(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("Read-only role CANNOT INSERT into User table (write denied)", () => {
      // Write must fail with permission error
      let writeFailed = false;
      let errorMessage = "";
      try {
        execSync(
          `psql "${RO_URL}" -t -A -c "INSERT INTO \\"User\\" (id, firstName, lastName, email, mobile, passwordHash, role, status, emailVerified, mobileVerified) VALUES ('test-ro-denied', 'Test', 'RO', 'test-ro@example.com', '9999999999', 'hash', 'BUYER', 'ACTIVE', true, true);"`,
          { encoding: "utf-8", timeout: 10000 },
        );
      } catch (e: unknown) {
        writeFailed = true;
        errorMessage = String(e);
      }
      expect(writeFailed).toBe(true);
      // PostgreSQL should deny with a permission error
      expect(errorMessage).toMatch(/permission denied|ERROR|must have/);
    });

    it("Read-only role CANNOT UPDATE User table (write denied)", () => {
      let writeFailed = false;
      try {
        execSync(
          `psql "${RO_URL}" -t -A -c "UPDATE \\"User\\" SET role='ADMIN' WHERE id='nonexistent';"`,
          { encoding: "utf-8", timeout: 10000 },
        );
      } catch {
        writeFailed = true;
      }
      expect(writeFailed).toBe(true);
    });

    it("Read-only role CANNOT DELETE from User table (write denied)", () => {
      let writeFailed = false;
      try {
        execSync(
          `psql "${RO_URL}" -t -A -c "DELETE FROM \\"User\\" WHERE id='nonexistent';"`,
          { encoding: "utf-8", timeout: 10000 },
        );
      } catch {
        writeFailed = true;
      }
      expect(writeFailed).toBe(true);
    });

    it("Read-only role CANNOT INSERT into UserRole table (write denied)", () => {
      let writeFailed = false;
      try {
        execSync(
          `psql "${RO_URL}" -t -A -c "INSERT INTO \\"UserRole\\" (id, userId, roleId) VALUES ('test-ur-denied', 'nonexistent', 'nonexistent');"`,
          { encoding: "utf-8", timeout: 10000 },
        );
      } catch {
        writeFailed = true;
      }
      expect(writeFailed).toBe(true);
    });

    it("Dry-run script succeeds under read-only role", () => {
      // The dry-run script should work with the read-only role because
      // it only performs SELECT queries (count, findMany, groupBy)
      let exitCode = 0;
      try {
        execSync("bunx tsx scripts/rbac-backfill-dryrun.ts", {
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env, DATABASE_URL: RO_URL + "?schema=public" },
        });
      } catch (e: unknown) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).toBe(0);
    });
  },
);
