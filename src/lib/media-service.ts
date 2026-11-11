/**
 * HEAVIX media service — durable private Backblaze B2 object storage.
 *
 * Binary objects and JSON metadata sidecars live only in the dedicated
 * heavix-dev-assets bucket under heavix-media/. No local filesystem fallback
 * is permitted: missing B2 configuration fails closed.
 *
 * Existing API contract retained:
 *   uploadAsset, listAssets, getAsset, deleteAsset, attachAsset
 *
 * relativePath is retained for API compatibility but now contains the opaque
 * B2 object key, never a local disk path. Public URLs are stable internal
 * /api/media/{assetId} routes; private B2 credentials are never returned.
 */

import {
  B2_MEDIA_SCOPE,
  copyB2MediaObject,
  createB2MediaReadUrl,
  deleteB2MediaObject,
  getB2MediaObject,
  listB2MediaObjects,
  putB2MediaObject,
} from "@/lib/b2-media-storage";
import { validateImageBuffer, sanitizeFilename } from "@/lib/upload-security";
import { optimizeImageBuffer } from "@/lib/media-image-optimizer";
import { logAudit, type AuditActorType } from "@/lib/audit";

const ALLOWED_ENTITY_TYPES = new Set([
  "Listing",
  "Product",
  "Part",
  "Brand",
  "Category",
  "Article",
  "Page",
  "Store",
  "Generic",
]);

export type MediaVisibility = "PUBLIC" | "PRIVATE";
export type MediaStatus = "ACTIVE" | "STAGED" | "ATTACHED";

export interface MediaAsset {
  id: string;
  filename: string;
  originalFilename: string | null;
  /** Stable internal URL; resolves through the private B2 read gate. */
  url: string;
  /** Compatibility field; this is an opaque B2 object key, not a disk path. */
  relativePath: string;
  mimeType: string;
  ext: string;
  size: number;
  uploadedBy: string | null;
  uploadedAt: string;
  entityType: string | null;
  entityId: string | null;
  altText: string | null;
  visibility: MediaVisibility;
  status: MediaStatus;
}

interface AssetSidecar extends MediaAsset {}

function randomAssetId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function monthSubfolder(date = new Date()): string {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return year + "/" + month;
}

function metadataKey(assetId: string): string {
  if (!/^[a-f0-9]{24}$/.test(assetId)) {
    throw new Error("شناسه رسانه نامعتبر است.");
  }
  return B2_MEDIA_SCOPE.prefix + "metadata/" + assetId + ".json";
}

function objectKey(assetId: string, ext: string, date = new Date()): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExt) throw new Error("فرمت فایل نامعتبر است.");
  return B2_MEDIA_SCOPE.prefix + "objects/" + monthSubfolder(date) + "/" + assetId + "." + safeExt;
}

function stagingObjectKey(assetId: string, ext: string, userId: string | null): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  const owner = (userId ?? "").trim();
  if (!safeExt || !/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) {
    throw new Error("مالک یا فرمت فایل برای فضای موقت نامعتبر است.");
  }
  return B2_MEDIA_SCOPE.prefix + "staging/" + owner + "/" + assetId + "." + safeExt;
}

function parseSidecar(bytes: Uint8Array): AssetSidecar | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as AssetSidecar;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      !/^[a-f0-9]{24}$/.test(parsed.id) ||
      typeof parsed.relativePath !== "string" ||
      !parsed.relativePath.startsWith(B2_MEDIA_SCOPE.prefix) ||
      typeof parsed.url !== "string" ||
      parsed.url !== "/api/media/" + parsed.id
    ) {
      return null;
    }
    return {
      ...parsed,
      visibility: parsed.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      status:
        parsed.status === "STAGED" || parsed.status === "ATTACHED"
          ? parsed.status
          : "ACTIVE",
    };
  } catch {
    return null;
  }
}

async function writeSidecar(asset: AssetSidecar): Promise<void> {
  await putB2MediaObject(
    metadataKey(asset.id),
    new TextEncoder().encode(JSON.stringify(asset)),
    "application/json",
  );
}

async function readAllAssets(limit = 1000): Promise<MediaAsset[]> {
  const keys = await listB2MediaObjects(B2_MEDIA_SCOPE.prefix + "metadata/", limit);
  const assets: MediaAsset[] = [];
  for (const key of keys) {
    try {
      const sidecar = parseSidecar(await getB2MediaObject(key));
      if (sidecar) assets.push(sidecar);
    } catch {
      // One missing/corrupt sidecar must not hide all other media records.
    }
  }
  assets.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : a.uploadedAt > b.uploadedAt ? -1 : 0));
  return assets;
}

export interface UploadAssetInput {
  /** Raw uploaded bytes; callers enforce request limits before allocating. */
  file: Buffer;
  uploadedBy: string | null;
  entityType?: string;
  entityId?: string;
  altText?: string;
  originalFilename?: string;
  /** Admin-managed assets are public; seller uploads must explicitly be private. */
  visibility?: MediaVisibility;
  actorType?: AuditActorType;
}

export interface UploadAssetResult {
  ok: boolean;
  asset?: MediaAsset;
  error?: string;
}

export async function uploadAsset(input: UploadAssetInput): Promise<UploadAssetResult> {
  const buffer = input.file;
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: "فایل خالی است." };
  }

  const validation = validateImageBuffer(buffer);
  if (!validation.ok || !validation.type || !validation.ext || !validation.mime) {
    return { ok: false, error: validation.error ?? "فایل نامعتبر است." };
  }

  let optimized: Awaited<ReturnType<typeof optimizeImageBuffer>>;
  try {
    optimized = await optimizeImageBuffer(buffer, validation.type);
  } catch {
    return { ok: false, error: "تصویر نامعتبر است یا ابعاد آن بیش از حد مجاز است." };
  }

  const assetId = randomAssetId();
  const safeName = sanitizeFilename(optimized.ext);
  const storedAt = new Date();
  const visibility: MediaVisibility = input.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
  const key = visibility === "PRIVATE"
    ? stagingObjectKey(assetId, optimized.ext, input.uploadedBy)
    : objectKey(assetId, optimized.ext, storedAt);
  const sidecar: AssetSidecar = {
    id: assetId,
    filename: safeName,
    originalFilename: (input.originalFilename ?? "").replace(/[\\/]/g, "_").replace(/[\\u0000-\\u001F\\u007F]/g, "").slice(0, 255) || null,
    url: "/api/media/" + assetId,
    relativePath: key,
    mimeType: optimized.mime,
    ext: optimized.ext,
    size: optimized.buffer.length,
    uploadedBy: input.uploadedBy ?? null,
    uploadedAt: storedAt.toISOString(),
    entityType: input.entityType && ALLOWED_ENTITY_TYPES.has(input.entityType)
      ? input.entityType
      : null,
    entityId: input.entityId ?? null,
    altText: input.altText?.slice(0, 500) ?? null,
    visibility,
    status: visibility === "PRIVATE" ? "STAGED" : "ACTIVE",
  };

  try {
    await putB2MediaObject(key, new Uint8Array(optimized.buffer), optimized.mime);
    await writeSidecar(sidecar);
  } catch {
    // Best-effort removal creates a B2 delete marker; bucket version retention
    // remains unchanged and no existing object/version is touched.
    await deleteB2MediaObject(key).catch(() => {});
    return { ok: false, error: "ذخیره‌سازی رسانه در فضای پایدار ناموفق بود." };
  }

  await logAudit({
    actorId: input.uploadedBy ?? null,
    actorType: input.actorType ?? (input.uploadedBy ? "USER" : "SYSTEM"),
    action: "media.upload",
    entityType: "MediaAsset",
    entityId: assetId,
    after: {
      filename: safeName,
      url: sidecar.url,
      mimeType: optimized.mime,
      size: optimized.buffer.length,
      entityTypeRef: sidecar.entityType,
      entityIdRef: sidecar.entityId,
      visibility,
    },
    reason: "بارگذاری رسانه در فضای پایدار B2",
  }).catch(() => {});

  return { ok: true, asset: { ...sidecar } };
}

export interface ListAssetsInput {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export async function listAssets(input: ListAssetsInput = {}): Promise<MediaAsset[]> {
  const limit = Math.max(1, Math.min(1000, input.limit ?? 200));
  const all = await readAllAssets(1000);
  let filtered = all;
  if (input.entityType) filtered = filtered.filter((asset) => asset.entityType === input.entityType);
  if (input.entityId) filtered = filtered.filter((asset) => asset.entityId === input.entityId);
  return filtered.slice(0, limit);
}

export async function getAsset(assetId: string): Promise<MediaAsset | null> {
  if (!/^[a-f0-9]{24}$/.test(assetId)) return null;
  try {
    const sidecar = parseSidecar(await getB2MediaObject(metadataKey(assetId)));
    return sidecar ? { ...sidecar } : null;
  } catch (error) {
    if (String(error).includes("HTTP 404")) return null;
    throw error;
  }
}

export async function getAssetReadUrl(assetId: string): Promise<string | null> {
  const asset = await getAsset(assetId);
  if (!asset) return null;
  return createB2MediaReadUrl(asset.relativePath, 300);
}

export async function deleteAsset(
  assetId: string,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const asset = await getAsset(assetId);
  if (!asset) return { ok: false, error: "رسانه یافت نشد." };

  try {
    await deleteB2MediaObject(asset.relativePath);
    await deleteB2MediaObject(metadataKey(assetId));
  } catch {
    return { ok: false, error: "حذف رسانه از فضای پایدار ناموفق بود." };
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "media.delete",
    entityType: "MediaAsset",
    entityId: assetId,
    before: { filename: asset.filename, url: asset.url },
    reason: "حذف رسانه از فضای پایدار B2",
  }).catch(() => {});

  return { ok: true };
}

export async function attachAsset(
  assetId: string,
  entityType: string,
  entityId: string,
  userId: string | null,
  actorType: AuditActorType = "USER",
): Promise<{ ok: boolean; asset?: MediaAsset; error?: string }> {
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return { ok: false, error: "نوع موجودیت نامعتبر است." };
  }
  if (!entityId) return { ok: false, error: "شناسه موجودیت الزامی است." };

  const asset = await getAsset(assetId);
  if (!asset) return { ok: false, error: "رسانه یافت نشد." };

  let finalKey = asset.relativePath;
  const uploadedAt = new Date(asset.uploadedAt);
  if (asset.status === "STAGED" && asset.relativePath.includes("/staging/")) {
    finalKey = objectKey(asset.id, asset.ext, Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt);
    try {
      await copyB2MediaObject(asset.relativePath, finalKey);
    } catch {
      return { ok: false, error: "انتقال رسانه از فضای موقت به فضای نهایی B2 ناموفق بود." };
    }
  }

  const updated: AssetSidecar = {
    ...asset,
    relativePath: finalKey,
    entityType,
    entityId,
    status: "ATTACHED",
  };
  try {
    await writeSidecar(updated);
  } catch {
    // Keep the staging source in place so the existing stable URL still works.
    return { ok: false, error: "به‌روزرسانی متادیتای رسانه ناموفق بود." };
  }

  if (finalKey !== asset.relativePath) {
    // B2 bucket versioning is preserved; DeleteObject creates the normal
    // delete marker and does not purge historical versions.
    await deleteB2MediaObject(asset.relativePath).catch(() => {});
  }

  await logAudit({
    actorId: userId ?? null,
    actorType,
    action: "media.attach",
    entityType: "MediaAsset",
    entityId: assetId,
    before: { entityType: asset.entityType, entityId: asset.entityId },
    after: { entityType, entityId },
    reason: "اتصال رسانه به موجودیت",
  }).catch(() => {});

  return { ok: true, asset: updated };
}
