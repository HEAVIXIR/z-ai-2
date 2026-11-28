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
} from "@/lib/upload-security";
import { optimizeImageBuffer } from "@/lib/media-image-optimizer";
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

const MAX_SIDECAR_BYTES = 4096;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function sidecarPathFor(assetRelativePathWithExt: string): string {
  return `${assetRelativePathWithExt}.meta.json`;
}

function isSafeRelativeAssetPath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !relativePath.includes(String.fromCharCode(92)) &&
    !relativePath.includes(String.fromCharCode(0)) &&
    !path.posix.isAbsolute(relativePath) &&
    !relativePath.split("/").some((part) => !part || part === "." || part === "..")
  );
}

/** Validate persisted metadata against the sidecar's actual filename and asset path. */
function isValidAssetSidecar(
  value: unknown,
  expectedRelativePath: string,
): value is AssetSidecar {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSafeRelativeAssetPath(expectedRelativePath)) return false;

  const expectedFilename = path.posix.basename(expectedRelativePath);
  const extension = path.posix.extname(expectedFilename).slice(1).toLowerCase();
  const expectedMime = MIME_BY_EXTENSION[extension];

  return Boolean(
    expectedMime &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 128 &&
    candidate.filename === expectedFilename &&
    candidate.url === `/uploads/${expectedRelativePath}` &&
    candidate.relativePath === expectedRelativePath &&
    candidate.mimeType === expectedMime &&
    candidate.ext === extension &&
    Number.isSafeInteger(candidate.size) &&
    (candidate.size as number) > 0 &&
    (candidate.uploadedBy === null || typeof candidate.uploadedBy === "string") &&
    typeof candidate.uploadedAt === "string" &&
    Number.isFinite(Date.parse(candidate.uploadedAt)) &&
    (candidate.entityType === null ||
      (typeof candidate.entityType === "string" && ALLOWED_ENTITY_TYPES.has(candidate.entityType))) &&
    (candidate.entityId === null || typeof candidate.entityId === "string") &&
    (candidate.altText === null || typeof candidate.altText === "string")
  );
}

/**
 * Resolve an asset path from persisted metadata without allowing traversal,
 * absolute paths, platform separator tricks, or symlink targets.
 */
async function resolveStoredAssetPath(relativePath: string, expectedSize?: number): Promise<string | null> {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split("/").some((part) => !part || part === "." || part === "..")
  ) return null;

  const root = path.resolve(UPLOAD_ROOT);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (!resolved.startsWith(root + path.sep)) return null;
  try {
    const stat = await fs.lstat(resolved);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (expectedSize !== undefined && stat.size !== expectedSize)
    ) return null;
    const realRoot = await fs.realpath(root);
    const realFile = await fs.realpath(resolved);
    if (!realFile.startsWith(realRoot + path.sep)) return null;
    return resolved;
  } catch {
    return null;
  }
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

/** Read and fully validate a bounded sidecar JSON; returns null if invalid. */
async function readSidecar(
  sidecarFullPath: string,
  expectedRelativePath: string,
): Promise<AssetSidecar | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    const stat = await fs.lstat(sidecarFullPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_SIDECAR_BYTES) {
      return null;
    }

    // Open once, then compare inode identity with lstat to reject a symlink or
    // path swap between the metadata check and the actual read.
    handle = await fs.open(sidecarFullPath, "r");
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.dev !== stat.dev ||
      opened.ino !== stat.ino ||
      opened.size === 0 ||
      opened.size > MAX_SIDECAR_BYTES
    ) {
      return null;
    }

    // Read at most one byte beyond the limit so a concurrent file growth cannot
    // turn a small metadata file into an unbounded allocation.
    const buffer = Buffer.alloc(MAX_SIDECAR_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === 0 || bytesRead > MAX_SIDECAR_BYTES) return null;
    const raw = buffer.toString("utf8", 0, bytesRead);

    const parsed: unknown = JSON.parse(raw);
    if (!isValidAssetSidecar(parsed, expectedRelativePath)) return null;

    // Return only the supported fields; never expose arbitrary persisted JSON keys.
    return {
      id: parsed.id,
      filename: parsed.filename,
      url: parsed.url,
      relativePath: parsed.relativePath,
      mimeType: parsed.mimeType,
      ext: parsed.ext,
      size: parsed.size,
      uploadedBy: parsed.uploadedBy,
      uploadedAt: parsed.uploadedAt,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      altText: parsed.altText,
    };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
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
    const binaryRelativePath = rel.slice(0, -".meta.json".length);
    const sc = await readSidecar(full, binaryRelativePath);
    if (!sc) continue;
    // Ignore stale metadata and assets whose persisted path no longer resolves
    // to a regular file contained by UPLOAD_ROOT.
    if (!(await resolveStoredAssetPath(binaryRelativePath, sc.size))) continue;
    sidecars.push(sc);
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
  /** User id of the uploader (resolved via RBAC Session). */
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

  // 2. Decode under strict pixel/dimension limits and re-encode static images.
  // Sharp strips embedded metadata by default; animated/multi-page images are
  // preserved without flattening. Never expose decoder errors to the caller.
  let optimized: Awaited<ReturnType<typeof optimizeImageBuffer>>;
  try {
    optimized = await optimizeImageBuffer(buffer, validation.type);
  } catch {
    return {
      ok: false,
      error: "تصویر نامعتبر است یا ابعاد آن بیش از حد مجاز است.",
    };
  }
  const storedBuffer = optimized.buffer;

  // 3. Sanitize filename (random, opaque) using the output format, not client MIME.
  const sub = monthSubfolder();
  const targetDir = path.join(UPLOAD_ROOT, sub);
  await fs.mkdir(targetDir, { recursive: true }).catch(() => {});

  // 3. Write binary file exclusively (guard against accidental overwrite).
  // If a randomized filename collision occurs, retry with a new filename rather
  // than clobbering existing content.
  let safeName = sanitizeFilename(optimized.ext);
  let fullDiskPath = path.join(targetDir, safeName);
  let relPath = path.join(sub, safeName).split(path.sep).join("/");
  let publicUrl = `/uploads/${relPath}`;
  let binaryCreated = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.writeFile(fullDiskPath, storedBuffer, { flag: "wx" });
      binaryCreated = true;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 2) {
        return {
          ok: false,
          error: `ذخیره‌سازی فایل ناموفق بود: ${(err as Error).message}`,
        };
      }
      safeName = sanitizeFilename(optimized.ext);
      fullDiskPath = path.join(targetDir, safeName);
      relPath = path.join(sub, safeName).split(path.sep).join("/");
      publicUrl = `/uploads/${relPath}`;
    }
  }
  if (!binaryCreated) {
    return { ok: false, error: "ذخیره‌سازی فایل ناموفق بود." };
  }

  // 4. Build sidecar metadata
  const assetId = generateAssetId();
  const sidecar: AssetSidecar = {
    id: assetId,
    filename: safeName,
    url: publicUrl,
    relativePath: relPath,
    mimeType: optimized.mime,
    ext: optimized.ext,
    size: storedBuffer.length,
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
    await fs.writeFile(sidecarDiskPath, JSON.stringify(sidecar, null, 2), { encoding: "utf8", flag: "wx" });
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
      mimeType: optimized.mime,
      size: storedBuffer.length,
      entityTypeRef: sidecar.entityType,
      entityIdRef: sidecar.entityId,
    },
    reason: `بارگذاری رسانه جدید (${optimized.mime}, ${storedBuffer.length} بایت)`,
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
  const binaryPath = await resolveStoredAssetPath(asset.relativePath, asset.size);
  if (!binaryPath) {
    return { ok: false, error: "مسیر فایل رسانه نامعتبر است یا فایل وجود ندارد." };
  }
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

  const binaryPath = await resolveStoredAssetPath(asset.relativePath, asset.size);
  if (!binaryPath) {
    return { ok: false, error: "مسیر فایل رسانه نامعتبر است یا فایل وجود ندارد." };
  }
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
  // Write a unique temporary sidecar and atomically replace the old one.
  // Readers therefore observe either the previous complete JSON or the new one,
  // never a partially-written document.
  const temporarySidecarPath = `${sidecarPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporarySidecarPath, JSON.stringify(updated, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(temporarySidecarPath, sidecarPath);
  } catch (err) {
    await fs.unlink(temporarySidecarPath).catch(() => {});
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
