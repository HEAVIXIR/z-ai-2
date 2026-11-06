import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("public listing and comparison API privacy contract", () => {
  it("uses the same allowlisted DTO in both listing-search query paths", () => {
    const source = read("src/app/api/listings/route.ts");
    expect(source).toContain("toPublicListingDTO");
    expect(source).not.toContain("const data = rows.map((l) => ({\n      ...l");
  });

  it("only compares published listings through the legacy public endpoint", () => {
    const source = read("src/app/api/compare/route.ts");
    expect(source).toContain('status: "PUBLISHED"');
    expect(source).toContain("ordered.map(toPublicListingDTO)");
    expect(source).not.toContain("function serialize(l: any)");
  });

  it("rejects non-public listings before they enter a comparison session", () => {
    const source = read("src/lib/compare-engine.ts");
    expect(source).toContain('status: "PUBLISHED"');
    expect(source).toContain('status: "ACTIVE"');
    expect(source.split('brand: { is: { active: true, status: "ACTIVE" } }').length - 1).toBe(2);
    expect(source).toContain("...(input.brandId ? { brandId: input.brandId } : {})");
    expect(source).toContain("...(it.brandId ? { brandId: it.brandId } : {})");
  });
});
