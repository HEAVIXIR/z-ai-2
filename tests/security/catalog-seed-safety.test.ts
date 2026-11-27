import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("catalog seed write-safety contracts", () => {
  it("requires the exact Preview guard before Phase 2 database reads", () => {
    const source = read("prisma/seed-phase2-catalog-core.ts");
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeGreaterThan(-1);
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeLessThan(source.indexOf("db.brand.findFirst"));
    expect(source).not.toContain("db.listing.update");
    expect(source).not.toContain("verifiedBy: \"admin\"");
  });

  it("requires the exact Preview guard and contains no inferred compatibility or RBAC writes in Phase 3", () => {
    const source = read("prisma/seed-phase3-catalog.ts");
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeGreaterThan(-1);
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeLessThan(source.indexOf("db.country.findFirst"));
    expect(source).not.toMatch(/db\.compatibilityEdge\.(create|upsert)/);
    expect(source).not.toMatch(/db\.userRole\.(create|upsert)/);
  });

  it("requires the exact Preview guard and does not seed compatibility edges in the canonical catalog script", () => {
    const source = read("prisma/seed-catalog.ts");
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeGreaterThan(-1);
    expect(source.indexOf("assertPreviewSeedTarget(db")).toBeLessThan(source.indexOf("db.brand.findMany"));
    expect(source).not.toMatch(/db\.compatibilityEdge\.(create|upsert)/);
  });

  it("keeps Listing-to-Product audit read-only and exact-match-only", () => {
    const source = read("scripts/catalog-listing-product-audit.ts");
    expect(source).toContain("--confirm-preview-readonly");
    expect(source).toContain("UNIQUE_EXACT_CANDIDATE_REVIEW_ONLY");
    expect(source).toContain("READ_ONLY_NO_LINKS_WRITTEN");
    expect(source).not.toMatch(/db\.[a-zA-Z]+\.(create|update|delete|upsert|deleteMany|updateMany)\s*\(/);
  });

  it("keeps model and compatibility registries non-executable pending human evidence review", () => {
    const models = JSON.parse(read("prisma/catalog/model-registry.review.json"));
    const compatibility = JSON.parse(read("prisma/catalog/compatibility-evidence.review.json"));
    expect(models.status).toBe("REVIEW_ONLY_NOT_A_SEED_INPUT");
    expect(models.entries.every((entry: any) => entry.reviewStatus === "UNREVIEWED")).toBe(true);
    expect(compatibility.status).toBe("REVIEW_ONLY_NOT_A_SEED_INPUT");
    expect(compatibility.claims.every((claim: any) => claim.executable === false && claim.evidenceReference === null)).toBe(true);
  });
});
