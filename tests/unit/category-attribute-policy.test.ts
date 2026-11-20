import { describe, expect, it } from "vitest";
import { validateListingAttributeValues } from "../../src/lib/listing-attributes";

type Fixture = {
  parents?: Record<string, string | null>;
  links?: Array<{
    categoryId: string;
    attributeId: string;
    active?: boolean;
    required?: boolean;
  }>;
  attributes?: Array<{ id: string; name: string; labelFa: string | null; type: string; options: Array<{ id: string }> }>;
};

function makeDb(fixture: Fixture) {
  return {
    category: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        parentId: fixture.parents?.[where.id] ?? null,
      }),
    },
    categoryAttribute: {
      findMany: async () => fixture.links ?? [],
    },
    productModelAttribute: {
      findMany: async () => [],
    },
    attributeDefinition: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (fixture.attributes ?? []).filter((attribute) => where.id.in.includes(attribute.id)),
    },
  };
}

describe("category attribute runtime policy", () => {
  it("uses the nearest category link to make an inherited required field optional", async () => {
    const db = makeDb({
      parents: { leaf: "parent", parent: null },
      links: [
        { categoryId: "parent", attributeId: "weight", active: true, required: true },
        { categoryId: "leaf", attributeId: "weight", active: true, required: false },
      ],
    });

    const result = await validateListingAttributeValues(db, { categoryId: "leaf" }, [], false, true);
    expect(result).toEqual({ ok: true, values: [] });
  });

  it("does not require an inactive leaf override and does not fall back to the parent", async () => {
    const db = makeDb({
      parents: { leaf: "parent", parent: null },
      links: [
        { categoryId: "parent", attributeId: "weight", active: true, required: true },
        { categoryId: "leaf", attributeId: "weight", active: false, required: true },
      ],
    });

    const result = await validateListingAttributeValues(db, { categoryId: "leaf" }, [], false, true);
    expect(result).toEqual({ ok: true, values: [] });
  });

  it("returns the Persian labels of missing required attributes", async () => {
    const db = makeDb({
      parents: { loader: null },
      links: [{ categoryId: "loader", attributeId: "weight", active: true, required: true }],
      attributes: [{
        id: "weight",
        name: "Operating weight",
        labelFa: "وزن عملیاتی",
        type: "INTEGER",
        options: [],
      }],
    });

    const result = await validateListingAttributeValues(db, { categoryId: "loader" }, [], false, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("وزن عملیاتی");
  });

  it("rejects a newly submitted value for a disabled category attribute", async () => {
    const db = makeDb({
      parents: { loader: null },
      links: [{ categoryId: "loader", attributeId: "weight", active: false, required: false }],
      attributes: [{
        id: "weight",
        name: "Operating weight",
        labelFa: "وزن عملیاتی",
        type: "INTEGER",
        options: [],
      }],
    });

    const result = await validateListingAttributeValues(
      db,
      { categoryId: "loader" },
      [{ attributeId: "weight", numberValue: 12000 }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("به دسته‌بندی یا مدل");
  });
});


  it("accepts zero and false as completed values for required numeric and boolean fields", async () => {
    const db = makeDb({
      parents: { loader: null },
      links: [
        { categoryId: "loader", attributeId: "capacity", active: true, required: true },
        { categoryId: "loader", attributeId: "hasCabin", active: true, required: true },
      ],
      attributes: [
        { id: "capacity", name: "Capacity", labelFa: "ظرفیت", type: "INTEGER", options: [] },
        { id: "hasCabin", name: "Cabin", labelFa: "کابین", type: "BOOLEAN", options: [] },
      ],
    });

    const result = await validateListingAttributeValues(
      db,
      { categoryId: "loader" },
      [
        { attributeId: "capacity", numberValue: 0 },
        { attributeId: "hasCabin", booleanValue: false },
      ],
      false,
      true,
    );

    expect(result.ok).toBe(true);
  });
});
