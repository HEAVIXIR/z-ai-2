import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import dataset from "../../prisma/data/iran-locations-1404.json";
import manifest from "../../prisma/data/iran-locations-1404.manifest.json";
import {
  assertPreviewLocationSeedApproval,
  buildIranLocationSeedPlan,
} from "../../scripts/geospatial/seed-iran-location-catalog";

const datasetBytes = readFileSync(resolve(process.cwd(), "prisma/data/iran-locations-1404.json"));

describe("guarded Iran location catalog seed plan", () => {
  const plan = () => buildIranLocationSeedPlan(dataset, manifest, datasetBytes);

  it("verifies exact bytes, SHA-256 and the canonical 1 + 31 + 1,479 hierarchy", () => {
    expect(plan()).toMatchObject({
      countryCount: 1,
      provinceCount: 31,
      cityCount: 1479,
      sourceCityRecordCount: 1481,
      duplicateNamesCollapsed: 2,
      destructiveOperations: false,
      seedAllowed: true,
      rightsReviewStatus: "APPROVED",
      commercialUseAllowed: true,
    });
  });

  it("rejects a dataset object that differs from the SHA-256-verified bytes", () => {
    const altered = {
      ...dataset,
      cities: dataset.cities.map((city, index) =>
        index === 0 ? { ...city, name: "داده دستکاری‌شده" } : city,
      ),
    };
    expect(() => buildIranLocationSeedPlan(altered, manifest, datasetBytes))
      .toThrow("Parsed dataset object does not match the exact SHA-256-verified dataset bytes.");
  });

  it("rejects modified dataset bytes before planning any write", () => {
    const modifiedBytes = Buffer.concat([datasetBytes, Buffer.from(" ")]);
    expect(() => buildIranLocationSeedPlan(dataset, manifest, modifiedBytes))
      .toThrow("Location dataset SHA-256 does not match the committed manifest.");
  });

  it("requires explicit preview environment, environment gate and command confirmation", () => {
    const approvedPlan = { ...plan(), seedAllowed: true };
    expect(() => assertPreviewLocationSeedApproval(
      approvedPlan,
      { HEAVIX_ENV: "production", HEAVIX_ALLOW_PREVIEW_LOCATION_SEED: "1" },
      ["--apply", "--confirm-preview-location-seed"],
    )).toThrow("Location catalog writes are restricted to HEAVIX_ENV=preview.");

    expect(() => assertPreviewLocationSeedApproval(
      approvedPlan,
      { HEAVIX_ENV: "preview", HEAVIX_ALLOW_PREVIEW_LOCATION_SEED: "1" },
      ["--apply"],
    )).toThrow("Explicit --confirm-preview-location-seed confirmation is required.");
  });

  it("requires a separate explicit preview approval environment flag", () => {
    const approvedPlan = { ...plan(), seedAllowed: true };
    expect(() => assertPreviewLocationSeedApproval(
      approvedPlan,
      { HEAVIX_ENV: "preview", HEAVIX_ALLOW_PREVIEW_LOCATION_SEED: "1" },
      ["--apply", "--confirm-preview-location-seed"],
    )).toThrow("HEAVIX_PREVIEW_LOCATION_SEED_APPROVED=YES is required for explicit approval.");
  });

  it("keeps the upstream GPL license metadata and records owner authorization separately", () => {
    expect(manifest.sourceLicense).toBe("GPL-3.0");
    expect(manifest.ownerAuthorization).toMatchObject({
      status: "APPROVED",
      basis: "EXPLICIT_OWNER_DIRECTIVE",
      approvedOn: "2026-11-24",
    });
  });

  it("keeps database writes blocked while the manifest approval is pending", () => {
    const pendingManifest = { ...manifest, rightsReviewStatus: "PENDING", commercialUseAllowed: false };
    const pendingPlan = buildIranLocationSeedPlan(dataset, pendingManifest, datasetBytes);
    expect(() => assertPreviewLocationSeedApproval(
      pendingPlan,
      { HEAVIX_ENV: "preview", HEAVIX_ALLOW_PREVIEW_LOCATION_SEED: "1", HEAVIX_PREVIEW_LOCATION_SEED_APPROVED: "YES" },
      ["--apply", "--confirm-preview-location-seed"],
    )).toThrow("Location catalog import is blocked until manifest rights review is APPROVED and commercialUseAllowed=true.");
  });

  it("permits only the fully approved preview gate without connecting to or mutating a database in tests", () => {
    const approvedPlan = { ...plan(), seedAllowed: true };
    expect(() => assertPreviewLocationSeedApproval(
      approvedPlan,
      { HEAVIX_ENV: "preview", HEAVIX_ALLOW_PREVIEW_LOCATION_SEED: "1", HEAVIX_PREVIEW_LOCATION_SEED_APPROVED: "YES" },
      ["--apply", "--confirm-preview-location-seed"],
    )).not.toThrow();
  });

  it("keeps dry-run ahead of PrismaClient construction", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/geospatial/seed-iran-location-catalog.ts"),
      "utf8",
    );
    expect(script.indexOf('if (!args.includes("--apply"))')).toBeGreaterThanOrEqual(0);
    expect(script.indexOf('if (!args.includes("--apply"))')).toBeLessThan(script.indexOf("const db = new PrismaClient()"));
    expect(script).toContain("databaseConnected: false");
    expect(script).toContain("writesPerformed: false");
  });
});
