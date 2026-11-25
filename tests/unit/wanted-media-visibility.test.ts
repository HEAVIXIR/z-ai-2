import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  createB2MediaReadUrl: vi.fn(),
  getCurrentUser: vi.fn(),
  can: vi.fn(),
  buyRequestFindUnique: vi.fn(),
  listingImageFindFirst: vi.fn(),
}));

vi.mock("@/lib/media-service", () => ({ getAsset: mocks.getAsset }));
vi.mock("@/lib/b2-media-storage", () => ({
  createB2MediaReadUrl: mocks.createB2MediaReadUrl,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ can: mocks.can }));
vi.mock("@/lib/db", () => ({
  db: {
    buyRequest: { findUnique: mocks.buyRequestFindUnique },
    listingImage: { findFirst: mocks.listingImageFindFirst },
  },
}));

import { GET } from "@/app/api/media/[id]/route";

const assetId = "0123456789abcdef01234567";
const requestId = "wanted-123";
const owner = { id: "buyer-1" };
const asset = {
  id: assetId,
  url: `/api/media/${assetId}`,
  relativePath: "heavix-media/staging/buyer-1/asset.webp",
  uploadedBy: owner.id,
  entityType: "BuyRequest",
  entityId: requestId,
  status: "ATTACHED",
  visibility: "PRIVATE",
};

function context() {
  return { params: Promise.resolve({ id: assetId }) };
}

function request() {
  return new Request(`https://heavix.example/api/media/${assetId}`);
}

async function readMedia() {
  return GET(request(), context());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAsset.mockResolvedValue(asset);
  mocks.createB2MediaReadUrl.mockResolvedValue("https://b2.example/signed-image");
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.can.mockResolvedValue(false);
  mocks.buyRequestFindUnique.mockResolvedValue({
    userId: owner.id,
    status: "ACTIVE",
    publishedAt: new Date(Date.now() - 60_000),
    expiresAt: null,
  });
});

describe("BuyRequest media public visibility gate", () => {
  it("publishes an attached image only for an active, published, unexpired request", async () => {
    const response = await readMedia();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://b2.example/signed-image");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.createB2MediaReadUrl).toHaveBeenCalledWith(asset.relativePath, 60);
    expect(mocks.buyRequestFindUnique).toHaveBeenCalledWith({
      where: { id: requestId },
      select: { userId: true, status: true, publishedAt: true, expiresAt: true },
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it.each([
    ["pending moderation", { status: "PENDING" }],
    ["active but not yet published", { status: "ACTIVE", publishedAt: null }],
    ["scheduled for the future", { status: "ACTIVE", publishedAt: new Date(Date.now() + 60_000) }],
    ["expired", { status: "ACTIVE", expiresAt: new Date(Date.now() - 60_000) }],
  ])("keeps media private when the request is %s", async (_label, patch) => {
    mocks.buyRequestFindUnique.mockResolvedValue({
      userId: owner.id,
      status: "ACTIVE",
      publishedAt: new Date(Date.now() - 60_000),
      expiresAt: null,
      ...patch,
    });

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("does not let a PUBLIC sidecar flag bypass BuyRequest moderation", async () => {
    mocks.getAsset.mockResolvedValue({ ...asset, visibility: "PUBLIC" });
    mocks.buyRequestFindUnique.mockResolvedValue({
      userId: owner.id,
      status: "PENDING",
      publishedAt: null,
      expiresAt: null,
    });

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("allows request.read reviewers to inspect attached pending BuyRequest media privately", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    mocks.can.mockImplementation(async (_userId: string, permission: string) => permission === "request.read");
    mocks.buyRequestFindUnique.mockResolvedValue({
      userId: owner.id,
      status: "PENDING",
      publishedAt: null,
      expiresAt: null,
    });

    const response = await readMedia();

    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.can).toHaveBeenCalledWith("reviewer-1", "request.read");
  });

  it("allows the owner to read their own pending request media privately", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);
    mocks.buyRequestFindUnique.mockResolvedValue({
      userId: owner.id,
      status: "PENDING",
      publishedAt: null,
      expiresAt: null,
    });

    const response = await readMedia();

    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("denies a signed-in non-owner without request.read or media.read", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "unprivileged-1" });
    mocks.can.mockResolvedValue(false);
    mocks.buyRequestFindUnique.mockResolvedValue({
      userId: owner.id,
      status: "PENDING",
      publishedAt: null,
      expiresAt: null,
    });

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
    expect(mocks.can).toHaveBeenCalledWith("unprivileged-1", "request.read");
    expect(mocks.can).toHaveBeenCalledWith("unprivileged-1", "media.read");
  });

  it("does not let request.read reviewers inspect unassociated staged uploads", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    mocks.can.mockImplementation(async (_userId: string, permission: string) => permission === "request.read");
    mocks.getAsset.mockResolvedValue({
      ...asset,
      status: "STAGED",
      entityId: null,
    });

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.buyRequestFindUnique).not.toHaveBeenCalled();
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("does not let request.read reviewers inspect media whose BuyRequest row is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    mocks.can.mockImplementation(async (_userId: string, permission: string) => permission === "request.read");
    mocks.buyRequestFindUnique.mockResolvedValue(null);

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });

  it("never exposes an unassociated staged BuyRequest asset", async () => {
    mocks.getAsset.mockResolvedValue({
      ...asset,
      status: "STAGED",
      entityId: null,
      visibility: "PUBLIC",
    });

    const response = await readMedia();

    expect(response.status).toBe(404);
    expect(mocks.buyRequestFindUnique).not.toHaveBeenCalled();
    expect(mocks.createB2MediaReadUrl).not.toHaveBeenCalled();
  });
});
