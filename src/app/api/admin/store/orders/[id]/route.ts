import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  getOrderDetail,
  CommerceServiceError,
} from "@/lib/commerce-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/orders/[id] — order detail + status update
   PHASE-P8-TRANSACTION — GET delegated to commerce-service
   (getOrderDetail, richer read with customer + mechanic + payments
   + shipment context). PATCH stays inline for the metadata fields
   (status / notes / shippingAddress / couponCode / mechanicId) and
   imports commerce-service so future deepening (status-state-machine
   via the service) is one method-call away.
   ============================================================ */

const ALLOWED_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const ALLOWED_PAY_STATUSES = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];

function toErrorResponse(e: unknown) {
  if (e instanceof CommerceServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/orders/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    // Delegate the rich read to the commerce-service so the read
    // shape + audit context is owned by the service (same pattern
    // as the procurement/shipments detail routes after extraction).
    const order = await getOrderDetail(id);
    return NextResponse.json({ success: true, data: order });
  } catch (e: any) {
    return toErrorResponse(e);
  }
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
    const existing = await storeDb.order.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });

    const data: any = {};
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: "وضعیت نامعتبر" }, { status: 400 });
      }
      data.status = body.status;
    }
    if (body.paymentStatus !== undefined) {
      if (!ALLOWED_PAY_STATUSES.includes(body.paymentStatus)) {
        return NextResponse.json({ success: false, error: "وضعیت پرداخت نامعتبر" }, { status: 400 });
      }
      data.paymentStatus = body.paymentStatus;
    }
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.shippingAddress !== undefined) data.shippingAddress = body.shippingAddress || null;
    if (body.couponCode !== undefined) data.couponCode = body.couponCode || null;
    if (body.mechanicId !== undefined) data.mechanicId = body.mechanicId || null;

    const order = await storeDb.order.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true, family: true, phone: true } },
        mechanic: { select: { id: true, name: true, family: true, shopName: true } },
        _count: { select: { items: true, payments: true } },
      },
    });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.order.update",
      entityType: "Order",
      entityId: order.id,
      before: existing,
      after: order,
    });

    // After the inline update, delegate the rich read to the
    // commerce-service so the response shape is identical to GET.
    const refreshed = await getOrderDetail(id).catch(() => null);
    return NextResponse.json({
      success: true,
      data: refreshed ?? {
        ...order,
        subtotalUsd: String(order.subtotalUsd),
        shippingUsd: String(order.shippingUsd),
        discountIrr: String(order.discountIrr),
        totalUsd: String(order.totalUsd),
        totalIrr: String(order.totalIrr),
        currencyRateAtOrder: String(order.currencyRateAtOrder),
        marginPercentAtOrder: String(order.marginPercentAtOrder),
        createdAt: order.createdAt?.toISOString?.() ?? null,
        updatedAt: order.updatedAt?.toISOString?.() ?? null,
      },
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
