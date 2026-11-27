import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const ROUTE = "src/app/api/listings/[id]/route.ts";

function readRoute(): string {
  return fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
}

describe("listing image mutation ownership contract", () => {
  it("scopes delete mutations to the authorized listing", () => {
    const source = readRoute();
    expect(source).toMatch(/listingId:\s*id,\s*id:\s*\{\s*in:\s*body\.removeImages\.map\(String\)\s*\}/);
  });

  it("scopes primary-image selection and validates before clearing current primary", () => {
    const source = readRoute();
    const start = source.indexOf("if (body.setPrimaryImage)");
    const end = source.indexOf("if (body.reorderImages", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(block).toContain("listingImage.findFirst");
    expect(block).toMatch(/where:\s*\{\s*id:\s*String\(body\.setPrimaryImage\),\s*listingId:\s*id/);
    expect(block).toContain("if (!targetImage)");
    expect(block.indexOf("if (!targetImage)")).toBeLessThan(block.indexOf("data: { isPrimary: false }"));
    expect(block).toMatch(/where:\s*\{\s*id:\s*targetImage\.id,\s*listingId:\s*id\s*\}/);
  });

  it("scopes image reorder mutations to the authorized listing", () => {
    const source = readRoute();
    expect(source).toMatch(/where:\s*\{\s*id:\s*String\(imgId\),\s*listingId:\s*id\s*\},\s*data:\s*\{\s*sortOrder:\s*idx/);
  });
});
