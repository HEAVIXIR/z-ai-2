import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { validateBuyRequestAttributeValues } from "@/lib/buy-request-attributes";

type CategoryLink = { categoryId: string; attributeId: string; required: boolean };
type Attribute = {
  id: string;
  type: string;
  unit: string | null;
  options: Array<{ id: string }>;
};

function fakeDb(options: {
  categoryLinks?: CategoryLink[];
  attributes?: Attribute[];
} = {}): PrismaClient {
  return {
    category: {
      findUnique: async () => ({ parentId: null }),
    },
    categoryAttribute: {
      findMany: async () => options.categoryLinks ?? [],
    },
    productModelAttribute: {
      findMany: async () => [],
    },
    attributeDefinition: {
      findMany: async () => options.attributes ?? [],
    },
  } as unknown as PrismaClient;
}

const category = { categoryId: "cat-1", attributeId: "attr-1", required: false };
const multiSelect: Attribute = {
  id: "attr-1",
  type: "MULTI_SELECT",
  unit: null,
  options: [{ id: "opt-1" }, { id: "opt-2" }],
};

describe("validateBuyRequestAttributeValues — behavioral contracts", () => {
  it("normalizes typed MULTI_SELECT IDs and ignores the legacy text transport slot", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [category], attributes: [multiSelect] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", selectedOptionIds: ["opt-1", "opt-2"], textValue: "opt-1,opt-2" }],
      false,
      true,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values[0]).toMatchObject({
        attributeId: "attr-1",
        textValue: null,
        optionId: null,
        selectedOptionIds: ["opt-1", "opt-2"],
      });
    }
  });

  it("supports legacy comma-separated MULTI_SELECT transport without a TEXT-slot conflict", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [category], attributes: [multiSelect] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", textValue: "opt-1,opt-2" }],
      false,
      true,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values[0].selectedOptionIds).toEqual(["opt-1", "opt-2"]);
  });

  it("rejects a selected option that does not belong to the attribute", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [category], attributes: [multiSelect] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", selectedOptionIds: ["foreign-option"] }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate MULTI_SELECT options", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [category], attributes: [multiSelect] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", selectedOptionIds: ["opt-1", "opt-1"] }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("enforces required attributes when the payload is entirely empty", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [{ ...category, required: true }] }),
      { categoryId: "cat-1" },
      [],
      false,
      true,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("does not treat an empty MULTI_SELECT array as a satisfied required value", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [{ ...category, required: true }], attributes: [multiSelect] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", selectedOptionIds: [], textValue: "" }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects values outside the selected category/model attribute membership", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [{ ...category, attributeId: "another-attribute" }] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", textValue: "value" }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an incompatible typed slot", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({
        categoryLinks: [category],
        attributes: [{ id: "attr-1", type: "TEXT", unit: null, options: [] }],
      }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", numberValue: 42 }],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("treats boolean false as a present value for a required BOOLEAN attribute", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({
        categoryLinks: [category],
        attributes: [{ id: "attr-1", type: "BOOLEAN", unit: null, options: [] }],
      }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", booleanValue: false }],
      false,
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects non-object entries instead of throwing", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb(),
      { categoryId: "cat-1" },
      [null as unknown as Record<string, unknown>],
      false,
      true,
    );
    expect(result.ok).toBe(false);
  });
});
