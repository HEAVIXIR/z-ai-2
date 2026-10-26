import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/backup.sh");

function runBackup(failStore = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), "heavix-backup-test-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const fakePgDump = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `if [[ "$*" == *"store-db"* ]] && [ "${failStore ? "1" : "0"}" = "1" ]; then echo "fake Store dump failure" >&2; exit 7; fi`,
    'printf -- "-- disposable dump for %s\\n" "$*"',
    "",
  ].join("\n");
  const fakePath = path.join(bin, "pg_dump");
  writeFileSync(fakePath, fakePgDump, { mode: 0o755 });
  chmodSync(fakePath, 0o755);

  const result = spawnSync("bash", [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      DB_HOST: "main-db",
      DB_PORT: "5432",
      DB_USER: "backup-user",
      DB_NAME: "main_db",
      DB_PASSWORD: "test-only-main-password",
      STORE_DB_HOST: "store-db",
      STORE_DB_PORT: "5432",
      STORE_DB_USER: "backup-user",
      STORE_DB_NAME: "store_db",
      STORE_DB_PASSWORD: "test-only-store-password",
      ...(failStore ? { BACKUP_TEST_FAIL_STORE: "1" } : {}),
    },
  });
  return { root, result };
}

describe("PostgreSQL paired backup script", () => {
  it("publishes both dumps only after checksum creation succeeds", () => {
    const { root, result } = runBackup(false);
    try {
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Backup complete: \.\/backups\/\d{8}_\d{6}/);
      const dirs = readdirSync(path.join(root, "backups")).filter((name) => !name.startsWith("."));
      expect(dirs).toHaveLength(1);
      const backupDir = path.join(root, "backups", dirs[0]);
      for (const file of ["main.sql", "store.sql", "checksums.txt"]) {
        expect(statSync(path.join(backupDir, file)).size).toBeGreaterThan(0);
      }
      const checksum = spawnSync("sha256sum", ["-c", "checksums.txt"], {
        cwd: backupDir,
        encoding: "utf8",
      });
      expect(checksum.status).toBe(0);
      expect(result.stdout).not.toContain("test-only-main-password");
      expect(result.stdout).not.toContain("test-only-store-password");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not publish a partial backup when the Store dump fails", () => {
    const { root, result } = runBackup(true);
    try {
      expect(result.status).not.toBe(0);
      expect(readdirSync(path.join(root, "backups")).filter((name) => !name.startsWith("."))).toHaveLength(0);
      expect(result.stdout).not.toContain("Backup complete:");
      expect(result.stdout).not.toContain("test-only-main-password");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
