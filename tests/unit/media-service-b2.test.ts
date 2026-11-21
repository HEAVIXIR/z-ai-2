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
  logAuditStrict: vi.fn(async () => undefined),
}));

import { logAuditStrict } from "@/lib/audit";

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

  it("rejects attaching another seller's staged media", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_owner",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });

    const result = await attachAsset(uploaded.asset!.id, "Listing", "listing_other", "seller_other");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("مالکیت یا وضعیت رسانه");
    expect(b2State.copyCalls).toHaveLength(0);
    expect((await getAsset(uploaded.asset!.id))?.status).toBe("STAGED");
  });

  it("rejects reusing an already attached seller asset", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_owner",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });

    const first = await attachAsset(uploaded.asset!.id, "Listing", "listing_first", "seller_owner");
    const second = await attachAsset(uploaded.asset!.id, "Listing", "listing_second", "seller_owner");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toContain("قبلاً");
    expect(b2State.copyCalls).toHaveLength(1);
    expect((await getAsset(uploaded.asset!.id))?.entityId).toBe("listing_first");
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

  it("rolls back uploaded B2 objects when the required audit write fails", async () => {
    vi.mocked(logAuditStrict).mockRejectedValueOnce(new Error("audit unavailable"));
    const result = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_audit_failure",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });

    expect(result.ok).toBe(false);
    expect(b2State.objects.size).toBe(0);
    expect(b2State.deleteCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not delete a B2 asset when the required request audit fails", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("admin image"),
      uploadedBy: "admin_audit_failure",
      actorType: "ADMIN",
    });
    vi.mocked(logAuditStrict).mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await deleteAsset(uploaded.asset!.id, "admin_audit_failure");

    expect(result.ok).toBe(false);
    expect(b2State.deleteCalls).toHaveLength(0);
    expect(await getAsset(uploaded.asset!.id)).not.toBeNull();
  });

  it("restores the staged sidecar when the required attach audit fails", async () => {
    const uploaded = await uploadAsset({
      file: Buffer.from("seller image"),
      uploadedBy: "seller_attach_audit",
      entityType: "Listing",
      visibility: "PRIVATE",
      actorType: "USER",
    });
    vi.mocked(logAuditStrict).mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await attachAsset(
      uploaded.asset!.id,
      "Listing",
      "listing_audit_failure",
      "seller_attach_audit",
    );

    expect(result.ok).toBe(false);
    expect((await getAsset(uploaded.asset!.id))?.status).toBe("STAGED");
    expect((await getAsset(uploaded.asset!.id))?.entityId).toBeNull();
    expect(b2State.copyCalls).toHaveLength(1);
    expect(b2State.deleteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects an invalid asset id without touching B2", async () => {
    expect(await getAsset("../escape")).toBeNull();
    expect(b2State.listCalls).toHaveLength(0);
    expect(b2State.readUrlCalls).toHaveLength(0);
  });
});


describe("B2 sidecar integrity", () => {
  it("fails closed for unknown sidecar visibility and status values", async () => {
      const id = "a".repeat(24);
      const key = "heavix-media/metadata/" + id + ".json";
      const base = {
        id,
        filename: "opaque-asset.webp",
        originalFilename: null,
        url: "/api/media/" + id,
        relativePath: "heavix-media/objects/2026/11/" + id + ".webp",
        mimeType: "image/webp",
        ext: "webp",
        size: 123,
        uploadedBy: "seller_1",
        uploadedAt: new Date().toISOString(),
        entityType: null,
        entityId: null,
        altText: null,
        visibility: "PUBLIC",
        status: "ACTIVE",
      };
  
      b2State.objects.set(
        key,
        new TextEncoder().encode(JSON.stringify({ ...base, visibility: "UNKNOWN" })),
      );
      expect(await getAsset(id)).toBeNull();
  
      b2State.objects.set(
        key,
        new TextEncoder().encode(JSON.stringify({ ...base, status: "UNKNOWN" })),
      );
      expect(await getAsset(id)).toBeNull();
  
      b2State.objects.set(
        key,
        new TextEncoder().encode(JSON.stringify({ ...base, visibility: "PRIVATE", status: "ACTIVE" })),
      );
      expect(await getAsset(id)).toBeNull();
    });
});
