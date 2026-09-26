import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns — HEAVIX returns list + create
   T2-W2-B — Returns domain (Return → Order → Items → Reason →
   Status → Inspection → Resolution → Refund → Audit).
   GET  : list returns with filters (orderId, status, limit)
   POST : create a return request for an order
   ============================================================ */

const ALLOWED_STATUSES = [
  "REQUESTED",
  "APPROVED",
  "INSPECTED",
  "RESOLVED",
  "REJECTED",
] as const;

function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
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
    const orderId = url.searchParams.get("orderId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 100);

    const where: any = {};
    if (orderId) where.orderId = orderId;
    if (status) {
      if (!ALLOWED_STATUSES.includes(status as any)) {
        return NextResponse.json(
          { success: false, error: "وضعیت نامعتبر" },
          { status: 400 },
        );
      }
      where.status = status;
    }

    const [items, total] = await Promise.all([
      storeDb.return.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: { id: true, name: true, family: true, phone: true },
              },
            },
          },
        },
      }),
      storeDb.return.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total,
    });
  } catch (e: any) {
    console.error("[store/returns GET] error:", e);
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
    const { orderId, reason, status, inspection, resolution, reference } = body;

    if (!orderId || !reason) {
      return NextResponse.json(
        { success: false, error: "سفارش و دلیل مرجوعی الزامی است" },
        { status: 400 },
      );
    }

    const order = await storeDb.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "سفارش یافت نشد" },
        { status: 404 },
      );
    }

    const initialStatus =
      status && ALLOWED_STATUSES.includes(status as any)
        ? status
        : "REQUESTED";

    const ret = await storeDb.return.create({
      data: {
        orderId,
        reason,
        status: initialStatus,
        inspection: inspection || null,
        resolution: resolution || null,
        createdBy: user.id,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.return.create',
      entityType: 'Return',
      entityId: ret.id,
      after: {
        orderId,
        reason,
        status: initialStatus,
        inspection: ret.inspection,
        resolution: ret.resolution,
        reference: reference || null,
      },
    });

    return NextResponse.json({ success: true, data: serialize(ret) });
  } catch (e: any) {
    console.error("[store/returns POST] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
