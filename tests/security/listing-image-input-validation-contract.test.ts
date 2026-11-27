import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/listings/[id]/route.ts"), "utf8");
const imageBlock = source.slice(source.indexOf("// Image management: validate"), source.indexOf("// Attribute values upsert"));

describe("listing image mutation request validation contract", () => {
  it("enforces the 10-image ceiling and validates image URL protocols", () => {
    expect(imageBlock).toContain("currentImageCount + addImages.length > 10");
    expect(imageBlock).toContain('parsed.protocol === "https:" || parsed.protocol === "http:"');
    expect(imageBlock).toContain("!parsed.username && !parsed.password");
  });
  it("validates requested image IDs against listing ownership before mutations", () => {
    expect(imageBlock).toMatch(/where:\s*\{\s*listingId:\s*id,\s*id:\s*\{\s*in:\s*requestedIds\s*\}\s*\}/);
    expect(imageBlock.indexOf("if (requestedIds.length)")).toBeLessThan(imageBlock.indexOf("if (addImages.length)"));
  });
  it("scopes image deletes, primary selection and reordering by listingId", () {
    expect(imageBlock).toMatch(/deleteMany\(\{\s*where:\s*\{\s*listingId:\s*id,\s*id:\s*\{\s*in:\s*removeImages\s*\}\s*\}\s*\}\)/);
    expect(imageBlock).toMatch(/where:\s*\{\s*id:\s*String\(body\.setPrimaryImage\),\s*listingId:\s*id\s*\}/);
    expect(imageBlock).toMatch(/where:\s*\{\s*id:\s*imgId,\s*listingId:\s*id\s*\}/);
  });
});
