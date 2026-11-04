import { describe, expect, it } from "vitest";
import { extractWidgetData } from "@/lib/admin/page-builder/widget-data-response";

describe("extractWidgetData", () => {
  it.each([
    ["nested data items", { data: { items: [{ id: "1" }] } }, [{ id: "1" }]],
    ["direct items", { items: [{ id: "2" }] }, [{ id: "2" }]],
    ["categories envelope", { categories: [{ id: "3" }] }, [{ id: "3" }]],
    ["brands envelope", { brands: [{ id: "4" }] }, [{ id: "4" }]],
    ["articles envelope", { articles: [{ id: "5" }] }, [{ id: "5" }]],
    ["services envelope", { services: [{ id: "6" }] }, [{ id: "6" }]],
    ["data array", { data: [{ id: "7" }] }, [{ id: "7" }]],
  ])("normalizes %s", (_label, payload, expected) => {
    expect(extractWidgetData(payload)).toEqual(expected);
  });

  it("preserves object payloads for singleton widgets", () => {
    expect(extractWidgetData({ data: { total: 12 } })).toEqual({ total: 12 });
  });

  it.each([null, undefined, [], "bad", 12, {}])("returns null for unsupported payloads: %s", (payload) => {
    expect(extractWidgetData(payload)).toBeNull();
  });
});
