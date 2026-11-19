import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import dataset from "../../prisma/data/iran-locations-1404.json";
import manifest from "../../prisma/data/iran-locations-1404.manifest.json";
import { buildIranLocationCatalog } from "../../scripts/geospatial/build-iran-location-catalog.mjs";

describe("HEAVIX Iran canonical location catalog", () => {
  it("contains only the requested Country → Province → City levels", () => {
    expect(dataset.countries).toHaveLength(1);
    expect(dataset.countries[0]).toMatchObject({ sourceCode: "IR", name: "ایران" });
    expect(dataset.provinces).toHaveLength(31);
    expect(dataset.cities).toHaveLength(1479);
    expect(dataset).not.toHaveProperty("counties");
    expect(dataset).not.toHaveProperty("districts");
    expect(dataset).not.toHaveProperty("villages");
  });

  it("preserves the upstream source count and the two same-province deduplications", () => {
    expect(dataset.metadata.sourceCityRecordCount).toBe(1481);
    expect(dataset.metadata.distinctCityCount).toBe(1479);
    expect(dataset.metadata.duplicateNamesCollapsed).toBe(2);
  });

  it("has unique stable source codes and valid province references", () => {
    const provinceCodes = new Set(dataset.provinces.map((province) => province.sourceCode));
    expect(provinceCodes.size).toBe(31);
    expect(new Set(dataset.cities.map((city) => city.sourceCode)).size).toBe(1479);
    for (const province of dataset.provinces) expect(province.countryCode).toBe("IR");
    for (const city of dataset.cities) {
      expect(provinceCodes.has(city.provinceCode)).toBe(true);
      expect(city.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("reproduces the committed dataset and manifest from the existing source file", () => {
    const sourceBytes = readFileSync(resolve(process.cwd(), "prisma/data/iran-cities-1404.json"));
    const generated = buildIranLocationCatalog(sourceBytes);
    const committedDataset = readFileSync(resolve(process.cwd(), "prisma/data/iran-locations-1404.json"));
    const committedManifest = readFileSync(resolve(process.cwd(), "prisma/data/iran-locations-1404.manifest.json"));
    expect(Buffer.from(generated.datasetBytes).equals(committedDataset)).toBe(true);
    expect(Buffer.from(generated.manifestBytes).equals(committedManifest)).toBe(true);
  });

  it("matches the exact committed dataset bytes to the manifest SHA-256", () => {
    const bytes = readFileSync(resolve(process.cwd(), "prisma/data/iran-locations-1404.json"));
    const actual = createHash("sha256").update(bytes).digest("hex");
    expect(actual).toBe(manifest.sha256);
  });

  it("keeps the import gate closed until a documented approval is recorded", () => {
    expect(manifest.rightsReviewStatus).toBe("PENDING");
    expect(manifest.commercialUseAllowed).toBe(false);
  });
});
