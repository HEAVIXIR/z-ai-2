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
import { logAuditStrict, type AuditActorType } from "@/lib/audit";

const ALLOWED_ENTITY_TYPES = new Set([
  "Listing",
  "BuyRequest",
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

type AssetSidecar = MediaAsset;

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
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AssetSidecar>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      !/^[a-f0-9]{24}$/.test(parsed.id) ||
      typeof parsed.filename !== "string" ||
      typeof parsed.relativePath !== "string" ||
      !parsed.relativePath.startsWith(B2_MEDIA_SCOPE.prefix) ||
      parsed.relativePath.includes("..") ||
      (!parsed.relativePath.includes("/objects/") && !parsed.relativePath.includes("/staging/")) ||
      typeof parsed.url !== "string" ||
      parsed.url !== "/api/media/" + parsed.id ||
      typeof parsed.mimeType !== "string" ||
      !parsed.mimeType.startsWith("image/") ||
      typeof parsed.ext !== "string" ||
      !/^[a-z0-9]{2,8}$/i.test(parsed.ext) ||
      !Number.isSafeInteger(parsed.size) ||
      Number(parsed.size) <= 0 ||
      typeof parsed.uploadedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.uploadedAt)) ||
      !(parsed.uploadedBy === undefined || parsed.uploadedBy === null || typeof parsed.uploadedBy === "string") ||
      !(parsed.entityType === undefined || parsed.entityType === null || (typeof parsed.entityType === "string" && ALLOWED_ENTITY_TYPES.has(parsed.entityType))) ||
      !(parsed.entityId === undefined || parsed.entityId === null || typeof parsed.entityId === "string") ||
      !(parsed.altText === undefined || parsed.altText === null || typeof parsed.altText === "string") ||
      !(parsed.originalFilename === undefined || parsed.originalFilename === null || typeof parsed.originalFilename === "string") ||
      (parsed.visibility !== "PUBLIC" && parsed.visibility !== "PRIVATE") ||
      (parsed.status !== "ACTIVE" && parsed.status !== "STAGED" && parsed.status !== "ATTACHED")
    ) {
      return null;
    }

    // Fail closed on impossible visibility/status combinations. Unknown or
    // malformed metadata must never silently become a public active asset.
    if (parsed.status === "STAGED" && (parsed.visibility !== "PRIVATE" || !parsed.relativePath.includes("/staging/"))) {
      return null;
    }
    if (parsed.status === "ACTIVE" && (parsed.visibility !== "PUBLIC" || !parsed.relativePath.includes("/objects/"))) {
      return null;
    }
    if (parsed.status === "ATTACHED" && !parsed.relativePath.includes("/objects/")) {
      return null;
    }

    return {
      ...(parsed as AssetSidecar),
      originalFilename: typeof parsed.originalFilename === "string" ? parsed.originalFilename.slice(0, 255) : null,
      uploadedBy: typeof parsed.uploadedBy === "string" ? parsed.uploadedBy : null,
      entityType: typeof parsed.entityType === "string" ? parsed.entityType : null,
      entityId: typeof parsed.entityId === "string" ? parsed.entityId : null,
      altText: typeof parsed.altText === "string" ? parsed.altText.slice(0, 500) : null,
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
  /** Maximum durable optimized object size, derived server-side from the user's plan. */
  maxOutputBytes?: number;
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
    optimized = await optimizeImageBuffer(buffer, validation.type, input.maxOutputBytes);
    if (input.maxOutputBytes !== undefined && optimized.buffer.length > input.maxOutputBytes) {
      return { ok: false, error: "تصویر پس از بهینه‌سازی با سقف حجم پلن حساب مطابقت ندارد." };
    }
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
    originalFilename: (input.originalFilename ?? "").split(/[\\/]/).pop()?.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 255) || null,
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
  } catch (error) {
    // Compensate both writes because a timed-out PUT may have succeeded even
    // when its response was lost. Version history remains governed by B2.
    const cleanup = await Promise.allSettled([
      deleteB2MediaObject(key),
      deleteB2MediaObject(metadataKey(assetId)),
    ]);
    if (cleanup.some((result) => result.status === "rejected")) {
      console.error("[media] failed upload cleanup incomplete", { assetId });
    }
    console.error("[media] B2 upload/sidecar write failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "ذخیره‌سازی رسانه در فضای پایدار ناموفق بود." };
  }

  try {
    await logAuditStrict({
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
    });
  } catch (error) {
    const cleanup = await Promise.allSettled([
      deleteB2MediaObject(key),
      deleteB2MediaObject(metadataKey(assetId)),
    ]);
    if (cleanup.some((result) => result.status === "rejected")) {
      console.error("[media] upload audit rollback incomplete", { assetId });
    }
    console.error("[media] upload audit failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "ثبت رویداد امنیتی رسانه ناموفق بود؛ بارگذاری تأیید نشد." };
  }

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
    await logAuditStrict({
      actorId: userId ?? null,
      actorType: "ADMIN",
      action: "media.delete.requested",
      entityType: "MediaAsset",
      entityId: assetId,
      before: { filename: asset.filename, url: asset.url },
      after: { state: "REQUESTED" },
      reason: "درخواست حذف رسانه از فضای پایدار B2",
    });
  } catch (error) {
    console.error("[media] delete request audit failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "ثبت رویداد حذف ناموفق بود؛ رسانه حذف نشد." };
  }

  try {
    await deleteB2MediaObject(asset.relativePath);
    await deleteB2MediaObject(metadataKey(assetId));
  } catch {
    try {
      await logAuditStrict({
        actorId: userId ?? null,
        actorType: "ADMIN",
        action: "media.delete.failed",
        entityType: "MediaAsset",
        entityId: assetId,
        before: { filename: asset.filename, url: asset.url },
        after: { state: "FAILED" },
        reason: "حذف رسانه از فضای پایدار B2 ناموفق بود",
      });
    } catch (auditError) {
      console.error("[media] delete failure audit failed", {
        assetId,
        error: auditError instanceof Error ? auditError.message : "unknown",
      });
    }
    return { ok: false, error: "حذف رسانه از فضای پایدار ناموفق بود." };
  }

  try {
    await logAuditStrict({
      actorId: userId ?? null,
      actorType: "ADMIN",
      action: "media.delete.completed",
      entityType: "MediaAsset",
      entityId: assetId,
      before: { filename: asset.filename, url: asset.url },
      after: { state: "DELETED" },
      reason: "حذف رسانه از فضای پایدار B2 تکمیل شد",
    });
  } catch (error) {
    // The durable request event already exists; report the completion-audit
    // failure without pretending the external B2 delete can be rolled back.
    console.error("[media] delete completion audit failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

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

  // Idempotent retry is allowed only for the exact same destination.
  if (asset.status === "ATTACHED") {
    if (asset.entityType === entityType && asset.entityId === entityId) {
      return { ok: true, asset };
    }
    return { ok: false, error: "این رسانه قبلاً به موجودیت دیگری متصل شده است." };
  }

  // Seller attachment is restricted to the original owner's private staging
  // asset. Never allow an active/public or unowned asset to be rebound through
  // this path; administrative media flows must use their dedicated controls.
  if (
    actorType === "USER" &&
    (
      asset.status !== "STAGED" ||
      asset.visibility !== "PRIVATE" ||
      asset.entityId !== null ||
      asset.entityType !== entityType ||
      !asset.relativePath.includes("/staging/") ||
      !userId ||
      asset.uploadedBy !== userId
    )
  ) {
    return { ok: false, error: "مالکیت یا وضعیت رسانه برای اتصال معتبر نیست." };
  }

  let finalKey = asset.relativePath;
  const uploadedAt = new Date(asset.uploadedAt);
  if (asset.status === "STAGED" && asset.relativePath.includes("/staging/")) {
    finalKey = objectKey(asset.id, asset.ext, Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt);
    try {
      await copyB2MediaObject(asset.relativePath, finalKey);
    } catch (error) {
      await deleteB2MediaObject(finalKey).catch((cleanupError) => {
        console.error("[media] failed copy cleanup incomplete", {
          assetId,
          error: cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
      });
      console.error("[media] B2 staging copy failed", {
        assetId,
        error: error instanceof Error ? error.message : "unknown",
      });
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
  } catch (error) {
    // Keep the original staging object/sidecar as the source of truth and
    // remove any final copy whose metadata could not be committed.
    if (finalKey !== asset.relativePath) {
      await deleteB2MediaObject(finalKey).catch((cleanupError) => {
        console.error("[media] failed metadata rollback cleanup", {
          assetId,
          error: cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
      });
    }
    console.error("[media] B2 sidecar update failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "به‌روزرسانی متادیتای رسانه ناموفق بود." };
  }

  try {
    await logAuditStrict({
      actorId: userId ?? null,
      actorType,
      action: "media.attach",
      entityType: "MediaAsset",
      entityId: assetId,
      before: { entityType: asset.entityType, entityId: asset.entityId },
      after: { entityType, entityId },
      reason: "اتصال رسانه به موجودیت",
    });
  } catch (error) {
    const cleanup = await Promise.allSettled([
      writeSidecar(asset),
      ...(finalKey !== asset.relativePath ? [deleteB2MediaObject(finalKey)] : []),
    ]);
    if (cleanup.some((result) => result.status === "rejected")) {
      console.error("[media] attach audit rollback incomplete", { assetId });
    }
    console.error("[media] attach audit failed", {
      assetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "ثبت رویداد اتصال رسانه ناموفق بود؛ اتصال تأیید نشد." };
  }

  if (finalKey !== asset.relativePath) {
    // Remove the staging source only after the updated sidecar and strict
    // audit row are durable. A failed delete is retained for later cleanup.
    try {
      await deleteB2MediaObject(asset.relativePath);
    } catch (error) {
      console.error("[media] stale staging object cleanup required", {
        assetId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return { ok: true, asset: updated };
}
