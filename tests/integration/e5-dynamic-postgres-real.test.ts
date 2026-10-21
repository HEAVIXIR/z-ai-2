import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

/* ============================================================
   HEAVIX — STEP 15.34: DYNAMIC PostgreSQL 17 Integration Test
   ------------------------------------------------------------
   This test runs against a REAL PostgreSQL 17 service container
   in GitHub Actions CI. It executes the ACTUAL
   scripts/e5/resolve-identity.sh helper against real PostgreSQL
   — NOT a stubbed psql.

   This is the FIRST dynamic validation of the E5 identity
   helper. It proves:
     1. resolve_connection_identity works against real PostgreSQL 17
     2. validate_connection_identity correctly validates all 4 fields
     3. pg_control_system() is accessible (CR-03 permission verification)
     4. system_identifier is returned and non-empty
     5. current_database() returns the expected database name
     6. pg_is_in_recovery() returns 'f' (primary, not replica)
     7. The helper fails closed when connected to a wrong database

   CR-08: This test provides DYNAMIC PostgreSQL validation that
   stubbed tests cannot.

   Test gating: Only runs when DATABASE_URL contains "localhost"
   (same pattern as rfq-quote-visibility-real.test.ts).
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)("E5 Dynamic PostgreSQL 17 — Real Identity Validation (CR-08)", () => {
  const HELPER_PATH = "scripts/e5/resolve-identity.sh";
  const DB_URL = process.env.DATABASE_URL!;
  // Strip ?schema=public query param — psql doesn't support it, only Prisma does
  const PSQL_DB_URL = DB_URL.split("?")[0];
  const MAINTENANCE_DB_URL = `postgresql://postgres:postgres@localhost:5432/postgres`;

  // Resolve expected values from the real PostgreSQL instance
  let expectedServerIdentity: string;
  let expectedClusterIdentifier: string;
  let expectedDbName: string;

  beforeAll(() => {
    // Get expected values directly from PostgreSQL (trusted source: the DB itself)
    expectedServerIdentity = execSync(
      `psql -t -A -c "SELECT COALESCE(inet_server_addr()::text, 'NULL') || ':' || COALESCE(inet_server_port()::text, 'NULL');" "${PSQL_DB_URL}"`,
      { encoding: "utf-8" },
    ).trim();

    expectedClusterIdentifier = execSync(
      `psql -t -A -c "SELECT system_identifier::text FROM pg_control_system();" "${PSQL_DB_URL}"`,
      { encoding: "utf-8" },
    ).trim();

    expectedDbName = execSync(
      `psql -t -A -c "SELECT current_database();" "${PSQL_DB_URL}"`,
      { encoding: "utf-8" },
    ).trim();
  });

  it("CR-08-1: resolve_connection_identity succeeds against real PostgreSQL 17", () => {
    const result = execSync(
      `bash -c 'source ${HELPER_PATH} && resolve_connection_identity "${PSQL_DB_URL}" "real-pg-test"'`,
      { encoding: "utf-8", timeout: 10000 },
    ).trim();

    // Output format: server|cluster|db_name|is_in_recovery
    const parts = result.split("|");
    expect(parts).toHaveLength(4);
    expect(parts[0]).not.toBe("UNRESOLVED");
    expect(parts[0]).not.toBe("NULL:NULL");
    expect(parts[1]).not.toBe("UNRESOLVED");
    expect(parts[2]).toBe(expectedDbName);
    expect(parts[3]).toBe("f"); // primary, not replica
  });

  it("CR-08-2: pg_control_system() is accessible (CR-03 permission verification)", () => {
    // This test proves pg_control_system() works with the default postgres role
    const result = execSync(
      `psql -t -A -c "SELECT system_identifier::text FROM pg_control_system();" "${PSQL_DB_URL}"`,
      { encoding: "utf-8" },
    ).trim();

    expect(result).not.toBe("");
    expect(result).toMatch(/^\d+$/); // system_identifier is a bigint
  });

  it("CR-08-3: validate_connection_identity succeeds with correct expected values", () => {
    // validate_connection_identity writes OK to STDERR (not stdout), per the helper's design
    // The function returns 0 on success, 1 on failure
    let exitCode = 0;
    let stderr = "";
    try {
      execSync(
        `bash -c 'source ${HELPER_PATH} && validate_connection_identity \\
          "${PSQL_DB_URL}" "real-pg-test" \\
          "${expectedServerIdentity}" "${expectedClusterIdentifier}" \\
          "${expectedDbName}" "yes" \\
          "" ""'`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
      stderr = (e as { stderr?: string }).stderr ?? "";
    }
    // Success = exit code 0 (the helper writes OK to stderr, returns 0)
    expect(exitCode).toBe(0);
  });

  it("CR-08-4: validate_connection_identity FAILS with wrong database name", () => {
    let exitCode = 0;
    try {
      execSync(
        `bash -c 'source ${HELPER_PATH} && validate_connection_identity \\
          "${PSQL_DB_URL}" "wrong-db-test" \\
          "${expectedServerIdentity}" "${expectedClusterIdentifier}" \\
          "wrong_database_name" "yes" \\
          "" ""'`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it("CR-08-5: validate_connection_identity FAILS with wrong cluster identifier", () => {
    let exitCode = 0;
    try {
      execSync(
        `bash -c 'source ${HELPER_PATH} && validate_connection_identity \\
          "${PSQL_DB_URL}" "wrong-cluster-test" \\
          "${expectedServerIdentity}" "9999999999999999999" \\
          "${expectedDbName}" "yes" \\
          "" ""'`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it("CR-08-6: validate_connection_identity FAILS with E5_REQUIRE_PRIMARY=no (CR-12)", () => {
    let exitCode = 0;
    try {
      execSync(
        `bash -c 'source ${HELPER_PATH} && validate_connection_identity \\
          "${PSQL_DB_URL}" "cr-12-test" \\
          "${expectedServerIdentity}" "${expectedClusterIdentifier}" \\
          "${expectedDbName}" "no" \\
          "" ""'`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it("CR-08-7: validate_connection_identity FAILS with invalid E5_REQUIRE_PRIMARY (CR-11)", () => {
    let exitCode = 0;
    try {
      execSync(
        `bash -c 'source ${HELPER_PATH} && validate_connection_identity \\
          "${PSQL_DB_URL}" "cr-11-test" \\
          "${expectedServerIdentity}" "${expectedClusterIdentifier}" \\
          "${expectedDbName}" "yees" \\
          "" ""'`,
        { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it("CR-08-8: system_identifier is unique per cluster (not empty/NULL)", () => {
    expect(expectedClusterIdentifier).not.toBe("");
    expect(expectedClusterIdentifier).not.toBe("NULL");
    expect(expectedClusterIdentifier).not.toBe("UNRESOLVED");
    expect(expectedClusterIdentifier.length).toBeGreaterThan(10);
  });

  it("CR-08-9: pg_is_in_recovery() returns 'f' (primary, not replica)", () => {
    const result = execSync(
      `psql -t -A -c "SELECT pg_is_in_recovery();" "${PSQL_DB_URL}"`,
      { encoding: "utf-8" },
    ).trim();
    expect(result).toBe("f");
  });
});
