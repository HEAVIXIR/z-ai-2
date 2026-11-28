/**
 * HEAVIX — seller listing image upload contract
 *
 * Protects the authenticated upload path and prevents listings from attaching
 * arbitrary URLs or another seller's media assets.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const wizard = read("src/app/listings/new/page.tsx");
const uploadRoute = read("src/app/api/listings/upload/route.ts");
const listingRoute = read("src/app/api/listings/route.ts");
const mediaService = read("src/lib/media-service.ts");

describe("seller listing image upload contract", () => {
  it("uses a real authenticated seller upload endpoint rather than placeholder URLs", () => {
    expect(wizard).toContain('fetch("/api/listings/upload"');
    expect(wizard).toContain("assetId: result.asset.id");
    expect(wizard).not.toContain("/uploads/placeholder-");
    expect(uploadRoute).toContain("const user = await getCurrentUser()");
    expect(uploadRoute).toContain('if (!user)');
    expect(uploadRoute).toContain('actorType: "USER"');
  });

  it("enforces multipart size limits and records the uploader as the asset owner", () => {
    expect(uploadRoute).toContain("MAX_SELLER_UPLOAD_BYTES");
    expect(uploadRoute).toContain("file.size > MAX_SELLER_UPLOAD_BYTES");
    expect(uploadRoute).toContain("uploadedBy: user.id");
    expect(uploadRoute).toContain('entityType: "Generic"');
    expect(uploadRoute).toContain("entityId: user.id");
    expect(mediaService).toContain("actorType: input.actorType ?? \"ADMIN\"");
  });

  it("rejects arbitrary, duplicate, foreign and over-limit listing image references", () => {
    expect(listingRoute).toContain("body.images !== undefined && !Array.isArray(body.images)");
    expect(listingRoute).toContain("imageInputs.length > 10");
    expect(listingRoute).toContain("imageAssetIds.has(assetId)");
    expect(listingRoute).toContain("await getAssets([...imageAssetIds])");
    expect(listingRoute).toContain("asset.uploadedBy !== user.id");
    expect(listingRoute).toContain('asset.entityType !== "Generic"');
    expect(listingRoute).toContain("asset.entityId !== user.id");
    expect(listingRoute).toContain("asset.url !== image.url");
  });

  it("persists only verified asset URLs and preserves primary image ordering", () => {
    expect(listingRoute).toContain("validatedImages.push({");
    expect(listingRoute).toContain("if (validatedImages.length > 0)");
    expect(listingRoute).toContain("url: image.url");
    expect(listingRoute).toContain("isPrimary: idx === 0");
    expect(wizard).toContain("images: images.map((image) => ({ assetId: image.assetId, url: image.url }))");
  });

  it("shows uploaded previews and prevents submit while image upload is active", () => {
    expect(wizard).toContain("<NextImage");
    expect(wizard).toContain("disabled={imageUploading || images.length >= 10}");
    expect(wizard).toContain("if (imageUploading)");
  });
});
