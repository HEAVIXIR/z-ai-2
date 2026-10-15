import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { requestPayment } from "@/lib/store-zarinpal";
import { getStoreUserWithRole } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/payments/gateway/request — Gateway payment request

   STEP 12.86 P0 SECURITY FIX:
   Previously PUBLIC — anyone with orderId + phone could initiate
   a gateway payment for any order. Now requires:
   - Authenticated session (getStoreUserWithRole)
   - Ownership: order.userId === session.id OR customer.phone === session.mobile
   - Order state validation: not CANCELLED/REFUNDED, not already PAID
   - Duplicate prevention: no more than 1 PENDING GATEWAY payment per order
   - Amount from server (order.totalIrr), never from client

   Body: { orderId }
   ============================================================ */

export async function POST(req: Request) {
  try {
    // P0 FIX: Require authenticated session.
    const sessionUser = await getStoreUserWithRole();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const body = await req.json();
    const orderId = String(body.orderId || "");

    if (!orderId) {
      return NextResponse.json({ error: "orderId الزامی است" }, { status: 400 });
    }

    const order = await storeDb.order.findUnique({
      where: { id: orderId },
      include: { customer: true, payments: true },
    });
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }

    // P0 FIX: Ownership check — admin can pay for any order; others only their own.
    if (!sessionUser.isAdmin) {
      const isOwner = order.userId === sessionUser.id ||
        (order.customer && order.customer.phone === sessionUser.mobile);
      if (!isOwner) {
        return NextResponse.json(
          { error: "دسترسی غیرمجاز" },
          { status: 403 },
        );
      }
    }

    // P0 FIX: Order state validation.
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return NextResponse.json(
        { error: "برای این سفارش نمی‌توان پرداخت ثبت کرد" },
        { status: 409 },
      );
    }
    if (order.paymentStatus === "PAID") {
      return NextResponse.json(
        { error: "این سفارش قبلاً پرداخت شده است" },
        { status: 409 },
      );
    }

    // P0 FIX: Duplicate prevention — no more than 1 PENDING GATEWAY payment.
    const pendingGateway = order.payments.find(
      (p) => p.method === "GATEWAY" && p.status === "PENDING",
    );
    if (pendingGateway) {
      // Return existing gateway URL instead of creating duplicate.
      return NextResponse.json({
        ok: true,
        authority: pendingGateway.authority,
        gatewayUrl: pendingGateway.gatewayUrl,
        method: pendingGateway.gateway,
        paymentId: pendingGateway.id,
        message: "درخواست پرداخت قبلی همچنان فعال است",
      });
    }

    // P0 FIX: Amount from server only.
    const amountIrr = Math.round(Number(order.totalIrr));
    if (amountIrr <= 0) {
      return NextResponse.json({ error: "مبلغ سفارش نامعتبر است" }, { status: 400 });
    }

    // Build callback URL — phone comes from session, not client.
    const phone = sessionUser.mobile || order.customer?.phone || "";
    const incoming = new URL(req.url);
    const origin = `${incoming.protocol}//${incoming.host}`;
    const callbackUrl = `${origin}/api/store/payments/gateway/callback?orderId=${order.id}&phone=${encodeURIComponent(phone)}`;

    const { authority, gatewayUrl, method } = await requestPayment({
      amountIrr,
      description: `سفارش ${order.orderNumber} — فروشگاه هویکس`,
      callbackUrl,
      mobile: phone,
      orderNumber: order.orderNumber,
    });

    // STEP 12.94 RACE FIX: Use transaction to atomically check + create
    const payment = await storeDb.$transaction(async (tx: any) => {
      const existingPending = await tx.payment.findFirst({
        where: { orderId: order.id, method: "GATEWAY", status: "PENDING" },
      });
      if (existingPending) {
        return existingPending;
      }
      return tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr,
          amountUsd: order.currencyRateAtOrder > 0 ? amountIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100)) : 0,
          method: "GATEWAY",
          status: "PENDING",
          gateway: method,
          authority,
          gatewayUrl,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      authority,
      gatewayUrl,
      method,
      paymentId: payment.id,
    });
  } catch (e: any) {
    console.error("[api/store/payments/gateway/request POST] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
