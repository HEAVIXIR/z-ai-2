import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  deleteAsset: vi.fn(),
  getAsset: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/media-service", () => ({
  deleteAsset: mocks.deleteAsset,
  getAsset: mocks.getAsset,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

import { DELETE } from "@/app/api/admin/media/[id]/route";

describe("DELETE /api/admin/media/[id] audit ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue([{ id: "admin-1" }, null]);
    mocks.deleteAsset.mockImplementation(async () => {
      await mocks.logAudit({
        action: "media.delete",
        entityId: "asset-1",
      });
      return { ok: true };
    });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("does not duplicate the media service's delete audit event", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/media/asset-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "asset-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.manage");
    expect(mocks.deleteAsset).toHaveBeenCalledWith("asset-1", "admin-1");
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: "media.delete",
      entityId: "asset-1",
    });
  });

  it("does not invoke storage or audit when media.manage is denied", async () => {
    mocks.requireAdmin.mockResolvedValue([
      null,
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    ]);

    const response = await DELETE(
      new Request("http://localhost/api/admin/media/asset-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "asset-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
