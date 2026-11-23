import {
  attachAsset,
  deleteAsset,
  getAsset,
  listAssets,
  type MediaAsset,
} from "@/lib/media-service";
import { storeDb } from "@/lib/store-db";

const MEDIA_URL = /^\/api\/media\/([a-f0-9]{24})$/;
export const MAX_STORE_PART_IMAGES = 20;

export function parseStoredPartImageUrls(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function parsePartImageUrls(value: unknown, allowedExistingUrls: string[] = []): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_STORE_PART_IMAGES) return null;
  const urls = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (
    urls.some((url) => !MEDIA_URL.test(url) && !allowedExistingUrls.includes(url)) ||
    new Set(urls).size !== urls.length
  ) {
    return null;
  }
  return urls;
}

export type PartMediaValidation =
  | { ok: true; staged: MediaAsset[] }
  | { ok: false; status: 403 | 503; error: string };

export async function validatePartImageUrls(
  urls: string[],
  userId: string,
  partId?: string,
  allowedExistingUrls: string[] = [],
  allowStagedOwnerOverride = false,
): Promise<PartMediaValidation> {
  const staged: MediaAsset[] = [];
  for (const url of urls) {
    if (allowedExistingUrls.includes(url)) continue;
    const match = MEDIA_URL.exec(url);
    if (!match) {
      return { ok: false, status: 403, error: "تصاویر قطعه باید از مسیر امن رسانه بارگذاری شده باشند." };
    }

    let asset: MediaAsset | null;
    try {
      asset = await getAsset(match[1]);
    } catch {
      return { ok: false, status: 503, error: "بررسی رسانه در فضای ذخیره‌سازی موقتاً ناموفق بود." };
    }

    if (!asset || asset.url !== url || asset.entityType !== "Part") {
      return { ok: false, status: 403, error: "یکی از تصاویر متعلق به چرخه رسانه قطعات فروشگاه نیست." };
    }

    const alreadyAttachedHere =
      !!partId &&
      asset.status === "ATTACHED" &&
      asset.visibility === "PRIVATE" &&
      asset.entityId === partId &&
      asset.relativePath.includes("/objects/");

    if (alreadyAttachedHere) continue;

    const ownedStagedAsset =
      asset.status === "STAGED" &&
      asset.visibility === "PRIVATE" &&
      asset.entityId === null &&
      (asset.uploadedBy === userId || allowStagedOwnerOverride) &&
      asset.relativePath.includes("/staging/");

    if (!ownedStagedAsset) {
      return { ok: false, status: 403, error: "تصویر متعلق به حساب شما نیست، قبلاً به قطعه دیگری متصل شده یا وضعیت آن معتبر نیست." };
    }
    staged.push(asset);
  }

  return { ok: true, staged };
}

export async function attachStagedPartImages(
  assets: MediaAsset[],
  partId: string,
  userId: string,
): Promise<{ attachedCount: number; pendingCount: number }> {
  let attachedCount = 0;
  let pendingCount = 0;
  for (const asset of assets) {
    try {
      const result = await attachAsset(asset.id, "Part", partId, userId, "ADMIN");
      if (result.ok) attachedCount++;
      else pendingCount++;
    } catch {
      pendingCount++;
    }
  }
  return { attachedCount, pendingCount };
}

export async function cleanupPartMediaUrls(
  urls: string[],
  partId: string,
  userId: string,
  allowStagedOwnerOverride = false,
): Promise<{ deletedCount: number; pendingCount: number; pendingUrls: string[] }> {
  let deletedCount = 0;
  let pendingCount = 0;
  const pendingUrls: string[] = [];

  for (const url of urls) {
    const match = MEDIA_URL.exec(url);
    if (!match) continue;

    let asset: MediaAsset | null;
    try {
      asset = await getAsset(match[1]);
    } catch {
      pendingCount++;
      pendingUrls.push(url);
      continue;
    }
    if (!asset) continue;

    const belongsToPart =
      asset.entityType === "Part" &&
      asset.entityId === partId &&
      asset.status === "ATTACHED";
    const isOwnedStagedAsset =
      asset.entityType === "Part" &&
      asset.entityId === null &&
      asset.status === "STAGED" &&
      (asset.uploadedBy === userId || allowStagedOwnerOverride);

    if (!belongsToPart && !isOwnedStagedAsset) {
      pendingCount++;
      pendingUrls.push(url);
      continue;
    }

    try {
      const result = await deleteAsset(asset.id, userId);
      if (result.ok) deletedCount++;
      else {
        pendingCount++;
        pendingUrls.push(url);
      }
    } catch {
      pendingCount++;
      pendingUrls.push(url);
    }
  }

  return { deletedCount, pendingCount, pendingUrls };
}

/**
 * Manual, permission-gated cleanup for abandoned Part media.
 * Staged uploads expire after 24 hours. Attached assets are retained only
 * while their owning Part exists and still references the stable media URL.
 */
export async function cleanupStalePartMedia(
  userId: string,
  now = new Date(),
): Promise<{ scanned: number; deletedCount: number; pendingCount: number }> {
  const assets = await listAssets({ entityType: "Part", limit: 1000 });
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  let deletedCount = 0;
  let pendingCount = 0;

  for (const asset of assets) {
    let shouldDelete = false;
    if (asset.status === "STAGED" && asset.entityId === null) {
      const uploadedAt = Date.parse(asset.uploadedAt);
      shouldDelete = Number.isFinite(uploadedAt) && uploadedAt < cutoff;
    } else if (asset.status === "ATTACHED" && asset.entityId) {
      const part = await storeDb.part.findUnique({
        where: { id: asset.entityId },
        select: { images: true },
      });
      shouldDelete = !part || !parseStoredPartImageUrls(part.images).includes(asset.url);
    }

    if (!shouldDelete) continue;
    try {
      const result = await deleteAsset(asset.id, userId);
      if (result.ok) deletedCount++;
      else pendingCount++;
    } catch {
      pendingCount++;
    }
  }

  return { scanned: assets.length, deletedCount, pendingCount };
}
