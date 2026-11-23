import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Store Part media lifecycle contract", () => {
  it("uses a permissioned, CSRF-protected, rate-limited private B2 staging route", () => {
    const route = read("src/app/api/admin/store/parts/media/route.ts");
    expect(route).toContain('requirePermission(user.id, "store.manage")');
    expect(route).toContain("checkCsrf(request)");
    expect(route).toContain("enforceRateLimit(user.id, UPLOAD)");
    expect(route).toContain('entityType: "Part"');
    expect(route).toContain('visibility: "PRIVATE"');
    expect(route).toContain("MAX_UPLOAD_BYTES");
  });

  it("validates stable media references and attaches only after the Part exists", () => {
    const create = read("src/app/api/admin/store/parts/route.ts");
    expect(create).toContain("validatePartImageUrls(images, user.id)");
    expect(create).toContain("attachStagedPartImages(mediaValidation.staged, part.id, user.id)");
    expect(create).toContain("mediaPendingCount");
    const update = read("src/app/api/admin/store/parts/[id]/route.ts");
    expect(update).toContain("attachStagedPartImages(stagedMediaAssets, part.id, user.id)");
    expect(update).toContain("cleanupPartMediaUrls(removedUrls, id, user.id)");
    const deleteHandler = update.slice(update.indexOf("export async function DELETE"));
    expect(deleteHandler.indexOf("storeDb.part.delete")).toBeLessThan(deleteHandler.indexOf("cleanupPartMediaUrls(existingImageUrls, id, user.id, true)"));
  });

  it("supports attachment retry and cleanup of stale or unreferenced Part assets", () => {
    const retry = read("src/app/api/admin/store/parts/[id]/media/route.ts");
    const cleanup = read("src/app/api/admin/store/parts/media/cleanup/route.ts");
    expect(retry).toContain("attachStagedPartImages");
    expect(retry).toContain("mediaStatus");
    expect(cleanup).toContain("cleanupStalePartMedia");
    expect(cleanup).toContain("requirePermission(user.id, \"store.manage\")");
  });

  it("makes Part media public only when the active Part references an attached asset", () => {
    const media = read("src/app/api/media/[id]/route.ts");
    expect(media).toContain('const isPartAsset = asset.entityType === "Part"');
    expect(media).toContain('asset.status === "ATTACHED"');
    expect(media).toContain("part.active === true && referenced");
    expect(media).toContain('can(user.id, "store.read")');
  });

  it("wires the admin UI to the dedicated uploader, retry and cleanup actions", () => {
    const page = read("src/app/admin/store/parts/page.tsx");
    const uploader = read("src/components/store/StorePartImageUploader.tsx");
    expect(page).toContain("<StorePartImageUploader");
    expect(page).toContain("retryMedia");
    expect(page).toContain("cleanupMedia");
    expect(uploader).toContain('fetch("/api/admin/store/parts/media"');
    expect(uploader).toContain('accept="image/jpeg,image/png,image/webp"');
  });
});
