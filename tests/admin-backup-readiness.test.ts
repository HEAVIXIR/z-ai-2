import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBackupEnvironment } from "../src/lib/backup-config";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("paired PostgreSQL backup configuration", () => {
  it("derives independent Main and Store connection settings from canonical URLs", () => {
    const env = buildBackupEnvironment({
      DATABASE_URL: "postgresql://main_user:p%40ss%3Aword@main-db.internal:6432/heavix_main?schema=public",
      STORE_DATABASE_URL: "postgres://store_user:store%2Fsecret@store-db.internal/heavix_store?schema=public",
    });

    expect(env).toMatchObject({
      DB_HOST: "main-db.internal",
      DB_PORT: "6432",
      DB_USER: "main_user",
      DB_NAME: "heavix_main",
      DB_PASSWORD: "p@ss:word",
      STORE_DB_HOST: "store-db.internal",
      STORE_DB_PORT: "5432",
      STORE_DB_USER: "store_user",
      STORE_DB_NAME: "heavix_store",
      STORE_DB_PASSWORD: "store/secret",
    });
  });

  it.each([
    [{ DATABASE_URL: undefined, STORE_DATABASE_URL: "postgresql://u:p@db/store" }, /Main database URL is not configured/],
    [{ DATABASE_URL: "not-a-url", STORE_DATABASE_URL: "postgresql://u:p@db/store" }, /Main database URL is invalid/],
    [{ DATABASE_URL: "sqlite:file.db", STORE_DATABASE_URL: "postgresql://u:p@db/store" }, /Main database URL must use PostgreSQL/],
    [{ DATABASE_URL: "postgresql://u@db/main", STORE_DATABASE_URL: "postgresql://u:p@db/store" }, /Main database URL is missing required connection fields/],
    [{ DATABASE_URL: "postgresql://u:p@db/main", STORE_DATABASE_URL: undefined }, /Store database URL is not configured/],
  ] as const)("rejects incomplete or unsupported configuration without exposing URLs", (input, expectedError) => {
    const raw = JSON.stringify(input);
    let caught: unknown;

    try {
      buildBackupEnvironment(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(expectedError);
    expect((caught as Error).message).not.toContain("postgresql://");
    expect((caught as Error).message).not.toContain("secret");
    expect((caught as Error).message).not.toContain(raw);
  });
});

describe("admin backup runtime wiring", () => {
  it("ships the backup script and PostgreSQL client in the runtime image", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toMatch(/apt-get install[^\\n]*bash postgresql-client/s);
    expect(dockerfile).toContain("COPY --from=builder /app/scripts/backup.sh ./scripts/backup.sh");
    expect(dockerfile).toMatch(/chmod 0750 \.\/scripts\/backup\.sh/);
  });

  it("uses persistent backup storage in production Compose", () => {
    const compose = read("docker-compose.prod.yml");
    expect(compose).toContain("heavix_backups:/app/backups");
    expect(compose).toMatch(/volumes:\n[\s\S]*^  heavix_backups:\s*$/m);
  });

  it("uses the completion marker emitted by the backup script and keeps HTTP errors generic", () => {
    const route = read("src/app/api/admin/backup/route.ts");
    const script = read("scripts/backup.sh");

    expect(script).toContain('echo "Backup complete: $BACKUP_DIR"');
    expect(route).toContain(/Backup complete:\\s+\\.\/backups\//.source);
    expect(route).toContain("Backup failed; no successful paired backup was confirmed.");
    expect(route).not.toContain("stdout,");
    expect(route).not.toContain("stderr,");
  });

  it("checks backup permission before spawning the backup process", () => {
    const route = read("src/app/api/admin/backup/route.ts");
    const permissionCheck = route.indexOf('await requirePermission(user.id, "backup.manage")');
    const processSpawn = route.indexOf('execFileAsync("bash", [scriptPath]');

    expect(permissionCheck).toBeGreaterThan(-1);
    expect(processSpawn).toBeGreaterThan(permissionCheck);
  });
});
