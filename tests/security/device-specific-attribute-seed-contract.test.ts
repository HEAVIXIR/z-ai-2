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
    expect(seed).toMatch(/where:\s*\{\s*domain,\s*level:\s*2,\s*nameEn:\s*deviceNameEn\s*\}/);
    expect(seed).toMatch(/where:\s*\{\s*domain,\s*level:\s*1,\s*nameEn:\s*deviceNameEn\s*\}/);
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
