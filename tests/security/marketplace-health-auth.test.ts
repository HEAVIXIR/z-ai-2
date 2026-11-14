import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  requirePermission,
  queryRaw,
  countListings,
  countProducts,
  countOffers,
  countBids,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  queryRaw: vi.fn(),
  countListings: vi.fn(),
  countProducts: vi.fn(),
  countOffers: vi.fn(),
  countBids: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: queryRaw,
    listing: { count: countListings },
    product: { count: countProducts },
    listingOffer: { count: countOffers },
    auctionBid: { count: countBids },
  },
}));

import { GET } from "@/app/api/admin/marketplace/health/route";

describe("GET /api/admin/marketplace/health — RBAC boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue(1);
    countListings.mockResolvedValue(100);
    countProducts.mockResolvedValue(30);
    countOffers.mockResolvedValue(4);
    countBids.mockResolvedValue(2);
  });

  it("rejects unauthenticated requests before querying the database", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("requires analytics.read permission", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    requirePermission.mockRejectedValue(new Error("forbidden"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns marketplace metrics only after authorization", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1" });
    requirePermission.mockResolvedValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("admin-1", "analytics.read");
    expect(body.stats).toEqual({ listings: 100, products: 30, offers: 4, bids: 2 });
  });
});
