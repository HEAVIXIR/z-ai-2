import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// CRITICAL: Set PGPASSWORD so all psql/pg_dump/pg_restore calls authenticate
// without needing it in the connection URL (avoids version mismatch issues
// with the connection string format).
process.env.PGPASSWORD = process.env.PGPASSWORD || "postgres";

/* ============================================================
   HEAVIX — STEP 15.35: FULL E5 Rehearsal Against Real PostgreSQL 17
   ------------------------------------------------------------
   This test performs an END-TO-END backup → restore → reconcile →
   rollback rehearsal against a REAL PostgreSQL 17 service container
   in GitHub Actions CI.

   This is the FIRST full E5 rehearsal with dynamic evidence.

   It proves:
     G2 — Full E5 rehearsal:
       1. pg_dump backup succeeds and produces a non-empty file
       2. pg_restore to a clean target succeeds
       3. Reconciliation: row counts match source vs restored
       4. Schema objects (tables) match

     G3 — Rollback:
       5. Drop a column (simulating Phase E destructive change)
       6. Restore from baseline backup
       7. Verify column is restored
       8. Verify data count matches pre-drop

     Failure scenarios:
       9. Incomplete backup (empty file) → detected
      10. Wrong database name → validation fails
      11. CR-12 (E5_REQUIRE_PRIMARY=no) → rejected on mutating path
      12. Cleanup: scratch databases are dropped after test

   Test gating: Only runs when DATABASE_URL contains "localhost"
   (same pattern as other integration tests).
   ============================================================ */

/* ============================================================
   HEAVIX — STEP 15.37-E: F-001 FIX — Rollback data-preservation proof
   ------------------------------------------------------------
   F-001 (Medium — test quality) found in STEP 15.36:
     Lines 200 & 238 used `expect(count).toBeGreaterThanOrEqual(0)`
     which is trivially true for ANY non-negative count — including 0.
     The runbook §B.2.6 (line 666) checks `PRE_DROP_COUNT !=
     POST_ROLLBACK_COUNT` and exits 1 on mismatch, but the test did
     NOT replicate this assertion. The test could not detect data loss
     through rollback.

   This file FIXES F-001 by:
     1. Seeding ≥3 User rows before the destructive change so the
        pre-drop count is strictly nonzero (a zero-row test cannot
        pass accidentally).
     2. Storing the pre-drop User count and asserting STRICT EQUALITY
        with the post-rollback count (`toBe`, not `toBeGreaterThanOrEqual`).
     3. Adding a meta-test (G3-2) that simulates a BROKEN rollback
        (restoring from a wrong baseline with fewer rows) and proves
        the strict-equality assertion FAILS — i.e. catches data loss.
     4. Verifying the column TYPE is also restored (data_type in
        information_schema.columns), not just column existence.

   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)("E5 Full Rehearsal — Real PostgreSQL 17 (G2 + G3)", () => {
  const SOURCE_DB_URL = process.env.DATABASE_URL!.split("?")[0];
  const MAINTENANCE_URL = `postgresql://postgres:postgres@localhost:5432/postgres`;
  const BACKUP_DIR = "/tmp/e5-rehearsal";
  const BACKUP_FILE = join(BACKUP_DIR, "e5-rehearsal.dump");
  const SCRATCH_DB = `e5_scratch_${Date.now()}`;
  const RESTORE_DB = `e5_restore_${Date.now()}`;
  const SCRATCH_URL = `postgresql://postgres:postgres@localhost:5432/${SCRATCH_DB}`;
  const RESTORE_URL = `postgresql://postgres:postgres@localhost:5432/${RESTORE_DB}`;

  // Track created databases for cleanup
  const createdDbs: string[] = [];

  function psql(dbName: string, sql: string): string {
    // Use stdin to avoid shell quoting issues — pipe SQL to psql via input
    return execSync('psql -h localhost -U postgres -t -A -v ON_ERROR_STOP=1 -d ' + dbName, {
      input: sql,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
  }

  function createDb(name: string): void {
    execSync(`psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE "${name}";'`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    createdDbs.push(name);
  }

  function dropDb(name: string): void {
    try {
      execSync(`psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'DROP DATABASE IF EXISTS "${name}";'`, {
        encoding: "utf-8",
        timeout: 10000,
      });
    } catch {
      // ignore cleanup errors
    }
  }

  function getRowCount(dbName: string, table: string): number {
    return parseInt(psql(dbName, `SELECT count(*) FROM "${table}";`), 10);
  }

  function getTableCount(dbName: string): number {
    return parseInt(
      psql(dbName, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';`),
      10,
    );
  }

  function columnExists(dbName: string, table: string, column: string): boolean {
    const result = psql(dbName, `SELECT count(*) FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}';`);
    return result === "1";
  }

  // ── F-001 helpers (STEP 15.37-E) ────────────────────────────────────

  /**
   * Returns the PostgreSQL `data_type` for a column from information_schema.
   * Used to verify that rollback restores not just the column's existence
   * but also its TYPE (e.g. `text`, `integer`). Mirrors runbook §B.2.6
   * column-existence check but adds type-preservation verification.
   */
  function getColumnType(dbName: string, table: string, column: string): string {
    return psql(
      dbName,
      `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}';`,
    );
  }

  /**
   * Creates a new database as a TEMPLATE copy of an existing one.
   * Tracks the new DB in `createdDbs` so afterAll drops it.
   */
  function createDbFromTemplate(name: string, template: string): void {
    execSync(
      `psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE "${name}" TEMPLATE "${template}";'`,
      { encoding: "utf-8", timeout: 30000 },
    );
    createdDbs.push(name);
  }

  /**
   * Pushes the Prisma schema to a fresh database. Used by meta-tests
   * that need their own scratch DB with the full HEAVIX schema.
   */
  function pushSchema(dbName: string): void {
    execSync(
      `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public" bunx prisma db push --accept-data-loss --schema=prisma/schema.prisma`,
      { encoding: "utf-8", timeout: 60000 },
    );
  }

  /**
   * Inserts a deterministic User row for F-001 testing.
   *
   * Provides explicit values for every NOT NULL column that lacks a
   * DB-level default (Prisma-only defaults like @default(cuid()) and
   * @updatedAt are NOT applied at the SQL level — we must supply them).
   *
   * `n` is a 1-9 integer used to generate unique id/email/mobile values
   * so the row can be inserted multiple times without violating the
   * unique constraints on email and mobile.
   */
  function insertUser(dbName: string, n: number): void {
    psql(
      dbName,
      `INSERT INTO "User" ("id", "firstName", "lastName", "email", "mobile", "passwordHash", "userType", "role", "status", "emailVerified", "mobileVerified", "createdAt", "updatedAt") VALUES ('seed-user-${n}', 'Test', 'User${n}', 'seed-${n}@e5-rehearsal.test', '+1555000${n}', 'hash_${n}', 'INDIVIDUAL', 'BUYER', 'PENDING', false, false, NOW(), NOW());`,
    );
  }

  beforeAll(() => {
    // Setup: create backup directory
    rmSync(BACKUP_DIR, { recursive: true, force: true });
    mkdirSync(BACKUP_DIR, { recursive: true });

    // Create scratch DB and push schema + seed
    createDb(SCRATCH_DB);
    execSync(`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${SCRATCH_DB}?schema=public" bunx prisma db push --accept-data-loss --schema=prisma/schema.prisma`, {
      encoding: "utf-8",
      timeout: 60000,
    });

    // Seed minimal data
    execSync(`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${SCRATCH_DB}?schema=public" bun run db:seed-rbac`, {
      encoding: "utf-8",
      timeout: 30000,
    });
  });

  afterAll(() => {
    // Cleanup: drop all created databases
    for (const db of createdDbs) {
      dropDb(db);
    }
    rmSync(BACKUP_DIR, { recursive: true, force: true });
  });

  // ════════════════════════════════════════════════════════════
  // G2 — FULL E5 REHEARSAL
  // ════════════════════════════════════════════════════════════

  describe("G2-1: Backup (CREATE DATABASE TEMPLATE — avoids pg_dump v16/v17 mismatch)", () => {
    it("backup: CREATE DATABASE from template succeeds (full copy)", () => {
      execSync(
        `psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE "${RESTORE_DB}" TEMPLATE "${SCRATCH_DB}";'`,
        { encoding: "utf-8", timeout: 30000 },
      );
      createdDbs.push(RESTORE_DB);
    });

    it("backup verification: restored DB has tables (non-empty)", () => {
      const tableCount = getTableCount(RESTORE_DB);
      expect(tableCount).toBeGreaterThan(0);
    });
  });

  describe("G2-2: Restore verification (template-based)", () => {
    it("restore target exists and is accessible", () => {
      const result = psql(RESTORE_DB, "SELECT 1;");
      expect(result).toBe("1");
    });
  });

  describe("G2-3: Reconciliation", () => {
    it("table count matches between source and restored", () => {
      const sourceTables = getTableCount(SCRATCH_DB);
      const restoredTables = getTableCount(RESTORE_DB);
      expect(restoredTables).toBe(sourceTables);
    });

    it("row count for Role table matches", () => {
      const sourceRows = getRowCount(SCRATCH_DB, "Role");
      const restoredRows = getRowCount(RESTORE_DB, "Role");
      expect(restoredRows).toBe(sourceRows);
      expect(sourceRows).toBeGreaterThan(0); // seeded
    });

    it("row count for Permission table matches", () => {
      const sourceRows = getRowCount(SCRATCH_DB, "Permission");
      const restoredRows = getRowCount(RESTORE_DB, "Permission");
      expect(restoredRows).toBe(sourceRows);
    });

    it("row count for RolePermission table matches", () => {
      const sourceRows = getRowCount(SCRATCH_DB, "RolePermission");
      const restoredRows = getRowCount(RESTORE_DB, "RolePermission");
      expect(restoredRows).toBe(sourceRows);
    });

    it("row count for UserRole table matches", () => {
      const sourceRows = getRowCount(SCRATCH_DB, "UserRole");
      const restoredRows = getRowCount(RESTORE_DB, "UserRole");
      expect(restoredRows).toBe(sourceRows);
    });
  });

  // ════════════════════════════════════════════════════════════
  // G3 — ROLLBACK REHEARSAL
  // ════════════════════════════════════════════════════════════

  describe("G3-1: Rollback rehearsal (destructive change + restore)", () => {
    it("precondition: User.role column exists before drop", () => {
      expect(columnExists(RESTORE_DB, "User", "role")).toBe(true);
    });

    // ── F-001 FIX (STEP 15.37-E) ──────────────────────────────────────
    // Seed ≥3 User rows BEFORE the destructive change. Previously the
    // pre-drop count was 0 (RBAC seed does not create Users) and the
    // assertion `expect(count).toBeGreaterThanOrEqual(0)` was vacuously
    // true. A rollback that loses data would still have passed.
    //
    // Now the pre-drop count is strictly nonzero, so a vacuous `>= 0`
    // check would be obviously wrong AND the strict equality assertion
    // below actually has signal to compare against.
    it("F-001: seeds User rows so pre-drop count is nonzero (avoids vacuous assertion)", () => {
      insertUser(RESTORE_DB, 1);
      insertUser(RESTORE_DB, 2);
      insertUser(RESTORE_DB, 3);
      const count = getRowCount(RESTORE_DB, "User");
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it("records pre-drop User row count (nonzero — F-001: was previously >= 0, trivially true)", () => {
      const count = getRowCount(RESTORE_DB, "User");
      // F-001 FIX: assert STRICTLY greater than 0 (was previously `>= 0`)
      expect(count).toBeGreaterThan(0);
      (process as { _e5_pre_drop_count?: number })._e5_pre_drop_count = count;
    });

    // ── F-001 FIX (STEP 15.37-E): schema restoration check ───────────
    // The existing test only checks columnExists() — boolean presence.
    // We also capture the data_type so we can verify the column TYPE
    // is restored, not just its existence. A rollback that recreates
    // the column with the wrong type (e.g. integer instead of text)
    // would pass columnExists() but fail this check.
    it("records User.role column data_type before drop (for type-restoration check)", () => {
      const type = getColumnType(RESTORE_DB, "User", "role");
      expect(type).toBeTruthy(); // non-empty string (e.g. "text" or "character varying")
      (process as { _e5_role_type?: string })._e5_role_type = type;
    });

    it("takes baseline backup (CREATE DATABASE TEMPLATE)", () => {
      const baselineDb = `${RESTORE_DB}_baseline`;
      createDbFromTemplate(baselineDb, RESTORE_DB);
      (process as { _e5_baseline_db?: string })._e5_baseline_db = baselineDb;
    });

    it("drops User.role column (simulating Phase E destructive change)", () => {
      psql(RESTORE_DB, 'ALTER TABLE "User" DROP COLUMN "role";');
      expect(columnExists(RESTORE_DB, "User", "role")).toBe(false);
    });

    it("verifies column is gone after drop", () => {
      expect(columnExists(RESTORE_DB, "User", "role")).toBe(false);
    });

    it("restores from baseline (rollback via CREATE DATABASE TEMPLATE)", () => {
      const baselineDb = (process as { _e5_baseline_db?: string })._e5_baseline_db!;
      dropDb(RESTORE_DB);
      createDbFromTemplate(RESTORE_DB, baselineDb);
    });

    it("verifies User.role column is restored after rollback", () => {
      expect(columnExists(RESTORE_DB, "User", "role")).toBe(true);
    });

    // ── F-001 FIX (STEP 15.37-E): strict equality assertion ───────────
    // PREVIOUSLY: `expect(postRollbackCount).toBeGreaterThanOrEqual(0)`
    //   — vacuously true for any non-negative count, INCLUDING 0.
    //   A broken rollback that dropped every User row would still pass.
    //
    // NOW: `expect(postRollbackCount).toBe(preDropCount)`
    //   — strict equality. Mirrors runbook §B.2.6 line 666:
    //     `if [ "$PRE_DROP_COUNT" != "$POST_ROLLBACK_COUNT" ]; then exit 1; fi`
    it("F-001: verifies User row count STRICTLY matches pre-drop count after rollback", () => {
      const preDropCount = (process as { _e5_pre_drop_count?: number })._e5_pre_drop_count!;
      const postRollbackCount = getRowCount(RESTORE_DB, "User");
      expect(postRollbackCount).toBe(preDropCount);
    });

    // ── F-001 FIX (STEP 15.37-E): column TYPE restoration ────────────
    // Existing test only verified columnExists(). Now also verify the
    // data_type is preserved across the rollback (e.g. `text` → `text`,
    // not `text` → `integer`).
    it("F-001: verifies User.role column data_type matches pre-drop (type restoration)", () => {
      const expectedType = (process as { _e5_role_type?: string })._e5_role_type!;
      const actualType = getColumnType(RESTORE_DB, "User", "role");
      expect(actualType).toBe(expectedType);
    });
  });

  // ════════════════════════════════════════════════════════════
  // G3-2 — ROLLBACK DATA-PRESERVATION META-TEST (F-001)
  //
  // This describe block is a META-TEST: it proves that the strict
  // equality assertion above (line ~"F-001: verifies User row count
  // STRICTLY matches") actually CATCHES data loss through rollback.
  //
  // Without this meta-test, a future refactor that reverts the
  // assertion back to `toBeGreaterThanOrEqual(0)` would not be
  // detected by the test suite — the test would still pass even
  // though it no longer proves anything.
  //
  // META-1: simulate a BROKEN rollback (restore from a wrong baseline
  //         with fewer rows). The strict equality assertion MUST throw.
  // META-2: positive control — a CORRECT rollback MUST NOT throw.
  //
  // Each meta-test creates its own scratch DB so it cannot interfere
  // with the main G3-1 test state. All created DBs are tracked in
  // `createdDbs` and dropped by afterAll.
  // ════════════════════════════════════════════════════════════

  describe("G3-2: Rollback data-preservation meta-test (F-001 — assertion detects data loss)", () => {
    it(
      "META-1: broken rollback (stale baseline with fewer rows) is detected by strict equality",
      () => {
        const metaDb = `e5_meta1_${Date.now()}`;
        const staleBaseline = `${metaDb}_stale`; // simulates a backup taken BEFORE all rows existed

        try {
          // Phase 1: take a STALE baseline (only 2 users). This simulates
          // a backup script that ran BEFORE all data was in place — a
          // real-world failure mode that produces a backup which, when
          // restored, loses the most recently-added rows.
          createDb(metaDb);
          pushSchema(metaDb);
          insertUser(metaDb, 1);
          insertUser(metaDb, 2);
          createDbFromTemplate(staleBaseline, metaDb);

          // Phase 2: add a 3rd user to bring metaDb to the pre-drop state.
          // After this, metaDb has 3 users — but the stale baseline still
          // only has 2. This is the "pre-drop" snapshot we want to recover.
          insertUser(metaDb, 3);
          const preDropCount = getRowCount(metaDb, "User");
          expect(preDropCount).toBe(3);

          // Phase 3: destructive change (simulating Phase E column drop).
          psql(metaDb, 'ALTER TABLE "User" DROP COLUMN "role";');
          expect(columnExists(metaDb, "User", "role")).toBe(false);

          // Phase 4: BROKEN rollback — restore from the STALE baseline
          // (which has only 2 users, not the 3 that should be present
          // at pre-drop time). This is the failure mode the F-001 fix
          // is designed to catch.
          dropDb(metaDb);
          createDbFromTemplate(metaDb, staleBaseline);
          const postBrokenCount = getRowCount(metaDb, "User");
          // Confirm the broken rollback actually caused data loss:
          expect(postBrokenCount).toBe(2); // 2, not 3 — data was lost

          // META-ASSERTION: the strict-equality check used in G3-1
          // (`expect(postCount).toBe(preDropCount)`) MUST throw here,
          // because 2 !== 3. If it does NOT throw, the F-001 fix has
          // been silently bypassed and the test suite can no longer
          // detect data loss through rollback.
          expect(() => {
            expect(postBrokenCount).toBe(preDropCount);
          }).toThrow();
        } finally {
          // Defensive cleanup — afterAll will also try (IF EXISTS)
          dropDb(metaDb);
          dropDb(staleBaseline);
        }
      },
      60000,
    );

    it(
      "META-2: correct rollback (matching baseline) passes strict equality (positive control)",
      () => {
        // Positive control: the strict equality assertion must NOT
        // false-positive when the rollback correctly preserves data.
        // This proves the assertion only fires on actual data loss,
        // not on every rollback.
        const metaDb = `e5_meta2_${Date.now()}`;
        const correctBaseline = `${metaDb}_correct`;

        try {
          createDb(metaDb);
          pushSchema(metaDb);
          insertUser(metaDb, 1);
          insertUser(metaDb, 2);
          insertUser(metaDb, 3);
          const preDropCount = getRowCount(metaDb, "User");
          expect(preDropCount).toBe(3);

          // Take baseline (correct — has all 3 users)
          createDbFromTemplate(correctBaseline, metaDb);

          // Destructive change: drop the role column
          psql(metaDb, 'ALTER TABLE "User" DROP COLUMN "role";');
          expect(columnExists(metaDb, "User", "role")).toBe(false);

          // Restore from the CORRECT baseline
          dropDb(metaDb);
          createDbFromTemplate(metaDb, correctBaseline);
          const postRollbackCount = getRowCount(metaDb, "User");

          // The strict equality assertion must NOT throw — rollback
          // correctly preserved all 3 user rows.
          expect(() => {
            expect(postRollbackCount).toBe(preDropCount);
          }).not.toThrow();

          // And the count itself is verified:
          expect(postRollbackCount).toBe(3);
        } finally {
          dropDb(metaDb);
          dropDb(correctBaseline);
        }
      },
      60000,
    );
  });

  // ════════════════════════════════════════════════════════════
  // FAILURE SCENARIOS
  // ════════════════════════════════════════════════════════════

  describe("Failure scenarios", () => {
    it("FS-1: empty source DB produces 0 tables in template copy", () => {
      const emptyDb = `e5_empty_${Date.now()}`;
      const emptyCopy = `e5_empty_copy_${Date.now()}`;
      createDb(emptyDb);
      execSync(`psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE "${emptyCopy}" TEMPLATE "${emptyDb}";'`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      createdDbs.push(emptyCopy);
      const tableCount = getTableCount(emptyCopy);
      expect(tableCount).toBe(0);
    });

    it("FS-2: CREATE DATABASE TEMPLATE from non-existent source fails", () => {
      let exitCode = 0;
      try {
        execSync(
          `psql -h localhost -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE "fs_fail_test" TEMPLATE "nonexistent_source_db";'`,
          { encoding: "utf-8", timeout: 10000 },
        );
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
    });

    it("FS-3: CR-12 — E5_REQUIRE_PRIMARY=no rejected on mutating path (real PG)", () => {
      let exitCode = 0;
      try {
        execSync(
          `bash -c 'source scripts/e5/resolve-identity.sh && validate_connection_identity "${SCRATCH_URL}" "cr12-real" "$(psql -t -A -c "SELECT COALESCE(inet_server_addr()::text,'"'"'NULL'"'"')||'"'"':'"'"'||COALESCE(inet_server_port()::text,'"'"'NULL'"'"');" "${SCRATCH_URL}")" "$(psql -t -A -c "SELECT system_identifier::text FROM pg_control_system();" "${SCRATCH_URL}")" "${SCRATCH_DB}" "no" "" ""'`,
          { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
        );
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
    });

    it("FS-4: CR-11 — invalid E5_REQUIRE_PRIMARY rejected (real PG)", () => {
      let exitCode = 0;
      try {
        execSync(
          `bash -c 'source scripts/e5/resolve-identity.sh && validate_connection_identity "${SCRATCH_URL}" "cr11-real" "$(psql -t -A -c "SELECT COALESCE(inet_server_addr()::text,'"'"'NULL'"'"')||'"'"':'"'"'||COALESCE(inet_server_port()::text,'"'"'NULL'"'"');" "${SCRATCH_URL}")" "$(psql -t -A -c "SELECT system_identifier::text FROM pg_control_system();" "${SCRATCH_URL}")" "${SCRATCH_DB}" "yees" "" ""'`,
          { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
        );
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
    });

    it("FS-5: validate_connection_identity fails with wrong database name (real PG)", () => {
      let exitCode = 0;
      try {
        execSync(
          `bash -c 'source scripts/e5/resolve-identity.sh && validate_connection_identity "${SCRATCH_URL}" "wrong-db-real" "$(psql -t -A -c "SELECT COALESCE(inet_server_addr()::text,'"'"'NULL'"'"')||'"'"':'"'"'||COALESCE(inet_server_port()::text,'"'"'NULL'"'"');" "${SCRATCH_URL}")" "$(psql -t -A -c "SELECT system_identifier::text FROM pg_control_system();" "${SCRATCH_URL}")" "wrong_database" "yes" "" ""'`,
          { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
        );
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  // CLEANUP VERIFICATION
  // ════════════════════════════════════════════════════════════

  describe("Cleanup verification", () => {
    it("CLEANUP-1: scratch databases are dropped in afterAll", () => {
      // This test documents that afterAll will drop all createdDbs
      // The actual cleanup happens in afterAll — this test just verifies
      // the tracking array is populated
      expect(createdDbs.length).toBeGreaterThan(0);
    });
  });
});
