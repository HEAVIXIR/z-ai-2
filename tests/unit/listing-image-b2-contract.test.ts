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
    expect(route).toContain('const requestedEntityType = formData.get("entityType")?.toString() || "Listing"');
    expect(route).toContain('requestedEntityType !== "Listing" && requestedEntityType !== "BuyRequest"');
    expect(route).toContain("entityType: requestedEntityType");
    expect(route).toContain('visibility: "PRIVATE"');
    expect(route).toContain("maxOutputBytes: policy.maxImageBytes");
    expect(route).toContain("getListingImagePolicy(user.id)");
    expect(route).toContain("uploadedBy: user.id");
    expect(route).toContain("assetId: result.asset.id");
  });

  it("routes the seller listing uploader through staging and applies the resolved plan cap", () => {
    const uploader = read("src/components/listings/ListingImageUploader.tsx");
    expect(uploader).toContain("const maxImages = policy.maxImages");
    expect(uploader).toContain('fetch("/api/media/staging"');
    expect(uploader).not.toContain('fetch("/api/admin/upload"');
    expect(uploader).toContain("if (files.length > remaining)");
    expect(uploader).toContain("return;");
  });

  // WANTED_MEDIA_BROWSER_E2E: include this contract change in the isolated browser acceptance trigger.
  it("sends only canonical staged asset IDs for demand media and never client image URLs", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain('images: transactionType === "WANTED" || transactionType === "SERVICE_REQUEST" ? undefined : images.map((url) => ({ url }))');
    expect(page).toContain("body.assetIds = stagedMediaAssets.map((asset) => asset.assetId)");
    expect(page).toContain('entityType={transactionType === "WANTED" || isServiceRequest ? "BuyRequest" : "Listing"}');
  });

  it("rejects oversized and unowned staged media before creating ListingImage rows", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain("rawImages.length > imagePolicy.maxImages");
    expect(route).toContain("rawAssetIds.length > imagePolicy.maxImages");
    expect(route).toContain("asset.size > imagePolicy.maxImageBytes");
    expect(route).toContain("rawAssetIds.length > imagePolicy.maxImages");
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
    const service = read("src/lib/media-service.ts");
    expect(route).toContain('await can(user.id, "media.read")');
    expect(route).toContain('import { can } from "@/lib/authorization"');
    expect(route).toContain('asset.visibility === "PUBLIC"');
    expect(route).toContain('listingImage.listing.status === "PUBLISHED"');
    expect(route).toContain("listingOwnerId === user.id");
    expect(route).toContain('import { createB2MediaReadUrl } from "@/lib/b2-media-storage"');
    expect(service).toContain("asset.uploadedBy !== userId");
    expect(service).toContain('asset.status !== "STAGED"');
    expect(service).toContain("asset.entityId !== null");
    expect(route).toContain("createB2MediaReadUrl(asset.relativePath, isBuyRequestAsset ? 60 : 300)");
    expect(route).toContain('isBuyRequestAsset ? "private, no-store" : isPublic ? "public, max-age=60, s-maxage=60"');
    expect(route).not.toContain("getAssetReadUrl(id)");
    expect(route).toContain('status: 404');
    expect(route).toContain('"private, no-store"');
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

  it("persists BuyRequest image associations with matching main and Preview schemas", () => {
    const main = read("prisma/schema.prisma");
    const preview = read("prisma/preview-schema.prisma");
    const migration = read("prisma/migrations/20261120150000_buy_request_images/migration.sql");
    const service = read("src/lib/wanted-service.ts");
    const route = read("src/app/api/wanted/route.ts");
    for (const schema of [main, preview]) {
      expect(schema).toContain("images          BuyRequestImage[]");
      expect(schema).toContain("model BuyRequestImage {");
      expect(schema).toContain("assetId      String      @unique");
      expect(schema).toContain('onDelete: Cascade');
    }
    expect(migration).toContain('CREATE TABLE "BuyRequestImage"');
    expect(migration).toContain('"BuyRequestImage_assetId_key"');
    expect(migration).toContain('"BuyRequestImage_buyRequestId_sortOrder_key"');
    expect(migration).toContain('REFERENCES "BuyRequest"("id")');
    expect(service).toContain("images: {");
    expect(service).toContain("assetId: image.assetId");
    expect(route).toContain('asset.entityType !== "BuyRequest"');
    expect(route).toContain("asset.uploadedBy !== userId");
    const mediaRetry = read("src/lib/wanted-media.ts");
    const retryRoute = read("src/app/api/wanted/[id]/media/route.ts");
    expect(mediaRetry).toContain('attachAsset(asset.id, "BuyRequest", request.id, userId)');
    expect(route).toContain("retryBuyRequestMediaAttachments(created.id, userId)");
    expect(route).toContain("mediaPendingCount: mediaResult.pendingCount");
    expect(retryRoute).toContain("retryBuyRequestMediaAttachments(id, user.id)");
    expect(retryRoute).toContain('status: result.pendingCount === 0 ? 200 : 202');
  });

  it("exposes BuyRequest image previews only to request reviewers and renders owner/admin galleries", () => {
    const mediaRoute = read("src/app/api/media/[id]/route.ts");
    const adminApi = read("src/app/api/admin/requests/route.ts");
    const adminPage = read("src/app/admin/requests/page.tsx");
    const ownerPage = read("src/app/dashboard/wanted/page.tsx");
    expect(mediaRoute).toContain('can(user.id, "request.read")');
    expect(mediaRoute).toContain("isBuyRequestAsset && !!buyRequestOwnerId");
    expect(adminApi).toContain("images: {");
    expect(adminPage).toContain("r.images.map");
    expect(ownerPage).toContain("images: {");
    expect(ownerPage).toContain("r.images.map");
  });

  it("marks owner-only and admin moderation request feeds as private and non-cacheable", () => {
    const wantedApi = read("src/app/api/wanted/route.ts");
    const adminApi = read("src/app/api/admin/requests/route.ts");
    const ownerFeed = wantedApi.split('// ?mine=true')[1]?.split('// Public callers')[0] ?? "";
    expect(ownerFeed).toContain('"Cache-Control": "private, no-store"');
    expect(adminApi).toContain('"Cache-Control": "private, no-store"');
  });

  it("fails closed when the one-migration Preview workflow sees later unapproved DDL", () => {
    const workflow = read(".github/workflows/app-preview-wanted-structural-migration.yml");
    expect(workflow).toContain("# Prisma migrate deploy applies EVERY pending migration in this checkout.");
    expect(workflow).toContain('later_migrations=(');
    expect(workflow).toContain('"20261119190000_first_party_geospatial_foundation"');
    expect(workflow).toContain('"20261120113000_location_source_codes"');
    expect(workflow).toContain('"20261120130000_category_attribute_active_policy"');
    expect(workflow).toContain('"20261120150000_buy_request_images"');
    expect(workflow).toContain("separately reviewed and explicitly approved migration gate");
    expect(read("prisma/migrations/README.md")).toContain("currently includes twelve append-only PostgreSQL migrations");
  });
});
