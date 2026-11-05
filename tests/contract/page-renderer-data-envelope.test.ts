import { describe, expect, it } from "vitest";
import { normalizePublicWidgetCollection } from "@/lib/page-renderer-data";

describe("public PageRenderer response envelopes", () => {
  it("normalizes the listings { success, count, data: [] } envelope", () => {
    const rows = [{ id: "listing-1" }];
    expect(normalizePublicWidgetCollection({ success: true, count: 1, data: rows })).toEqual(rows);
  });

  it("normalizes nested { data: { items: [] } } envelopes", () => {
    const rows = [{ id: "nested-1" }];
    expect(normalizePublicWidgetCollection({ data: { items: rows } })).toEqual(rows);
  });

  it("normalizes the taxonomy categories tree envelope", () => {
    const rows = [{ id: "category-1", children: [] }];
    expect(normalizePublicWidgetCollection({ categories: rows, flat: rows })).toEqual(rows);
  });

  it("normalizes the public brands envelope", () => {
    const rows = [{ id: "brand-1", slug: "brand", name: "Brand" }];
    expect(normalizePublicWidgetCollection({ brands: rows })).toEqual(rows);
  });

  it("normalizes the public articles envelope", () => {
    const rows = [{ id: "article-1", slug: "article", title: "Article" }];
    expect(normalizePublicWidgetCollection({ articles: rows })).toEqual(rows);
  });

  it("normalizes the public services envelope", () => {
    const rows = [{ id: "service-1", nameFa: "Service" }];
    expect(normalizePublicWidgetCollection({ services: rows })).toEqual(rows);
  });

  it("preserves a deliberate empty array as an empty result", () => {
    expect(normalizePublicWidgetCollection({ brands: [] })).toEqual([]);
  });

  it.each([null, undefined, [], "invalid", 42, {}, { brands: "not-an-array" }, { error: "failed" }])(
    "returns null for malformed or missing collection payloads: %o",
    (payload) => {
      expect(normalizePublicWidgetCollection(payload)).toBeNull();
    },
  );
});
