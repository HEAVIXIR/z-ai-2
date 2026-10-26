import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    readonly statusCode = 403;
  },
  logAudit: vi.fn(),
  trackError: vi.fn(),
  buildBackupEnvironment: vi.fn(),
  execFile: vi.fn(),
  execFileAsync: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/authorization", () => ({
  requirePermission: mocks.requirePermission,
  AuthorizationError: mocks.AuthorizationError,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/error-tracking", () => ({ trackError: mocks.trackError }));
vi.mock("@/lib/backup-config", () => ({
  buildBackupEnvironment: mocks.buildBackupEnvironment,
}));
vi.mock("node:child_process", () => {
  const execFile = mocks.execFile;
  // Preserve Node's promisified execFile result shape ({ stdout, stderr }).
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    configurable: true,
    value: mocks.execFileAsync,
  });
  return { execFile };
});
vi.mock("node:fs/promises", () => ({
  default: { access: mocks.access, stat: mocks.stat },
  access: mocks.access,
  stat: mocks.stat,
}));

import { POST } from "@/app/api/admin/backup/route";

const genericFailure = {
  error: "Backup failed; no successful paired backup was confirmed.",
};

function authenticateAdmin() {
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });
  mocks.requirePermission.mockResolvedValue(undefined);
}

describe("POST /api/admin/backup authorization and failure boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 128 });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.buildBackupEnvironment.mockReturnValue({
      DB_HOST: "main-db",
      DB_PORT: "5432",
      DB_USER: "main-user",
      DB_NAME: "main",
      DB_PASSWORD: "redacted-main-secret",
      STORE_DB_HOST: "store-db",
      STORE_DB_PORT: "5432",
      STORE_DB_USER: "store-user",
      STORE_DB_NAME: "store",
      STORE_DB_PASSWORD: "redacted-store-secret",
    });
  });

  it("denies anonymous callers before permission, filesystem, or process access", async () => {
    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("does not spawn a process when backup.manage permission is denied", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.requirePermission.mockRejectedValue(new mocks.AuthorizationError("Forbidden"));

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("user-1", "backup.manage");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("fails closed when database configuration is missing and does not spawn a process", async () => {
    authenticateAdmin();
    mocks.buildBackupEnvironment.mockImplementation(() => {
      throw new Error("Main database URL is not configured");
    });

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(genericFailure);
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
  });

  it("returns a generic error when the backup script is absent", async () => {
    authenticateAdmin();
    mocks.access.mockRejectedValue(new Error("ENOENT /app/scripts/backup.sh"));

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(genericFailure);
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("/app/");
  });

  it("does not publish success when the script emits a malformed completion marker", async () => {
    authenticateAdmin();
    mocks.execFileAsync.mockResolvedValueOnce({
      stdout: "Backup complete: /private/server/path/main.sql",
      stderr: "sensitive diagnostic",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(genericFailure);
    expect(JSON.stringify(body)).not.toContain("/private/");
    expect(JSON.stringify(body)).not.toContain("sensitive diagnostic");
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each(["Main", "Store"])(
    "returns no success and leaks no process details when the paired backup fails at %s",
    async (database) => {
      authenticateAdmin();
      mocks.execFileAsync.mockRejectedValueOnce(
        new Error(database + " pg_dump failed; password=secret-value"),
      );

      const response = await POST();
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual(genericFailure);
      expect(JSON.stringify(body)).not.toContain("secret-value");
      expect(JSON.stringify(body)).not.toContain("pg_dump");
      expect(mocks.logAudit).not.toHaveBeenCalled();
    },
  );

  it("reports success only after both dumps and checksum validation succeed", async () => {
    authenticateAdmin();
    mocks.execFileAsync
      .mockResolvedValueOnce({
        stdout: "Backup complete: ./backups/20261027_120000\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "main.sql: OK\nstore.sql: OK\n",
        stderr: "",
      });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      backupId: "20261027_120000",
      databases: ["main", "store"],
    });
    expect(mocks.execFileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.stat).toHaveBeenCalledTimes(3);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "ADMIN",
        action: "backup.create",
        entityType: "Database",
      }),
    );
  });
});
