import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("public listing API privacy contract", () => {
  it("uses an explicit allowlisted DTO in both fast and attribute-filter search paths", () => {
    const source = read("src/app/api/listings/route.ts");
    expect(source).toContain('import { toPublicListingDTO } from "@/lib/public-listing-dto"');
    expect(source).toContain("results.map(toPublicListingDTO)");
    expect(source).toContain("rows.map(toPublicListingDTO)");
    expect(source).not.toContain("...l,");
  });

  it("does not include seller, moderation, or internal scalar fields in the public DTO", () => {
    const source = read("src/lib/public-listing-dto.ts");
    for (const forbidden of ["sellerId", "sellerPhone", "sellerName", "companyId", "moderationNotes", "internalNotes"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("listing.id");
    expect(source).toContain("listing.title");
    expect(source).toContain("listing.images");
  });
});
