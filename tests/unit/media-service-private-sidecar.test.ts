import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
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

type MediaService = typeof import("@/lib/media-service");
let service: MediaService;
let testRoot = "";
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "heavix-media-sidecar-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testRoot);
  service = await import("@/lib/media-service");
});

afterAll(async () => {
  cwdSpy.mockRestore();
  await fs.rm(testRoot, { recursive: true, force: true });
});

function assetPaths(relativePath: string) {
  const parts = relativePath.split("/");
  const uploadsRoot = path.join(testRoot, "public", "uploads");
  const metadataRoot = path.join(testRoot, ".heavix-media-metadata");
  return {
    binary: path.join(uploadsRoot, ...parts),
    publicSidecar: path.join(uploadsRoot, ...parts) + ".meta.json",
    privateSidecar: path.join(metadataRoot, ...parts) + ".meta.json",
  };
}

describe("media service private sidecar storage", () => {
  it("writes metadata outside public, supports attach/list, and deletes private metadata", async () => {
    const result = await service.uploadAsset({
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

    const raw = await fs.readFile(paths.privateSidecar, "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      id: asset.id,
      uploadedBy: "admin-test",
      entityId: "entity-before",
    });
    await expect(fs.access(paths.publicSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const attached = await service.attachAsset(
      asset.id,
      "Listing",
      "listing-private-sidecar",
      "admin-test",
    );
    expect(attached.ok).toBe(true);
    expect(attached.asset?.entityType).toBe("Listing");
    expect(attached.asset?.entityId).toBe("listing-private-sidecar");

    const listed = await service.listAssets({ entityId: "listing-private-sidecar" });
    expect(listed.some((item) => item.id === asset.id)).toBe(true);

    const deleted = await service.deleteAsset(asset.id, "admin-test");
    expect(deleted.ok).toBe(true);
    await expect(fs.access(paths.privateSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(paths.binary)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reads legacy public sidecars without mutating them during listing, then privatizes on attach", async () => {
    const folder = `legacy-sidecar-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const relativePath = `${folder}/legacy.jpg`;
    const paths = assetPaths(relativePath);

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

    const listed = await service.listAssets({ entityId: "legacy-entity" });

    expect(listed.some((item) => item.id === "0123456789abcdef01234567")).toBe(true);
    await expect(fs.access(paths.publicSidecar)).resolves.toBeUndefined();
    await expect(fs.access(paths.privateSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const attached = await service.attachAsset(
      "0123456789abcdef01234567",
      "Listing",
      "legacy-entity-updated",
      "admin-test",
    );
    expect(attached.ok).toBe(true);
    await expect(fs.access(paths.publicSidecar)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(paths.privateSidecar)).resolves.toBeUndefined();
  });

  it("rejects sidecars whose embedded path disagrees with their on-disk path", async () => {
    const folder = `invalid-sidecar-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const relativePath = `${folder}/invalid.jpg`;
    const paths = assetPaths(relativePath);
    const outside = path.join(testRoot, "must-remain-untouched.txt");

    await fs.mkdir(path.dirname(paths.binary), { recursive: true });
    await fs.writeFile(paths.binary, Buffer.from("legacy-image"));
    await fs.writeFile(outside, "must remain untouched");
    await fs.writeFile(
      paths.publicSidecar,
      JSON.stringify({
        id: "fedcba9876543210fedcba98",
        filename: "invalid.jpg",
        url: "/uploads/../../must-remain-untouched.txt",
        relativePath: "../../must-remain-untouched.txt",
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

    const listed = await service.listAssets();
    expect(listed.some((item) => item.id === "fedcba9876543210fedcba98")).toBe(false);
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("must remain untouched");
    await expect(fs.access(paths.publicSidecar)).resolves.toBeUndefined();
  });
});
