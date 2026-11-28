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


  it("validates complete technical-attribute batches before seller and admin PATCH mutations", () => {
    const sellerRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/listings/[id]/route.ts"),
      "utf8",
    );
    const adminRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/admin/listings/[id]/route.ts"),
      "utf8",
    );
    const validator = readFileSync(
      resolve(process.cwd(), "src/lib/listing-attribute-validation.ts"),
      "utf8",
    );
    for (const route of [sellerRoute, adminRoute]) {
      expect(route).toContain("validateListingAttributeBatch(");
      expect(route).toContain("data.categoryId !== undefined ? data.categoryId : existing.categoryId");
      expect(route).toContain("if (!validation.ok)");
    }
    expect(validator).toContain("Duplicate attributeIds are not allowed");
    expect(validator).toContain("Numeric values must be finite and match a numeric attribute");
    expect(validator).toContain("Date values must be valid and match a date attribute");
    expect(validator).toContain("optionOwners.get(option.optionId) !== option.attributeId");
    expect(validator).toContain("getCategoryAttributeIds(db, categoryId)");
    expect(validator).toContain('definition?.type !== "BOOLEAN" || typeof value.booleanValue !== "boolean"');
    expect(validator).toContain('type === "MULTI_SELECT"');
    expect(validator).toContain('expectedType: "MULTI_SELECT"');
    expect(validator).toContain('(type === "INTEGER" || type === "YEAR") && !Number.isInteger(numeric)');

  });

});


const sellerListingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/listings/[id]/route.ts"),
  "utf8",
);
const adminListingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/listings/[id]/route.ts"),
  "utf8",
);
const listingCreateRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/listings/route.ts"),
  "utf8",
);
const listingAttributePutRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/listings/[id]/attributes/route.ts"),
  "utf8",
);
const newListingPage = readFileSync(
  resolve(process.cwd(), "src/app/listings/new/page.tsx"),
  "utf8",
);
const sharedAttributeValidator = readFileSync(
  resolve(process.cwd(), "src/lib/listing-attribute-validation.ts"),
  "utf8",
);

describe("end-to-end technical attribute persistence contract", () => {
  it("serializes empty technical fields as explicit nulls so edits can clear stale values", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/listings/AttributeFields.tsx"),
      "utf8",
    );
    expect(component).toContain("Include explicit nulls for empty fields");
    expect(component).toContain("out.push(entry);");
    expect(component).toContain("entry.numberValue = null;");
    expect(component).toContain("entry.optionId = null;");
  });

  it("validates required fields, storage type compatibility and range bounds", () => {
    expect(sharedAttributeValidator).toContain("options.enforceRequired");
    expect(sharedAttributeValidator).toContain("getCategoryAttributeLinks(db, categoryId)");
    expect(sharedAttributeValidator).toContain("missingRequiredAttributeIds");
    expect(sharedAttributeValidator).toContain("Attribute values must match their definition type");
    expect(sharedAttributeValidator).toContain("Range values must contain valid minimum and maximum numbers");
  });

  it("uses the shared validator for the standalone technical-attribute PUT endpoint", () => {
    expect(listingAttributePutRoute).toContain('import { validateListingAttributeBatch } from "@/lib/listing-attribute-validation"');
    expect(listingAttributePutRoute).toContain("{ enforceRequired: true }");
    expect(listingAttributePutRoute).toContain("if (!validation.ok)");
  });

  it("persists new listing, images and technical attributes in one transaction", () => {
    expect(listingCreateRoute).toContain("validateListingAttributeBatch");
    expect(listingCreateRoute).toContain("{ enforceRequired: true }");
    expect(listingCreateRoute).toContain("db.$transaction(async (tx: any) =>");
    expect(listingCreateRoute).toContain("tx.listingImage.createMany");
    expect(listingCreateRoute).toContain("tx.listingAttributeValue.createMany");
    expect(listingCreateRoute).toContain('sourceType: "SELLER_INPUT"');
  });

  it("sends serialized attribute values with the create request instead of a second PUT", () => {
    expect(newListingPage).toContain("attributeValues: attributePayload");
    expect(newListingPage).not.toContain("/attributes`,");
    expect(newListingPage).not.toContain('method: "PUT"');
  });

  it("enforces required attributes server-side when a seller or admin changes category", () => {
    for (const route of [sellerListingRoute, adminListingRoute]) {
      expect(route).toContain("const categoryChanged = data.categoryId !== undefined && data.categoryId !== existing.categoryId");
      expect(route).toContain("{ enforceRequired: categoryChanged }");
    }
  });
});
