import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/restore.sh");
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "heavix-restore-test-"));
  roots.push(root);
  const bin = path.join(root, "bin");
  const backup = path.join(root, "backup");
  mkdirSync(bin);
  mkdirSync(backup);
  writeFileSync(path.join(backup, "main.sql"), "-- disposable main dump\n");
  writeFileSync(path.join(backup, "store.sql"), "-- disposable store dump\n");
  const checksum = spawnSync("sha256sum", ["main.sql", "store.sql"], {
    cwd: backup,
    encoding: "utf8",
  });
  if (checksum.status !== 0) throw new Error(checksum.stderr);
  writeFileSync(path.join(backup, "checksums.txt"), checksum.stdout);

  const psqlLog = path.join(root, "psql.log");
  writeFileSync(psqlLog, "");
  const psql = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf "%s\\n" "$*" >> "$PSQL_LOG"',
    "cat >/dev/null || true",
    "",
  ].join("\n");
  writeFileSync(path.join(bin, "psql"), psql, { mode: 0o755 });
  chmodSync(path.join(bin, "psql"), 0o755);

  const docker = [
    "#!/usr/bin/env bash",
    "if [[ ${1:-} == ps ]]; then exit 0; fi",
    "exit 1",
    "",
  ].join("\n");
  writeFileSync(path.join(bin, "docker"), docker, { mode: 0o755 });
  chmodSync(path.join(bin, "docker"), 0o755);

  return { root, bin, backup, psqlLog };
}

function runRestore(f: ReturnType<typeof fixture>, overrides: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${f.bin}:${process.env.PATH ?? ""}`,
    PSQL_LOG: f.psqlLog,
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USER: "test-user",
    DB_PASSWORD: "test-main-password",
    STORE_DB_HOST: "localhost",
    STORE_DB_PORT: "5433",
    STORE_DB_USER: "test-user",
    STORE_DB_PASSWORD: "test-store-password",
    HEAVIX_RESTORE_TRAFFIC_DRAINED: "1",
    ...overrides,
  };
  delete env.DB_NAME;
  delete env.STORE_DB_NAME;
  delete env.HEAVIX_ENV;
  delete env.NODE_ENV;
  const result = spawnSync("bash", [scriptPath, f.backup], {
    cwd: f.root,
    encoding: "utf8",
    input: "RESTORE localhost/heavix AND localhost/heavix_store\n",
    env,
  });
  return result;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("paired database restore script", () => {
  it("loads safe defaults before prompting and verifies both databases", () => {
    const f = fixture();
    const result = runRestore(f);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Main:  localhost:5432 / database heavix");
    expect(result.stdout).toContain("Store: localhost:5433 / database heavix_store");
    const calls = readFileSync(f.psqlLog, "utf8");
    expect(calls).toContain('DROP DATABASE IF EXISTS "heavix" WITH (FORCE)');
    expect(calls).toContain('DROP DATABASE IF EXISTS "heavix_store" WITH (FORCE)');
    expect(calls).toContain('CREATE DATABASE "heavix"');
    expect(calls).toContain('CREATE DATABASE "heavix_store"');
    expect(result.stdout).not.toContain("test-main-password");
    expect(result.stdout).not.toContain("test-store-password");
    expect(result.stdout).not.toContain("db push --accept-data-loss");
  });

  it("fails before any database command when a checksum does not match", () => {
    const f = fixture();
    writeFileSync(path.join(f.backup, "main.sql"), "-- tampered dump\n");
    const result = runRestore(f);

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/FAILED|checksum/i);
    expect(readFileSync(f.psqlLog, "utf8")).toBe("");
  });

  it("blocks restore until application traffic is explicitly drained", () => {
    const f = fixture();
    const result = runRestore(f, { HEAVIX_RESTORE_TRAFFIC_DRAINED: "0" });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("stop application traffic");
    expect(readFileSync(f.psqlLog, "utf8")).toBe("");
  });

  it("blocks remote targets unless the explicit non-production gate is set", () => {
    const f = fixture();
    const result = runRestore(f, {
      DB_HOST: "db.example.invalid",
      STORE_DB_HOST: "store.example.invalid",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("remote restore requires HEAVIX_ALLOW_REMOTE_RESTORE=1");
    expect(readFileSync(f.psqlLog, "utf8")).toBe("");
  });
});
