import { describe, expect, it } from "vitest";
import { getAdminDashboardSnapshot } from "@/lib/admin/dashboard-snapshot";

const HAS_POSTGRES =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

describe.skipIf(!HAS_POSTGRES)("Admin dashboard PostgreSQL snapshot", () => {
  it("executes the single-query snapshot against the real test schema", async () => {
    const snapshot = await getAdminDashboardSnapshot();

    expect(snapshot.totalListings).toEqual(expect.any(Number));
    expect(snapshot.publishedListings).toEqual(expect.any(Number));
    expect(snapshot.featuredListings).toEqual(expect.any(Number));
    expect(snapshot.totalBrands).toEqual(expect.any(Number));
    expect(snapshot.totalCategories).toEqual(expect.any(Number));
    expect(snapshot.totalViews._sum.viewCount).toEqual(expect.any(Number));

    expect(Array.isArray(snapshot.recentListings)).toBe(true);
    expect(Array.isArray(snapshot.recentRequests)).toBe(true);
    expect(Array.isArray(snapshot.recentRFQs)).toBe(true);
    expect(Array.isArray(snapshot.recentOffers)).toBe(true);
    expect(Array.isArray(snapshot.featureFlags)).toBe(true);
    expect(Array.isArray(snapshot.catalogIssues)).toBe(true);
    expect(snapshot.catalogIssues).toHaveLength(5);

    expect(snapshot.aiStats._count).toEqual(expect.any(Number));
    expect(snapshot.aiSuccess).toEqual(expect.any(Number));
    expect(snapshot.aiFailed).toEqual(expect.any(Number));

    for (const offer of snapshot.recentOffers) {
      expect(typeof offer.offerAmount).toBe("bigint");
    }
  });
});
