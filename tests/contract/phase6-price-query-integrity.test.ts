import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function exportedFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`Missing exported function: ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("Phase 6 price observation query integrity", () => {
  const adminPage = readRepoFile("src/app/admin/price-intelligence/page.tsx");
  const historyEngine = readRepoFile("src/lib/price-history-engine.ts");

  it("uses the canonical PriceObservation filters for admin aggregation", () => {
    const groupByStart = adminPage.indexOf("const allStats = await db.priceObservation.groupBy({");
    const groupByEnd = adminPage.indexOf("// Hydrate category + brand names", groupByStart);
    expect(groupByStart).toBeGreaterThanOrEqual(0);
    expect(groupByEnd).toBeGreaterThan(groupByStart);
    const groupByBlock = adminPage.slice(groupByStart, groupByEnd);

    expect(groupByBlock).toContain("where: priceWhere");
    expect(groupByBlock).not.toMatch(/\byear\s*:\s*yearFilter/);
    expect(adminPage).toContain('status: "ACTIVE"');
    expect(adminPage).toContain("askingPrice: { not: null }");
    expect(adminPage).toContain("priceWhere.listing = { year: yearFilter }");
  });

  it.each(["getPriceStats", "getPriceHistory", "getPriceSuggestions", "detectOutliers"])(
    "%s excludes inactive and price-less observations",
    (name) => {
      const block = exportedFunction(historyEngine, name);
      expect(block).toContain('status: "ACTIVE"');
      expect(block).toContain("askingPrice: { not: null }");
    },
  );

  it("does not double-count a listing already represented by an observation", () => {
    const history = exportedFunction(historyEngine, "getPriceHistory");
    expect(history).toContain("observedListingIds");
    expect(history).toContain("id: { notIn: [...observedListingIds] }");
    expect(history).toContain("if (params.productId) listingWhere.productId = params.productId;");
    expect(history).toContain('orderBy: { observedAt: "desc" }');
    expect(history).toContain('orderBy: { createdAt: "desc" }');
  });
});
