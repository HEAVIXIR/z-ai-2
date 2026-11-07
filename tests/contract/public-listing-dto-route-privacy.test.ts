import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("public listing API privacy contract", () => {
  it("keeps the fast path explicitly projected and applies the DTO to attribute-filter results", () => {
    const source = read("src/app/api/listings/route.ts");
    const fastPath = source.split("// Slow path: attribute filters present")[0] ?? "";
    const slowPath = source.split("// Slow path: attribute filters present")[1] ?? "";
    expect(source).toContain('import { toPublicListingDTO } from "@/lib/public-listing-dto"');
    expect(fastPath).toContain("const data = results.map((l) => ({");
    expect(fastPath).not.toContain("sellerId");
    expect(fastPath).not.toContain("sellerPhone");
    expect(slowPath).toContain("rows.map(toPublicListingDTO)");
    expect(source).not.toContain("...l,");
  });

  it("does not include seller, moderation, or internal scalar fields in the shared public DTO", () => {
    const source = read("src/lib/public-listing-dto.ts");
    for (const forbidden of ["sellerId", "sellerPhone", "sellerName", "companyId", "moderationNotes", "internalNotes"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("listing.id");
    expect(source).toContain("listing.title");
    expect(source).toContain("listing.images");
  });
});
