import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "admin-1" } as { id: string } | null,
  requirePermission: vi.fn(),
  checkCsrf: vi.fn(),
  enforceRateLimit: vi.fn(),
  uploadAsset: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/authorization", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/rate-limit-check", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/rate-limit-presets", () => ({ UPLOAD: { limit: 10, windowMs: 60000 } }));
vi.mock("@/lib/media-service", () => ({ uploadAsset: mocks.uploadAsset }));

import { POST } from "@/app/api/admin/store/parts/media/route";

function request(file?: File) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("https://heavix.example/api/admin/store/parts/media", {
    method: "POST",
    headers: { Origin: "https://heavix.example" },
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "admin-1" };
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.checkCsrf.mockReturnValue(true);
  mocks.enforceRateLimit.mockReturnValue({ ok: true });
  mocks.uploadAsset.mockResolvedValue({
    ok: true,
    asset: {
      id: "0123456789abcdef01234567",
      url: "/api/media/0123456789abcdef01234567",
      size: 1200,
    },
  });
});

describe("Store Part B2 staging upload security", () => {
  it("requires an authenticated Store manager before reading the file", async () => {
    mocks.user = null;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("requires store.manage and CSRF before storing a private Part asset", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("forbidden"));
    const denied = await POST(request(new File(["image"], "part.jpg", { type: "image/jpeg" })));
    expect(denied.status).toBe(403);
    expect(mocks.uploadAsset).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.checkCsrf.mockReturnValueOnce(false);
    const csrf = await POST(request(new File(["image"], "part.jpg", { type: "image/jpeg" })));
    expect(csrf.status).toBe(403);
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("stores the upload as a private Part staging asset and returns a stable URL", async () => {
    const response = await POST(request(new File(["image"], "part.jpg", { type: "image/jpeg" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      assetId: "0123456789abcdef01234567",
      url: "/api/media/0123456789abcdef01234567",
    });
    expect(mocks.uploadAsset).toHaveBeenCalledWith(expect.objectContaining({
      uploadedBy: "admin-1",
      actorType: "ADMIN",
      entityType: "Part",
      visibility: "PRIVATE",
    }));
  });

  it("rejects a file larger than the shared upload security limit", async () => {
    const large = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
    const response = await POST(request(large));
    expect(response.status).toBe(413);
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });
});
