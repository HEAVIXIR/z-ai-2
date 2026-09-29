import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { listAssets, uploadAsset } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/media — Wave 3A media library endpoints
   ------------------------------------------------------------
   GET  ?entityType=&entityId=&limit=   — list assets
   POST multipart/form-data (file, [altText], [entityType], [entityId])
                                       — upload a new asset
   Permission: media.upload (POST) / media.read (GET)
   ============================================================ */

export async function GET(req: Request) {
  const [user, error] = await requireAdmin("media.upload");
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
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "فایل ارسال نشده است." },
        { status: 400 },
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
      actorType: 'ADMIN',
      action: 'media.upload',
      entityType: 'MediaAsset',
      entityId: result.asset.id,
      after: { filename: result.asset.filename, altText: result.asset.altText, entityType: result.asset.entityType, entityId: result.asset.entityId },
      reason: 'Media asset uploaded via admin API',
    });

    return NextResponse.json({ ok: true, asset: result.asset });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
