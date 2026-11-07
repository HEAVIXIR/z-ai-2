import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/lib/ai-matching.ts",
  "src/lib/recommendations.ts",
  "src/lib/market-heatmap.ts",
  "src/lib/opportunity-engine.ts",
  "src/lib/knowledge-graph.ts",
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
  });

  it("rechecks visibility while hydrating AI match details", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ai-matching.ts"),
      "utf8",
    );
    expect(source).toContain("...getPublicListingWhere(), id: { in: listingIds }");
  });
});
