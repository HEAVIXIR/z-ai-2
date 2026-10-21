import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.26: Behavioral Tests for E5 Identity Helper
   ------------------------------------------------------------
   CR-01: These tests EXECUTE the resolve_connection_identity
   helper with stubbed psql commands to verify actual exit
   behavior — not just string presence in the runbook.
   ============================================================ */

const TMP_DIR = "/tmp/e5-behavioral-test";

const HELPER_SCRIPT = `#!/bin/bash
set -uo pipefail

resolve_connection_identity() {
  local db_url="$1"
  local label="$2"
  local server_identity cluster_identity db_name is_in_recovery

  server_identity=$(psql -t -A -v ON_ERROR_STOP=1 "$db_url" -c "SELECT COALESCE(inet_server_addr()::text, 'NULL') || ':' || COALESCE(inet_server_port()::text, 'NULL');" 2>/dev/null || echo "UNRESOLVED")
  server_identity=$(echo "$server_identity" | tr -d '[:space:]')
  if [ -z "$server_identity" ] || [ "$server_identity" = "UNRESOLVED" ] || [ "$server_identity" = "NULL:NULL" ]; then
    echo "FATAL: server identity for $label is NULL, empty, or unresolved." >&2
    return 1
  fi

  cluster_identity=$(psql -t -A -v ON_ERROR_STOP=1 "$db_url" -c "SELECT system_identifier::text FROM pg_control_system();" 2>/dev/null || echo "UNRESOLVED")
  cluster_identity=$(echo "$cluster_identity" | tr -d '[:space:]')
  if [ -z "$cluster_identity" ] || [ "$cluster_identity" = "UNRESOLVED" ]; then
    echo "FATAL: cluster identifier for $label is NULL, empty, or unresolved." >&2
    return 1
  fi

  db_name=$(psql -t -A -v ON_ERROR_STOP=1 "$db_url" -c "SELECT current_database();" 2>/dev/null || echo "UNRESOLVED")
  db_name=$(echo "$db_name" | tr -d '[:space:]')
  if [ -z "$db_name" ] || [ "$db_name" = "UNRESOLVED" ]; then
    echo "FATAL: database name for $label is NULL, empty, or unresolved." >&2
    return 1
  fi

  is_in_recovery=$(psql -t -A -v ON_ERROR_STOP=1 "$db_url" -c "SELECT pg_is_in_recovery();" 2>/dev/null || echo "UNRESOLVED")
  is_in_recovery=$(echo "$is_in_recovery" | tr -d '[:space:]')
  if [ -z "$is_in_recovery" ] || [ "$is_in_recovery" = "UNRESOLVED" ]; then
    echo "FATAL: server role for $label is unresolved." >&2
    return 1
  fi

  echo "\${server_identity}|\${cluster_identity}|\${db_name}|\${is_in_recovery}"
  return 0
}

set +e
RESULT=$(resolve_connection_identity "postgresql://test:test@localhost:5432/postgres" "test")
EXIT_CODE=$?
set -e
if [ $EXIT_CODE -eq 0 ]; then
  echo "OK:\${RESULT}"
else
  echo "FAIL"
fi
exit $EXIT_CODE
`;

function makePsqlStub(responses: {
  server_identity?: { out: string; exit: number };
  cluster_identity?: { out: string; exit: number };
  db_name?: { out: string; exit: number };
  is_in_recovery?: { out: string; exit: number };
}): void {
  const defaults = {
    server_identity: { out: "10.0.0.5:5432", exit: 0 },
    cluster_identity: { out: "1234567890", exit: 0 },
    db_name: { out: "postgres", exit: 0 },
    is_in_recovery: { out: "f", exit: 0 },
  };
  const r = { ...defaults, ...responses };

  const stub = `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "inet_server_addr"; then printf '%s' '${r.server_identity.out}'; exit ${r.server_identity.exit}; fi
if echo "$ARGS" | grep -q "pg_control_system"; then printf '%s' '${r.cluster_identity.out}'; exit ${r.cluster_identity.exit}; fi
if echo "$ARGS" | grep -q "current_database"; then printf '%s' '${r.db_name.out}'; exit ${r.db_name.exit}; fi
if echo "$ARGS" | grep -q "pg_is_in_recovery"; then printf '%s' '${r.is_in_recovery.out}'; exit ${r.is_in_recovery.exit}; fi
exit 1
`;
  writeFileSync(join(TMP_DIR, "psql"), stub, { mode: 0o755 });
  writeFileSync(join(TMP_DIR, "run.sh"), HELPER_SCRIPT, { mode: 0o755 });
}

function runHelper(responses: Parameters<typeof makePsqlStub>[0]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  makePsqlStub(responses);

  const env = {
    ...process.env,
    PATH: `${TMP_DIR}:${process.env.PATH}`,
  };

  try {
    const stdout = execSync(`bash ${join(TMP_DIR, "run.sh")}`, {
      env,
      encoding: "utf-8",
      timeout: 5000,
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("E5 Behavioral Tests — resolve_connection_identity (CR-01)", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("1. NULL:NULL identity (Unix-socket) → fail-closed", () => {
    const result = runHelper({ server_identity: { out: "NULL:NULL", exit: 0 } });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NULL, empty, or unresolved");
  });

  it("2. Empty server identity → fail-closed", () => {
    const result = runHelper({ server_identity: { out: "", exit: 0 } });
    expect(result.exitCode).not.toBe(0);
  });

  it("3. psql error on all queries → fail-closed", () => {
    const result = runHelper({
      server_identity: { out: "", exit: 1 },
      cluster_identity: { out: "", exit: 1 },
      db_name: { out: "", exit: 1 },
      is_in_recovery: { out: "", exit: 1 },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NULL, empty, or unresolved");
  });

  it("4. Permission denied for pg_control_system → fail-closed", () => {
    const result = runHelper({ cluster_identity: { out: "", exit: 1 } });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("cluster identifier");
  });

  it("5. All valid → success with correct output format", () => {
    const result = runHelper({});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK:");
    expect(result.stdout).toContain("10.0.0.5:5432");
    expect(result.stdout).toContain("1234567890");
    expect(result.stdout).toContain("postgres");
    expect(result.stdout).toContain("f");
  });

  it("6. Server in recovery (replica) → helper succeeds, caller checks", () => {
    const result = runHelper({ is_in_recovery: { out: "t", exit: 0 } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("|t");
  });

  it("7. Database name unresolved → fail-closed", () => {
    const result = runHelper({ db_name: { out: "", exit: 1 } });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("database name");
  });

  it("8. Server role unresolved → fail-closed", () => {
    const result = runHelper({ is_in_recovery: { out: "", exit: 1 } });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("server role");
  });
});
