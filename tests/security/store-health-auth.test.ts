import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  requirePermission,
  queryRaw,
  countParts,
  countBrands,
  countCategories,
  countOrders,
  getStoreMonitoringStatus,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  queryRaw: vi.fn(),
  countParts: vi.fn(),
  countBrands: vi.fn(),
  countCategories: vi.fn(),
  countOrders: vi.fn(),
  getStoreMonitoringStatus: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ requirePermission }));
vi.mock("@/lib/store-db", () => ({
  storeDb: {
    $queryRaw: queryRaw,
    part: { count: countParts },
    brand: { count: countBrands },
    category: { count: countCategories },
    order: { count: countOrders },
  },
}));
vi.mock("@/lib/admin/store-monitoring-registry", () => ({
  getStoreMonitoringStatus,
}));

import { GET } from "@/app/api/admin/store/health/route";

describe("GET /api/admin/store/health — RBAC boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue(1);
    countParts.mockResolvedValue(10);
    countBrands.mockResolvedValue(4);
    countCategories.mockResolvedValue(8);
    countOrders.mockResolvedValue(3);
    getStoreMonitoringStatus.mockResolvedValue([]);
  });

  it("rejects unauthenticated requests before touching the Store DB", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("requires store.read permission", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    requirePermission.mockRejectedValue(new Error("forbidden"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns Store health metrics only after the permission check", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1" });
    requirePermission.mockResolvedValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("admin-1", "store.read");
    expect(queryRaw).toHaveBeenCalled();
    expect(body).toMatchObject({
      status: "ok",
      db: "connected",
      stats: { parts: 10, brands: 4, categories: 8, orders: 3 },
    });
  });
});
