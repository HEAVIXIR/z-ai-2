import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public comparison share response privacy", () => {
  it("routes share-token responses through the least-privilege DTO", () => {
    const route = readFileSync("src/app/api/compare/shared/[token]/route.ts", "utf8");
    const dto = readFileSync("src/lib/public-compare-dto.ts", "utf8");

    expect(route).toContain("toPublicComparisonDTO");
    expect(route).toContain("toPublicComparisonDTO(await getComparisonData(session.id))");
    expect(dto).toContain("source: cell.provenance.source");
    expect(dto).toContain("confidence: cell.provenance.confidence");
    expect(dto).toContain("verifiedAt: cell.provenance.verifiedAt");
    expect(dto).not.toContain("sourceReference:");
    expect(dto).not.toContain("verifiedBy:");
  });
});
