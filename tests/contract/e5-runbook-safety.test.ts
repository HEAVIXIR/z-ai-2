import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.15-A: E5 Runbook Safety Regression Test
   ------------------------------------------------------------
   Purpose: statically detect the two defects the owner found
   in STEP 15.15:

   E5-F01: `prisma db push --accept-data-loss` appeared BEFORE
           `DATABASE_URL` was pinned to the scratch DB. This
           could connect to a pre-existing DATABASE_URL pointing
           at production.

   E5-F02: raw connection strings (`MAINTENANCE_DB_URL`,
           `SCRATCH_DB_URL`) were `echo`-d to stdout, which
           could leak credentials into logs or reports.

   These tests parse the E5 runbook (embedded in the combined
   report markdown) and assert the unsafe patterns are absent
   and the safe patterns are present.

   This is a static contract test — no database required.
   ============================================================ */

const REPORT_PATH =
  "docs/verification/STEP-14.99-COMBINED-REPORT.md";
const SHARED_SCRIPT_PATH = "scripts/e5/resolve-identity.sh";

function readRunbook(): string {
  return readFileSync(REPORT_PATH, "utf-8");
}

// CR-05: The E5 runbook `source`s scripts/e5/resolve-identity.sh rather than
// inlining the identity-resolution logic. Many of the safety-critical strings
// (COALESCE, NULL:NULL, mismatch messages) now live in the shared script.
// Tests must therefore read BOTH files: the runbook (for `source` +
// `validate_connection_identity` call sites) and the shared script (for the
// actual implementation strings).
function readSharedScript(): string {
  return readFileSync(SHARED_SCRIPT_PATH, "utf-8");
}

describe("E5 Runbook — E5-F01: db push must not run before DATABASE_URL is pinned", () => {
  const runbook = readRunbook();

  it("does NOT contain a `prisma db push` line BEFORE the `export DATABASE_URL` line", () => {
    // Find the §B.2.2 section
    const sectionStart = runbook.indexOf("### B.2.2");
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = runbook.indexOf("### B.2.3");
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = runbook.slice(sectionStart, sectionEnd);

    const pinLineIdx = section.indexOf('export DATABASE_URL="$SCRATCH_DB_URL"');
    expect(pinLineIdx).toBeGreaterThan(-1);

    const pushLineIdx = section.indexOf(
      "bunx prisma db push --accept-data-loss",
    );

    // If a db push line exists, it MUST come AFTER the pin line.
    if (pushLineIdx !== -1) {
      expect(pushLineIdx).toBeGreaterThan(pinLineIdx);
    }

    // The runbook must NOT contain the old comment that justified the
    // duplicate db push before pinning.
    expect(section).not.toContain(
      "NOTE: this uses DATABASE_URL env var — MUST be set to SCRATCH_DB_URL",
    );
  });

  it("validates the effective database target BEFORE any Prisma command", () => {
    const sectionStart = runbook.indexOf("### B.2.2");
    const sectionEnd = runbook.indexOf("### B.2.3");
    const section = runbook.slice(sectionStart, sectionEnd);

    // The E5-F01 guard must be present: server-side validation of current_database()
    expect(section).toContain("EFFECTIVE_DB");
    expect(section).toContain("SELECT current_database();");
    expect(section).toContain("FATAL: effective database is");

    // The validation must occur BEFORE the (single) prisma db push
    const validateIdx = section.indexOf("EFFECTIVE_DB");
    const pushIdx = section.indexOf("bunx prisma db push --accept-data-loss");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(validateIdx);
  });

  it("contains only ONE `prisma db push` invocation (not the prior duplicate)", () => {
    const sectionStart = runbook.indexOf("### B.2.2");
    const sectionEnd = runbook.indexOf("### B.2.3");
    const section = runbook.slice(sectionStart, sectionEnd);

    const matches = section.match(
      /bunx prisma db push --accept-data-loss/g,
    );
    expect(matches).toHaveLength(1);
  });
});

describe("E5 Runbook — E5-F02: raw connection strings must not be echoed", () => {
  const runbook = readRunbook();

  it("does NOT echo MAINTENANCE_DB_URL to stdout", () => {
    // The old pattern: `echo "Maintenance DB: $MAINTENANCE_DB_URL"`
    expect(runbook).not.toMatch(
      /echo\s+"[^"]*\$MAINTENANCE_DB_URL"/,
    );
  });

  it("does NOT echo SCRATCH_DB_URL to stdout", () => {
    // The old pattern: `echo "Scratch DB URL: $SCRATCH_DB_URL"`
    expect(runbook).not.toMatch(/echo\s+"[^"]*\$SCRATCH_DB_URL"/);
  });

  it("does NOT echo E5_BASE_URL or E5_MAINTENANCE_DB_URL to stdout", () => {
    // Never print the raw env vars containing credentials
    expect(runbook).not.toMatch(/echo\s+"[^"]*\$E5_BASE_URL"/);
    expect(runbook).not.toMatch(
      /echo\s+"[^"]*\$E5_MAINTENANCE_DB_URL"/,
    );
  });

  it("uses redacted display (resolved identity, not raw URL)", () => {
    // E5-F03 fix replaced MAINT_RESOLVED_HOST with ACTUAL_SERVER_IDENTITY
    // (validated against trusted E5_EXPECTED_SERVER_IDENTITY env var)
    expect(runbook).toContain("ACTUAL_SERVER_IDENTITY");
    expect(runbook).toContain("MAINT_RESOLVED_DB");
    expect(runbook).toContain("REDACTED");
  });

  it("the redacted display section does NOT contain raw URL variables", () => {
    // Extract the echo block and verify no raw URL interpolation
    const echoStart = runbook.indexOf(
      "=== E5 Rehearsal Configuration (REDACTED",
    );
    expect(echoStart).toBeGreaterThan(-1);
    const echoBlock = runbook.slice(echoStart, echoStart + 400);
    expect(echoBlock).not.toContain("$MAINTENANCE_DB_URL");
    expect(echoBlock).not.toContain("$SCRATCH_DB_URL");
    expect(echoBlock).not.toContain("$E5_BASE_URL");
  });
});

describe("E5 Runbook — preserves fail-fast and scratch confirmation", () => {
  const runbook = readRunbook();

  it("retains `set -euo pipefail`", () => {
    expect(runbook).toContain("set -euo pipefail");
  });

  it("retains the I-CONFIRM-SCRATCH interactive guard", () => {
    expect(runbook).toContain("I-CONFIRM-SCRATCH");
  });

  it("retains the production-like URL refusal guard", () => {
    expect(runbook).toContain("prod|staging|live|main");
    expect(runbook).toContain("FATAL: scratch DB name looks production-like");
  });
});

/* ============================================================
   STEP 15.17 — E5-F03 through E5-F06 regression tests
   ============================================================ */

describe("E5 Runbook — E5-F03: target identity assurance (server identity, not just DB name)", () => {
  const runbook = readRunbook();

  it("requires E5_EXPECTED_SERVER_IDENTITY env var", () => {
    expect(runbook).toContain("E5_EXPECTED_SERVER_IDENTITY");
    expect(runbook).toContain(
      "E5_EXPECTED_SERVER_IDENTITY must be set",
    );
  });

  it("validates actual server identity against trusted expected value", () => {
    // The runbook references ACTUAL/EXPECTED_SERVER_IDENTITY and `source`s the
    // shared script where the mismatch check lives.
    expect(runbook).toContain("ACTUAL_SERVER_IDENTITY");
    expect(runbook).toContain("EXPECTED_SERVER_IDENTITY");
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    expect(runbook).toContain("Refusing to proceed");
    // The actual mismatch message lives in the shared helper.
    expect(readSharedScript()).toContain("server mismatch");
  });

  it("resolves server identity via inet_server_addr + inet_server_port", () => {
    // The runbook sources the shared script; the inet_server_addr/port calls
    // live inside scripts/e5/resolve-identity.sh.
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    const sharedScript = readSharedScript();
    expect(sharedScript).toContain("inet_server_addr()");
    expect(sharedScript).toContain("inet_server_port()");
  });
});

describe("E5 Runbook — E5-F04: reliable exit-code capture under set -e", () => {
  const runbook = readRunbook();

  it("wraps pg_dump in set +e / set -e to capture exit code", () => {
    // Must contain `set +e` before pg_dump and `set -e` after $? capture
    const backupSection = runbook.slice(
      runbook.indexOf("B.2.3"),
      runbook.indexOf("B.2.4"),
    );
    expect(backupSection).toContain("set +e");
    expect(backupSection).toContain("BACKUP_EXIT=$?");
    expect(backupSection).toContain("set -e");
  });

  it("wraps pg_restore in set +e / set -e to capture exit code", () => {
    const restoreSection = runbook.slice(
      runbook.indexOf("B.2.4"),
      runbook.indexOf("B.2.5"),
    );
    expect(restoreSection).toContain("set +e");
    expect(restoreSection).toContain("RESTORE_EXIT=$?");
    expect(restoreSection).toContain("set -e");
  });

  it("wraps rollback pg_restore in set +e / set -e", () => {
    const rollbackSection = runbook.slice(
      runbook.indexOf("B.2.6"),
      runbook.indexOf("B.2.7"),
    );
    expect(rollbackSection).toContain("set +e");
    expect(rollbackSection).toContain("ROLLBACK_EXIT=$?");
    expect(rollbackSection).toContain("set -e");
  });
});

describe("E5 Runbook — E5-F05: fail-closed reconciliation", () => {
  const runbook = readRunbook();

  it("has a RECONCILE_FAIL accumulator variable", () => {
    expect(runbook).toContain("RECONCILE_FAIL=0");
    expect(runbook).toContain("RECONCILE_FAIL=1");
  });

  it("exits with nonzero on reconciliation failure", () => {
    expect(runbook).toContain("RECONCILE_FAIL");
    expect(runbook).toContain(
      "FATAL: E5 reconciliation failed",
    );
    expect(runbook).toContain("exit 1");
  });

  it("marks query failures as FATAL and sets RECONCILE_FAIL", () => {
    expect(runbook).toContain("query failed");
    expect(runbook).toContain("RECONCILE_FAIL=1");
  });

  it("does NOT use the old pattern of printing MISMATCH without exit", () => {
    // The old pattern just echoed MISMATCH; the new one sets RECONCILE_FAIL=1
    const reconcilesSection = runbook.slice(
      runbook.indexOf("B.2.5"),
      runbook.indexOf("B.2.6"),
    );
    expect(reconcilesSection).toContain("RECONCILE_FAIL=1");
    expect(reconcilesSection).toContain("exit 1");
  });
});

describe("E5 Runbook — E5-F06: rollback must prove column exists and change occurred", () => {
  const runbook = readRunbook();

  it("verifies column EXISTS before attempting to drop it", () => {
    const rollbackSection = runbook.slice(
      runbook.indexOf("B.2.6"),
      runbook.indexOf("B.2.7"),
    );
    expect(rollbackSection).toContain("COL_PRE_EXISTS");
    expect(rollbackSection).toContain(
      "column 'role' does not exist in 'User' table before drop",
    );
    expect(rollbackSection).toContain("exit 1");
  });

  it("does NOT use DROP COLUMN IF EXISTS (must fail if column missing)", () => {
    const rollbackSection = runbook.slice(
      runbook.indexOf("B.2.6"),
      runbook.indexOf("B.2.7"),
    );
    // The DROP must be without IF EXISTS — the precondition check guarantees existence
    expect(rollbackSection).toContain(
      'ALTER TABLE "User" DROP COLUMN "role";',
    );
    expect(rollbackSection).not.toContain(
      'DROP COLUMN IF EXISTS "role"',
    );
  });

  it("verifies the DROP actually occurred (column count == 0 after drop)", () => {
    const rollbackSection = runbook.slice(
      runbook.indexOf("B.2.6"),
      runbook.indexOf("B.2.7"),
    );
    expect(rollbackSection).toContain("COL_CHECK");
    expect(rollbackSection).toContain(
      "destructive change did not occur",
    );
    expect(rollbackSection).toContain("exit 1");
  });

  it("verifies column is restored after rollback (count == 1)", () => {
    const rollbackSection = runbook.slice(
      runbook.indexOf("B.2.6"),
      runbook.indexOf("B.2.7"),
    );
    expect(rollbackSection).toContain("COL_RESTORED");
    expect(rollbackSection).toContain(
      "column 'role' NOT restored",
    );
    expect(rollbackSection).toContain("exit 1");
  });
});

/* ============================================================
   STEP 15.22 — E5-F08: Fail-closed server identity (NULL/empty rejection)
   ============================================================ */

describe("E5 Runbook — E5-F08: fail-closed on NULL/empty/UNRESOLVED identity", () => {
  const runbook = readRunbook();
  const sharedScript = readSharedScript();

  it("uses COALESCE to convert NULL inet_server_addr to 'NULL' literal", () => {
    // The runbook sources the shared script; the COALESCE call lives there.
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    expect(sharedScript).toContain("COALESCE(inet_server_addr()::text, 'NULL')");
  });

  it("uses COALESCE to convert NULL inet_server_port to 'NULL' literal", () => {
    expect(sharedScript).toContain("COALESCE(inet_server_port()::text, 'NULL')");
  });

  it("sources the shared resolve_connection_identity helper (not inlined)", () => {
    // The helper is defined in scripts/e5/resolve-identity.sh and sourced.
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    expect(sharedScript).toContain("resolve_connection_identity()");
    // The runbook calls validate_connection_identity for ALL three connections.
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain('"$MAINTENANCE_DB_URL" "maintenance"');
    expect(runbook).toContain('"$SCRATCH_DB_URL" "scratch"');
    expect(runbook).toContain('"$RESTORE_DB_URL" "restore"');
  });

  it("resolve_connection_identity fails closed on NULL:NULL identity", () => {
    // The NULL:NULL fail-closed check lives in the shared script.
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    expect(sharedScript).toContain("NULL:NULL");
    expect(sharedScript).toContain("unresolved identity field");
  });

  it("resolve_connection_identity fails closed on empty string", () => {
    // The shared script checks `-z "$field"` for every resolved field.
    expect(sharedScript).toContain('-z "$field"');
  });

  it("resolve_connection_identity fails closed on UNRESOLVED", () => {
    // The shared script's fail-closed regex rejects the literal token UNRESOLVED.
    expect(sharedScript).toContain("UNRESOLVED");
  });

  it("mentions Unix-domain socket connections as rejected", () => {
    expect(runbook).toContain("Unix-domain socket");
    expect(runbook).toContain(
      "inet_server_addr() returns NULL",
    );
  });

  it("validates expected identity is non-empty before use", () => {
    expect(runbook).toContain(
      "E5_EXPECTED_SERVER_IDENTITY is empty or whitespace-only",
    );
  });

  it("maintenance uses validate_connection_identity (not inline psql)", () => {
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain(
      '"$MAINTENANCE_DB_URL" "maintenance"',
    );
  });

  it("scratch uses validate_connection_identity (not inline psql)", () => {
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain(
      '"$SCRATCH_DB_URL" "scratch"',
    );
  });

  it("restore uses validate_connection_identity (not inline psql)", () => {
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain(
      '"$RESTORE_DB_URL" "restore"',
    );
  });

  it("does NOT use raw inet_server_addr() without COALESCE", () => {
    // The old unsafe pattern: SELECT inet_server_addr() || ':' || inet_server_port()
    // The new safe pattern uses COALESCE to convert NULL to 'NULL' literal
    expect(runbook).not.toContain(
      "SELECT inet_server_addr() || ':' || inet_server_port();",
    );
  });
});

// ============================================================
// E5-F07: Server identity validation for ALL connections
// ============================================================
describe("E5-F07: Server identity for ALL connections", () => {
  it("F07-1: SCRATCH_DB_URL has server identity validation", () => {
    const content = readRunbook();
    // The runbook calls validate_connection_identity for scratch, passing
    // ACTUAL_SERVER_IDENTITY as the reference value.
    expect(content).toContain("validate_connection_identity");
    expect(content).toContain('"$SCRATCH_DB_URL" "scratch"');
    expect(content).toContain("$ACTUAL_SERVER_IDENTITY");
    // inet_server_addr lives in the shared helper.
    expect(readSharedScript()).toContain("inet_server_addr");
  });

  it("F07-2: RESTORE_DB_URL has server identity validation", () => {
    const content = readRunbook();
    expect(content).toContain("validate_connection_identity");
    expect(content).toContain('"$RESTORE_DB_URL" "restore"');
    // The restore validation passes ACTUAL_SERVER_IDENTITY as reference.
    expect(content).toContain("$ACTUAL_SERVER_IDENTITY");
  });

  it("F07-3: SCRATCH identity mismatch causes exit 1", () => {
    const content = readRunbook();
    // The validate_connection_identity call for scratch is followed by
    // `|| exit 1`, so any mismatch aborts the runbook. The call spans:
    //   validate_connection_identity \
    //     "$SCRATCH_DB_URL" "scratch" \
    //     ... \
    //     ... || exit 1
    const labelIdx = content.indexOf('"$SCRATCH_DB_URL" "scratch"');
    expect(labelIdx).toBeGreaterThan(-1);
    // validate_connection_identity appears just before the label line.
    const beforeLabel = content.substring(Math.max(0, labelIdx - 200), labelIdx);
    expect(beforeLabel).toContain("validate_connection_identity");
    // `|| exit 1` appears after the label line (closing the call).
    const afterLabel = content.substring(labelIdx, labelIdx + 500);
    expect(afterLabel).toContain("|| exit 1");
  });

  it("F07-4: RESTORE identity mismatch causes exit 1", () => {
    const content = readRunbook();
    const labelIdx = content.indexOf('"$RESTORE_DB_URL" "restore"');
    expect(labelIdx).toBeGreaterThan(-1);
    const beforeLabel = content.substring(Math.max(0, labelIdx - 200), labelIdx);
    expect(beforeLabel).toContain("validate_connection_identity");
    const afterLabel = content.substring(labelIdx, labelIdx + 500);
    expect(afterLabel).toContain("|| exit 1");
  });
});

/* ============================================================
   STEP 15.25 — E5-F09: Cluster identity (system_identifier)
   ============================================================ */

describe("E5 Runbook — E5-F09: cluster identity via system_identifier", () => {
  const runbook = readRunbook();
  const sharedScript = readSharedScript();

  it("requires E5_EXPECTED_CLUSTER_IDENTIFIER env var", () => {
    expect(runbook).toContain("E5_EXPECTED_CLUSTER_IDENTIFIER");
    expect(runbook).toContain(
      "E5_EXPECTED_CLUSTER_IDENTIFIER must be set",
    );
  });

  it("queries pg_control_system() for system_identifier", () => {
    expect(runbook).toContain("pg_control_system()");
    expect(runbook).toContain("system_identifier");
  });

  it("uses resolve_connection_identity (not old resolve_server_identity)", () => {
    expect(runbook).toContain("resolve_connection_identity");
    // Old helper name should not be used for identity resolution
    expect(runbook).not.toContain(
      'resolve_server_identity "',
    );
  });

  it("validates cluster identifier for maintenance connection", () => {
    // The runbook references ACTUAL/EXPECTED_CLUSTER_IDENTIFIER and calls
    // validate_connection_identity for maintenance. The mismatch message
    // lives in the shared helper.
    expect(runbook).toContain("ACTUAL_CLUSTER_IDENTIFIER");
    expect(runbook).toContain("EXPECTED_CLUSTER_IDENTIFIER");
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain('"$MAINTENANCE_DB_URL" "maintenance"');
    expect(sharedScript).toContain("cluster mismatch");
  });

  it("validates cluster identifier for scratch connection", () => {
    // The runbook calls validate_connection_identity for scratch, passing
    // EXPECTED_CLUSTER_IDENTIFIER and ACTUAL_CLUSTER_IDENTIFIER (reference).
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain('"$SCRATCH_DB_URL" "scratch"');
    expect(runbook).toContain("EXPECTED_CLUSTER_IDENTIFIER");
    expect(runbook).toContain("ACTUAL_CLUSTER_IDENTIFIER");
    expect(sharedScript).toContain("cluster mismatch");
  });

  it("validates cluster identifier for restore connection", () => {
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain('"$RESTORE_DB_URL" "restore"');
    expect(runbook).toContain("EXPECTED_CLUSTER_IDENTIFIER");
    expect(runbook).toContain("ACTUAL_CLUSTER_IDENTIFIER");
    expect(sharedScript).toContain("cluster mismatch");
  });

  it("fail-closed on unresolved cluster identifier", () => {
    // The shared helper's fail-closed loop rejects any NULL/empty/UNRESOLVED
    // field — including the cluster identifier — with an `unresolved identity
    // field` message. The runbook sources this helper for all connections.
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
    expect(runbook).toContain("validate_connection_identity");
    expect(runbook).toContain('"$MAINTENANCE_DB_URL" "maintenance"');
    expect(runbook).toContain('"$SCRATCH_DB_URL" "scratch"');
    expect(runbook).toContain('"$RESTORE_DB_URL" "restore"');
    expect(sharedScript).toContain("unresolved identity field");
    expect(sharedScript).toContain("cluster");
  });

  it("validates expected cluster identifier is non-empty", () => {
    expect(runbook).toContain(
      "E5_EXPECTED_CLUSTER_IDENTIFIER is empty or whitespace-only",
    );
  });

  it("documents the deployment assumption", () => {
    expect(runbook).toContain("direct TCP");
    expect(runbook).toContain("routing intermediary");
  });

  it("mentions proxy/pooler/failover as the gap closed by F09", () => {
    expect(runbook).toContain("proxy/pooler/failover");
    expect(runbook).toContain("source scripts/e5/resolve-identity.sh");
  });
});
