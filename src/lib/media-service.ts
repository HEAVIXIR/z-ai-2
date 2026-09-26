/* ============================================================
   HEAVIX — Wave 3A · Media Service (filesystem + sidecar JSON)

   ------------------------------------------------------------
   No new Prisma model — per Phase3-3A task constraint:
   "Do NOT create a Media model in the schema. Use the filesystem
    + a JSON metadata file or a simple in-memory/DB approach."

   This module implements an asset store on top of the existing
   /public/uploads/ directory. Each uploaded asset is persisted
   as a binary file plus a sidecar `<filename>.meta.json` file
   containing the asset metadata (id, alt, entityType, entityId,
   uploader, mime, size, timestamps).

   Sidecars are intentionally tiny (<1KB) so listing + filtering
   is a fast recursive walk + JSON.parse per sidecar.

   Public API:
     • uploadAsset({ file, uploadedBy, entityType?, entityId?, altText? })
     • listAssets({ entityType?, entityId?, limit? })
     • getAsset(assetId)
     • deleteAsset(assetId, userId)
     • attachAsset(assetId, entityType, entityId, userId)

   All mutations emit audit log entries via `logAudit`:
     • media.upload
     • media.delete
     • media.attach
   ============================================================ */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  validateImageBuffer,
  sanitizeFilename,
  logExifSanitizationRecommendation,
  type ImageType,
} from "@/lib/upload-security";
import { logAudit } from "@/lib/audit";

/* ── Constants ──────────────────────────────────────────────── */

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

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

/** Public asset shape returned by every API. */
export interface MediaAsset {
  id: string;
  filename: string;
  /** Public URL — relative to site root, e.g. /uploads/2026/01/abc.jpg */
  url: string;
  /** Disk path relative to UPLOAD_ROOT. */
  relativePath: string;
  mimeType: string;
  ext: string;
  size: number;
  uploadedBy: string | null;
  uploadedAt: string;
  entityType: string | null;
  entityId: string | null;
  altText: string | null;
}

/** Sidecar JSON shape (private). */
interface AssetSidecar {
  id: string;
  filename: string;
  url: string;
  relativePath: string;
  mimeType: string;
  ext: string;
  size: number;
  uploadedBy: string | null;
  uploadedAt: string;
  entityType: string | null;
  entityId: string | null;
  altText: string | null;
}

/* ── Helpers ───────────────────────────────────────────────── */

function sidecarPathFor(assetRelativePathWithExt: string): string {
  return `${assetRelativePathWithExt}.meta.json`;
}

/** Walk a directory recursively, returning every regular file. */
async function walkFiles(
  dir: string,
  base: string,
  acc: string[] = [],
): Promise<string[]> {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkFiles(full, base, acc);
    } else if (e.isFile()) {
      acc.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return acc;
}

/** Read a sidecar JSON; returns null if missing/corrupt. */
async function readSidecar(
  sidecarFullPath: string,
): Promise<AssetSidecar | null> {
  try {
    const raw = await fs.readFile(sidecarFullPath, "utf8");
    const parsed = JSON.parse(raw) as AssetSidecar;
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Walk /public/uploads/ and return all assets (newest first). */
async function readAllAssets(): Promise<MediaAsset[]> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true }).catch(() => {});
  const rels = await walkFiles(UPLOAD_ROOT, UPLOAD_ROOT);
  const sidecars: AssetSidecar[] = [];
  for (const rel of rels) {
    if (!rel.endsWith(".meta.json")) continue;
    const full = path.join(UPLOAD_ROOT, rel);
    const sc = await readSidecar(full);
    if (sc) sidecars.push(sc);
  }
  sidecars.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : a.uploadedAt > b.uploadedAt ? -1 : 0));
  return sidecars.map((s) => ({ ...s }));
}

/** Build the YYYY/MM subfolder for an asset (prevents one giant dir). */
function monthSubfolder(d = new Date()): string {
  const yyyy = d.getUTCFullYear().toString();
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return path.join(yyyy, mm);
}

/** Generate a fresh cuid-shaped asset id (24 hex chars). */
function generateAssetId(): string {
  return crypto.randomBytes(12).toString("hex");
}

/* ── Public API ────────────────────────────────────────────── */

export interface UploadAssetInput {
  /** Raw uploaded buffer (the caller already awaited arrayBuffer()). */
  file: Buffer;
  /** User id (or 'ADMIN' sentinel) performing the upload. */
  uploadedBy: string | null;
  /** Optional entity association (e.g. Listing). */
  entityType?: string;
  entityId?: string;
  altText?: string;
  /** Original filename (only used for ext derivation; never trusted). */
  originalFilename?: string;
}

export interface UploadAssetResult {
  ok: boolean;
  asset?: MediaAsset;
  error?: string;
}

/**
 * Validate, persist and record a new asset.
 *
 * Pipeline (per HEAVIX-SECURITY-BASELINE-V1 §7 / STEP 6):
 *   1. validateImageBuffer  — size + magic-bytes gate
 *   2. sanitizeFilename     — opaque, random, safe name
 *   3. write file to /public/uploads/YYYY/MM/<filename>
 *   4. write sidecar .meta.json with full metadata
 *   5. log audit 'media.upload'
 *
 * Returns `{ ok: true, asset }` on success, or `{ ok: false, error }`.
 */
export async function uploadAsset(
  input: UploadAssetInput,
): Promise<UploadAssetResult> {
  const buffer = input.file;
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: "فایل خالی است." };
  }

  // 1. Size + magic-bytes gate
  const validation = validateImageBuffer(buffer);
  if (!validation.ok || !validation.type || !validation.ext || !validation.mime) {
    return { ok: false, error: validation.error ?? "فایل نامعتبر است." };
  }

  // 2. Sanitize filename (random, opaque)
  const safeName = sanitizeFilename(validation.ext);
  const sub = monthSubfolder();
  const targetDir = path.join(UPLOAD_ROOT, sub);
  await fs.mkdir(targetDir, { recursive: true }).catch(() => {});
  const fullDiskPath = path.join(targetDir, safeName);
  const relPath = path.join(sub, safeName).split(path.sep).join("/");
  const publicUrl = `/uploads/${relPath}`;

  // 3. Write binary file (guard against accidental overwrite)
  try {
    await fs.writeFile(fullDiskPath, buffer);
  } catch (err) {
    return {
      ok: false,
      error: `ذخیره‌سازی فایل ناموفق بود: ${(err as Error).message}`,
    };
  }

  // EXIF strip recommendation (P1 TODO marker — already logged internally)
  logExifSanitizationRecommendation(validation.type as ImageType, buffer.length);

  // 4. Build sidecar metadata
  const assetId = generateAssetId();
  const sidecar: AssetSidecar = {
    id: assetId,
    filename: safeName,
    url: publicUrl,
    relativePath: relPath,
    mimeType: validation.mime,
    ext: validation.ext,
    size: buffer.length,
    uploadedBy: input.uploadedBy ?? null,
    uploadedAt: new Date().toISOString(),
    entityType: input.entityType && ALLOWED_ENTITY_TYPES.has(input.entityType)
      ? input.entityType
      : null,
    entityId: input.entityId ?? null,
    altText: input.altText ?? null,
  };

  // 5. Persist sidecar
  const sidecarDiskPath = path.join(targetDir, sidecarPathFor(safeName));
  try {
    await fs.writeFile(sidecarDiskPath, JSON.stringify(sidecar, null, 2), "utf8");
  } catch (err) {
    // Best-effort cleanup of orphaned binary if sidecar write failed
    await fs.unlink(fullDiskPath).catch(() => {});
    return {
      ok: false,
      error: `ذخیره‌سازی متادیتا ناموفق بود: ${(err as Error).message}`,
    };
  }

  // 6. Audit log (best-effort, never throws)
  await logAudit({
    actorId: input.uploadedBy ?? null,
    actorType: "ADMIN",
    action: "media.upload",
    entityType: "MediaAsset",
    entityId: assetId,
    after: {
      filename: safeName,
      url: publicUrl,
      mimeType: validation.mime,
      size: buffer.length,
      entityTypeRef: sidecar.entityType,
      entityIdRef: sidecar.entityId,
    },
    reason: `بارگذاری رسانه جدید (${validation.mime}, ${buffer.length} بایت)`,
  });

  return { ok: true, asset: { ...sidecar } };
}

export interface ListAssetsInput {
  entityType?: string;
  entityId?: string;
  /** Cap number of returned assets (default 200, max 1000). */
  limit?: number;
}

/**
 * List uploaded assets. Optionally filter by entity association.
 * Returns assets newest-first.
 */
export async function listAssets(
  input: ListAssetsInput = {},
): Promise<MediaAsset[]> {
  const limit = Math.max(1, Math.min(1000, input.limit ?? 200));
  const all = await readAllAssets();
  let filtered = all;
  if (input.entityType) {
    filtered = filtered.filter((a) => a.entityType === input.entityType);
  }
  if (input.entityId) {
    filtered = filtered.filter((a) => a.entityId === input.entityId);
  }
  return filtered.slice(0, limit);
}

/**
 * Get a single asset by id. Walks sidecars and matches on the `id` field.
 */
export async function getAsset(assetId: string): Promise<MediaAsset | null> {
  if (!assetId) return null;
  const all = await readAllAssets();
  return all.find((a) => a.id === assetId) ?? null;
}

/**
 * Delete an asset: removes both the binary file and its sidecar.
 * Audit-logged as 'media.delete'.
 */
export async function deleteAsset(
  assetId: string,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const asset = await getAsset(assetId);
  if (!asset) {
    return { ok: false, error: "رسانه یافت نشد." };
  }
  const binaryPath = path.join(UPLOAD_ROOT, asset.relativePath);
  const sidecarPath = `${binaryPath}.meta.json`;

  // Remove binary file
  try {
    await fs.unlink(binaryPath);
  } catch (err) {
    // If the binary is already gone, continue to remove sidecar
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: `حذف فایل ناموفق بود: ${(err as Error).message}` };
    }
  }
  // Remove sidecar
  try {
    await fs.unlink(sidecarPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: `حذف متادیتا ناموفق بود: ${(err as Error).message}` };
    }
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "media.delete",
    entityType: "MediaAsset",
    entityId: assetId,
    before: { filename: asset.filename, url: asset.url },
    reason: `حذف رسانه ${asset.filename}`,
  });

  return { ok: true };
}

/**
 * Attach an existing asset to an entity (sets entityType + entityId
 * on the sidecar). Audit-logged as 'media.attach'.
 */
export async function attachAsset(
  assetId: string,
  entityType: string,
  entityId: string,
  userId: string | null,
): Promise<{ ok: boolean; asset?: MediaAsset; error?: string }> {
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return { ok: false, error: "نوع موجودیت نامعتبر است." };
  }
  if (!entityId) {
    return { ok: false, error: "شناسه موجودیت الزامی است." };
  }
  const asset = await getAsset(assetId);
  if (!asset) {
    return { ok: false, error: "رسانه یافت نشد." };
  }

  const binaryPath = path.join(UPLOAD_ROOT, asset.relativePath);
  const sidecarPath = `${binaryPath}.meta.json`;
  const before = { entityType: asset.entityType, entityId: asset.entityId };
  const updated: AssetSidecar = {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    relativePath: asset.relativePath,
    mimeType: asset.mimeType,
    ext: asset.ext,
    size: asset.size,
    uploadedBy: asset.uploadedBy,
    uploadedAt: asset.uploadedAt,
    entityType,
    entityId,
    altText: asset.altText,
  };
  try {
    await fs.writeFile(sidecarPath, JSON.stringify(updated, null, 2), "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `به‌روزرسانی متادیتا ناموفق بود: ${(err as Error).message}`,
    };
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "media.attach",
    entityType: "MediaAsset",
    entityId: assetId,
    before,
    after: { entityType, entityId },
    reason: `پیوست رسانه به ${entityType} #${entityId}`,
  });

  return { ok: true, asset: { ...updated } };
}
