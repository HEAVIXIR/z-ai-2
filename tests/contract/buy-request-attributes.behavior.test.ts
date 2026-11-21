import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { validateBuyRequestAttributeValues } from "@/lib/buy-request-attributes";

type CategoryLink = { categoryId: string; attributeId: string; active?: boolean; required: boolean };
type Attribute = {
  id: string;
  type: string;
  unit: string | null;
  options: Array<{ id: string }>;
};

function fakeDb(options: {
  categoryLinks?: CategoryLink[];
  attributes?: Attribute[];
  parents?: Record<string, string | null>;
  inactiveCategories?: string[];
  modelLinks?: Array<{ attributeId: string; required: boolean }>;
} = {}): PrismaClient {
  return {
    category: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        parentId: options.parents?.[where.id] ?? null,
        active: !options.inactiveCategories?.includes(where.id),
      }),
    },
    categoryAttribute: {
      findMany: async ({ where }: { where: { categoryId: { in: string[] } } }) =>
        (options.categoryLinks ?? []).filter((link) => where.categoryId.in.includes(link.categoryId)),
    },
    productModelAttribute: {
      findMany: async () => options.modelLinks ?? [],
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

  it("does not accept a value from a category attribute explicitly disabled by the owner/admin", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({ categoryLinks: [{ ...category, active: false }] }),
      { categoryId: "cat-1" },
      [{ attributeId: "attr-1", textValue: "disabled" }],
      false,
      true,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("does not require an inherited field when the selected leaf explicitly disables it", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({
        parents: { leaf: "parent", parent: null },
        categoryLinks: [
          { ...category, categoryId: "parent", active: true, required: true },
          { ...category, categoryId: "leaf", active: false, required: true },
        ],
      }),
      { categoryId: "leaf" },
      [],
      false,
      true,
    );
    expect(result).toEqual({ ok: true, values: [] });
  });

  it("stops inheriting request fields from an inactive ancestor category", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({
        parents: { leaf: "inactive-parent", "inactive-parent": null },
        inactiveCategories: ["inactive-parent"],
        categoryLinks: [{ ...category, categoryId: "inactive-parent", active: true, required: true }],
      }),
      { categoryId: "leaf" },
      [],
      false,
      true,
    );
    expect(result).toEqual({ ok: true, values: [] });
  });

  it("does not let a model-specific link revive a category-disabled request field", async () => {
    const result = await validateBuyRequestAttributeValues(
      fakeDb({
        categoryLinks: [{ ...category, active: false, required: false }],
        modelLinks: [{ attributeId: "attr-1", required: true }],
      }),
      { categoryId: "cat-1", modelId: "model-1" },
      [{ attributeId: "attr-1", textValue: "disabled" }],
      false,
      true,
    );
    expect(result).toMatchObject({ ok: false });
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
        categoryLinks: [{ ...category, required: true }],
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
