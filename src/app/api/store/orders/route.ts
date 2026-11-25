import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getEffectiveRate, usdToIrr } from "@/lib/store-currency";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { checkCsrf } from "@/lib/csrf";
import { decrementOrderStock, OrderStockConflictError } from "@/lib/store-order-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function orderJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/* ============================================================
   /api/store/orders — HEAVIX store order endpoints

   Auth model (issue 1 — "one login for all HEAVIX sections"):
   - If the caller is logged in to HEAVIX (heavix-user cookie), we
     attach their `userId` to the created order and use it to scope
     GET responses.
   - If the caller is a HEAVIX admin (heavix-admin cookie), GET
     returns ALL orders regardless of userId/phone.
   - Phone-based lookup is kept for backwards compatibility (the
     pre-login flow) so existing customers with no HEAVIX account
     can still see their orders by phone.

   GET  ?phone=X&orderNumber=Y → retrieve one exact guest order
        ?userId=X       → list this user's orders by HEAVIX userId
        ?mine=true      → list the current session user's orders
        (admin session) → list all orders
   POST body:           → create a new order from cart
     { phone, name, family, address, items: [{partId, quantity}],
       mechanicId?, couponCode?, notes? }
     The userId is auto-attached from the session if the caller is
     logged in to HEAVIX. If not logged in, the order is still
     created (phone-only) but no userId is set.
   ============================================================ */

class CouponUsageConflictError extends Error {
  constructor() {
    super("کد تخفیف هم‌زمان تغییر کرده یا ظرفیت استفاده آن تکمیل شده است");
    this.name = "CouponUsageConflictError";
  }
}

function genOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const secret = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  return `HV-${t}${secret}`;
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
    const orderNumber = (url.searchParams.get("orderNumber") || "").trim().toUpperCase();
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
      return orderJson({ orders: orders.map(serializeOrder), admin: true });
    }

    // ?mine=true → use the session user's id.
    if (mine && !sessionUser) {
      return orderJson({ error: "احراز هویت الزامی است" }, { status: 401 });
    }
    if (mine && sessionUser?.id) {
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
      return orderJson({ orders: orders.map(serializeOrder) });
    }

    // Explicit userId filter (e.g. from the HEAVIX dashboard).
    if (userIdParam) {
      // Fail closed: an unauthenticated caller must never be able to enumerate
      // another user's orders by supplying a guessed userId.
      if (!sessionUser) {
        return orderJson({ error: "احراز هویت الزامی است" }, { status: 401 });
      }
      if (sessionUser.id !== userIdParam) {
        return orderJson({ error: "غیرمجاز" }, { status: 403 });
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
      return orderJson({ orders: orders.map(serializeOrder) });
    }

    // Guest lookup requires both the customer's phone and the exact order number.
    // Phone-only enumeration could expose multiple orders and their PII.
    if (!phone || phone.length < 8 || !orderNumber) {
      return orderJson(
        { error: "شماره موبایل و شماره سفارش الزامی است" },
        { status: 400 },
      );
    }

    if (sessionUser && (!sessionUser.mobileVerified || !sessionUser.mobile || phone !== sessionUser.mobile)) {
      return orderJson({ error: "شماره موبایل با حساب تأییدشده مطابقت ندارد" }, { status: 403 });
    }

    const customer = await storeDb.customer.findUnique({ where: { phone } });
    if (!customer) {
      return orderJson({ orders: [] });
    }

    const orders = await storeDb.order.findMany({
      where: { customerId: customer.id, orderNumber },
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true, images: true, active: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
        shipment: true,
        mechanic: { select: { id: true, name: true, family: true, shopName: true, phone: true } },
      },
    });

    return orderJson({ orders: orders.map(serializeOrder) });
  } catch (e: any) {
    console.error("[api/store/orders GET] error:", e);
    return orderJson(
      { error: "سرویس سفارش‌ها موقتاً در دسترس نیست" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return orderJson({ error: "CSRF check failed" }, { status: 403 });
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
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
    const aggregatedItems = new Map<string, number>();
    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== "object") {
        return orderJson({ error: "اقلام سبد خرید نامعتبر است" }, { status: 400 });
      }
      const item = rawItem as Record<string, unknown>;
      const partId = typeof item.partId === "string" ? item.partId.trim() : "";
      const quantity = Number(item.quantity);
      if (!partId || !Number.isSafeInteger(quantity) || quantity < 1) {
        return orderJson({ error: "شناسه قطعه یا تعداد نامعتبر است" }, { status: 400 });
      }
      const combined = (aggregatedItems.get(partId) ?? 0) + quantity;
      if (!Number.isSafeInteger(combined)) {
        return orderJson({ error: "تعداد درخواستی بیش از حد مجاز است" }, { status: 400 });
      }
      aggregatedItems.set(partId, combined);
    }
    const itemsInput = [...aggregatedItems].map(([partId, quantity]) => ({ partId, quantity }));

    // Resolve the current HEAVIX user (if any).
    const sessionUser = await getStoreUserWithRole();

    // If the caller is logged in to HEAVIX, auto-fill name/phone/email
    // from their profile when not explicitly provided. This implements
    // the "orders appear in their HEAVIX registered profile" behavior.
    const finalName = name || sessionUser?.firstName || "";
    const finalFamily = family || sessionUser?.lastName || "";
    const finalPhone = phone || sessionUser?.mobile || "";

    if (!finalPhone || finalPhone.length < 8) {
      return orderJson({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
    }
    if (!finalName) {
      return orderJson({ error: "نام الزامی است" }, { status: 400 });
    }
    if (!address) {
      return orderJson({ error: "آدرس الزامی است" }, { status: 400 });
    }
    if (itemsInput.length === 0) {
      return orderJson({ error: "سبد خرید خالی است" }, { status: 400 });
    }

    // load parts (active only) — snapshot prices
    const partIds = itemsInput.map((it) => it.partId);
    const parts = await storeDb.part.findMany({
      where: { id: { in: partIds }, active: true },
    });

    if (parts.length !== partIds.length) {
      return orderJson({ error: "برخی قطعات یافت نشد یا غیرفعال هستند" }, { status: 400 });
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
        return orderJson(
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

    // Persist the customer only after cart and pricing validation has succeeded.
    const customer = await storeDb.customer.upsert({
      where: { phone: finalPhone },
      update: { name: finalName, family: finalFamily || "", address },
      create: { phone: finalPhone, name: finalName, family: finalFamily || "", address },
    });

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

      // Claim stock in a deterministic part order. The helper performs
      // conditional stock CAS, warehouse allocation, SALE ledger writes and
      // transactional audit-outbox events inside this order transaction.
      const stockLines = [...orderItemsData].sort((a, b) => a.partId.localeCompare(b.partId));
      for (const it of stockLines) {
        await decrementOrderStock(tx, it.partId, it.quantity, o.id, sessionUser?.id ?? null);
      }

      // Atomically claim a coupon use. If another checkout consumes the
      // final use or the coupon changes after validation, roll back the order.
      if (appliedCouponCode) {
        const selectedCoupon = await tx.coupon.findUnique({
          where: { code: appliedCouponCode },
        });
        if (!selectedCoupon) {
          throw new CouponUsageConflictError();
        }
        const now = new Date();
        const where: any = {
          code: appliedCouponCode,
          active: true,
          value: selectedCoupon.value,
          type: selectedCoupon.type,
          minOrderIrr: selectedCoupon.minOrderIrr,
          usageLimit: selectedCoupon.usageLimit,
          expiresAt: selectedCoupon.expiresAt,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        };
        if (selectedCoupon.usageLimit > 0) {
          where.usedCount = { lt: selectedCoupon.usageLimit };
        }
        const claimed = await tx.coupon.updateMany({
          where,
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count !== 1) {
          throw new CouponUsageConflictError();
        }
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

    return orderJson({
      ok: true,
      order: serializeOrder(order),
      // Surface whether the order was linked to a HEAVIX account so the
      // client can show the right post-checkout messaging.
      linkedToUser: !!sessionUser?.id,
    });
  } catch (e: any) {
    if (e instanceof CouponUsageConflictError) {
      return orderJson({ error: e.message }, { status: 409 });
    }
    if (e instanceof OrderStockConflictError) {
      return orderJson(
        { error: "موجودی یکی از قطعات تغییر کرده یا کافی نیست؛ سبد خرید را به‌روزرسانی کنید" },
        { status: 409 },
      );
    }
    console.error("[api/store/orders POST] error:", e);
    return orderJson(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
