import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getEffectiveRate, usdToIrr } from "@/lib/store-currency";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { checkCsrf } from "@/lib/csrf";
import { decrementOrderStock, OrderStockConflictError } from "@/lib/store-order-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/orders — HEAVIX store order endpoints

   Auth model (issue 1 — "one login for all HEAVIX sections"):
   - If the caller is logged in to HEAVIX (heavix-user cookie), we
     attach their `userId` to the created order and use it to scope
     GET responses.
   - If the caller is a HEAVIX admin (heavix-admin cookie), GET
     returns ALL orders regardless of userId/phone.
   - Every non-admin read requires an authenticated HEAVIX session.
   - Phone lookup is allowed only when the requested phone matches the
     authenticated user's registered mobile number. Guest orders can be
     found only after that same account has authenticated.

   GET  ?phone=X        → list orders for the authenticated user's mobile
        ?userId=X       → list this user's orders by HEAVIX userId (owner only)
        ?mine=true      → list the current session user's orders
        (admin session) → list all orders
   POST body:           → create a new order from cart
     { phone, name, family, address, items: [{partId, quantity}],
       mechanicId?, couponCode?, notes? }
     The userId is auto-attached from the session if the caller is
     logged in to HEAVIX. If not logged in, the order is still
     created (phone-only) but no userId is set.
   ============================================================ */

function genOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `HV-${t}${r}`;
}

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const phone = (url.searchParams.get("phone") || "").trim();
    const userIdParam = (url.searchParams.get("userId") || "").trim();
    const mine = url.searchParams.get("mine") === "true";

    // Resolve the current session user (with admin flag).
    const sessionUser = await getStoreUserWithRole();

    // Admin → return all orders.
    if (sessionUser?.isAdmin) {
      const orders = await storeDb.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
          payments: { orderBy: { createdAt: "desc" } },
          shipment: true,
          mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
        },
      });
      return NextResponse.json({ orders: orders.map(serializeOrder), admin: true });
    }

    // All customer-facing order reads require a real authenticated session.
    // Admin access was handled above; never let an anonymous caller select
    // another user's orders by supplying a userId or phone query parameter.
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    // ?mine=true → use the authenticated session user's id.
    if (mine) {
      const orders = await storeDb.order.findMany({
        where: { userId: sessionUser.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
          payments: { orderBy: { createdAt: "desc" } },
          shipment: true,
          mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
        },
      });
      return NextResponse.json({ orders: orders.map(serializeOrder) });
    }

    // Explicit userId filter (e.g. from the HEAVIX dashboard).
    if (userIdParam) {
      // A caller-supplied userId is never an authentication credential.
      if (sessionUser.id !== userIdParam) {
        return NextResponse.json({ error: "غیرمجاز" }, { status: 403 });
      }
      const orders = await storeDb.order.findMany({
        where: { userId: userIdParam },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
          payments: { orderBy: { createdAt: "desc" } },
          shipment: true,
          mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
        },
      });
      return NextResponse.json({ orders: orders.map(serializeOrder) });
    }

    // Phone is a lookup key, not a secret. It is accepted only when it
    // exactly matches the authenticated account's registered mobile.
    if (!phone || phone.length < 8) {
      return NextResponse.json({ orders: [] });
    }
    if (!sessionUser.mobileVerified || !sessionUser.mobile || phone !== sessionUser.mobile) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const customer = await storeDb.customer.findUnique({ where: { phone } });
    if (!customer) {
      return NextResponse.json({ orders: [] });
    }

    // A verified authenticated mobile is the ownership proof for guest
    // orders created before account linking. An unverified profile value
    // must never authorize access to phone-linked customer records.
    const orders = await storeDb.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
        shipment: true,
        mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
      },
    });

    return NextResponse.json({ orders: orders.map(serializeOrder) });
  } catch (e: any) {
    console.error("[api/store/orders GET] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const phone = String(body.phone || "").trim();
    const name = String(body.name || "").trim();
    const family = String(body.family || "").trim();
    const address = String(body.address || "").trim();
    const notes = body.notes ? String(body.notes) : null;
    const mechanicId = body.mechanicId ? String(body.mechanicId) : null;
    const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : null;
    const itemsInput: Array<{ partId: string; quantity: number }> = Array.isArray(body.items)
      ? body.items
          .map((it: any) => ({ partId: String(it.partId || ""), quantity: Math.max(1, Number(it.quantity) || 1) }))
          .filter((it) => it.partId)
      : [];

    // Resolve the current HEAVIX user (if any).
    const sessionUser = await getStoreUserWithRole();

    // If the caller is logged in to HEAVIX, auto-fill name/phone/email
    // from their profile when not explicitly provided. This implements
    // the "orders appear in their HEAVIX registered profile" behavior.
    const finalName = name || sessionUser?.firstName || "";
    const finalFamily = family || sessionUser?.lastName || "";
    const finalPhone = phone || sessionUser?.mobile || "";

    if (!finalPhone || finalPhone.length < 8) {
      return NextResponse.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
    }
    if (!finalName) {
      return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: "آدرس الزامی است" }, { status: 400 });
    }
    if (itemsInput.length === 0) {
      return NextResponse.json({ error: "سبد خرید خالی است" }, { status: 400 });
    }

    // upsert customer
    const customer = await storeDb.customer.upsert({
      where: { phone: finalPhone },
      update: { name: finalName, family: finalFamily || "", address },
      create: { phone: finalPhone, name: finalName, family: finalFamily || "", address },
    });

    // load parts (active only) — snapshot prices
    const partIds = itemsInput.map((it) => it.partId);
    const parts = await storeDb.part.findMany({
      where: { id: { in: partIds }, active: true },
    });

    if (parts.length !== partIds.length) {
      return NextResponse.json({ error: "برخی قطعات یافت نشد یا غیرفعال هستند" }, { status: 400 });
    }

    // effective rate at order time
    const eff = await getEffectiveRate();

    // shipping flat fee (USD)
    const shippingUsd = 2;

    // build items + totals
    let subtotalUsd = 0;
    let subtotalIrr = 0;
    const orderItemsData: any[] = [];
    for (const it of itemsInput) {
      const part = parts.find((p) => p.id === it.partId);
      if (!part) continue;
      if (part.stock < it.quantity) {
        return NextResponse.json(
          { error: `موجودی قطعه «${part.nameFa || part.name}» کافی نیست` },
          { status: 400 },
        );
      }
      const unitPriceUsd = part.priceUsd;
      const unitPriceIrr = usdToIrr(unitPriceUsd, eff);
      const lineTotalUsd = unitPriceUsd * it.quantity;
      const lineTotalIrr = unitPriceIrr * it.quantity;
      subtotalUsd += lineTotalUsd;
      subtotalIrr += lineTotalIrr;
      orderItemsData.push({
        partId: part.id,
        partNameSnapshot: part.nameFa || part.name,
        quantity: it.quantity,
        unitPriceUsd,
        unitPriceIrr,
        lineTotalUsd,
        lineTotalIrr,
      });
    }

    // coupon validation
    let discountIrr = 0;
    let appliedCouponCode: string | null = null;
    if (couponCode) {
      const coupon = await storeDb.coupon.findUnique({ where: { code: couponCode } });
      if (coupon && coupon.active) {
        const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
        const limitReached = coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit;
        const meetsMin = subtotalIrr >= (coupon.minOrderIrr || 0);
        if (!expired && !limitReached && meetsMin) {
          appliedCouponCode = coupon.code;
          if (coupon.type === "PERCENT") {
            discountIrr = Math.round((subtotalIrr * coupon.value) / 100);
          } else {
            discountIrr = Math.round(coupon.value);
          }
          discountIrr = Math.min(discountIrr, subtotalIrr);
        }
      }
    }

    const totalUsd = subtotalUsd + shippingUsd;
    const totalIrr = Math.max(0, subtotalIrr + Math.round(shippingUsd * eff.rate * (1 + (eff.marginPercent || 0) / 100)) - discountIrr);

    // create order + items + decrement stock + increment soldCount + bump coupon usage
    const orderNumber = genOrderNumber();
    const order = await storeDb.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          // Link to the HEAVIX User (main DB) so the order shows up in
          // their dashboard. Null for phone-only (guest) orders.
          userId: sessionUser?.id || null,
          mechanicId: mechanicId || null,
          status: "PENDING",
          subtotalUsd,
          shippingUsd,
          discountIrr,
          totalUsd,
          totalIrr,
          currencyRateAtOrder: eff.rate,
          marginPercentAtOrder: eff.marginPercent,
          couponCode: appliedCouponCode,
          shippingAddress: address,
          notes,
          paymentStatus: "UNPAID",
          items: { create: orderItemsData },
        },
        include: {
          items: true,
          mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
        },
      });

      // The preflight stock read above is advisory only. This conditional
      // update is authoritative under concurrent checkouts; a conflict throws
      // inside the transaction and rolls back the order and all side effects.
      // Acquire Part locks in one global order for multi-line carts. This
      // prevents two checkouts containing the same parts in opposite cart
      // order from deadlocking before the per-Part warehouse allocation.
      const stockLines = [...orderItemsData].sort((a, b) => a.partId.localeCompare(b.partId));
      for (const it of stockLines) {
        await decrementOrderStock(tx, it.partId, it.quantity, o.id, sessionUser?.id ?? null);
      }

      // bump coupon usage
      if (appliedCouponCode) {
        await tx.coupon.update({
          where: { code: appliedCouponCode },
          data: { usedCount: { increment: 1 } },
        });
      }

      // update customer stats
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalSpentIrr: { increment: totalIrr },
        },
      });

      return o;
    });

    return NextResponse.json({
      ok: true,
      order: serializeOrder(order),
      // Surface whether the order was linked to a HEAVIX account so the
      // client can show the right post-checkout messaging.
      linkedToUser: !!sessionUser?.id,
    });
  } catch (e: any) {
    if (e instanceof OrderStockConflictError) {
      return NextResponse.json(
        { error: "موجودی یکی از قطعات تغییر کرده یا کافی نیست؛ سبد خرید را به‌روزرسانی کنید" },
        { status: 409 },
      );
    }
    console.error("[api/store/orders POST] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
