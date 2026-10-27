import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { listAssets, uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the multipart envelope below Vercel's 4.5 MB function request limit.
// File bytes are separately capped by MAX_UPLOAD_BYTES.
const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

/* ============================================================
   /api/admin/media — Wave 3A media library endpoints
   ------------------------------------------------------------
   GET  ?entityType=&entityId=&limit=   — list assets
   POST multipart/form-data (file, [altText], [entityType], [entityId])
                                       — upload a new asset
   Permission: media.upload (POST) / media.read (GET)
   ============================================================ */

export async function GET(req: Request) {
  const [user, error] = await requireAdmin("media.read");
  if (error) return error;
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType")?.trim() || undefined;
    const entityId = url.searchParams.get("entityId")?.trim() || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const assets = await listAssets({
      entityType,
      entityId,
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });

    return NextResponse.json({ ok: true, assets, count: assets.length });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  } finally {
    // user is guaranteed by requireAdmin — reference for linters
    void user;
  }
}

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("media.upload");
  if (error) return error;

  // Reject oversized declared bodies before multipart parsing. Content-Length
  // is only an early guard; the parsed File.size check below is authoritative.
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isFinite(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > MAX_UPLOAD_REQUEST_BYTES
    ) {
      return NextResponse.json(
        { ok: false, error: "حجم درخواست بیش از حد مجاز است." },
        { status: 413 },
      );
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "فایل ارسال نشده است." },
        { status: 400 },
      );
    }

    // Check size before arrayBuffer() to avoid creating a second large buffer.
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "حجم فایل خالی یا بیش از حد مجاز است." },
        { status: 413 },
      );
    }

    const altText =
      (formData.get("altText") as string | null)?.toString() || undefined;
    const entityType =
      (formData.get("entityType") as string | null)?.toString() || undefined;
    const entityId =
      (formData.get("entityId") as string | null)?.toString() || undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAsset({
      file: buffer,
      uploadedBy: user?.id ?? null,
      originalFilename: file.name,
      altText,
      entityType,
      entityId,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "آپلود ناموفق بود." },
        { status: 400 },
      );
    }

    await logAudit({
      actorId: user?.id ?? null,
      actorType: "ADMIN",
      action: "media.upload",
      entityType: "MediaAsset",
      entityId: result.asset.id,
      after: {
        filename: result.asset.filename,
        altText: result.asset.altText,
        entityType: result.asset.entityType,
        entityId: result.asset.entityId,
      },
      reason: "Media asset uploaded via admin API",
    });

    return NextResponse.json({ ok: true, asset: result.asset });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
