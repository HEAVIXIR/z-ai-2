import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSeed = (name: string) =>
  readFileSync(path.resolve(process.cwd(), "prisma", name), "utf8");

describe("Preview taxonomy seed safety contracts", () => {
  it.each([
    "seed-taxonomy-v11.ts",
    "seed-service-and-mineral-taxonomy.ts",
    "seed-service-mineral-attributes.ts",
    "seed-category-specific-attributes.ts",
    "seed-brands-a.ts",
    "seed-brands-b.ts",
    "seed-catalog.ts",
    "seed-services.ts",
  ])("%s requires explicit --apply and Preview environment before writes", (name) => {
    const source = readSeed(name);
    const mainStart = source.indexOf("async function main");
    expect(mainStart).toBeGreaterThanOrEqual(0);
    const main = source.slice(mainStart, mainStart + 700);
    expect(main).toContain('process.argv.includes("--apply")');
    expect(main).toContain("DRY RUN");
    expect(main).toContain('process.env.HEAVIX_ENV');
  });

  it("does not reactivate disabled transaction, service, or industry records", () => {
    const source = readSeed("seed-taxonomy-v11.ts");
    expect(source).not.toMatch(/update:\s*\{[^}]*active:\s*true/);
  });

  it("does not overwrite existing attribute definitions or category links", () => {
    const source = readSeed("seed-category-specific-attributes.ts");
    expect(source).toContain("update: {},");
    expect(source).not.toContain("db.attributeOption.update(");
    expect(source).toContain("Preserve administrator-managed per-category field settings");
  });

  it("does not overwrite existing service/mineral category field settings", () => {
    const source = readSeed("seed-service-mineral-attributes.ts");
    expect(source).toContain("update:{}");
  });
  it("links seeded models to their brand/category pairs without overwriting existing links", () => {
    const source = readSeed("seed-catalog.ts");
    expect(source).toContain("db.brandCategory.upsert");
    expect(source).toContain("where: { brandId_categoryId: { brandId, categoryId } }");
    expect(source).toContain("update: {},");
  });

  it("preserves existing brand and service metadata on seed reruns", () => {
    for (const name of ["seed-brands-a.ts", "seed-brands-b.ts", "seed-services.ts"]) {
      const source = readSeed(name);
      expect(source).toContain("update: {},");
    }
  });

  it("keeps the catalog and brand seeds additive", () => {
    for (const name of ["seed-brands-a.ts", "seed-brands-b.ts", "seed-catalog.ts", "seed-services.ts"]) {
      const source = readSeed(name);
      expect(source).not.toMatch(/db\.(?:brand|productModel|product|service)\.deleteMany/);
    }
  });

  it("restricts the legacy machine taxonomy rewrite to Preview", () => {
    const source = readSeed("seed-machine-taxonomy.ts");
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain('process.env.HEAVIX_ENV !== "preview"');
  });

  it("blocks the legacy broad attribute updater unless explicitly double-confirmed in Preview", () => {
    const source = readSeed("seed-attribute-catalog.ts");
    expect(source).toContain('process.argv.includes("--legacy-overwrite")');
    expect(source).toContain('process.argv.includes("--confirm-legacy-overwrite")');
    expect(source).toContain('process.env.HEAVIX_ENV !== "preview"');
  });

  it("does not accept a demo-sized catalog as a complete legacy import", () => {
    const verifier = readFileSync(
      path.resolve(process.cwd(), "scripts/verify-taxonomy-bootstrap.ts"),
      "utf8",
    );
    expect(verifier).toContain("categories < 539");
    expect(verifier).toContain("brands < 629");
  });

  it("uses the complete official-source-year-1404 real-city dataset for all Iranian provinces", () => {
    const data = JSON.parse(
      readFileSync(path.resolve(process.cwd(), "prisma/data/iran-cities-1404.json"), "utf8"),
    );
    const seed = readSeed("seed-taxonomy-v11.ts");
    expect(data.datasetVersion).toBe("3.1.2");
    expect(data.officialSourceYear).toBe(1404);
    expect(data.provinceCount).toBe(31);
    expect(data.sourceCityRecordCount).toBe(1481);
    expect(data.cityCount).toBe(1479);
    expect(data.provinces).toHaveLength(31);
    const flattened = data.provinces.flatMap((province: { name: string; cities: string[] }) =>
      province.cities.map((city) => `${province.name}::${city}`),
    );
    expect(flattened).toHaveLength(1479);
    expect(new Set(flattened).size).toBe(1479);
    expect(data.provinces.every((province: { name: string; cities: string[] }) =>
      province.name && province.cities.length > 0 && province.cities.every(Boolean),
    )).toBe(true);
    expect(seed).toContain('IRAN_LOCATION_DATA.provinces.map((province)');
    expect(seed).toContain('name: "چهارمحال و بختیاری"');
    expect(seed).toContain("totalCities !== IRAN_LOCATION_DATA.metadata.distinctCityCount");
  });

});
