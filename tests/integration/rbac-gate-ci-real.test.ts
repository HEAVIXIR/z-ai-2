import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.49: REAL CI Decision Path Test
   ------------------------------------------------------------
   This test exercises the ACTUAL CI gate runner script
   (scripts/rbac-gate-ci.ts) which:
     1. Runs the dry-run script
     2. Captures output
     3. Parses DRYRUN_GATE using the shared gate-logic module
     4. Validates using validateGateOutput()
     5. Decides using evaluateCiDecision()
     6. Exits 0 (pass) or 1 (fail)

   These tests verify the EXIT CODE of the runner, proving
   that the real CI path fails/succeeds as expected — not
   just that a pure function returns false.

   Gating: These tests require PostgreSQL (the dry-run script
   needs a DB). They SKIP locally (no PG) and RUN in CI.
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.49 — REAL CI Decision Path (scripts/rbac-gate-ci.ts)",
  () => {
    const RUNNER = join(process.cwd(), "scripts", "rbac-gate-ci.ts");

    it("Positive path: real dry-run + gate decision → exit 0 (PASS)", () => {
      // The CI test DB has seeded users (1 OK admin + 4 MISSING test users)
      // gatePasses should be true, readOnlyInvariant should be true
      let exitCode = 0;
      try {
        execSync(`bunx tsx ${RUNNER}`, {
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env },
        });
      } catch (e: unknown) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).toBe(0);
    });

    it("Script crash (no DRYRUN_GATE output) → exit 1 or 2 (FAIL)", () => {
      // Simulate a script crash by running a non-existent script
      let exitCode = 0;
      try {
        execSync(`bunx tsx ${RUNNER} --crash-sim`, {
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env, SIMULATE_CRASH: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e: unknown) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      // The runner should exit non-zero on any failure
      // (either 1 for gate failure, or 2 for script error)
      expect(exitCode).not.toBe(0);
    });
  },
);

/* ============================================================
   Non-DB tests: verify the CI runner script EXISTS and is
   syntactically valid (runs locally without PG).
   ============================================================ */

describe("STEP 15.49 — CI Runner Script Validation (no DB needed)", () => {
  it("scripts/rbac-gate-ci.ts exists and is importable", async () => {
    const mod = await import("../../scripts/rbac-gate-ci");
    expect(mod).toBeDefined();
  });

  it("scripts/rbac-gate-ci.ts imports from @/lib/rbac/gate-logic", () => {
    // Verify the runner uses the shared module (single source of truth)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const content = fs.readFileSync(
      join(process.cwd(), "scripts", "rbac-gate-ci.ts"),
      "utf-8",
    );
    expect(content).toContain("from \"../src/lib/rbac/gate-logic\"");
    expect(content).toContain("parseGateLine");
    expect(content).toContain("validateGateOutput");
    expect(content).toContain("evaluateCiDecision");
  });

  it("CI workflow uses scripts/rbac-gate-ci.ts (not bash/python parser)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const content = fs.readFileSync(
      join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf-8",
    );
    expect(content).toContain("scripts/rbac-gate-ci.ts");
    // Verify the old bash/python parser is gone
    expect(content).not.toContain("python3 -c");
  });
});
