import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkCsrf } from "@/lib/csrf";
import { deleteAsset, getAsset } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json({ ok: false, error: "رسانه یافت نشد." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    console.error("[api/admin/media/[id] GET] failed", err);
    return NextResponse.json({ ok: false, error: "دریافت رسانه ناموفق بود." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "CSRF check failed" }, { status: 403 });
  }
  const [user, error] = await requireAdmin("media.manage");
  if (error) return error;
  try {
    const { id } = await params;
    const result = await deleteAsset(id, user?.id ?? null);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "حذف ناموفق بود." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/media/[id] DELETE] failed", err);
    return NextResponse.json({ ok: false, error: "حذف رسانه ناموفق بود." }, { status: 500 });
  }
}
