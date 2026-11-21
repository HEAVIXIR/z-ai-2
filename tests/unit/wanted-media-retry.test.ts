import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkCsrf: vi.fn(),
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  getAsset: vi.fn(),
  attachAsset: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { buyRequest: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/media-service", () => ({
  getAsset: mocks.getAsset,
  attachAsset: mocks.attachAsset,
}));

import { POST } from "@/app/api/wanted/[id]/media/route";

const requestId = "wanted-123";
const assetId = "0123456789abcdef01234567";
const user = { id: "buyer-1" };
const stagedAsset = {
  id: assetId,
  url: `/api/media/${assetId}`,
  uploadedBy: user.id,
  entityType: "BuyRequest",
  entityId: null,
  status: "STAGED",
  visibility: "PRIVATE",
  relativePath: "heavix-media/staging/2026/11/asset.webp",
};

function request() {
  return new Request(`https://heavix.example/api/wanted/${requestId}/media`, {
    method: "POST",
    headers: { Origin: "https://heavix.example" },
  });
}

function context(id = requestId) {
  return { params: Promise.resolve({ id }) };
}

function wanted(images = [{ assetId, url: `/api/media/${assetId}` }]) {
  return { id: requestId, userId: user.id, images };
}

async function body(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkCsrf.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.findUnique.mockResolvedValue(wanted());
  mocks.getAsset.mockResolvedValue(stagedAsset);
  mocks.attachAsset.mockResolvedValue({ ok: true });
});

describe("POST /api/wanted/[id]/media recovery", () => {
  it("rejects CSRF before authentication or database access", async () => {
    mocks.checkCsrf.mockReturnValue(false);
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects anonymous callers", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing request", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.getAsset).not.toHaveBeenCalled();
  });

  it("prevents another buyer from attaching the request media", async () => {
    mocks.findUnique.mockResolvedValue({ ...wanted(), userId: "buyer-2" });
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("attaches only the owner's private staged assets from the persisted manifest", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      ok: true,
      attachedCount: 1,
      pendingCount: 0,
      mediaStatus: "ATTACHED",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        images: {
          select: { assetId: true, url: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    expect(mocks.getAsset).toHaveBeenCalledWith(assetId);
    expect(mocks.attachAsset).toHaveBeenCalledWith(assetId, "BuyRequest", requestId, user.id);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("treats an asset already attached to this exact request as success", async () => {
    mocks.getAsset.mockResolvedValue({ ...stagedAsset, status: "ATTACHED", entityId: requestId });
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ attachedCount: 1, pendingCount: 0 });
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["another owner's asset", { ...stagedAsset, uploadedBy: "buyer-2" }],
    ["another entity type", { ...stagedAsset, entityType: "Listing" }],
    ["a public staged asset", { ...stagedAsset, visibility: "PUBLIC" }],
    ["an asset already associated elsewhere", { ...stagedAsset, entityId: "wanted-other" }],
    ["an invalid lifecycle state", { ...stagedAsset, status: "DELETED" }],
    ["an asset attached to another request", { ...stagedAsset, status: "ATTACHED", entityId: "wanted-other" }],
  ])("leaves %s pending without rebinding it", async (_label, asset) => {
    mocks.getAsset.mockResolvedValue(asset);
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    expect(await body(response)).toMatchObject({ ok: false, attachedCount: 0, pendingCount: 1 });
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("rejects a manifest URL that does not match its persisted asset id", async () => {
    mocks.findUnique.mockResolvedValue(wanted([{ assetId, url: "/api/media/abcdefabcdefabcdefabcdef" }]));
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("continues safely when a sidecar read or attach fails", async () => {
    mocks.getAsset.mockRejectedValue(new Error("B2 unavailable"));
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    expect(await body(response)).toMatchObject({ pendingCount: 1, mediaStatus: "PENDING" });
  });

  it("returns a generic error when the durable manifest query fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database details"));
    const response = await POST(request(), context());
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({
      error: "بازیابی تصاویر درخواست در حال حاضر کامل نشد.",
    });
  });
});
