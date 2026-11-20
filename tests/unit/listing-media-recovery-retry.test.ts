import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/listings/[id]/media-retry/route.ts", "utf8");

describe("seller listing media recovery endpoint contract", () => {
  it("requires authentication and CSRF before media recovery", () => {
    expect(route).toContain("getCurrentUser()");
    expect(route).toContain("checkCsrf(request)");
  });

  it("restricts recovery to the listing owner", () => {
    expect(route).toContain("listing.sellerId !== user.id");
  });

  it("only retries private staged listing media and accepts idempotent same-listing attachments", () => {
    expect(route).toContain('asset.status === "ATTACHED"');
    expect(route).toContain('asset.entityType === "Listing"');
    expect(route).toContain("asset.entityId === listing.id");
    expect(route).toContain('asset.status !== "STAGED"');
    expect(route).toContain('asset.visibility !== "PRIVATE"');
    expect(route).toContain("attachAsset(assetId, \"Listing\", listing.id, user.id, \"USER\")");
  });

  it("does not create image rows or delete storage objects and reports pending retry IDs", () => {
    expect(route).not.toContain("listingImage.create");
    expect(route).not.toContain("deleteAsset(");
    expect(route).toContain("pendingAssetIds: pending");
    expect(route).toContain('mediaStatus: pending.length ? "PENDING" : "ATTACHED"');
  });
});
