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
const locationsRoute = readFileSync(join(process.cwd(), "src/app/api/locations/route.ts"), "utf8");
const locationItemRoute = readFileSync(join(process.cwd(), "src/app/api/locations/[id]/route.ts"), "utf8");
const listingsRoute = readFileSync(join(process.cwd(), "src/app/api/listings/route.ts"), "utf8");
const listingLocationPicker = readFileSync(join(process.cwd(), "src/components/listings/LocationPicker.tsx"), "utf8");
const newListingPage = readFileSync(join(process.cwd(), "src/app/listings/new/page.tsx"), "utf8");
const publicListingDto = readFileSync(join(process.cwd(), "src/lib/public-listing-dto.ts"), "utf8");

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

  it("protects all location mutations with the fail-closed CSRF guard", () => {
    expect(locationsRoute).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(locationsRoute).toMatch(/export async function POST[\s\S]*?checkCsrf\(req\)/);
    expect(locationItemRoute).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(locationItemRoute).toMatch(/export async function PATCH[\s\S]*?checkCsrf\(req\)/);
    expect(locationItemRoute).toMatch(/export async function DELETE[\s\S]*?checkCsrf\(req\)/);
  });

  it("rejects incomplete and out-of-range city coordinate pairs", () => {
    for (const source of [locationsRoute, locationItemRoute]) {
      expect(source).toContain("latitude and longitude must be provided together");
      expect(source).toContain("coordinates are outside valid WGS84 bounds");
      expect(source).toContain("latitude < -90");
      expect(source).toContain("longitude > 180");
    }
  });

  it("collects a manual exact point separately from city selection and submits it", () => {
    expect(listingLocationPicker).toContain("نقطهٔ دقیق محل دستگاه");
    expect(listingLocationPicker).toContain("مختصات مرکز شهر");
    expect(newListingPage).toContain("locationLatitude: location.latitude?.trim() ? Number(location.latitude) : undefined");
    expect(newListingPage).toContain("locationLongitude: location.longitude?.trim() ? Number(location.longitude) : undefined");
  });

  it("validates and persists exact listing coordinates without substituting city centroids", () => {
    expect(listingsRoute).toContain("hasLocationLatitude !== hasLocationLongitude");
    expect(listingsRoute).toContain("typeof body.locationLatitude !== \"number\"");
    expect(listingsRoute).toContain("body.locationLatitude < -90");
    expect(listingsRoute).toContain("body.locationLongitude > 180");
    expect(listingsRoute).toContain("locationLatitude,");
    expect(listingsRoute).toContain("locationLongitude,");
    expect(listingsRoute).toContain("locationUpdatedAt: locationLatitude !== null ? new Date() : null");
  });

  it("keeps exact equipment coordinates out of unauthenticated listing DTOs", () => {
    expect(publicListingDto).not.toContain("locationLatitude");
    expect(publicListingDto).not.toContain("locationLongitude");
    expect(publicListingDto).not.toContain("...listing");
  });

  it("does not silently enable extensions, external tile services or perform data imports", () => {
    expect(migration).not.toMatch(/CREATE EXTENSION|INSERT INTO|UPDATE "Listing"|UPDATE "BuyRequest"/i);
    expect(architecture).toContain("HEAVIX operates its own vector-tile pipeline");
    expect(architecture).toContain("no public OSM tile");
  });
});
