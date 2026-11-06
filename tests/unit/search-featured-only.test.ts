import { beforeEach, describe, expect, it, vi } from "vitest";

const { count, findMany } = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      count,
      findMany,
    },
  },
}));

import { searchListings } from "@/lib/search";

describe("searchListings featured-only filtering", () => {
  beforeEach(() => {
    count.mockReset().mockResolvedValue(0);
    findMany.mockReset().mockResolvedValue([]);
  });

  it("restricts both count and result queries to published featured listings", async () => {
    await searchListings({ featuredOnly: true, limit: 8 });

    const expectedWhere = { status: "PUBLISHED", featured: true };
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, take: 8 }),
    );
  });

  it("keeps the normal published-listing contract when featuredOnly is not requested", async () => {
    await searchListings({ limit: 8 });

    const expectedWhere = { status: "PUBLISHED" };
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, take: 8 }),
    );
  });
});
