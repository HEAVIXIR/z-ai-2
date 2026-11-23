import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  user: { id: "admin-1" } as { id: string } | null,
  requirePermission: vi.fn(),
  checkCsrf: vi.fn(),
  categoryFindUnique: vi.fn(),
  brandFindFirst: vi.fn(),
  partFindUnique: vi.fn(),
  partCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/authorization", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/store-db", () => ({
  storeDb: {
    category: { findUnique: mocks.categoryFindUnique },
    brand: { findFirst: mocks.brandFindFirst },
    part: { findUnique: mocks.partFindUnique, create: mocks.partCreate },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { POST } from "@/app/api/admin/store/parts/route";

const validPart = {
  name: "Hydraulic Filter",
  nameFa: "فیلتر هیدرولیک",
  sku: "HF-001",
  categoryId: "category-1",
  brandId: "brand-1",
  description: "Industrial hydraulic filter",
  priceUsd: 25.5,
  stock: 4,
  lowStockThreshold: 2,
  contactForPrice: false,
};

function request(body: unknown) {
  return new Request("http://localhost/api/admin/store/parts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

describe("manual Store part creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "admin-1" };
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.checkCsrf.mockReturnValue(true);
    mocks.categoryFindUnique.mockResolvedValue({ id: "category-1", name: "Filters", slug: "filters" });
    mocks.brandFindFirst.mockResolvedValue({ id: "brand-1" });
    mocks.partFindUnique.mockResolvedValue(null);
    mocks.partCreate.mockImplementation(async ({ data, include }: any) => ({
      id: "part-1",
      ...data,
      views: 0,
      soldCount: 0,
      createdAt: new Date("2026-11-23T00:00:00.000Z"),
      updatedAt: new Date("2026-11-23T00:00:00.000Z"),
      category: include?.category ? { id: "category-1", name: "Filters", slug: "filters" } : null,
      brand: include?.brand ? { id: "brand-1", name: "Brand", slug: "brand" } : null,
    }));
    mocks.audit.mockResolvedValue(undefined);
  });

  it("creates a part without a source URL or any AI provider dependency", async () => {
    const response = await POST(request(validPart));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { id: "part-1", sku: "HF-001", sourceUrl: null, active: true },
    });
    expect(mocks.partCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceUrl: null,
        images: "[]",
        compatibleCars: "[]",
        priceUsd: 25.5,
      }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "admin-1",
      action: "store.part.create",
      entityType: "Part",
      entityId: "part-1",
    }));
  });

  it("supports contact-for-price manual entry without a numeric price", async () => {
    const response = await POST(request({
      ...validPart,
      brandId: null,
      priceUsd: undefined,
      contactForPrice: true,
    }));
    expect(response.status).toBe(201);
    expect(mocks.partCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ priceUsd: 0, contactForPrice: true, brandId: null }),
    }));
  });

  it("rejects invalid category or inactive/missing brand before creating", async () => {
    mocks.categoryFindUnique.mockResolvedValueOnce(null);
    const categoryResponse = await POST(request(validPart));
    expect(categoryResponse.status).toBe(400);
    expect(mocks.partCreate).not.toHaveBeenCalled();

    mocks.categoryFindUnique.mockResolvedValue({ id: "category-1" });
    mocks.brandFindFirst.mockResolvedValueOnce(null);
    const brandResponse = await POST(request(validPart));
    expect(brandResponse.status).toBe(400);
    expect(mocks.partCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed numeric values and oversized bodies before writes", async () => {
    const invalidStock = await POST(request({ ...validPart, stock: -1 }));
    expect(invalidStock.status).toBe(400);
    expect(mocks.partCreate).not.toHaveBeenCalled();

    const largeBody = {
      ...validPart,
      description: "x".repeat(600 * 1024),
    };
    const oversized = await POST(request(largeBody));
    expect(oversized.status).toBe(413);
    expect(mocks.partCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate SKU and invalid source URLs", async () => {
    mocks.partFindUnique.mockResolvedValueOnce({ id: "existing-part" });
    const duplicate = await POST(request(validPart));
    expect(duplicate.status).toBe(409);

    mocks.partFindUnique.mockResolvedValue(null);
    const invalidUrl = await POST(request({ ...validPart, sourceUrl: "javascript:alert(1)" }));
    expect(invalidUrl.status).toBe(400);
    expect(mocks.partCreate).not.toHaveBeenCalled();
  });

  it("enforces store.manage and CSRF before reading or writing data", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("forbidden"));
    const forbidden = await POST(request(validPart));
    expect(forbidden.status).toBe(403);
    expect(mocks.categoryFindUnique).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.checkCsrf.mockReturnValueOnce(false);
    const csrfRejected = await POST(request(validPart));
    expect(csrfRejected.status).toBe(403);
    expect(mocks.categoryFindUnique).not.toHaveBeenCalled();
  });

  it("keeps the manual route independent of paid AI gateways", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/admin/store/parts/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/preflightAIRequest|getAIProvider|recordAICost|z-ai-web-dev-sdk/);
    expect(source).toContain("readBoundedJson");
  });
});
