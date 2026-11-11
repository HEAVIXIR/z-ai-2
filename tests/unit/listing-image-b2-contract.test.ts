import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("seller B2 media staging contract", () => {
  it("keeps seller uploads private and authenticated", () => {
    const route = read("src/app/api/media/staging/route.ts");
    expect(route).toContain("getCurrentUser()");
    expect(route).toContain("checkCsrf(request)");
    expect(route).toContain("enforceRateLimit(user.id, UPLOAD)");
    expect(route).toContain('entityType: "Listing"');
    expect(route).toContain('visibility: "PRIVATE"');
    expect(route).toContain("uploadedBy: user.id");
    expect(route).toContain("assetId: result.asset.id");
  });

  it("routes the seller listing uploader through staging and caps images at ten", () => {
    const uploader = read("src/components/listings/ListingImageUploader.tsx");
    expect(uploader).toContain("maxImages = 10");
    expect(uploader).toContain('fetch("/api/media/staging"');
    expect(uploader).not.toContain('fetch("/api/admin/upload"');
    expect(uploader).toContain("if (files.length > remaining)");
    expect(uploader).toContain("return;");
  });

  it("rejects oversized and unowned staged media before creating ListingImage rows", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain("rawImages.length > 10");
    expect(route).toContain("rawAssetIds.length > 10");
    expect(route).toContain("asset.uploadedBy !== user.id");
    expect(route).toContain('asset.visibility !== "PRIVATE"');
    expect(route).toContain('asset.status !== "STAGED"');
    expect(route).not.toContain("body.images.slice(0, 10)");
    expect(route).toContain("attachAsset(asset.id, \"Listing\", listing.id, user.id)");
  });

  it("stores media binaries and metadata through the B2 adapter, never local disk", () => {
    const service = read("src/lib/media-service.ts");
    expect(service).toContain("putB2MediaObject");
    expect(service).toContain("listB2MediaObjects");
    expect(service).toContain("createB2MediaReadUrl");
    expect(service).not.toContain('from "node:fs"');
    expect(service).not.toContain('from "node:path"');
    expect(service).not.toContain("UPLOAD_ROOT");
  });

  it("keeps B2 private and gates read URLs by public visibility, owner or admin", () => {
    const route = read("src/app/api/media/[id]/route.ts");
    expect(route).toContain('adminGuard("media.read")');
    expect(route).toContain('asset.visibility === "PUBLIC"');
    expect(route).toContain('listingImage.listing.status === "PUBLISHED"');
    expect(route).toContain("listingOwnerId === user.id");
    expect(route).toContain("getAssetReadUrl(id)");
    expect(route).toContain('status: 404');
  });

  it("pins the object-storage adapter to the dedicated media bucket and prefix", () => {
    const adapter = read("src/lib/b2-media-storage.ts");
    expect(adapter).toContain('const EXPECTED_BUCKET = "heavix-dev-assets"');
    expect(adapter).toContain('const EXPECTED_PREFIX = "heavix-media/"');
    expect(adapter).toContain('const EXPECTED_REGION = "us-east-005"');
    expect(adapter).toContain('const EXPECTED_ENDPOINT = "https://s3.us-east-005.backblazeb2.com"');
    expect(adapter).toContain('requiredEnv("B2_APPLICATION_KEY")');
    expect(adapter).toContain("createB2MediaReadUrl");
  });
});
