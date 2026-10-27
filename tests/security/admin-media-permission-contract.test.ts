import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listAssets: vi.fn(),
  uploadAsset: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
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

  it("keeps media.upload required for upload attempts", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/media", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.upload");
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });
  it("rejects oversized declared bodies before multipart parsing", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        "content-length": String(MAX_UPLOAD_BYTES + 256 * 1024 + 1),
      }),
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects oversized files before allocating an ArrayBuffer", async () => {
    const file = new File(
      [new Uint8Array(MAX_UPLOAD_BYTES + 1)],
      "oversized.jpg",
      { type: "image/jpeg" },
    );
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const formData = {
      get: (name: string) => (name === "file" ? file : null),
    } as FormData;
    const request = {
      headers: new Headers(),
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

});
