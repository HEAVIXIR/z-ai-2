import { describe, expect, it } from "vitest";
import type { ComparisonData } from "@/lib/compare-engine";
import { toPublicComparisonDTO } from "@/lib/public-compare-dto";

describe("toPublicComparisonDTO", () => {
  it("removes internal source references and verifier user IDs", () => {
    const input: ComparisonData = {
      items: [],
      rows: [{
        key: "operating_weight",
        label: "وزن عملیاتی",
        category: "attribute",
        isDifferent: false,
        cells: [{
          itemId: "item-1",
          display: "20 t",
          raw: "20",
          normalized: "20",
          provenance: {
            source: "ADMIN_VERIFIED",
            confidence: 0.95,
            verifiedAt: "2026-11-07T10:00:00.000Z",
            sourceReference: "https://internal.example/source/123",
            verifiedBy: "internal-user-id-123",
          },
        }],
      }],
      attributes: ["operating_weight"],
      differences: [],
      crossCategoryWarning: false,
      categories: [],
    };

    const result = toPublicComparisonDTO(input);
    const provenance = result.rows[0].cells[0].provenance;

    expect(provenance).toEqual({
      source: "ADMIN_VERIFIED",
      confidence: 0.95,
      verifiedAt: "2026-11-07T10:00:00.000Z",
    });
    expect(provenance).not.toHaveProperty("sourceReference");
    expect(provenance).not.toHaveProperty("verifiedBy");
  });

  it("preserves cells without provenance", () => {
    const input: ComparisonData = {
      items: [],
      rows: [{
        key: "year",
        label: "سال",
        category: "fixed",
        isDifferent: false,
        cells: [{
          itemId: "item-1",
          display: "2020",
          raw: "2020",
          normalized: "2020",
        }],
      }],
      attributes: [],
      differences: [],
      crossCategoryWarning: false,
      categories: [],
    };

    expect(toPublicComparisonDTO(input).rows[0].cells[0].provenance).toBeUndefined();
  });
});
