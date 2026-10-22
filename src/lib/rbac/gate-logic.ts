/**
 * HEAVIX — STEP 15.48: Gate Logic Module (testable, no DB dependency)
 *
 * Extracted from scripts/rbac-backfill-dryrun.ts to make the gate evaluation
 * logic independently testable. This module contains PURE functions that
 * can be tested without a database connection.
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
  safeToBackfillCount: number;
  mismatchCount: number;
  multiRoleCount: number;
  invalidCount: number;
  total: number;
}

export interface ParsedGate {
  gatePasses?: boolean;
  readOnlyInvariant?: boolean;
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

export function validateGateOutput(parsed: ParsedGate): string | null {
  if (parsed.error) return parsed.error;
  if (typeof parsed.gatePasses !== "boolean") return "MISSING_OR_INVALID_gatePasses";
  if (typeof parsed.readOnlyInvariant !== "boolean") return "MISSING_OR_INVALID_readOnlyInvariant";
  if (typeof parsed.safeToBackfillCount !== "number") return "MISSING_OR_INVALID_safeToBackfillCount";
  if (typeof parsed.mismatchCount !== "number") return "MISSING_OR_INVALID_mismatchCount";
  if (typeof parsed.multiRoleCount !== "number") return "MISSING_OR_INVALID_multiRoleCount";
  if (typeof parsed.invalidCount !== "number") return "MISSING_OR_INVALID_invalidCount";
  if (typeof parsed.total !== "number") return "MISSING_OR_INVALID_total";
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
