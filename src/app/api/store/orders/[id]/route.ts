import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUserWithRole } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/orders/[id] — Order detail (auth required)

   STEP 12.84 P0 SECURITY FIX:
   Previously this endpoint was PUBLIC — anyone with an order ID
   could view full order details including payment info and PII.
   Now requires:
   - Authenticated session (getStoreUserWithRole)
   - Ownership: order.userId === sessionUser.id OR (verified mobile AND matching customer phone)
   - Admin: sessionUser.isAdmin can view any order

   No phone-based lookup without session. No synthetic admin.
   ============================================================ */

function serializeOrder(o: any) {
  const safePart = (part: any) => part ? {
    id: part.id,
    name: part.name,
    nameFa: part.nameFa,
    sku: part.sku,
    images: part.images,
    active: part.active,
  } : null;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotalUsd: Number(o.subtotalUsd ?? 0),
    shippingUsd: Number(o.shippingUsd ?? 0),
    discountIrr: Number(o.discountIrr ?? 0),
    totalUsd: Number(o.totalUsd ?? 0),
    totalIrr: Number(o.totalIrr ?? 0),
    currencyRateAtOrder: Number(o.currencyRateAtOrder ?? 0),
    marginPercentAtOrder: Number(o.marginPercentAtOrder ?? 0),
    couponCode: o.couponCode ?? null,
    shippingAddress: o.shippingAddress ?? null,
    notes: o.notes ?? null,
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt?.toISOString?.() ?? null,
    updatedAt: o.updatedAt?.toISOString?.() ?? null,
    customer: o.customer ? {
      id: o.customer.id,
      phone: o.customer.phone,
      name: o.customer.name,
      family: o.customer.family,
      address: o.customer.address,
      status: o.customer.status,
    } : undefined,
    items: (o.items || []).map((it: any) => ({
      id: it.id,
      partId: it.partId,
      partNameSnapshot: it.partNameSnapshot,
      quantity: it.quantity,
      unitPriceUsd: Number(it.unitPriceUsd ?? 0),
      unitPriceIrr: Number(it.unitPriceIrr ?? 0),
      lineTotalUsd: Number(it.lineTotalUsd ?? 0),
      lineTotalIrr: Number(it.lineTotalIrr ?? 0),
      part: safePart(it.part),
    })),
    payments: (o.payments || []).map((p: any) => ({
      id: p.id,
      amountIrr: Number(p.amountIrr ?? 0),
      amountUsd: Number(p.amountUsd ?? 0),
      method: p.method,
      status: p.status,
      receiptImageUrl: p.receiptImageUrl ?? null,
      referenceCode: p.referenceCode ?? null,
      payerName: p.payerName ?? null,
      note: p.note ?? null,
      gateway: p.gateway ?? null,
      gatewayUrl: p.gatewayUrl ?? null,
      createdAt: p.createdAt?.toISOString?.() ?? null,
      reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
    })),
    shipment: o.shipment ? {
      id: o.shipment.id,
      carrier: o.shipment.carrier,
      trackingCode: o.shipment.trackingCode ?? null,
      status: o.shipment.status,
      shippedAt: o.shipment.shippedAt?.toISOString?.() ?? null,
      deliveredAt: o.shipment.deliveredAt?.toISOString?.() ?? null,
      pickupDate: o.shipment.pickupDate?.toISOString?.() ?? null,
      note: o.shipment.note ?? null,
    } : null,
    mechanic: o.mechanic ? {
      id: o.mechanic.id,
      name: o.mechanic.name,
      family: o.mechanic.family,
      shopName: o.mechanic.shopName,
      phone: o.mechanic.phone,
    } : null,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // P0 FIX: Require authenticated session.
    const sessionUser = await getStoreUserWithRole();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const order = await storeDb.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
        shipment: true,
        mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }

    // P0 FIX: Ownership check — admin can see any order; others only their own.
    if (!sessionUser.isAdmin) {
      const isOwner = order.userId === sessionUser.id ||
        (sessionUser.mobileVerified && order.customer && order.customer.phone === sessionUser.mobile);
      if (!isOwner) {
        return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
      }
    }

    return NextResponse.json({ order: serializeOrder(order) });
  } catch (e: any) {
    console.error("[api/store/orders/[id] GET] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
