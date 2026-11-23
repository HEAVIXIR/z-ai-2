import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getCurrentUser: vi.fn(),
  can: vi.fn(),
  partFindUnique: vi.fn(),
  partFindFirst: vi.fn(),
  listingFindFirst: vi.fn(),
  buyRequestFindUnique: vi.fn(),
  createB2MediaReadUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listingImage: { findFirst: mocks.listingFindFirst },
    buyRequest: { findUnique: mocks.buyRequestFindUnique },
  },
}));
vi.mock("@/lib/store-db", () => ({
  storeDb: { part: { findUnique: mocks.partFindUnique, findFirst: mocks.partFindFirst } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ can: mocks.can }));
vi.mock("@/lib/media-service", () => ({ getAsset: mocks.getAsset }));
vi.mock("@/lib/b2-media-storage", () => ({ createB2MediaReadUrl: mocks.createB2MediaReadUrl }));

import { GET } from "@/app/api/media/[id]/route";

const assetId = "0123456789abcdef01234567";
const assetUrl = "/api/media/" + assetId;
const asset = {
  id: assetId,
  url: assetUrl,
  relativePath: "heavix-media/objects/2026/11/" + assetId + ".webp",
  entityType: "Part",
  entityId: "part-1",
  status: "ATTACHED",
  visibility: "PRIVATE",
  uploadedBy: "admin-uploader",
};

function request() {
  return new Request("https://heavix.example" + assetUrl);
}

function context() {
  return { params: Promise.resolve({ id: assetId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAsset.mockResolvedValue(asset);
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.can.mockResolvedValue(false);
  mocks.partFindUnique.mockResolvedValue({ active: true, images: JSON.stringify([assetUrl]) });
  mocks.partFindFirst.mockResolvedValue(null);
  mocks.listingFindFirst.mockResolvedValue(null);
  mocks.buyRequestFindUnique.mockResolvedValue(null);
  mocks.createB2MediaReadUrl.mockResolvedValue("https://b2.example/signed-read");
});

describe("Store Part media public-read lifecycle", () => {
  it("serves an attached image publicly only when the active Part references it", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://b2.example/signed-read");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60");
    expect(mocks.partFindUnique).toHaveBeenCalledWith({
      where: { id: "part-1" },
      select: { active: true, images: true },
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("keeps images of inactive Parts private but available to store.read administrators", async () => {
    mocks.partFindUnique.mockResolvedValue({ active: false, images: JSON.stringify([assetUrl]) });
    mocks.getCurrentUser.mockResolvedValue({ id: "store-admin" });
    mocks.can.mockImplementation(async (_userId: string, permission: string) => permission === "store.read");

    const response = await GET(request(), context());
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not expose an attached Part asset that the Part no longer references", async () => {
    mocks.partFindUnique.mockResolvedValue({ active: true, images: "[]" });

    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("does not expose staged media by guessing a Part entity ID", async () => {
    mocks.getAsset.mockResolvedValue({
      ...asset,
      entityId: null,
      status: "STAGED",
      relativePath: "heavix-media/staging/admin-uploader/" + assetId + ".webp",
    });
    mocks.partFindUnique.mockResolvedValue(null);

    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("preserves legacy public Part images only when an active Part still references them", async () => {
    mocks.getAsset.mockResolvedValue({
      ...asset,
      status: "ACTIVE",
      visibility: "PUBLIC",
      entityId: null,
    });
    mocks.partFindFirst.mockResolvedValue({ id: "part-legacy", active: true });

    const response = await GET(request(), context());
    expect(response.status).toBe(302);
    expect(mocks.partFindFirst).toHaveBeenCalledWith({
      where: { images: { contains: assetUrl } },
      select: { id: true, active: true },
    });
  });
});
