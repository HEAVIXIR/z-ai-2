import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const helperSource = readFileSync(
  path.join(root, "src/lib/homepage/verified-selection.ts"),
  "utf8",
);

describe("homepage verified-section — deterministic pool contract", () => {
  it("uses two parallel DB-level queries (strict + inclusive) instead of a fixed pool", () => {
    // The strict query filters verified:true at the DB level with take:8
    expect(pageSource).toContain('withHomepageQueryDiagnostics("listing.verified-strict"');
    expect(pageSource).toContain("verified: true");
    // The inclusive query has no verified filter with take:8
    expect(pageSource).toContain('withHomepageQueryDiagnostics("listing.verified-inclusive"');
  });

  it("does not retain the old fixed 20-row pool query", () => {
    expect(pageSource).not.toContain("listing.verified-pool");
    expect(pageSource).not.toContain("verifiedCandidateRows");
    // The JS filter+slice that created the pool-of-20 limitation is gone
    expect(pageSource).not.toMatch(/verifiedCandidateRows\.filter/);
    expect(pageSource).not.toMatch(/verifiedRows\.slice\(0,\s*8\)/);
  });

  it("delegates selection to the pure selectVerifiedListings helper", () => {
    expect(pageSource).toContain("selectVerifiedListings");
    expect(pageSource).toContain("from \"@/lib/homepage/verified-selection\"");
  });

  it("preserves the admin setting read with safe null-default", () => {
    // The flag must default to true (verified-only) when the setting is absent
    expect(pageSource).toContain("verifiedSectionVerifiedOnly ?? true");
  });

  it("maintains the merged batch-1 Promise.all (no new sequential await before it)", () => {
    // The two verified queries must be INSIDE the batch-1 Promise.all,
    // not awaited separately before or after it.
    expect(pageSource).toContain("verifiedStrictRows, verifiedInclusiveRows");
  });

  it("helper defaults to strict (verified-only) for null/undefined flag", () => {
    expect(helperSource).toContain("verifiedOnlyFlag ?? true");
    expect(helperSource).toContain("useStrict");
  });
});
