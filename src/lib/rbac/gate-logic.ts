/**
 * HEAVIX — STEP 15.49: Gate Logic Module (testable, no DB dependency)
 *
 * SINGLE SOURCE OF TRUTH for gate evaluation, parsing, validation, and
 * CI decision. Used by:
 *   - scripts/rbac-backfill-dryrun.ts (produces DRYRUN_GATE output)
 *   - scripts/rbac-gate-ci.ts (CI step runner — parses + decides)
 *   - tests/unit/rbac-gate-logic.test.ts (unit tests)
 *   - tests/integration/rbac-gate-ci-real.test.ts (real CI path tests)
 *
 * STEP 15.49 enhancements:
 *   - validateGateOutput: checks for negative, NaN, non-integer, sum mismatch
 *   - evaluateCiDecision: handles edge cases (script crash, no output)
 *   - Empty DB path: now produces full valid output with readOnlyInvariant=true
 */

export interface ClassificationCounts {
  OK: number;
  MISSING: number;
  MISMATCH: number;
  MULTI_ROLE: number;
  INVALID: number;
}

export interface SnapshotCounts {
  userCount: number;
  userRoleCount: number;
  roleCount: number;
  permissionCount: number;
  rolePermissionCount: number;
}

export interface GateResult {
  gatePasses: boolean;
  readOnlyInvariant: boolean;
  okCount: number;
  safeToBackfillCount: number;
  mismatchCount: number;
  multiRoleCount: number;
  invalidCount: number;
  total: number;
}

export interface ParsedGate {
  gatePasses?: boolean;
  readOnlyInvariant?: boolean;
  okCount?: number;
  safeToBackfillCount?: number;
  mismatchCount?: number;
  multiRoleCount?: number;
  invalidCount?: number;
  total?: number;
  error?: string;
}

/**
 * Evaluate the gate based on classification counts and snapshot comparison.
 *
 * STEP 15.47: gatePasses must be FAIL-CLOSED.
 * Policy: backfill is NOT safe if ANY of these are nonzero:
 *   - INVALID, MISMATCH, MULTI_ROLE
 *
 * STEP 15.48: readOnlyInvariant compares BOTH counts AND content fingerprints.
 */
export function evaluateGate(
  classification: ClassificationCounts,
  before: SnapshotCounts,
  after: SnapshotCounts,
  beforeFingerprint: string,
  afterFingerprint: string,
): GateResult {
  const gatePasses =
    classification.INVALID === 0 &&
    classification.MISMATCH === 0 &&
    classification.MULTI_ROLE === 0;

  const readOnlyInvariant =
    before.userCount === after.userCount &&
    before.userRoleCount === after.userRoleCount &&
    before.roleCount === after.roleCount &&
    before.permissionCount === after.permissionCount &&
    before.rolePermissionCount === after.rolePermissionCount &&
    beforeFingerprint === afterFingerprint;

  return {
    gatePasses,
    readOnlyInvariant,
    okCount: classification.OK,
    safeToBackfillCount: classification.MISSING,
    mismatchCount: classification.MISMATCH,
    multiRoleCount: classification.MULTI_ROLE,
    invalidCount: classification.INVALID,
    total:
      classification.OK +
      classification.MISSING +
      classification.MISMATCH +
      classification.MULTI_ROLE +
      classification.INVALID,
  };
}

export function formatGateOutput(result: GateResult): string {
  return `DRYRUN_GATE:${JSON.stringify(result)}`;
}

export function parseGateLine(line: string): ParsedGate {
  if (!line.startsWith("DRYRUN_GATE:")) {
    return { error: "MISSING_PREFIX" };
  }
  const jsonStr = line.slice("DRYRUN_GATE:".length);
  try {
    return JSON.parse(jsonStr) as ParsedGate;
  } catch {
    return { error: "MALFORMED_JSON" };
  }
}

function validateCountField(value: unknown, name: string): string | null {
  if (typeof value !== "number") return `MISSING_OR_INVALID_${name}`;
  if (!Number.isFinite(value)) return `NON_FINITE_${name}`;
  if (!Number.isInteger(value)) return `NON_INTEGER_${name}`;
  if (value < 0) return `NEGATIVE_${name}`;
  return null;
}

export function validateGateOutput(parsed: ParsedGate): string | null {
  if (parsed.error) return parsed.error;
  // Type checks for booleans
  if (typeof parsed.gatePasses !== "boolean") return "MISSING_OR_INVALID_gatePasses";
  if (typeof parsed.readOnlyInvariant !== "boolean") return "MISSING_OR_INVALID_readOnlyInvariant";
  // STEP 15.50: numeric field validation (negative, NaN, non-integer) — now includes okCount
  const numericFields: Array<[unknown, string]> = [
    [parsed.okCount, "okCount"],
    [parsed.safeToBackfillCount, "safeToBackfillCount"],
    [parsed.mismatchCount, "mismatchCount"],
    [parsed.multiRoleCount, "multiRoleCount"],
    [parsed.invalidCount, "invalidCount"],
    [parsed.total, "total"],
  ];
  for (const [value, name] of numericFields) {
    const err = validateCountField(value, name);
    if (err) return err;
  }
  // STEP 15.50: EXACT classification total equality
  // total MUST equal okCount + safeToBackfillCount + mismatchCount + multiRoleCount + invalidCount
  const sumOfAll =
    (parsed.okCount ?? 0) +
    (parsed.safeToBackfillCount ?? 0) +
    (parsed.mismatchCount ?? 0) +
    (parsed.multiRoleCount ?? 0) +
    (parsed.invalidCount ?? 0);
  if (sumOfAll !== (parsed.total ?? 0)) {
    return `SUM_MISMATCH (ok+missing+mismatch+multi+invalid=${sumOfAll} != total=${parsed.total})`;
  }
  // STEP 15.49: if gatePasses=true but any blocking count > 0, that's inconsistent
  if (parsed.gatePasses && ((parsed.mismatchCount ?? 0) > 0 || (parsed.multiRoleCount ?? 0) > 0 || (parsed.invalidCount ?? 0) > 0)) {
    return `INCONSISTENT_GATE (gatePasses=true but blocking counts > 0)`;
  }
  return null;
}

export function evaluateCiDecision(parsed: ParsedGate): {
  shouldPass: boolean;
  reason: string;
} {
  const validationError = validateGateOutput(parsed);
  if (validationError) {
    return { shouldPass: false, reason: `VALIDATION_ERROR: ${validationError}` };
  }
  if (!parsed.gatePasses) {
    return { shouldPass: false, reason: "gatePasses=false — Phase C backfill is NOT safe" };
  }
  if (!parsed.readOnlyInvariant) {
    return { shouldPass: false, reason: "readOnlyInvariant=false — database was mutated" };
  }
  return { shouldPass: true, reason: "PASS: gate passed and read-only invariant holds" };
}
