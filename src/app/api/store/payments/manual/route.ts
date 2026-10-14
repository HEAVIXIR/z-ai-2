import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUserWithRole } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/payments/manual — Manual receipt submission

   STEP 12.84 P0 SECURITY FIX:
   Previously this endpoint was PUBLIC — anyone with an order ID
   and phone number could submit payment receipts. Now requires:
   - Authenticated session
   - Ownership: order belongs to session user (by userId or phone)
   - Order state validation: order must not be CANCELLED or REFUNDED
   - Duplicate prevention: no more than 3 PENDING payments per order
   - Overpayment prevention: total pending+paid cannot exceed order total

   Body: { orderId, method: CARD|CASH, amountIrr,
           referenceCode?, payerName?, payerCard?, note? }
   ============================================================ */

const MAX_PENDING_PAYMENTS = 3;

export async function POST(req: Request) {
  try {
    // P0 FIX: Require authenticated session.
    const sessionUser = await getStoreUserWithRole();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const body = await req.json();
    const orderId = String(body.orderId || "");
    const method = body.method === "CASH" ? "CASH" : "CARD";
    const amountIrr = Number(body.amountIrr) || 0;
    const referenceCode = body.referenceCode ? String(body.referenceCode) : null;
    const payerName = body.payerName ? String(body.payerName) : null;
    const payerCard = body.payerCard ? String(body.payerCard) : null;
    const note = body.note ? String(body.note) : null;

    if (!orderId) {
      return NextResponse.json({ error: "orderId الزامی است" }, { status: 400 });
    }
    if (amountIrr <= 0) {
      return NextResponse.json({ error: "مبلغ پرداخت نامعتبر است" }, { status: 400 });
    }

    const order = await storeDb.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        payments: true,
      },
    });
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }

    // P0 FIX: Ownership check — admin can submit for any order; others only their own.
    if (!sessionUser.isAdmin) {
      const isOwner = order.userId === sessionUser.id ||
        (order.customer && order.customer.phone === sessionUser.mobile);
      if (!isOwner) {
        return NextResponse.json(
          { error: "شماره موبایل با سفارش مطابقت ندارد" },
          { status: 403 },
        );
      }
    }

    // P0 FIX: Order state validation — cannot submit payment for cancelled/refunded orders.
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return NextResponse.json(
        { error: "برای این سفارش نمی‌توان پرداخت ثبت کرد" },
        { status: 409 },
      );
    }

    // P0 FIX: Duplicate prevention — limit pending payments.
    const pendingPayments = order.payments.filter((p: any) => p.status === "PENDING");
    if (pendingPayments.length >= MAX_PENDING_PAYMENTS) {
      return NextResponse.json(
        { error: `حداکثر ${MAX_PENDING_PAYMENTS} فیش در انتظار تأیید مجاز است` },
        { status: 409 },
      );
    }

    // P0 FIX: Overpayment prevention — total pending+paid + new amount cannot exceed order total.
    const totalIrr = Number(order.totalIrr ?? 0);
    if (totalIrr > 0) {
      const existingTotal = order.payments
        .filter((p: any) => p.status === "PENDING" || p.status === "APPROVED")
        .reduce((sum: number, p: any) => sum + Number(p.amountIrr ?? 0), 0);
      if (existingTotal + amountIrr > totalIrr) {
        return NextResponse.json(
          { error: `مبلغ پرداخت از مبلغ باقیمانده (${(totalIrr - existingTotal).toLocaleString()} ریال) بیشتر است` },
          { status: 400 },
        );
      }
    }

    const payment = await storeDb.payment.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        amountIrr,
        amountUsd: order.currencyRateAtOrder > 0 ? amountIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100)) : 0,
        method,
        status: "PENDING",
        referenceCode,
        payerName,
        payerCard,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      payment: {
        ...payment,
        amountIrr: Number(payment.amountIrr),
        amountUsd: Number(payment.amountUsd),
        createdAt: payment.createdAt?.toISOString?.() ?? null,
        reviewedAt: payment.reviewedAt?.toISOString?.() ?? null,
      },
      message: "فیش شما با موفقیت ثبت شد. پس از تأیید مدیر، سفارش پردازش خواهد شد.",
    });
  } catch (e: any) {
    console.error("[api/store/payments/manual POST] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
