import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PHASE_B_SEED = readFileSync("prisma/seed-brands-b.ts", "utf-8");

describe("Phase B brand seed preservation", () => {
  it("makes identity refresh an explicit opt-in", () => {
    expect(PHASE_B_SEED).toContain("refreshIdentity?: boolean;");
    expect(PHASE_B_SEED).toContain("update: b.refreshIdentity ? {");
    expect(PHASE_B_SEED).toContain("} : {},");
  });

  it("preserves existing brand identity by default", () => {
    expect(PHASE_B_SEED).toContain(
      "Phase B is additive for existing brands: preserve curated identity",
    );
    expect(PHASE_B_SEED).toContain(
      "featured state, family, parent, website, and verification by default",
    );
  });

  it("opts in only the documented Iveco legacy-name correction", () => {
    expect(PHASE_B_SEED).toContain(
      'name: "ایوکو", nameEn: "Iveco", country: "Italy", refreshIdentity: true,',
    );
  });

  it("continues adding industry links without replacing existing links", () => {
    expect(PHASE_B_SEED).toContain(
      "where: { brandId_industry: { brandId: brand.id, industry: ind } }",
    );
    expect(PHASE_B_SEED).toContain("update: {},");
  });
});
