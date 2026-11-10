import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, findCustomer, getStoreUserWithRole } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findCustomer: vi.fn(),
  getStoreUserWithRole: vi.fn(),
}));

vi.mock("@/lib/store-db", () => ({
  storeDb: {
    order: { findMany },
    customer: { findUnique: findCustomer },
  },
}));
vi.mock("@/lib/store-auth", () => ({ getStoreUserWithRole }));
vi.mock("@/lib/store-currency", () => ({
  getEffectiveRate: vi.fn(),
  usdToIrr: vi.fn(),
}));
vi.mock("@/lib/csrf", () => ({ checkCsrf: vi.fn(() => true) }));

import { GET } from "@/app/api/store/orders/route";

describe("GET /api/store/orders — userId authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it("rejects unauthenticated userId lookups before querying the database", async () => {
    getStoreUserWithRole.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/store/orders?userId=victim-user"),
    );

    expect(response.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user requesting another user's orders", async () => {
    getStoreUserWithRole.mockResolvedValue({
      id: "user-a",
      mobile: "09120000000",
      isAdmin: false,
    });

    const response = await GET(
      new Request("http://localhost/api/store/orders?userId=user-b"),
    );

    expect(response.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("allows a signed-in user to query only their own orders", async () => {
    getStoreUserWithRole.mockResolvedValue({
      id: "user-a",
      mobile: "09120000000",
      isAdmin: false,
    });

    const response = await GET(
      new Request("http://localhost/api/store/orders?userId=user-a"),
    );

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" } }),
    );
  });

  it("keeps the explicit admin all-orders path", async () => {
    getStoreUserWithRole.mockResolvedValue({
      id: "admin-1",
      mobile: "09120000001",
      isAdmin: true,
    });

    const response = await GET(
      new Request("http://localhost/api/store/orders?userId=victim-user"),
    );

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 200 }),
    );
  });
  it("rejects guest phone-only order enumeration", async () => {
    getStoreUserWithRole.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/store/orders?phone=09120000000"),
    );

    expect(response.status).toBe(400);
    expect(findCustomer).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("scopes guest retrieval to one exact order number and phone", async () => {
    getStoreUserWithRole.mockResolvedValue(null);
    findCustomer.mockResolvedValue({ id: "customer-1" });

    const response = await GET(
      new Request("http://localhost/api/store/orders?phone=09120000000&orderNumber=hv-abc123xyz"),
    );

    expect(response.status).toBe(200);
    expect(findCustomer).toHaveBeenCalledWith({ where: { phone: "09120000000" } });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "customer-1", orderNumber: "HV-ABC123XYZ" },
        take: 1,
      }),
    );
  });

});
