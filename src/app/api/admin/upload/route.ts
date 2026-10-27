import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preserve the existing MediaUploader contract while respecting the hosting cap.
const MAX_ADMIN_UPLOAD_BYTES = Math.min(MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
const MAX_UPLOAD_REQUEST_BYTES = MAX_ADMIN_UPLOAD_BYTES + 256 * 1024;

/**
 * POST /api/admin/upload
 *
 * Compatibility endpoint used by existing admin UI components. The canonical
 * media service owns magic-byte validation, opaque filenames, storage and audit.
 * Response contract is { url: string } for existing MediaUploader consumers.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAdmin("media.upload");
  if (error) return error;

  // Reject oversized declared bodies before multipart parsing. This is an early
  // guard only; the parsed File.size check remains authoritative.
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isFinite(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > MAX_UPLOAD_REQUEST_BYTES
    ) {
      return NextResponse.json(
        { error: "حجم درخواست بیش از حد مجاز است." },
        { status: 413 },
      );
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "فایل ارسال نشده است." },
        { status: 400 },
      );
    }

    // Check before arrayBuffer() to avoid an extra allocation for oversized files.
    if (file.size <= 0 || file.size > MAX_ADMIN_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "حجم فایل خالی یا بیش از حد مجاز است." },
        { status: 413 },
      );
    }

    const altText = formData.get("altText")?.toString() || undefined;
    const entityType = formData.get("entityType")?.toString() || undefined;
    const entityId = formData.get("entityId")?.toString() || undefined;
    const result = await uploadAsset({
      file: Buffer.from(await file.arrayBuffer()),
      uploadedBy: user?.id ?? null,
      originalFilename: file.name,
      altText,
      entityType,
      entityId,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json(
        { error: result.error ?? "آپلود ناموفق بود." },
        { status: 400 },
      );
    }

    // uploadAsset records the audit event; do not duplicate it at the route.
    return NextResponse.json({ ok: true, url: result.asset.url });
  } catch {
    return NextResponse.json(
      { error: "خطای داخلی هنگام آپلود فایل." },
      { status: 500 },
    );
  }
}
