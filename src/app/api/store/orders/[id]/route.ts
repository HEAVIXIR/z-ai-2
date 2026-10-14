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
   - Ownership: order.userId === sessionUser.id OR order.customer.phone === sessionUser.mobile
   - Admin: sessionUser.isAdmin can view any order

   No phone-based lookup without session. No synthetic admin.
   ============================================================ */

function serializeOrder(o: any) {
  return {
    ...o,
    subtotalUsd: Number(o.subtotalUsd ?? 0),
    shippingUsd: Number(o.shippingUsd ?? 0),
    discountIrr: Number(o.discountIrr ?? 0),
    totalUsd: Number(o.totalUsd ?? 0),
    totalIrr: Number(o.totalIrr ?? 0),
    currencyRateAtOrder: Number(o.currencyRateAtOrder ?? 0),
    marginPercentAtOrder: Number(o.marginPercentAtOrder ?? 0),
    createdAt: o.createdAt?.toISOString?.() ?? null,
    updatedAt: o.updatedAt?.toISOString?.() ?? null,
    items: (o.items || []).map((it: any) => ({
      ...it,
      unitPriceUsd: Number(it.unitPriceUsd ?? 0),
      unitPriceIrr: Number(it.unitPriceIrr ?? 0),
      lineTotalUsd: Number(it.lineTotalUsd ?? 0),
      lineTotalIrr: Number(it.lineTotalIrr ?? 0),
    })),
    payments: (o.payments || []).map((p: any) => ({
      ...p,
      amountIrr: Number(p.amountIrr ?? 0),
      amountUsd: Number(p.amountUsd ?? 0),
      createdAt: p.createdAt?.toISOString?.() ?? null,
      reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
    })),
    shipment: o.shipment
      ? {
          ...o.shipment,
          shippedAt: o.shipment.shippedAt?.toISOString?.() ?? null,
          deliveredAt: o.shipment.deliveredAt?.toISOString?.() ?? null,
        }
      : null,
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
        (order.customer && order.customer.phone === sessionUser.mobile);
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
