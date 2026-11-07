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

  it("drops unrecognized fields at every nested public boundary", () => {
    const input = {
      items: [{
        id: "item-1",
        sortOrder: 0,
        type: "LISTING",
        title: "Public listing",
        internalItemSecret: "must-not-leak",
      }],
      rows: [{
        key: "year",
        label: "سال",
        category: "fixed",
        isDifferent: false,
        internalRowSecret: "must-not-leak",
        cells: [{
          itemId: "item-1",
          display: "2020",
          raw: "2020",
          normalized: "2020",
          internalCellSecret: "must-not-leak",
          provenance: {
            source: "ADMIN_VERIFIED",
            confidence: 0.9,
            verifiedAt: "2026-11-07T10:00:00.000Z",
            sourceReference: "https://internal.example/private",
            verifiedBy: "internal-user-id",
            internalProvenanceSecret: "must-not-leak",
          },
        }],
      }],
      attributes: ["year"],
      differences: [],
      crossCategoryWarning: false,
      categories: [{ id: "cat-1", name: "ماشین‌آلات", internalCategorySecret: "must-not-leak" }],
      internalRootSecret: "must-not-leak",
    } as unknown as ComparisonData;

    const result = toPublicComparisonDTO(input);
    const serialized = JSON.stringify(result);

    for (const secret of [
      "internalItemSecret",
      "internalRowSecret",
      "internalCellSecret",
      "internalProvenanceSecret",
      "internalCategorySecret",
      "internalRootSecret",
      "sourceReference",
      "verifiedBy",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(result.items[0].title).toBe("Public listing");
    expect(result.rows[0].cells[0].provenance).toEqual({
      source: "ADMIN_VERIFIED",
      confidence: 0.9,
      verifiedAt: "2026-11-07T10:00:00.000Z",
    });
  });
});
