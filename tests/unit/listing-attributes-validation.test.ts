import { describe, expect, it, vi } from "vitest";
import { validateListingAttributeValues } from "@/lib/listing-attributes";

function createDb() {
  return {
    category: {
      findUnique: vi.fn(async () => ({ parentId: null })),
    },
    categoryAttribute: {
      findMany: vi.fn(async () => [{ attributeId: "attr-1" }]),
    },
    productModelAttribute: {
      findMany: vi.fn(async () => []),
    },
    attributeDefinition: {
      findMany: vi.fn(async () => [{
        id: "attr-1",
        type: "SELECT",
        options: [{ id: "option-1" }, { id: "option-2" }],
      }]),
    },
  };
}

describe("listing attribute validation", () => {
  it("normalizes allowed typed values and forces seller provenance", async () => {
    const db = createDb();
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1", modelId: null },
      [{
        attributeId: "attr-1",
        optionId: "option-1",
        sourceType: "ADMIN_VERIFIED",
        confidence: 0.7,
      }],
      false,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toMatchObject({
      attributeId: "attr-1",
      optionId: "option-1",
      sourceType: "SELLER_INPUT",
      confidence: 0.7,
      verifiedAt: null,
      verifiedBy: null,
    });
  });

  it("rejects attribute IDs outside the selected category/model scope", async () => {
    const db = createDb();
    db.categoryAttribute.findMany.mockResolvedValue([]);
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1", modelId: null },
      [{ attributeId: "attr-1", optionId: "option-1" }],
      false,
    );
    expect(result).toEqual({
      ok: false,
      error: "یکی از ویژگی‌ها به دسته‌بندی یا مدل این آگهی متصل نیست.",
    });
  });

  it("rejects an option that belongs to a different attribute", async () => {
    const db = createDb();
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1", modelId: null },
      [{ attributeId: "attr-1", optionId: "foreign-option" }],
      false,
    );
    expect(result).toEqual({
      ok: false,
      error: "گزینهٔ انتخاب‌شده متعلق به این ویژگی نیست.",
    });
  });

  it("returns an empty normalized payload without querying the catalog", async () => {
    const db = createDb();
    const result = await validateListingAttributeValues(db, {}, [], false);
    expect(result).toEqual({ ok: true, values: [] });
    expect(db.attributeDefinition.findMany).not.toHaveBeenCalled();
  });
});
