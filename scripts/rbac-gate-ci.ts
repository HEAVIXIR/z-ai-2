#!/usr/bin/env tsx
/**
 * HEAVIX — STEP 15.49: CI Gate Runner
 *
 * SINGLE SOURCE OF TRUTH for CI gate decision. This script:
 *   1. Runs the dry-run script
 *   2. Captures output
 *   3. Extracts the DRYRUN_GATE line
 *   4. Parses + validates using the shared gate-logic module
 *   5. Exits 0 (pass) or 1 (fail) based on evaluateCiDecision()
 *
 * This replaces the bash/python parser in .github/workflows/ci.yml so that
 * the CI decision path uses the SAME logic as the unit tests.
 *
 * Usage: bunx tsx scripts/rbac-gate-ci.ts
 *
 * Exit codes:
 *   0 — gate passed (gatePasses=true AND readOnlyInvariant=true)
 *   1 — gate failed (any validation error, gatePasses=false, or readOnlyInvariant=false)
 *   2 — script error (dry-run script crashed, no output, etc.)
 */

import { execSync } from "node:child_process";
import { parseGateLine, validateGateOutput, evaluateCiDecision } from "../src/lib/rbac/gate-logic";

const SCRIPT = "scripts/rbac-backfill-dryrun.ts";

function main(): void {
  let output: string;
  let childExitedNonZero = false;
  try {
    output = execSync(`bunx tsx ${SCRIPT} 2>&1`, {
      encoding: "utf-8",
      timeout: 120000,
      env: { ...process.env },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string; status?: number };
    // CR-15.50-01: A failed child process MUST NOT be treated as successful
    // merely because its captured output contains a parseable gate line.
    childExitedNonZero = true;
    output = e.stdout ?? "";
    if (!output) {
      console.error("ERROR: dry-run script crashed with no output");
      console.error(e.message);
      process.exit(2);
    }
    // CR-15.50-01: If the child process exited non-zero, we must FAIL the gate
    // regardless of whether the output contains a DRYRUN_GATE line.
    // The dry-run script should exit 0 on success and 2 on unrecoverable error.
    // A non-zero exit means the script itself failed — we cannot trust its output.
    console.error(`FAIL: dry-run script exited non-zero (status=${e.status ?? "?"})`);
    console.error("A failed child process cannot produce a valid gate result.");
    console.log("--- captured output ---");
    console.log(output);
    console.log("--- end captured output ---");
    process.exit(1);
  }

  // Print the dry-run output for CI log visibility
  console.log(output);

  // Find the DRYRUN_GATE line
  const lines = output.split("\n");
  const gateLine = lines.reverse().find((l) => l.startsWith("DRYRUN_GATE:"));

  if (!gateLine) {
    console.error("FAIL: No DRYRUN_GATE output found");
    process.exit(1);
  }

  // Parse using the shared module
  const parsed = parseGateLine(gateLine);

  // Validate
  const validationError = validateGateOutput(parsed);
  if (validationError) {
    console.error(`FAIL: Gate output validation error: ${validationError}`);
    process.exit(1);
  }

  // Evaluate CI decision using the shared module
  const decision = evaluateCiDecision(parsed);
  console.log(`CI DECISION: ${decision.shouldPass ? "PASS" : "FAIL"} — ${decision.reason}`);

  if (!decision.shouldPass) {
    process.exit(1);
  }

  process.exit(0);
}

// Only run main() when executed directly (not when imported by tests)
if (require.main === module) {
  main();
}

// Export for testing
export { main, parseGateLine, validateGateOutput, evaluateCiDecision };
