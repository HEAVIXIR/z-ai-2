import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  deleteAsset: vi.fn(),
  getAsset: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/media-service", () => ({
  deleteAsset: mocks.deleteAsset,
  getAsset: mocks.getAsset,
}));

import { DELETE } from "@/app/api/admin/media/[id]/route";

describe("DELETE /api/admin/media/[id] audit ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue([{ id: "admin-1" }, null]);
    mocks.deleteAsset.mockResolvedValue({ ok: true });
  });

  it("delegates deletion and does not duplicate the service-owned audit event", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/media/asset-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "asset-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.manage");
    expect(mocks.deleteAsset).toHaveBeenCalledWith("asset-1", "admin-1");

    const source = readFileSync(
      "src/app/api/admin/media/[id]/route.ts",
      "utf8",
    );
    expect(source).not.toContain("logAudit");
  });
});
