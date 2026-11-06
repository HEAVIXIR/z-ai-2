import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(ROOT, "src/app/sellers/[id]/page.tsx"),
  "utf8",
);

describe("public seller profile reputation integrity", () => {
  it("does not fabricate trust scores or star ratings from listing counts", () => {
    expect(source).not.toContain("trustScore");
    expect(source).not.toContain("امتیاز اعتماد");
    expect(source).not.toContain("seller._count.listings > 0 ? 5 : 0");
    expect(source).not.toContain("<Star");
  });

  it("shows only factual company verification state", () => {
    expect(source).toContain("وضعیت شرکت");
    expect(source).toContain("seller.company?.verified");
  });

  it("aggregates public views from published listings only", () => {
    expect(source).toContain('where: { sellerId: seller.id, status: "PUBLISHED" }');
  });
});
