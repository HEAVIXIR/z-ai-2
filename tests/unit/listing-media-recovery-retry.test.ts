import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/listings/[id]/media/route.ts", "utf8");
const wizard = readFileSync("src/app/listings/new/page.tsx", "utf8");

describe("seller listing media recovery endpoint contract", () => {
  it("requires same-origin CSRF validation and authentication", () => {
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("getCurrentUser()");
  });

  it("restricts recovery to the listing owner", () => {
    expect(route).toContain("listing.sellerId !== user.id");
  });

  it("uses ListingImage rows as the retry manifest and preserves image order", () => {
    expect(route).toContain('images: { select: { url: true }, orderBy: { sortOrder: "asc" } }');
    expect(route).toContain('/^\\/api\\/media\\/([a-f0-9]{24})$/');
  });

  it("only attaches the owner's private staged listing assets and accepts same-listing retries", () => {
    expect(route).toContain("asset.uploadedBy !== user.id");
    expect(route).toContain('asset.status !== "STAGED"');
    expect(route).toContain('asset.visibility !== "PRIVATE"');
    expect(route).toContain("asset.entityId !== null");
    expect(route).toContain("attachAsset(asset.id, \"Listing\", listing.id, user.id)");
    expect(route).toContain('asset.status === "ATTACHED"');
  });

  it("keeps unsupported or unavailable image records pending instead of reporting false success", () => {
    expect(route).toContain("if (!match)");
    expect(route).toContain("pendingCount++");
    expect(route).toContain("pendingCount === 0 ? \"ATTACHED\" : \"PENDING\"");
  });

  it("does not create image rows or delete media and prevents caching private retry results", () => {
    expect(route).not.toContain("listingImage.create");
    expect(route).not.toContain("deleteAsset(");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });
});

describe("listing creation wizard media recovery wiring", () => {
  it("calls the canonical listing media retry endpoint and displays pending state", () => {
    expect(wizard).toContain('`/api/listings/${encodeURIComponent(mediaRepairListingId)}/media`');
    expect(wizard).toContain("result.pendingCount");
    expect(wizard).toContain("retryMediaAttachment");
  });
});
