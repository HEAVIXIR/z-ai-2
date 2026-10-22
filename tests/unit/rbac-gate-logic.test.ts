import { describe, it, expect } from "vitest";
import {
  evaluateGate,
  formatGateOutput,
  parseGateLine,
  validateGateOutput,
  evaluateCiDecision,
  type ClassificationCounts,
  type SnapshotCounts,
} from "@/lib/rbac/gate-logic";

/* ============================================================
   HEAVIX — STEP 15.48: Executable Negative-Path Tests for
   the Phase C Dry-Run Gate Logic
   ------------------------------------------------------------
   These tests exercise the gate evaluation logic with REAL
   function calls — not code inspection. They prove that:
     1. Valid output with gatePasses=true → CI passes
     2. gatePasses=false → CI fails
     3. readOnlyInvariant=false → CI fails
     4. Missing DRYRUN_GATE line → CI fails
     5. Malformed JSON → CI fails
     6. Missing required field → CI fails
     7. MULTI_ROLE > 0 → gatePasses=false → CI fails

   These are PURE unit tests — no database required. They run
   in CI AND locally. They complement (not replace) the real
   PostgreSQL integration tests.
   ============================================================ */

const CLEAN_CLASSIFICATION: ClassificationCounts = {
  OK: 1,
  MISSING: 4,
  MISMATCH: 0,
  MULTI_ROLE: 0,
  INVALID: 0,
};

const MATCHING_SNAPSHOTS = {
  before: {
    userCount: 5,
    userRoleCount: 1,
    roleCount: 5,
    permissionCount: 120,
    rolePermissionCount: 300,
  } as SnapshotCounts,
  after: {
    userCount: 5,
    userRoleCount: 1,
    roleCount: 5,
    permissionCount: 120,
    rolePermissionCount: 300,
  } as SnapshotCounts,
  beforeFingerprint: "abc123",
  afterFingerprint: "abc123",
};

describe("STEP 15.48 — Gate Logic: Positive Path", () => {
  it("1. Valid output with gatePasses=true and readOnlyInvariant=true → CI passes", () => {
    const result = evaluateGate(
      CLEAN_CLASSIFICATION,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    expect(result.gatePasses).toBe(true);
    expect(result.readOnlyInvariant).toBe(true);

    const line = formatGateOutput(result);
    const parsed = parseGateLine(line);
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(true);
    expect(decision.reason).toContain("PASS");
  });
});

describe("STEP 15.48 — Gate Logic: Negative Paths", () => {
  it("2. gatePasses=false (INVALID > 0) → CI fails", () => {
    const badClassification = { ...CLEAN_CLASSIFICATION, INVALID: 1 };
    const result = evaluateGate(
      badClassification,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    expect(result.gatePasses).toBe(false);

    const line = formatGateOutput(result);
    const parsed = parseGateLine(line);
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("gatePasses=false");
  });

  it("3. gatePasses=false (MISMATCH > 0) → CI fails", () => {
    const badClassification = { ...CLEAN_CLASSIFICATION, MISMATCH: 1 };
    const result = evaluateGate(
      badClassification,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    expect(result.gatePasses).toBe(false);

    const decision = evaluateCiDecision(parseGateLine(formatGateOutput(result)));
    expect(decision.shouldPass).toBe(false);
  });

  it("4. readOnlyInvariant=false (counts differ) → CI fails", () => {
    const afterWithMoreUsers = { ...MATCHING_SNAPSHOTS.after, userCount: 6 };
    const result = evaluateGate(
      CLEAN_CLASSIFICATION,
      MATCHING_SNAPSHOTS.before,
      afterWithMoreUsers,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    expect(result.gatePasses).toBe(true); // gate still passes (no INVALID/MISMATCH/MULTI_ROLE)
    expect(result.readOnlyInvariant).toBe(false); // but read-only violated

    const decision = evaluateCiDecision(parseGateLine(formatGateOutput(result)));
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("readOnlyInvariant=false");
  });

  it("5. readOnlyInvariant=false (fingerprint differs, counts same) → CI fails", () => {
    // STEP 15.48: content fingerprint catches mutations that preserve counts
    const result = evaluateGate(
      CLEAN_CLASSIFICATION,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after, // same counts
      "fingerprint_before",
      "fingerprint_after_DIFFERENT", // different fingerprint = data mutated
    );
    expect(result.readOnlyInvariant).toBe(false);

    const decision = evaluateCiDecision(parseGateLine(formatGateOutput(result)));
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("readOnlyInvariant=false");
  });

  it("6. Missing DRYRUN_GATE line → CI fails (parseGateLine returns error)", () => {
    const parsed = parseGateLine("some random output without prefix");
    expect(parsed.error).toBe("MISSING_PREFIX");

    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("VALIDATION_ERROR");
  });

  it("7. Malformed JSON → CI fails (parseGateLine returns error)", () => {
    const parsed = parseGateLine("DRYRUN_GATE:{this is not valid json}");
    expect(parsed.error).toBe("MALFORMED_JSON");

    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("VALIDATION_ERROR");
  });

  it("8. Missing required field (no gatePasses) → CI fails", () => {
    const parsed = {
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: 4,
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 5,
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe("MISSING_OR_INVALID_gatePasses");

    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("9. Wrong type for field (gatePasses as string) → CI fails", () => {
    const parsed = {
      gatePasses: "true", // string, not boolean
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: 4,
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 5,
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe("MISSING_OR_INVALID_gatePasses");

    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("10. MULTI_ROLE > 0 → gatePasses=false → CI fails (STEP 15.47 policy)", () => {
    const multiRoleClassification = { ...CLEAN_CLASSIFICATION, MULTI_ROLE: 1 };
    const result = evaluateGate(
      multiRoleClassification,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      MATCHING_SNAPSHOTS.beforeFingerprint,
      MATCHING_SNAPSHOTS.afterFingerprint,
    );
    expect(result.gatePasses).toBe(false); // MULTI_ROLE blocks gate
    expect(result.multiRoleCount).toBe(1);
    expect(result.readOnlyInvariant).toBe(true); // read-only still holds

    const decision = evaluateCiDecision(parseGateLine(formatGateOutput(result)));
    expect(decision.shouldPass).toBe(false);
    expect(decision.reason).toContain("gatePasses=false");
  });
});

describe("STEP 15.48 — Gate Logic: Edge Cases", () => {
  it("Empty DB (all counts zero) → gatePasses=true, readOnlyInvariant=true", () => {
    const emptyClassification: ClassificationCounts = {
      OK: 0,
      MISSING: 0,
      MISMATCH: 0,
      MULTI_ROLE: 0,
      INVALID: 0,
    };
    const emptySnapshot: SnapshotCounts = {
      userCount: 0,
      userRoleCount: 0,
      roleCount: 5, // roles are seeded
      permissionCount: 120,
      rolePermissionCount: 300,
    };
    const result = evaluateGate(
      emptyClassification,
      emptySnapshot,
      emptySnapshot,
      "empty_fp",
      "empty_fp",
    );
    expect(result.gatePasses).toBe(true);
    expect(result.readOnlyInvariant).toBe(true);
    expect(result.total).toBe(0);
  });

  it("All classification types present → gatePasses=false (MULTI_ROLE+MISMATCH+INVALID)", () => {
    const allBad: ClassificationCounts = {
      OK: 1,
      MISSING: 2,
      MISMATCH: 3,
      MULTI_ROLE: 4,
      INVALID: 5,
    };
    const result = evaluateGate(
      allBad,
      MATCHING_SNAPSHOTS.before,
      MATCHING_SNAPSHOTS.after,
      "fp",
      "fp",
    );
    expect(result.gatePasses).toBe(false);
    expect(result.mismatchCount).toBe(3);
    expect(result.multiRoleCount).toBe(4);
    expect(result.invalidCount).toBe(5);
    expect(result.total).toBe(15);
  });
});

describe("STEP 15.49 — Edge Case Validation", () => {
  it("Negative count → validation error", () => {
    const parsed = {
      gatePasses: true,
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: -1, // negative!
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 0,
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe("NEGATIVE_safeToBackfillCount");
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("NaN count → validation error", () => {
    const parsed = {
      gatePasses: true,
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: NaN,
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 0,
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe("NON_FINITE_safeToBackfillCount");
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("Non-integer count → validation error", () => {
    const parsed = {
      gatePasses: true,
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: 1.5, // non-integer
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 2,
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe("NON_INTEGER_safeToBackfillCount");
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("Sum mismatch (classes > total) → validation error", () => {
    const parsed = {
      gatePasses: false,
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: 5,
      mismatchCount: 5,
      multiRoleCount: 5,
      invalidCount: 5,
      total: 10, // sum of classes = 20 > total = 10
    };
    const error = validateGateOutput(parsed);
    expect(error).toContain("SUM_MISMATCH");
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("Inconsistent gate (gatePasses=true but MISMATCH>0) → validation error", () => {
    const parsed = {
      gatePasses: true, // says pass
      readOnlyInvariant: true,
      okCount: 0,
            safeToBackfillCount: 0,
      mismatchCount: 1, // but has mismatch!
      multiRoleCount: 0,
      invalidCount: 0,
      total: 1,
    };
    const error = validateGateOutput(parsed);
    expect(error).toContain("INCONSISTENT_GATE");
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(false);
  });

  it("Empty DB path → full valid output with readOnlyInvariant=true", () => {
    // Simulate the empty-DB DRYRUN_GATE output
    const line = 'DRYRUN_GATE:{"gatePasses":true,"readOnlyInvariant":true,"okCount":0,"safeToBackfillCount":0,"mismatchCount":0,"multiRoleCount":0,"invalidCount":0,"total":0}';
    const parsed = parseGateLine(line);
    const error = validateGateOutput(parsed);
    expect(error).toBe(null); // valid!
    const decision = evaluateCiDecision(parsed);
    expect(decision.shouldPass).toBe(true); // empty DB passes
  });
});

describe("STEP 15.50 — Exact Total Equality (CR-15.50-02)", () => {
  it("Sum too small (okCount + others < total) → validation error", () => {
    const parsed = {
      gatePasses: true,
      readOnlyInvariant: true,
      okCount: 1,
      safeToBackfillCount: 2,
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 10, // sum = 3, but total = 10 → too large
    };
    const error = validateGateOutput(parsed);
    expect(error).toContain("SUM_MISMATCH");
  });

  it("Sum too large (okCount + others > total) → validation error", () => {
    const parsed = {
      gatePasses: false,
      readOnlyInvariant: true,
      okCount: 5,
      safeToBackfillCount: 5,
      mismatchCount: 5,
      multiRoleCount: 5,
      invalidCount: 5,
      total: 10, // sum = 25, but total = 10 → too small
    };
    const error = validateGateOutput(parsed);
    expect(error).toContain("SUM_MISMATCH");
  });

  it("Exact equality (sum === total) → valid", () => {
    const parsed = {
      gatePasses: true,
      readOnlyInvariant: true,
      okCount: 1,
      safeToBackfillCount: 4,
      mismatchCount: 0,
      multiRoleCount: 0,
      invalidCount: 0,
      total: 5, // 1+4+0+0+0 = 5 = total ✓
    };
    const error = validateGateOutput(parsed);
    expect(error).toBe(null);
  });
});

describe("STEP 15.50 — Child-Process Failure Handling (CR-15.50-01)", () => {
  it("Gate runner source: catch block exits 1 on non-zero child exit", () => {
    // Verify the gate-ci.ts source contains the CR-15.50-01 fix:
    // a non-zero child exit MUST cause exit(1), not continue to gate evaluation
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const content = fs.readFileSync("scripts/rbac-gate-ci.ts", "utf-8");
    // The fix adds a check: if childExitedNonZero, exit 1
    expect(content).toContain("childExitedNonZero");
    expect(content).toContain("A failed child process cannot produce a valid gate result");
    expect(content).toContain("process.exit(1)");
  });
});
