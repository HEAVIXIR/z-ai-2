import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkCsrf: vi.fn(),
  listAssets: vi.fn(),
  uploadAsset: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrf: mocks.checkCsrf,
}));

vi.mock("@/lib/media-service", () => ({
  listAssets: mocks.listAssets,
  uploadAsset: mocks.uploadAsset,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

import { GET, POST } from "@/app/api/admin/media/route";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

describe("/api/admin/media permission separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkCsrf.mockReturnValue(true);
    mocks.requireAdmin.mockResolvedValue([{ id: "admin-1" }, null]);
    mocks.listAssets.mockResolvedValue([]);
    mocks.uploadAsset.mockResolvedValue({ ok: true, asset: { id: "asset-1" } });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("uses media.read for listing assets", async () => {
    const response = await GET(new Request("http://localhost/api/admin/media"));
    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.read");
    expect(mocks.listAssets).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin upload before authorization or body parsing", async () => {
    mocks.checkCsrf.mockReturnValue(false);
    const response = await POST(new Request("http://localhost/api/admin/media", {
      method: "POST",
      body: new FormData(),
    }));
    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("keeps media.upload required for upload attempts", async () => {
    const response = await POST(new Request("http://localhost/api/admin/media", {
      method: "POST",
      body: new FormData(),
    }));
    expect(response.status).toBe(400);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.upload");
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects oversized declared bodies before multipart parsing", async () => {
    const request = {
      headers: new Headers({
        "content-length": String(MAX_UPLOAD_BYTES + 256 * 1024 + 1),
      }),
    } as unknown as Request;
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects oversized files before allocating an ArrayBuffer", async () => {
    const file = new File(
      [new Uint8Array(MAX_UPLOAD_BYTES + 1)],
      "oversized.jpg",
      { type: "image/jpeg" },
    );
    const arrayBuffer = vi.spyOn(File.prototype, "arrayBuffer");
    const form = new FormData();
    form.set("file", file);
    const request = new Request("http://localhost/api/admin/media", {
      method: "POST",
      body: form,
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
    arrayBuffer.mockRestore();
  });
});
