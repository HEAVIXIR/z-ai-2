import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(ROOT, "src/lib/admin/dashboard-snapshot.ts"),
  "utf8",
);

describe("Admin dashboard Worker CPU contract", () => {
  it("uses one bounded PostgreSQL snapshot instead of Prisma query fan-out", () => {
    expect((source.match(/db\.\$queryRaw/g) ?? []).length).toBe(1);
    expect(source).not.toMatch(
      /db\.(?:listing|brand|category|buyRequest|rFQ|listingOffer|featureFlag|aIGatewayLog)\.(?:count|aggregate|findMany)\s*\(/,
    );
    for (const table of [
      '"Listing"',
      '"Brand"',
      '"Category"',
      '"BuyRequest"',
      '"RFQ"',
      '"ListingOffer"',
      '"FeatureFlag"',
      '"AIGatewayLog"',
      '"ListingImage"',
    ]) {
      expect(source).toContain(table);
    }
  });

  it("bounds every recent-activity collection at the SQL layer", () => {
    expect(source).toContain('LIMIT 6');
    expect(source.match(/LIMIT 5/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves the existing dashboard data contract", () => {
    for (const key of [
      "totalListings",
      "publishedListings",
      "featuredListings",
      "totalBrands",
      "totalCategories",
      "totalViews",
      "recentListings",
      "recentRequests",
      "recentRFQs",
      "recentOffers",
      "featureFlags",
      "aiStats",
      "aiSuccess",
      "aiFailed",
      "catalogIssues",
    ]) {
      expect(source).toContain(key);
    }
  });
});
