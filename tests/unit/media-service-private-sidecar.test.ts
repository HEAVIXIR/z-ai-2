import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

vi.mock("@/lib/upload-security", () => ({
  validateImageBuffer: vi.fn(() => ({
    ok: true,
    type: "jpeg",
    ext: "jpg",
    mime: "image/jpeg",
  })),
  sanitizeFilename: vi.fn(
    () => `media-private-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
  ),
}));

vi.mock("@/lib/media-image-optimizer", () => ({
  optimizeImageBuffer: vi.fn(async (buffer: Buffer) => ({
    buffer,
    ext: "jpg",
    mime: "image/jpeg",
  })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

import {
  attachAsset,
  deleteAsset,
  listAssets,
  uploadAsset,
} from "@/lib/media-service";

const uploadsRoot = path.join(process.cwd(), "public", "uploads");
const metadataRoot = path.join(process.cwd(), ".heavix-media-metadata");
const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((target) =>
      fs.rm(target, { recursive: true, force: true }),
    ),
  );
});

function assetPaths(relativePath: string) {
  const parts = relativePath.split("/");
  return {
    binary: path.join(uploadsRoot, ...parts),
    publicSidecar: path.join(uploadsRoot, ...parts) + ".meta.json",
    privateSidecar: path.join(metadataRoot, ...parts) + ".meta.json",
  };
}

describe("media service private sidecar storage", () => {
  it("writes metadata outside public, supports attach/list, and deletes private metadata", async () => {
    const result = await uploadAsset({
      file: Buffer.from("image-fixture"),
      uploadedBy: "admin-test",
      entityType: "Generic",
      entityId: "entity-before",
      altText: "private metadata test",
    });

    expect(result.ok).toBe(true);
    expect(result.asset).toBeDefined();
    const asset = result.asset!;
    const paths = assetPaths(asset.relativePath);
    cleanupPaths.push(paths.binary, paths.privateSidecar, paths.publicSidecar);

    const raw = await fs.readFile(paths.privateSidecar, "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      id: asset.id,
      uploadedBy: "admin-test",
      entityId: "entity-before",
    });
    await expect(fs.access(paths.publicSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const attached = await attachAsset(
      asset.id,
      "Listing",
      "listing-private-sidecar",
      "admin-test",
    );
    expect(attached.ok).toBe(true);
    expect(attached.asset?.entityType).toBe("Listing");
    expect(attached.asset?.entityId).toBe("listing-private-sidecar");

    const listed = await listAssets({ entityId: "listing-private-sidecar" });
    expect(listed.some((item) => item.id === asset.id)).toBe(true);

    const deleted = await deleteAsset(asset.id, "admin-test");
    expect(deleted.ok).toBe(true);
    await expect(fs.access(paths.privateSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(paths.binary)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("moves legacy public sidecars to private metadata storage before returning assets", async () => {
    const folder = `legacy-sidecar-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const relativePath = `${folder}/legacy.jpg`;
    const paths = assetPaths(relativePath);
    cleanupPaths.push(path.join(uploadsRoot, folder), path.join(metadataRoot, folder));

    await fs.mkdir(path.dirname(paths.binary), { recursive: true });
    await fs.writeFile(paths.binary, Buffer.from("legacy-image"));
    await fs.writeFile(
      paths.publicSidecar,
      JSON.stringify({
        id: "0123456789abcdef01234567",
        filename: "legacy.jpg",
        url: `/uploads/${relativePath}`,
        relativePath,
        mimeType: "image/jpeg",
        ext: "jpg",
        size: 12,
        uploadedBy: "legacy-admin",
        uploadedAt: "2026-11-07T00:00:00.000Z",
        entityType: "Listing",
        entityId: "legacy-entity",
        altText: null,
      }),
    );

    const listed = await listAssets({ entityId: "legacy-entity" });

    expect(listed.some((item) => item.id === "0123456789abcdef01234567")).toBe(true);
    await expect(fs.access(paths.publicSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(paths.privateSidecar)).resolves.toBeUndefined();
  });

  it("rejects sidecars whose embedded path disagrees with their on-disk path", async () => {
    const folder = `invalid-sidecar-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const relativePath = `${folder}/invalid.jpg`;
    const paths = assetPaths(relativePath);
    const outside = path.join(process.cwd(), `media-sidecar-escape-${Date.now()}.txt`);
    cleanupPaths.push(path.join(uploadsRoot, folder), path.join(metadataRoot, folder), outside);

    await fs.mkdir(path.dirname(paths.binary), { recursive: true });
    await fs.writeFile(paths.binary, Buffer.from("legacy-image"));
    await fs.writeFile(outside, "must remain untouched");
    await fs.writeFile(
      paths.publicSidecar,
      JSON.stringify({
        id: "fedcba9876543210fedcba98",
        filename: "invalid.jpg",
        url: "/uploads/../../media-sidecar-escape.txt",
        relativePath: "../../media-sidecar-escape.txt",
        mimeType: "image/jpeg",
        ext: "jpg",
        size: 12,
        uploadedBy: "unknown",
        uploadedAt: "2026-11-07T00:00:00.000Z",
        entityType: null,
        entityId: null,
        altText: null,
      }),
    );

    const listed = await listAssets();
    expect(listed.some((item) => item.id === "fedcba9876543210fedcba98")).toBe(false);
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("must remain untouched");
    await expect(fs.access(paths.publicSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
