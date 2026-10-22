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
  try {
    output = execSync(`bunx tsx ${SCRIPT} 2>&1`, {
      encoding: "utf-8",
      timeout: 120000,
      env: { ...process.env },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    // The dry-run script may have exited non-zero; capture stdout if available
    output = e.stdout ?? "";
    if (!output) {
      console.error("ERROR: dry-run script crashed with no output");
      console.error(e.message);
      process.exit(2);
    }
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

main();
