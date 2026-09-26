import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { deleteAsset, getAsset } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/media/[id] — Wave 3A single-asset endpoints
   ------------------------------------------------------------
   GET     — fetch a single asset by id
   DELETE  — remove asset (binary + sidecar) and audit 'media.delete'
   Permission: media.manage
   ============================================================ */

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const [, error] = await requireAdmin("media.manage");
  if (error) return error;
  try {
    const { id } = await params;
    const asset = await getAsset(id);
    if (!asset) {
      return NextResponse.json(
        { ok: false, error: "رسانه یافت نشد." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, asset });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const [user, error] = await requireAdmin("media.manage");
  if (error) return error;
  try {
    const { id } = await params;
    const result = await deleteAsset(id, user?.id ?? null);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "حذف ناموفق بود." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
