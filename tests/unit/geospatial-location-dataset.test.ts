import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { validateLocationDataset } from "../../scripts/geospatial/validate-location-dataset.mjs";

const dataset = {
  countries: [{ sourceCode: "IR", name: "ایران" }],
  provinces: [{ sourceCode: "IR-THR", name: "تهران", countryCode: "IR" }],
  cities: [{ sourceCode: "IR-THR-TEH", name: "تهران", provinceCode: "IR-THR", latitude: 35.7, longitude: 51.4 }],
};
const manifest = {
  sourceUrl: "https://example.org/official-dataset",
  sourceName: "Official administrative dataset",
  license: "CC-BY-4.0",
  sourceVersion: "2026-01",
  sourceDate: "2026-01-01",
  rightsReviewStatus: "APPROVED",
  commercialUseAllowed: true,
  sha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
};

describe("first-party geospatial dataset validation", () => {
  it("accepts a structurally valid, rights-approved hierarchy", () => {
    const result = validateLocationDataset(dataset, manifest, manifest.sha256);
    expect(result.structurallyValid).toBe(true);
    expect(result.importEligible).toBe(true);
    expect(result.counts).toEqual({ countries: 1, provinces: 1, cities: 1 });
  });

  it("blocks import eligibility when licensing has not been approved", () => {
    const result = validateLocationDataset(dataset, { ...manifest, rightsReviewStatus: "PENDING" }, manifest.sha256);
    expect(result.structurallyValid).toBe(true);
    expect(result.importEligible).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects orphan city and province references", () => {
    const broken = {
      ...dataset,
      provinces: [{ sourceCode: "X", name: "استان", countryCode: "MISSING" }],
      cities: [{ sourceCode: "Y", name: "شهر", provinceCode: "MISSING" }],
    };
    const result = validateLocationDataset(broken, manifest, manifest.sha256);
    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith("countryCode"))).toBe(true);
    expect(result.errors.some((e) => e.path.endsWith("provinceCode"))).toBe(true);
  });

  it("rejects duplicate stable codes and invalid coordinate pairs/ranges", () => {
    const broken = {
      ...dataset,
      cities: [
        { sourceCode: "DUP", name: "شهر الف", provinceCode: "IR-THR", latitude: 91, longitude: 10 },
        { sourceCode: "DUP", name: "شهر ب", provinceCode: "IR-THR", latitude: 30 },
      ],
    };
    const result = validateLocationDataset(broken, manifest, manifest.sha256);
    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate sourceCode"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("latitude must"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("supplied together"))).toBe(true);
  });

  it("rejects a checksum mismatch", () => {
    const result = validateLocationDataset(dataset, { ...manifest, sha256: "0".repeat(64) }, manifest.sha256);
    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((e) => e.path === "manifest.sha256")).toBe(true);
  });

  it("does not silently treat county/district rows as cities", () => {
    const result = validateLocationDataset({ ...dataset, counties: [{ sourceCode: "C1", name: "شهرستان" }] }, manifest, manifest.sha256);
    expect(result.warnings.some((w) => w.includes("not accepted as City"))).toBe(true);
  });
});
