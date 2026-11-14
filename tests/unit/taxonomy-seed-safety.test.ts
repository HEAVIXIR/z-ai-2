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

});
