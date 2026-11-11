import { beforeEach, describe, expect, it, vi } from "vitest";

const b2State = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  copyCalls: [] as Array<[string, string]>,
  deleteCalls: [] as string[],
  readUrlCalls: [] as string[],
  listCalls: [] as string[],
}));

vi.mock("@/lib/b2-media-storage", () => ({
  B2_MEDIA_SCOPE: {
    bucket: "heavix-dev-assets",
    prefix: "heavix-media/",
    region: "us-east-005",
    endpoint: "https://s3.us-east-005.backblazeb2.com",
  },
  putB2MediaObject: vi.fn(async (key: string, body: Uint8Array) => {
    b2State.objects.set(key, new Uint8Array(body));
  }),
  getB2MediaObject: vi.fn(async (key: string) => {
    const value = b2State.objects.get(key);
    if (!value) throw new Error("B2 object operation failed (HTTP 404).");
    return new Uint8Array(value);
  }),
  deleteB2MediaObject: vi.fn(async (key: string) => {
    b2State.deleteCalls.push(key);
    b2State.objects.delete(key);
  }),
  copyB2MediaObject: vi.fn(async (source: string, destination: string) => {
    const value = b2State.objects.get(source);
    if (!value) throw new Error("source missing");
    b2State.copyCalls.push([source, destination]);
    b2State.objects.set(destination, new Uint8Array(value));
  }),
  listB2MediaObjects: vi.fn(async (prefix: string) => {
    b2State.listCalls.push(prefix);
    return [...b2State.objects.keys()].filter((key) => key.startsWith(prefix));
  }),
  createB2MediaReadUrl: vi.fn(async (key: string) => {
    b2State.readUrlCalls.push(key);
    return "https://signed.example.invalid/" + encodeURIComponent(key) + "?ttl=300";
  }),
}));

vi.mock("@/lib/upload-security", () => ({
  validateImageBuffer: vi.fn(() => ({
    ok: true,
    type: "png",
    ext: "png",
    mime: "image/png",
  })),
  sanitizeFilename: vi.fn(() => "opaque-asset.png"),
}));

vi.mock("@/lib/media-image-optimizer", () => ({
  optimizeImageBuffer: vi.fn(async () => ({
    buffer: Buffer.from("optimized-image-bytes"),
    type: "webp",
    ext: "webp",
    mime: "image/webp",
    reencoded: true,
  })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

import {
  attachAsset,
  deleteAsset,
  getAsset,
  getAssetReadUrl,
  listAssets,
  uploadAsset,
} from "@/lib/media-service";

describe("B2-backed media service", () => {
  beforeEach(() => {
    b2State.objects.clear();
    b2State.copyCalls.length = 0;
    b2State.deleteCalls.length = 0;
    b2State.readUrlCalls.length = 0;
    b2State.listCalls.length = 0;
    vi.clearAllMocks();
  });

  it("stores seller uploads under the authenticated owner's staging prefix", async () => {
    const result = await uploadAsset({
      file: Buffer.from("untrusted input"),
      uploadedBy: "seller_123",
      originalFilename: "../machine/photo.png",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });

    expect(result.ok).toBe(true);
    expect(result.asset?.status).toBe("STAGED");
    expect(result.asset?.visibility).toBe("PRIVATE");
    expect(result.asset?.relativePath).toMatch(/^heavix-media\/staging\/seller_123\/[a-f0-9]{24}\.webp$/);
    expect(result.asset?.originalFilename).toBe("photo.png");
    expect(result.asset?.url).toBe("/api/media/" + result.asset?.id);
    expect(b2State.objects.has("heavix-media/metadata/" + result.asset?.id + ".json")).toBe(true);
  });

  it("stores admin-managed public media directly under the final object prefix", async () => {
    const result = await uploadAsset({
      file: Buffer.from("admin image"),
      uploadedBy: "admin_1",
      actorType: "ADMIN",
    });

    expect(result.ok).toBe(true);
    expect(result.asset?.visibility).toBe("PUBLIC");
    expect(result.asset?.status).toBe("ACTIVE");
    expect(result.asset?.relativePath).toMatch(/^heavix-media\/objects\/\d{4}\/\d{2}\//);
  });

  it("copies an owned staged object to the final prefix before attaching it", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_456",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });
    expect(uploaded.asset).toBeDefined();
    const stagedKey = uploaded.asset!.relativePath;

    const attached = await attachAsset(uploaded.asset!.id, "Listing", "listing_1", "seller_456");

    expect(attached.ok).toBe(true);
    expect(attached.asset?.status).toBe("ATTACHED");
    expect(attached.asset?.entityId).toBe("listing_1");
    expect(attached.asset?.relativePath).toMatch(/^heavix-media\/objects\/\d{4}\/\d{2}\//);
    expect(b2State.copyCalls).toEqual([[stagedKey, attached.asset!.relativePath]]);
    expect(b2State.deleteCalls).toContain(stagedKey);
  });

  it("lists sidecars from the metadata namespace", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_789",
      entityType: "Listing",
      visibility: "PRIVATE",
    });
    const assets = await listAssets({ entityType: "Listing", limit: 10 });

    expect(assets.map((asset) => asset.id)).toContain(uploaded.asset?.id);
    expect(b2State.listCalls).toContain("heavix-media/metadata/");
  });

  it("issues a short-lived read URL for the server-resolved B2 object key", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_789",
      entityType: "Listing",
      visibility: "PRIVATE",
    });
    const url = await getAssetReadUrl(uploaded.asset!.id);

    expect(url).toContain("ttl=300");
    expect(b2State.readUrlCalls).toEqual([uploaded.asset!.relativePath]);
  });

  it("deletes both binary object and metadata sidecar", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("admin image"),
      uploadedBy: "admin_1",
      actorType: "ADMIN",
    });
    const result = await deleteAsset(uploaded.asset!.id, "admin_1");

    expect(result.ok).toBe(true);
    expect(b2State.deleteCalls).toContain(uploaded.asset!.relativePath);
    expect(b2State.deleteCalls).toContain("heavix-media/metadata/" + uploaded.asset!.id + ".json");
    expect(await getAsset(uploaded.asset!.id)).toBeNull();
  });

  it("rejects an invalid asset id without touching B2", async () => {
    expect(await getAsset("../escape")).toBeNull();
    expect(b2State.listCalls).toHaveLength(0);
    expect(b2State.readUrlCalls).toHaveLength(0);
  });
});
