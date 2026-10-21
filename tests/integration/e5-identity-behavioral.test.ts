import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.28: Behavioral Tests for E5 Identity Helper
   ------------------------------------------------------------
   CR-05: These tests source the ACTUAL scripts/e5/resolve-identity.sh
   — NOT a duplicated copy. This ensures tests verify the real
   implementation.

   CR-07: Sentinel tests prove that NO mutating command runs after
   validation failure. A sentinel file is checked for absence.

   CR-06: Tests verify that validate_connection_identity checks DB name
   and primary role independently for each connection.
   ============================================================ */

const REPO_ROOT = join(__dirname, "..", "..");
const TMP_DIR = "/tmp/e5-behavioral-test";
const HELPER_PATH = join(REPO_ROOT, "scripts", "e5", "resolve-identity.sh");

function makePsqlStub(responses: {
  server_identity?: { out: string; exit: number };
  cluster_identity?: { out: string; exit: number };
  db_name?: { out: string; exit: number };
  is_in_recovery?: { out: string; exit: number };
}): void {
  const defaults = {
    server_identity: { out: "10.0.0.5:5432", exit: 0 },
    cluster_identity: { out: "6983723456789012345", exit: 0 },
    db_name: { out: "postgres", exit: 0 },
    is_in_recovery: { out: "f", exit: 0 },
  };
  const r = { ...defaults, ...responses };

  // The actual helper uses a SINGLE query with -F '|' separator.
  // All 4 fields come from one psql invocation containing inet_server_addr.
  // The stub returns all 4 fields as pipe-separated values.
  // If any field should fail (exit != 0), the entire query fails.
  const anyExit = [r.server_identity.exit, r.cluster_identity.exit, r.db_name.exit, r.is_in_recovery.exit].find(e => e !== 0);

  const stub = `#!/bin/bash
ARGS="$*"
# The helper uses a single query containing inet_server_addr
if echo "$ARGS" | grep -q "inet_server_addr"; then
  if [ ${anyExit ?? 0} -ne 0 ]; then
    exit ${anyExit ?? 0}
  fi
  printf '%s|%s|%s|%s' '${r.server_identity.out}' '${r.cluster_identity.out}' '${r.db_name.out}' '${r.is_in_recovery.out}'
  exit 0
fi
exit 1
`;
  writeFileSync(join(TMP_DIR, "psql"), stub, { mode: 0o755 });
}

function runTest(
  responses: Parameters<typeof makePsqlStub>[0],
  testScript: string,
): { exitCode: number; stdout: string; stderr: string; sentinelExists: boolean } {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  makePsqlStub(responses);

  // CR-05: Source the ACTUAL helper script — not a copy
  const fullScript = `#!/bin/bash
set -uo pipefail
source "${HELPER_PATH}"
${testScript}
`;

  const scriptPath = join(TMP_DIR, "run.sh");
  writeFileSync(scriptPath, fullScript, { mode: 0o755 });

  const env = {
    ...process.env,
    PATH: `${TMP_DIR}:${process.env.PATH}`,
  };

  try {
    const stdout = execSync(`bash ${scriptPath} 2>&1`, {
      env,
      encoding: "utf-8",
      timeout: 5000,
    });
    return {
      exitCode: 0,
      stdout,
      stderr: "",
      sentinelExists: existsSync(join(TMP_DIR, "SENTINEL_RAN")),
    };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    // When using 2>&1, stdout contains both stdout and stderr
    const combined = e.stdout ?? "";
    return {
      exitCode: e.status ?? 1,
      stdout: combined,
      stderr: combined,
      sentinelExists: existsSync(join(TMP_DIR, "SENTINEL_RAN")),
    };
  }
}

const VALID = {}; // uses defaults

describe("CR-05: Tests source the actual scripts/e5/resolve-identity.sh", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("sources the actual helper file (not a duplicate)", () => {
    // If the helper file doesn't exist, this test fails
    expect(existsSync(HELPER_PATH)).toBe(true);
  });

  it("resolve_connection_identity succeeds with valid psql output", () => {
    const result = runTest(VALID, `
RESULT=$(resolve_connection_identity "postgresql://t:t@localhost:5432/postgres" "test")
echo "RESULT=$RESULT"
`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("10.0.0.5:5432");
    expect(result.stdout).toContain("6983723456789012345");
    expect(result.stdout).toContain("postgres");
    expect(result.stdout).toContain("f");
  });

  it("resolve_connection_identity fails on NULL:NULL (Unix-socket)", () => {
    const result = runTest(
      { server_identity: { out: "NULL:NULL", exit: 0 } },
      `resolve_connection_identity "postgresql://t:t@localhost:5432/postgres" "test" || echo "CAUGHT_FAILURE"`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CAUGHT_FAILURE");
  });

  it("resolve_connection_identity fails on psql error", () => {
    const result = runTest(
      {
        server_identity: { out: "", exit: 1 },
        cluster_identity: { out: "", exit: 1 },
        db_name: { out: "", exit: 1 },
        is_in_recovery: { out: "", exit: 1 },
      },
      `resolve_connection_identity "postgresql://t:t@localhost:5432/postgres" "test" || echo "CAUGHT_FAILURE"`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CAUGHT_FAILURE");
  });
});

describe("CR-06: validate_connection_identity checks all fields independently", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("succeeds when all fields match expected values", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" && echo "VALIDATION_OK"
`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("VALIDATION_OK");
  });

  it("fails when database name mismatches", () => {
    const result = runTest(
      { db_name: { out: "wrong_db", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || echo "CAUGHT_DB_MISMATCH"
`,
    );
    expect(result.stdout).toContain("CAUGHT_DB_MISMATCH");
    expect(result.stdout).toContain("db_name mismatch");
  });

  it("fails when server is replica (is_in_recovery=t) and primary required", () => {
    const result = runTest(
      { is_in_recovery: { out: "t", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || echo "CAUGHT_REPLICA"
`,
    );
    expect(result.stdout).toContain("CAUGHT_REPLICA");
    expect(result.stdout).toContain("primary required");
  });

  it("fails when cluster identifier mismatches", () => {
    const result = runTest(
      { cluster_identity: { out: "9999999999999999999", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || echo "CAUGHT_CLUSTER_MISMATCH"
`,
    );
    expect(result.stdout).toContain("CAUGHT_CLUSTER_MISMATCH");
    expect(result.stdout).toContain("cluster mismatch");
  });

  it("fails when server identity mismatches", () => {
    const result = runTest(
      { server_identity: { out: "10.0.0.99:5432", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || echo "CAUGHT_SERVER_MISMATCH"
`,
    );
    expect(result.stdout).toContain("CAUGHT_SERVER_MISMATCH");
    expect(result.stdout).toContain("server mismatch"); // stderr is combined (2>&1)
  });

  it("CR-07: sentinel command does NOT run after validation failure", () => {
    // CR-07: If validation fails, the sentinel (representing a mutating
    // command like prisma db push) must NEVER execute.
    const result = runTest(
      { db_name: { out: "wrong_db", exit: 0 } }, // mismatch
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || exit 1

# SENTINEL: This represents a mutating command (schema push, seed, ALTER, etc.)
# If validation failed, this must NEVER run.
touch "${join(TMP_DIR, "SENTINEL_RAN")}"
echo "MUTATING_COMMAND_RAN"
`,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.sentinelExists).toBe(false);
    expect(result.stdout).not.toContain("MUTATING_COMMAND_RAN");
  });

  it("CR-07: sentinel command DOES run after validation success", () => {
    // Positive control: when validation succeeds, the sentinel runs.
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || exit 1

# SENTINEL: This represents a mutating command.
touch "${join(TMP_DIR, "SENTINEL_RAN")}"
echo "MUTATING_COMMAND_RAN"
`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.sentinelExists).toBe(true);
    expect(result.stdout).toContain("MUTATING_COMMAND_RAN");
  });
});

describe("Field extraction regression: 4 distinct values", () => {
  // This test catches the bug where ${VAR##*|} returned is_in_recovery
  // instead of cluster_identifier. Uses 4 DISTINCT values so any
  // mis-extraction is immediately visible.
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("correctly extracts all 4 fields with distinct values", () => {
    const result = runTest(
      {
        server_identity: { out: "SERVER_FIELD", exit: 0 },
        cluster_identity: { out: "CLUSTER_FIELD", exit: 0 },
        db_name: { out: "DB_FIELD", exit: 0 },
        is_in_recovery: { out: "RECOVERY_FIELD", exit: 0 },
      },
      `
RESULT=$(resolve_connection_identity "postgresql://t:t@localhost:5432/postgres" "test")
SERVER=$(echo "$RESULT" | cut -d'|' -f1)
CLUSTER=$(echo "$RESULT" | cut -d'|' -f2)
DB=$(echo "$RESULT" | cut -d'|' -f3)
RECOVERY=$(echo "$RESULT" | cut -d'|' -f4)
echo "S=$SERVER C=$CLUSTER D=$DB R=$RECOVERY"
# Assert each field is distinct and correct
[ "$SERVER" = "SERVER_FIELD" ] || { echo "SERVER WRONG: $SERVER"; exit 1; }
[ "$CLUSTER" = "CLUSTER_FIELD" ] || { echo "CLUSTER WRONG: $CLUSTER"; exit 1; }
[ "$DB" = "DB_FIELD" ] || { echo "DB WRONG: $DB"; exit 1; }
[ "$RECOVERY" = "RECOVERY_FIELD" ] || { echo "RECOVERY WRONG: $RECOVERY"; exit 1; }
echo "ALL_FIELDS_CORRECT"
`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ALL_FIELDS_CORRECT");
    expect(result.stdout).toContain("S=SERVER_FIELD");
    expect(result.stdout).toContain("C=CLUSTER_FIELD");
    expect(result.stdout).toContain("D=DB_FIELD");
    expect(result.stdout).toContain("R=RECOVERY_FIELD");
  });
});

describe("CR-11: E5_REQUIRE_PRIMARY validation (fail-closed on invalid values)", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("CR-11-1: invalid value 'yees' (typo) → fail-closed (exit 1)", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yees" \\
  "" "" || echo "CAUGHT_INVALID"
`);
    expect(result.exitCode).toBe(0); // || echo makes it 0
    expect(result.stdout).toContain("CAUGHT_INVALID");
    expect(result.stdout).toContain("invalid E5_REQUIRE_PRIMARY");
  });

  it("CR-11-2: invalid value 'tru' (typo) → fail-closed (exit 1)", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "tru" \\
  "" "" || echo "CAUGHT_INVALID"
`);
    expect(result.stdout).toContain("CAUGHT_INVALID");
    expect(result.stdout).toContain("invalid E5_REQUIRE_PRIMARY");
  });

  it("CR-11-3: empty string → fail-closed (exit 1)", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "" \\
  "" "" || echo "CAUGHT_INVALID"
`);
    expect(result.stdout).toContain("CAUGHT_INVALID");
  });

  it("CR-11-4: 'yes' (valid) → primary check enforced → succeeds on primary", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" && echo "VALIDATION_OK"
`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("VALIDATION_OK");
  });

  it("CR-11-5: 'YES' (case-insensitive) → primary check enforced → succeeds", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "YES" \\
  "" "" && echo "VALIDATION_OK"
`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("VALIDATION_OK");
  });

  it("CR-11-6: 'no' (valid skip) → primary check skipped → succeeds on replica", () => {
    const result = runTest(
      { is_in_recovery: { out: "t", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "no" \\
  "" "" && echo "VALIDATION_OK"
`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("VALIDATION_OK");
  });

  it("CR-11-7: 'yes' (valid) on replica → fails (primary required, is replica)", () => {
    const result = runTest(
      { is_in_recovery: { out: "t", exit: 0 } },
      `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yes" \\
  "" "" || echo "CAUGHT_REPLICA"
`,
    );
    expect(result.stdout).toContain("CAUGHT_REPLICA");
    expect(result.stdout).toContain("primary required");
  });

  it("CR-11-8: invalid value → sentinel NOT created (no mutation runs)", () => {
    const result = runTest(VALID, `
validate_connection_identity \\
  "postgresql://t:t@localhost:5432/postgres" "test" \\
  "10.0.0.5:5432" "6983723456789012345" \\
  "postgres" "yees" \\
  "" "" || exit 1
touch "${join(TMP_DIR, "SENTINEL_RAN")}"
echo "MUTATING_COMMAND_RAN"
`);
    expect(result.exitCode).not.toBe(0);
    expect(result.sentinelExists).toBe(false);
    expect(result.stdout).not.toContain("MUTATING_COMMAND_RAN");
  });
});
