import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkCsrf: vi.fn(),
  getCurrentUserId: vi.fn(),
  isAdmin: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  listingUpdate: vi.fn(),
  imageCount: vi.fn(),
  imageCreateMany: vi.fn(),
  imageUpdateMany: vi.fn(),
  getAsset: vi.fn(),
  attachAsset: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      update: mocks.listingUpdate,
    },
    listingImage: {
      count: mocks.imageCount,
      createMany: mocks.imageCreateMany,
      updateMany: mocks.imageUpdateMany,
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(),
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("@/lib/authorization", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/media-service", () => ({
  getAsset: mocks.getAsset,
  attachAsset: mocks.attachAsset,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { PATCH } from "@/app/api/listings/[id]/route";

const listingId = "listing-edit-1";
const userId = "seller-edit-1";
const assetId = "0123456789abcdef01234567";
const stagedAsset = {
  id: assetId,
  url: `/api/media/${assetId}`,
  uploadedBy: userId,
  visibility: "PRIVATE",
  status: "STAGED",
  entityType: "Listing",
  entityId: null,
};

function context() {
  return { params: Promise.resolve({ id: listingId }) };
}

function editRequest() {
  return new Request(`https://heavix.example/api/listings/${listingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addImages: [{ url: stagedAsset.url, isPrimary: true }] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkCsrf.mockReturnValue(true);
  mocks.getCurrentUserId.mockResolvedValue(userId);
  mocks.isAdmin.mockResolvedValue(false);
  mocks.findUnique
    .mockResolvedValueOnce({ id: listingId, sellerId: userId, slug: "existing", title: "Existing" })
    .mockResolvedValueOnce({ id: listingId, sellerId: userId, status: "PUBLISHED", title: "Existing" })
    .mockResolvedValueOnce({ id: listingId, images: [{ url: stagedAsset.url }], price: null });
  mocks.findFirst.mockResolvedValue(null);
  mocks.listingUpdate.mockResolvedValue({});
  mocks.imageCount.mockResolvedValue(0);
  mocks.imageCreateMany.mockResolvedValue({ count: 1 });
  mocks.imageUpdateMany.mockResolvedValue({ count: 1 });
  mocks.getAsset.mockResolvedValue(stagedAsset);
  mocks.attachAsset.mockResolvedValue({ ok: false, error: "storage temporarily unavailable" });
});

describe("PATCH listing media recovery continuity", () => {
  it("retains the listing image manifest and reports pending when attach fails", async () => {
    const response = await PATCH(editRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, mediaStatus: "PENDING", mediaPendingCount: 1 });
    expect(mocks.imageCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ listingId, url: stagedAsset.url, isPrimary: true })],
    });
    expect(mocks.attachAsset).toHaveBeenCalledWith(assetId, "Listing", listingId, userId);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps the staged manifest available when the media service throws", async () => {
    mocks.attachAsset.mockRejectedValue(new Error("temporary storage error"));

    const response = await PATCH(editRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, mediaStatus: "PENDING", mediaPendingCount: 1 });
    expect(mocks.imageCreateMany).toHaveBeenCalledTimes(1);
  });
});
