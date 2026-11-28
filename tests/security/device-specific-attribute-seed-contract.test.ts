import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  resolve(process.cwd(), "prisma/seed-device-specific-attributes.ts"),
  "utf8",
);

describe("device-specific technical attribute seed", () => {
  it("covers the core construction, mining, industrial and agricultural device categories", () => {
    for (const category of [
      "Excavator", "Wheel Loader", "Backhoe Loader", "Bulldozer", "Motor Grader",
      "Crane", "Forklift", "Mining Excavator", "Skid Steer Loader", "Compactor", "Telehandler", "Reach Truck", "Stackers", "Mining Dump Truck", "Rigid Dump Truck",
      "Articulated Dump Truck", "Drilling Machine", "Crusher", "Screening Machine",
      "Asphalt Paver", "Asphalt Plant", "Road Roller", "Stabilizer", "Cold Milling Machine", "Batching Plant", "Concrete Mixer", "Concrete Pump",
      "Generators", "Compressors", "Pumps", "Tractor", "Combine Harvester",
    ]) {
      expect(seed).toContain(`"${category}"`);
    }
  });

  it("links attributes to the selected leaf device category, not every machine category", () => {
    expect(seed).toMatch(/const domain = DEVICE_DOMAINS\[deviceNameEn\]\s*\?\?\s*"MACHINE"/);
    // Canonical slug resolution is primary; legacy nameEn fallback checks levels 2, 3 and 1.
    expect(seed).toContain('where: { slug, domain, layer: "CATALOG", active: true }');
    expect(seed).toMatch(/level:\s*2,\s*nameEn:\s*deviceNameEn/);
    expect(seed).toMatch(/level:\s*3,\s*nameEn:\s*deviceNameEn/);
    expect(seed).toMatch(/level:\s*1,\s*nameEn:\s*deviceNameEn/);
    expect(seed).toContain('Generators: "INDUSTRIAL_EQUIPMENT"');
    expect(seed).toContain('Tractor: "AGRICULTURE"');
    expect(seed).toContain("level: 1, nameEn: deviceNameEn");
    expect(seed).toContain("db.categoryAttribute.upsert");
    expect(seed).toContain("categoryId_attributeId");
  });

  it("is additive and repeatable; it never clears existing catalog data", () => {
    expect(seed).toContain("db.attributeDefinition.upsert");
    expect(seed).toContain("db.categoryAttribute.upsert");
    expect(seed).not.toContain("deleteMany");
    expect(seed).not.toContain("delete({");
  });

  it("keeps device-specific fields alongside shared machine fields", () => {
    expect(seed).toContain("const specs = [...shared, ...specific]");
    expect(seed).toContain("excavator-digging-depth");
    expect(seed).toContain("loader-breakout-force");
    expect(seed).toContain("crane-max-lift-capacity");
    expect(seed).toContain("generator-prime-power");
  });

  it("does not duplicate year, condition or operating-hours fields already captured by the listing form", () => {
    expect(seed).not.toContain("device-manufacture-year");
    expect(seed).not.toContain("device-condition");
    expect(seed).not.toContain("device-operating-hours");
    expect(seed).not.toContain("mining-excavator-operating-weight");
  });

  it("resolves active taxonomy categories by canonical slug before legacy nameEn fallback", () => {
    expect(seed).toContain("const DEVICE_CATEGORY_SLUGS");
    expect(seed).toContain('where: { slug, domain, layer: "CATALOG", active: true }');
    expect(seed).toContain('Excavator: ["excavator"]');
    expect(seed).toContain('"wheel-loader"');
    expect(seed).toContain('"mining-excavator-machine"');
    expect(seed).toContain('Crane: ["mobile-crane"]');
    expect(seed).toContain('Crusher: ["jaw-crusher"]');
    expect(seed).not.toContain('Crane: ["cranes-lifting"');
    expect(seed).not.toContain('Crusher: ["crushing-processing"');
    expect(seed).toContain('level: 3, nameEn: deviceNameEn');
    expect(seed).toContain('active: true');
  });
});


const listingEditForm = readFileSync(
  resolve(process.cwd(), "src/app/admin/listings/[id]/edit/ListingEditForm.tsx"),
  "utf8",
);

describe("device-specific listing edit form", () => {
  it("clears previous category values before loading another device's specifications", () => {
    const categoryChange = listingEditForm.indexOf("if (nextCategoryId !== categoryId)");
    const clearValues = listingEditForm.indexOf("setAttributeValues({})", categoryChange);
    const clearDefinitions = listingEditForm.indexOf("setAttributeDefs([])", clearValues);
    const updateCategory = listingEditForm.indexOf("setCategoryId(nextCategoryId)", clearDefinitions);
    expect(categoryChange).toBeGreaterThanOrEqual(0);
    expect(clearValues).toBeGreaterThan(categoryChange);
    expect(clearDefinitions).toBeGreaterThan(clearValues);
    expect(updateCategory).toBeGreaterThan(clearDefinitions);
  });
});


const sellerListingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/listings/[id]/route.ts"),
  "utf8",
);

const listingAttributeRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/listings/[id]/attributes/route.ts"),
  "utf8",
);

const categoryAttributesHelper = readFileSync(
  resolve(process.cwd(), "src/lib/category-attributes.ts"),
  "utf8",
);

const categoryAttributesGetRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/categories/[id]/attributes/route.ts"),
  "utf8",
);

describe("inherited category technical specifications", () => {
  it("walks parent categories and lets the nearest category override duplicate definitions", () => {
    expect(categoryAttributesHelper).toContain("getCategoryChainIds");
    expect(categoryAttributesHelper).toContain("while (currentId && !visited.has(currentId))");
    expect(categoryAttributesHelper).toContain("nearestByAttribute.has(row.attributeId)");
    expect(categoryAttributesHelper).toContain("rank.get(a.categoryId)");
  });

  it("serves inherited specifications through the endpoint used by the listing form", () => {
    expect(categoryAttributesGetRoute).toContain("getCategoryAttributeLinks(db, category.id)");
    expect(categoryAttributesGetRoute).toContain("links.map((l) => ({");
  });
});

describe("listing attribute PUT category and provenance guards", () => {
  it("accepts only attributes attached to the listing's current category", () => {
    expect(listingAttributeRoute).toContain("select: { id: true, sellerId: true, categoryId: true }");
    expect(listingAttributeRoute).toContain("getCategoryAttributeIds(db, listing.categoryId)");
    expect(listingAttributeRoute).toContain("getCategoryAttributeIds(db, listing.categoryId)");
    expect(listingAttributeRoute).toContain("disallowedAttributeIds.length");
    expect(listingAttributeRoute).toContain("not available for this listing category");
  });

  it("prevents sellers from forging verification provenance or foreign option IDs", () => {
    expect(listingAttributeRoute).toContain('sourceType: isAdmin ? "ADMIN_VERIFIED" : "SELLER_INPUT"');
    expect(listingAttributeRoute).toContain("confidence: isAdmin && v.confidence != null");
    expect(listingAttributeRoute).toContain("sourceReference: isAdmin && v.sourceReference != null");
    expect(listingAttributeRoute).toContain("db.attributeOption.findMany");
    expect(listingAttributeRoute).toContain('attrMap.get(option.attributeId)?.type !== "SELECT"');
    expect(listingAttributeRoute).toContain("optionsById.get(option.optionId) !== option.attributeId");
    expect(listingAttributeRoute).not.toContain("String(v.sourceType)");
  });

  it("rejects duplicate attribute IDs and malformed numeric/date values", () => {
    expect(listingAttributeRoute).toContain("Duplicate attributeIds are not allowed");
    expect(listingAttributeRoute).toContain("Number.isFinite(Number(value.numberValue))");
    expect(listingAttributeRoute).toContain("new Date(value.dateValue).getTime()");
  });

  it("writes an audit event only after the technical attribute transaction commits", () => {
    const transaction = listingAttributeRoute.indexOf("await db.$transaction(ops)");
    const audit = listingAttributeRoute.indexOf("action: \"marketplace.listing_attribute_value.bulk_upsert\"");
    const response = listingAttributeRoute.indexOf("return NextResponse.json({ ok: true, count: ops.length })");
    expect(listingAttributeRoute).toContain('import { logAudit } from "@/lib/audit"');
    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(transaction);
    expect(response).toBeGreaterThan(audit);
    expect(listingAttributeRoute).toContain("actorType: isAdmin ? \"ADMIN\" : \"USER\"");
  });
});

describe("listing category attribute cleanup", () => {
  it("removes only obsolete prior-category values and scopes deletion to the listing", () => {
    expect(listingEditForm).toContain("payload.removeAttributeIds = initial.attributeValues");
    expect(listingEditForm).toContain("categoryId !== initial.categoryId && attributeDefsCategoryId === categoryId");
    expect(listingEditForm).toContain("!nextAttributeIds.has(attributeId)");
    expect(listingEditForm).toContain("attributeDefsCategoryId !== categoryId");
    expect(listingEditForm).toContain("setAttributeDefsCategoryId(categoryId)");
    expect(sellerListingRoute).toContain("attributeId: { in: body.removeAttributeIds.map(String) }");
    expect(sellerListingRoute).toContain("listingId: id");
  });
});


describe("listing technical attribute API category validation", () => {
  it("rejects attribute ids that are not linked to the resulting listing category", () => {
    expect(sellerListingRoute).toContain("const targetCategoryId = data.categoryId ?? existing.categoryId");
    expect(sellerListingRoute).toContain("getCategoryAttributeIds(db, targetCategoryId)");
    expect(sellerListingRoute).toContain("allowedAttributeIds.has(String(value.attributeId))");
    expect(sellerListingRoute).toContain("invalidAttributeIds.length > 0");
    expect(sellerListingRoute).toContain("status: 400");
  });

  it("validates attributes before any listing mutation to avoid partial updates", () => {
    const validation = sellerListingRoute.indexOf("Validate incoming attribute IDs");
    const listingUpdate = sellerListingRoute.indexOf("await db.listing.update({ where: { id }, data })");
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(listingUpdate).toBeGreaterThan(validation);
  });
});



const adminListingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/listings/[id]/route.ts"),
  "utf8",
);

describe("admin listing technical attribute validation", () => {
  it("rejects attributes outside the resulting category before listing mutation", () => {
    const validation = adminListingRoute.indexOf("Validate incoming attribute IDs");
    const mutation = adminListingRoute.indexOf("await db.listing.update({ where: { id }, data })");
    expect(adminListingRoute).toContain("getCategoryAttributeIds(db, targetCategoryId)");
    expect(adminListingRoute).toContain("invalidAttributeIds.length > 0");
    expect(adminListingRoute).toContain("status: 400");
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(mutation).toBeGreaterThan(validation);
  });
});


const adminListingImageRoute = adminListingRoute;
describe("listing image ownership guards", () => {
  it.each([
    ["seller", sellerListingRoute],
    ["admin", adminListingImageRoute],
  ])("%s route rejects foreign image IDs before mutating the listing", (_name, route) => {
    const validation = route.indexOf("Validate image mutation IDs before any listing mutation");
    const listingMutation = route.indexOf("await db.listing.update({ where: { id }, data })");
    expect(route).toContain("where: { listingId: id, id: { in: uniqueRequestedImageIds } }");
    expect(route).toContain("One or more images do not belong to this listing");
    expect(route).toContain("invalidImageIds.length");
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(listingMutation).toBeGreaterThan(validation);
  });

  it("scopes delete, primary selection and reordering inside the shared mutation helper", () => {
    expect(listingImageMutationHelper).toContain("where: { listingId, id: { in: removeIds } }");
    expect(listingImageMutationHelper).toContain("where: { listingId, id: String(body.setPrimaryImage) }");
    expect(listingImageMutationHelper).toContain("where: { listingId, id: reorderIds[idx] }");
    expect(listingImageMutationHelper).toContain("Duplicate image IDs in reorderImages");
    expect(listingImageMutationHelper).toContain("The primary image cannot also be removed");
    expect(listingImageMutationHelper).toContain("An image cannot be removed and reordered");
    expect(listingImageMutationHelper).toContain("tx.listingImage.findMany");
  });
});


const listingImageMutationHelper = readFileSync(
  resolve(process.cwd(), "src/lib/listing-image-mutations.ts"),
  "utf8",
);

describe("atomic listing image mutations", () => {
  it("groups add, remove, primary selection and reorder in one Prisma transaction", () => {
    expect(listingImageMutationHelper).toContain("db.$transaction(async (tx: any) =>");
    expect(listingImageMutationHelper).toContain("tx.listingImage.createMany");
    expect(listingImageMutationHelper).toContain("tx.listingImage.deleteMany");
    expect(listingImageMutationHelper).toContain("tx.listingImage.updateMany");
    expect(listingImageMutationHelper).toContain("for (let idx = 0; idx < reorderIds.length; idx++)");
  });

  it("keeps every image mutation constrained to the listing", () => {
    expect(listingImageMutationHelper).toContain("where: { listingId, id: { in: removeIds } }");
    expect(listingImageMutationHelper).toContain("where: { listingId, id: String(body.setPrimaryImage) }");
    expect(listingImageMutationHelper).toContain("where: { listingId, id: reorderIds[idx] }");
    expect(listingImageMutationHelper).toContain("where: { listingId }");
  });

  it("routes seller and admin image operations through the atomic helper", () => {
    expect(sellerListingRoute).toContain("await mutateListingImages(db, id, body)");
    expect(adminListingRoute).toContain("await mutateListingImages(db, id, body)");
    expect(adminListingRoute).toContain("audit records are emitted only after commit");
  });
});
