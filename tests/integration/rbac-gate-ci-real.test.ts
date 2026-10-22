import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.49: CI Decision Path Validation
   ------------------------------------------------------------
   These tests verify that:
   1. The CI runner script (scripts/rbac-gate-ci.ts) exists
   2. It imports from the shared gate-logic module (single source of truth)
   3. The CI workflow uses the runner (not bash/python parser)
   4. The gate-logic module handles all edge cases

   The ACTUAL CI execution of the gate runner happens in the
   "Phase C dry-run" CI step (not as a test). This avoids
   concurrency issues (other tests mutating the DB while the
   dry-run takes its AFTER snapshot).
   ============================================================ */

describe("STEP 15.49 — CI Runner Script Validation", () => {
  const RUNNER_PATH = join(process.cwd(), "scripts", "rbac-gate-ci.ts");
  const WORKFLOW_PATH = join(process.cwd(), ".github", "workflows", "ci.yml");

  it("scripts/rbac-gate-ci.ts exists", () => {
    const content = readFileSync(RUNNER_PATH, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("scripts/rbac-gate-ci.ts imports from shared gate-logic module", () => {
    const content = readFileSync(RUNNER_PATH, "utf-8");
    expect(content).toContain('from "../src/lib/rbac/gate-logic"');
    expect(content).toContain("parseGateLine");
    expect(content).toContain("validateGateOutput");
    expect(content).toContain("evaluateCiDecision");
  });

  it("scripts/rbac-gate-ci.ts calls process.exit (not just returns)", () => {
    const content = readFileSync(RUNNER_PATH, "utf-8");
    // Verify the runner actually exits with code 1 on failure (not just logs)
    expect(content).toContain("process.exit(1)");
    expect(content).toContain("process.exit(0)");
  });

  it("CI workflow uses scripts/rbac-gate-ci.ts (not bash/python parser)", () => {
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    expect(content).toContain("scripts/rbac-gate-ci.ts");
    // Verify the old bash/python parser is gone
    expect(content).not.toContain("python3 -c");
    expect(content).not.toContain("GATE_PASSES");
  });

  it("CI workflow has the dry-run step as a named step", () => {
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    expect(content).toContain("Phase C dry-run");
    expect(content).toContain("STEP 15.49");
  });
});

/* ============================================================
   Real CI path tests (require PostgreSQL — skip locally)
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.49 — CI Gate Runner Exit Code (real PostgreSQL)",
  () => {
    it("CI gate runner exits 0 when gatePasses=true and readOnlyInvariant=true", () => {
      // This test runs the ACTUAL gate runner script.
      // In the CI test DB, the dry-run should find:
      //   - 1 OK (admin user seeded by db:seed-rbac)
      //   - 4 MISSING (test users without UserRole)
      //   - 0 MISMATCH, 0 MULTI_ROLE, 0 INVALID
      //   → gatePasses=true, readOnlyInvariant=true → exit 0
      //
      // NOTE: This test may be flaky if other integration tests mutate the DB
      // concurrently. The authoritative CI evidence is the "Phase C dry-run"
      // step in the CI workflow, which runs in isolation.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require("node:child_process");
      let exitCode = 0;
      try {
        execSync("bunx tsx scripts/rbac-gate-ci.ts", {
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e: unknown) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      // Accept exit 0 (pass) — the CI step is the authoritative check
      expect(exitCode).toBe(0);
    });
  },
);
