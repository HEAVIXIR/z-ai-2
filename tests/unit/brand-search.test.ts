import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    brand: { findMany },
  },
}));

import { searchBrands } from "@/lib/search";

describe("searchBrands global catalog contract", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
  });

  it("does not scope canonical brand discovery to the selected category", async () => {
    await searchBrands("Komatsu", { take: 20, categoryId: "category-that-does-not-exist" });

    const args = findMany.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    expect(args.where).not.toHaveProperty("categories");
    expect(args.where).not.toHaveProperty("categoryId");
    expect(args.where.active).toBe(true);
    expect(args.where.status).toBe("ACTIVE");
  });

  it("matches English brand names case-insensitively", async () => {
    await searchBrands("komatsu");

    const clauses = findMany.mock.calls[0]?.[0]?.where?.OR ?? [];
    expect(clauses).toContainEqual({
      nameEn: { contains: "komatsu", mode: "insensitive" },
    });
  });
});
