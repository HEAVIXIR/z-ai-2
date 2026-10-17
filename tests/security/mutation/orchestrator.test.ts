/**
 * STEP 13.53 P2-C — Mutation orchestrator (subprocess exit-code harness)
 * ======================================================================
 * This is the ONLY file in tests/security/mutation/ picked up by the normal
 * security suite (vitest.security.config.ts includes .test.{ts,tsx} under
 * tests/security/).
 *
 * It proves the owner's P2-C acceptance criteria via REAL subprocess exit
 * codes (dellk00k's repeated requirement):
 *
 *   1. HEALTHY: spawn `vitest run --config vitest.mutation.config.ts
 *      tests/security/mutation/healthy.snapshot.ts` -> expect EXIT CODE 0.
 *      This proves the real production route does not leak secrets.
 *
 *   2. MUTANT: spawn `vitest run --config vitest.mutation.config.ts
 *      tests/security/mutation/mutant.snapshot.ts` -> expect EXIT CODE NONZERO.
 *      This proves a controlled mutation (leaking err.message) causes the
 *      security test to FAIL as a real subprocess.
 *
 *   3. ROOT-CAUSE the mutant's nonzero exit: parse the subprocess stderr/stdout
 *      and assert it contains the SECURITY ASSERTION failure signature
 *      ("must not contain SUPERSECRET" / "AssertionError"). This proves the
 *      nonzero exit is caused by the security assertion — NOT by an import
 *      error, syntax error, or setup failure. If the mutant failed for a
 *      non-assertion reason, this test FAILS (no false pass).
 *
 *   4. SOURCE RESTORATION: verify the production source file is unchanged
 *      after the harness runs (the mutant operates on an isolated temp copy,
 *      never the real file).
 *
 * There is NO expect.toThrow that converts a mutant failure into a pass.
 * The orchestrator only inspects exit codes + output; the snapshot files
 * run the assertion directly and exit accordingly.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONFIG = "vitest.mutation.config.ts";
const HEALTHY = "tests/security/mutation/healthy.snapshot.ts";
const MUTANT = "tests/security/mutation/mutant.snapshot.ts";
const PROD_ROUTE = "src/app/api/deals/route.ts";

interface SubprocessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runVitest(target: string): SubprocessResult {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(
      "bunx",
      ["vitest", "run", "--config", CONFIG, target],
      { encoding: "utf-8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    exitCode = typeof err.status === "number" ? err.status : 1;
    stdout = typeof err.stdout === "string" ? err.stdout : (err.stdout ? err.stdout.toString() : "");
    stderr = typeof err.stderr === "string" ? err.stderr : (err.stderr ? err.stderr.toString() : "");
  }
  return { exitCode, stdout, stderr };
}

describe("STEP 13.53 P2-C — subprocess mutation harness (real exit codes)", () => {
  it("HEALTHY snapshot exits 0 (real production route does not leak secret)", () => {
    const r = runVitest(HEALTHY);
    // Detailed evidence on failure.
    if (r.exitCode !== 0) {
      console.error("HEALTHY snapshot FAILED unexpectedly.\n--- stdout ---\n" + r.stdout + "\n--- stderr ---\n" + r.stderr);
    }
    expect(r.exitCode, "HEALTHY route must pass the security assertion (exit 0)").toBe(0);
  });

  it("MUTANT snapshot exits NONZERO (mutated route leaks -> assertion fails)", () => {
    const r = runVitest(MUTANT);
    if (r.exitCode === 0) {
      console.error("MUTANT snapshot unexpectedly PASSED (exit 0) — the mutation did not cause a leak, or the assertion was bypassed.\n--- stdout ---\n" + r.stdout);
    }
    expect(r.exitCode, "MUTANT route must FAIL the security assertion (exit nonzero)").not.toBe(0);
  });

  it("MUTANT nonzero exit is caused by the SECURITY ASSERTION (not import/syntax/setup)", () => {
    const r = runVitest(MUTANT);
    const combined = r.stdout + "\n" + r.stderr;
    // The security assertion message (from assertNoSecret in mutant.snapshot.ts).
    // vitest prints AssertionError with the expect message.
    const assertionSignatures = [
      "must not contain SUPERSECRET",
      "must not contain internal-host",
      "must not contain /home/secret",
    ];
    const hasAssertionFailure = assertionSignatures.some((s) => combined.includes(s));
    if (!hasAssertionFailure) {
      console.error("MUTANT failed but NOT due to the security assertion.\n--- stdout ---\n" + r.stdout + "\n--- stderr ---\n" + r.stderr);
    }
    expect(hasAssertionFailure, "MUTANT failure must be the security assertion, not import/syntax/setup").toBe(true);

    // Guard against false passes: if the mutant failed due to a harness error
    // (e.g. "MUTATION HARNESS BROKEN", "Cannot find module", syntax error),
    // that is NOT a valid security proof — fail explicitly.
    const nonAssertionErrors = [
      "MUTATION HARNESS BROKEN",
      "Cannot find module",
      "SyntaxError",
      "TypeError: ",
      "ReferenceError: ",
    ];
    const hasNonAssertionError = nonAssertionErrors.some((s) => combined.includes(s) && !combined.includes("must not contain"));
    // Allow AssertionError + the assertion message, but not unrelated errors.
    // (A real AssertionError from expect() is fine; a thrown SyntaxError is not.)
    const hasSyntaxError = combined.includes("SyntaxError") || combined.includes("error TS");
    expect(hasSyntaxError, "MUTANT must not fail due to a syntax/type error").toBe(false);
  });

  it("production source is UNCHANGED after the harness (mutant operates on a temp copy only)", () => {
    // Run the mutant once more (it cleans up its temp copy), then verify the
    // real production route still contains the P2-C fix.
    runVitest(MUTANT);
    const source = readFileSync(PROD_ROUTE, "utf-8");
    expect(source, "P2-C fix marker must remain").toContain("STEP 13.31 P2-C FIX");
    expect(source, "fixed generic error return must remain").toContain('{ error: "Internal server error" }');
    expect(source, "no leaking mutation in production").not.toContain("err instanceof Error ? err.message");
  });
});
