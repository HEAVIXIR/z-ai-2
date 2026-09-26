import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/suppliers — HEAVIX supplier directory CRUD
   T2-W1-A — Store Gap Domain #3 (Suppliers)
   ============================================================ */

function serialize(s: any) {
  return {
    ...s,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    updatedAt: s.updatedAt?.toISOString?.() ?? null,
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const active = url.searchParams.get("active");

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { nameFa: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];
    }
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;

    const items = await storeDb.supplier.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total: items.length,
    });
  } catch (e: any) {
    console.error("[store/suppliers GET] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { name, nameFa, phone, email, address, active } = body;
    if (!name) {
      return NextResponse.json(
        { success: false, error: "نام تأمین‌کننده الزامی است" },
        { status: 400 },
      );
    }
    const s = await storeDb.supplier.create({
      data: {
        name,
        nameFa: nameFa || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        active: typeof active === "boolean" ? active : true,
      },
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.supplier.create',
      entityType: 'Supplier',
      entityId: s.id,
      after: s,
    });

    return NextResponse.json({ success: true, data: serialize(s) });
  } catch (e: any) {
    console.error("[store/suppliers POST] error:", e);
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
