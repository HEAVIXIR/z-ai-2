import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/lib/ai-matching.ts",
  "src/lib/recommendations.ts",
  "src/lib/market-heatmap.ts",
  "src/lib/opportunity-engine.ts",
  "src/lib/knowledge-graph.ts",
  "src/lib/price-engine.ts",
  "src/lib/price-history-engine.ts",
  "src/lib/ai-operational.ts",
  "src/lib/ai-agents/index.ts",
  "src/lib/matching-engine.ts",
  "src/lib/matching-service.ts",
  "src/lib/demand-engine.ts",
  "src/lib/alert-matcher.ts",
  "src/lib/search.ts",
  "src/app/api/ai-market-analyst/route.ts",
  "src/app/api/ai-price-intelligence/route.ts",
  "src/app/api/ai-price-suggestion/route.ts",
  "src/app/api/products/[slug]/route.ts",
  "src/app/admin/opportunity-radar/page.tsx",
  "src/app/admin/market-intelligence/page.tsx",
  "src/app/api/admin/market-intelligence/route.ts",
  "src/app/api/admin/opportunity-radar/route.ts",
  "src/app/listings/page.tsx",
  "src/app/admin/price-intelligence/page.tsx",
  "src/app/models/[slug]/page.tsx",
  "src/app/companies/[slug]/page.tsx",
  "src/app/brands/page.tsx",
  "src/app/market-insights/page.tsx",
  "src/app/api/brands/featured/route.ts",
  "src/app/api/admin/home/trusted-brands/route.ts",
  "src/app/admin/dashboard/page.tsx",
  "src/app/api/company/partners/route.ts",
  "src/app/admin/companies/[id]/page.tsx",
  "src/app/admin/taxonomy/brands/page.tsx",
  "src/app/api/admin/launch-phases/route.ts",
  "src/lib/site-stats.ts",
];

describe("public listing expiry across derived discovery surfaces", () => {
  it.each(files)("%s uses the canonical public listing visibility predicate", (file) => {
    const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(source).toContain('@/lib/listing-visibility');
    expect(source).not.toMatch(/status:\s*["']PUBLISHED["']/);
    expect(source).toContain("getPublicListingWhere");
  });

  it("does not use expired favorites as recommendation affinity signals", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/recommendations.ts"),
      "utf8",
    );
    expect(source).toContain("expiresAt: true");
    expect(source).toContain("isPublicListingActive(f.listing)");
    expect(source).toContain("listing: { is: getPublicListingWhere() }");
  });

  it("rechecks visibility while hydrating AI match details", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ai-matching.ts"),
      "utf8",
    );
    expect(source).toContain("...getPublicListingWhere(), id: { in: listingIds }");
  });
});
