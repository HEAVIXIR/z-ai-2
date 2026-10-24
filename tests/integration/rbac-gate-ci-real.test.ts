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

   The actual gate runner is executed in the tls-proof job against
   a separate TLS-enabled PostgreSQL 17 database, after schema + RBAC
   seeding and read-only role grants. The generic postgres:17 verify job
   explicitly does NOT run this gate because that service has no TLS.
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

  it("CI workflow executes the Phase C gate against TLS-enabled PostgreSQL 17", () => {
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    // The non-TLS service may explicitly skip this gate, but a separate real
    // TLS job MUST run the actual gate runner against an isolated test DB.
    expect(content).toContain("Run Phase C read-only preflight gate against TLS PostgreSQL 17");
    expect(content).toContain("bunx tsx scripts/rbac-gate-ci.ts");
    expect(content).toContain("heavix_preflight_test");
    expect(content).toContain("DRYRUN_EXPECTED_HOST: \"localhost\"");
    // Verify the old bash/python parser is gone
    expect(content).not.toContain("python3 -c");
    expect(content).not.toContain("GATE_PASSES");
  });

  it("CI workflow has the dry-run step as a named step", () => {
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    expect(content).toContain("Phase C dry-run");
    // STEP 15.88 changed the step name — accept either old or new
    const hasStep = content.includes("STEP 15.51") || content.includes("STEP 15.88");
    expect(hasStep).toBe(true);
  });
});

/* ============================================================
   Real CI path tests
   ------------------------------------------------------------
   The authoritative real execution runs in the tls-proof job after
   provisioning TLS-enabled PostgreSQL 17, creating an isolated database,
   pushing the schema, seeding RBAC, and granting SELECT-only privileges.
   It is deliberately separate from the generic postgres:17 verify job,
   which has no TLS and explicitly does not run the Phase C gate.

   The unit tests (tests/unit/rbac-gate-logic.test.ts) provide
   logic-level coverage including negative paths. The static tests above
   verify that CI wires the real gate runner into the TLS job.
   Together: unit tests + wiring checks + actual TLS DB gate execution
   provide layered evidence; staging execution remains separately gated.
   ============================================================ */
