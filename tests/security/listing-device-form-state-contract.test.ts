import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/app/listings/new/page.tsx"),
  "utf8",
);

describe("listing device category technical form state", () => {
  it("waits for the selected category schema before allowing the technical-specification step", () => {
    expect(page).toContain("const [attributeDefsCategoryId, setAttributeDefsCategoryId] = useState<string | null>(null)");
    expect(page).toContain("attributeDefsCategoryId !== categoryId");
    expect(page).toContain("setAttributeDefsCategoryId(categoryId)");
    expect(page).toContain("setAttributeDefsCategoryId(null)");
  });

  it("clears prior device values, definitions and validation errors on every category depth change", () => {
    expect(page).toContain("const resetCategoryAttributes = () =>");
    expect(page).toContain("setAttributes({});");
    expect(page).toContain("setAttributeDefs([]);");
    expect(page).toContain("setAttrErrors({});");
    expect(page).toMatch(/onPickRoot[\s\S]*?resetCategoryAttributes\(\)/);
    expect(page).toMatch(/onPickChild[\s\S]*?resetCategoryAttributes\(\)/);
    expect(page).toMatch(/onPickGrandchild[\s\S]*?resetCategoryAttributes\(\)/);
  });
});
