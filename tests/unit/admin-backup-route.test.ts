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
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("node:fs/promises", () => ({
  default: { access: mocks.access, stat: mocks.stat },
  access: mocks.access,
  stat: mocks.stat,
}));

import { POST } from "@/app/api/admin/backup/route";

describe("POST /api/admin/backup authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requirePermission.mockResolvedValue(undefined);
  });

  it("denies anonymous callers before permission, filesystem, or process access", async () => {
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("does not spawn a process when backup.manage permission is denied", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.requirePermission.mockRejectedValue(new mocks.AuthorizationError("Forbidden"));

    const response = await POST();
    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("user-1", "backup.manage");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });
});
