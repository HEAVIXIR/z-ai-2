import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadAsset: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/media-service", () => ({
  uploadAsset: mocks.uploadAsset,
}));

import { POST } from "@/app/api/admin/upload/route";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

const MAX_ADMIN_UPLOAD_BYTES = Math.min(MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
const MAX_UPLOAD_REQUEST_BYTES = MAX_ADMIN_UPLOAD_BYTES + 256 * 1024;

describe("POST /api/admin/upload compatibility contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue([{ id: "admin-1" }, null]);
    mocks.uploadAsset.mockResolvedValue({
      ok: true,
      asset: { id: "asset-1", url: "/uploads/2026/10/opaque.jpg" },
    });
  });

  it("denies unauthorized requests before multipart parsing or storage", async () => {
    mocks.requireAdmin.mockResolvedValue([
      null,
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    ]);
    const formData = vi.fn();
    const request = {
      headers: new Headers(),
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects oversized declared bodies before multipart parsing", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1),
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
      [new Uint8Array(MAX_ADMIN_UPLOAD_BYTES + 1)],
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

  it("returns the top-level url contract used by existing MediaUploader consumers", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "image.jpg", {
      type: "image/jpeg",
    });
    const formData = {
      get: (name: string) => {
        if (name === "file") return file;
        if (name === "altText") return "test image";
        return null;
      },
    } as FormData;
    const request = {
      headers: new Headers(),
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      url: "/uploads/2026/10/opaque.jpg",
    });
    expect(mocks.requireAdmin).toHaveBeenCalledWith("media.upload");
    expect(mocks.uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadedBy: "admin-1",
        originalFilename: "image.jpg",
        altText: "test image",
      }),
    );
  });

  it("does not claim success when the canonical media service rejects the file", async () => {
    mocks.uploadAsset.mockResolvedValue({
      ok: false,
      error: "فرمت فایل پشتیبانی نمی‌شود.",
    });
    const file = new File([new Uint8Array([1, 2, 3])], "invalid.jpg");
    const formData = {
      get: (name: string) => (name === "file" ? file : null),
    } as FormData;
    const request = {
      headers: new Headers(),
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.uploadAsset).toHaveBeenCalledTimes(1);
  });
});
