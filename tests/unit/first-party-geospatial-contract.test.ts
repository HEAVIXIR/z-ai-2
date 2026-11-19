import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20261119190000_first_party_geospatial_foundation/migration.sql"),
  "utf8",
);
const previewSchema = readFileSync(join(process.cwd(), "prisma/preview-schema.prisma"), "utf8");
const locationSourceCodesMigration = readFileSync(
  join(process.cwd(), "prisma/migrations/20261120113000_location_source_codes/migration.sql"),
  "utf8",
);
const architecture = readFileSync(
  join(process.cwd(), "docs/architecture/FIRST_PARTY_GEOSPATIAL.md"),
  "utf8",
);

describe("first-party geospatial contract", () => {
  it("stores exact coordinates separately from administrative city centroids", () => {
    expect(schema).toMatch(/locationLatitude\s+Float\?/);
    expect(schema).toMatch(/locationLongitude\s+Float\?/);
    expect(schema).toMatch(/latitude\s+Float\?/);
    expect(schema).toMatch(/longitude\s+Float\?/);
  });

  it("gives BuyRequest canonical country, province and city relations", () => {
    expect(schema).toMatch(/countryRef\s+Country\?\s+@relation\("BuyRequestCountry"/);
    expect(schema).toMatch(/provinceRef\s+Province\?\s+@relation\("BuyRequestProvince"/);
    expect(schema).toMatch(/cityRef\s+City\?\s+@relation\("BuyRequestCity"/);
    expect(migration).toContain('"BuyRequest_cityId_fkey"');
  });

  it("persists stable source codes for provinces and cities in both database schemas", () => {
    for (const source of [schema, previewSchema]) {
      expect(source).toMatch(/model Province \{[\s\S]*?sourceCode\s+String\?\s+@unique/);
      expect(source).toMatch(/model City \{[\s\S]*?sourceCode\s+String\?\s+@unique/);
    }
    expect(locationSourceCodesMigration).toContain('ALTER TABLE "Province" ADD COLUMN "sourceCode" TEXT');
    expect(locationSourceCodesMigration).toContain('ALTER TABLE "City" ADD COLUMN "sourceCode" TEXT');
    expect(locationSourceCodesMigration).toContain('CREATE UNIQUE INDEX "Province_sourceCode_key"');
    expect(locationSourceCodesMigration).toContain('CREATE UNIQUE INDEX "City_sourceCode_key"');
    expect(locationSourceCodesMigration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM|UPDATE "/i);
  });

  it("stores operational zone boundaries as portable GeoJSON", () => {
    expect(schema).toMatch(/model GeoZone \{/);
    expect(schema).toMatch(/boundaryGeoJson\s+String/);
    expect(migration).toContain('CREATE TABLE "GeoZone"');
  });

  it("does not silently enable extensions, external tile services or perform data imports", () => {
    expect(migration).not.toMatch(/CREATE EXTENSION|INSERT INTO|UPDATE "Listing"|UPDATE "BuyRequest"/i);
    expect(architecture).toContain("HEAVIX operates its own vector-tile pipeline");
    expect(architecture).toContain("no public OSM tile");
  });
});
