import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/app/listings/new/page.tsx"),
  "utf8",
);
const adminEdit = readFileSync(
  resolve(process.cwd(), "src/app/admin/listings/[id]/edit/ListingEditForm.tsx"),
  "utf8",
);

describe("listing device category technical form state", () => {
  it("waits for the selected category schema before allowing the technical-specification step", () => {
    expect(page).toContain("const [attributeDefsCategoryId, setAttributeDefsCategoryId] = useState<string | null>(null)");
    expect(page).toContain("attributeDefsCategoryId !== categoryId");
    expect(page).toContain("setAttributeDefsCategoryId(categoryId)");
    expect(page).toContain("setAttributeDefsCategoryId(null)");
  });

  it("validates required technical fields when an admin changes a listing category", () => {
    expect(adminEdit).toContain("validateAttributeFields,");
    expect(adminEdit).toContain("const [attributeErrors, setAttributeErrors]");
    expect(adminEdit).toContain("if (categoryId !== initial.categoryId && categoryId)");
    expect(adminEdit).toContain("errors={attributeErrors}");
    expect(adminEdit).toContain("setAttributeErrors(validateAttributeFields(attributeDefs, next))");
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
  it("preserves zero when serializing numeric technical attributes", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/listings/AttributeFields.tsx"),
      "utf8",
    );
    expect(component).toContain("Number.isFinite(numericValue) ? numericValue : null");
    expect(component).not.toContain("Number(raw) || null");
  });

});
