import { describe, expect, it } from "vitest";
import { crosswalkBrandIndustry, computeCategoryIndustries } from "../src/lib/brand-category-crosswalk";

describe("brand category crosswalk", () => {
  it("maps seeded brand industries to taxonomy application industries", () => {
    expect(crosswalkBrandIndustry("MINING_MACHINERY")).toEqual(["MINING"]);
    expect(crosswalkBrandIndustry("CONSTRUCTION_MACHINERY")).toContain("ROAD_CONSTRUCTION");
    expect(crosswalkBrandIndustry("FILTRATION")).toContain("OIL_GAS");
  });

  it("fails closed for unrecognized industry keys", () => {
    expect(crosswalkBrandIndustry("UNKNOWN_FUTURE_KEY")).toEqual([]);
  });

  it("aggregates direct and descendant application industries for parent categories", () => {
    const categories = [
      { id: "root", slug: "machinery", layer: "CATALOG", active: true, parentId: null },
      { id: "road", slug: "road", layer: "CATALOG", active: true, parentId: "root" },
      { id: "mining", slug: "mining", layer: "CATALOG", active: true, parentId: "root" },
    ];
    const direct = new Map([
      ["road", new Set(["ROAD_CONSTRUCTION"])],
      ["mining", new Set(["MINING"])],
    ]);
    const result = computeCategoryIndustries(categories, direct);
    expect(result.get("root")).toEqual(new Set(["ROAD_CONSTRUCTION", "MINING"]));
    expect(result.get("road")).toEqual(new Set(["ROAD_CONSTRUCTION"]));
  });

  it("detects taxonomy cycles rather than looping", () => {
    const categories = [
      { id: "a", slug: "a", layer: "CATALOG", active: true, parentId: "b" },
      { id: "b", slug: "b", layer: "CATALOG", active: true, parentId: "a" },
    ];
    expect(() => computeCategoryIndustries(categories, new Map())).toThrow(/cycle/i);
  });
});
