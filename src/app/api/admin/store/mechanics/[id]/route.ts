import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/mechanics/[id] — HEAVIX mechanic PATCH/DELETE
   ============================================================ */

function serialize(m: any) {
  return {
    ...m,
    rating: m.rating?.toString?.() ?? String(m.rating ?? 0),
    createdAt: m.createdAt?.toISOString?.() ?? null,
    updatedAt: m.updatedAt?.toISOString?.() ?? null,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const existing = await storeDb.mechanic.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });

    if (body.phone && body.phone !== existing.phone) {
      const dup = await storeDb.mechanic.findUnique({ where: { phone: body.phone } });
      if (dup && dup.id !== id) {
        return NextResponse.json({ success: false, error: "تلفن تکراری است" }, { status: 400 });
      }
    }

    const data: any = {};
    for (const k of ["phone", "name", "family", "shopName", "specialty", "city", "address", "status", "notes"]) {
      if (body[k] !== undefined) data[k] = body[k] || null;
    }
    if (body.verified !== undefined) data.verified = !!body.verified;
    if (body.rating !== undefined) data.rating = Number(body.rating) || 0;

    const m = await storeDb.mechanic.update({
      where: { id },
      data,
      include: { _count: { select: { orders: true } } },
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.mechanic.update',
      entityType: 'Mechanic',
      entityId: m.id,
      before: existing,
      after: m,
    });

    return NextResponse.json({ success: true, data: serialize(m) });
  } catch (e: any) {
    console.error("[store/mechanics PATCH] error:", e);
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const existing = await storeDb.mechanic.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    await storeDb.mechanic.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.mechanic.delete",
      entityType: "Mechanic",
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
