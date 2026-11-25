import { describe, expect, it, vi } from "vitest";
import { validateListingAttributeValues } from "@/lib/listing-attributes";

function createDb() {
  return {
    category: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        parentId: where.id === "leaf-1" ? "parent-1" : null,
      })),
    },
    categoryAttribute: {
      findMany: vi.fn(async () => [{ categoryId: "leaf-1", attributeId: "attr-1", required: false }]),
    },
    productModelAttribute: {
      findMany: vi.fn(async () => []),
    },
    attributeDefinition: {
      findMany: vi.fn(async () => [{
        id: "attr-1",
        name: "Operating weight",
        labelFa: "وزن عملیاتی",
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

  it("rejects a text payload for a SELECT attribute instead of persisting an empty selection", async () => {
    const db = createDb();
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1", modelId: null },
      [{ attributeId: "attr-1", textValue: "loader" }],
      false,
    );
    expect(result).toEqual({
      ok: false,
      error: "لطفاً یک گزینهٔ معتبر برای این ویژگی انتخاب کنید.",
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

  it("rejects creation when a required category attribute is missing", async () => {
    const db = createDb();
    db.categoryAttribute.findMany.mockResolvedValue([
      { categoryId: "leaf-1", attributeId: "attr-1", required: true },
    ]);
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1" },
      [],
      false,
      true,
    );
    expect(result).toEqual({
      ok: false,
      error: "لطفاً این مشخصات الزامی را تکمیل کنید: وزن عملیاتی",
    });
  });

  it("lets a more-specific category make an inherited required attribute optional", async () => {
    const db = createDb();
    db.categoryAttribute.findMany.mockResolvedValue([
      { categoryId: "parent-1", attributeId: "attr-1", required: true },
      { categoryId: "leaf-1", attributeId: "attr-1", required: false },
    ]);
    const result = await validateListingAttributeValues(
      db,
      { categoryId: "leaf-1" },
      [],
      false,
      true,
    );
    expect(result).toEqual({ ok: true, values: [] });
  });

  it("returns an empty normalized payload without querying the catalog when no scope exists", async () => {
    const db = createDb();
    const result = await validateListingAttributeValues(db, {}, [], false);
    expect(result).toEqual({ ok: true, values: [] });
    expect(db.attributeDefinition.findMany).not.toHaveBeenCalled();
  });
});
