import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { checkCsrf } from "@/lib/csrf";

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
  // Reject cross-origin submissions before reading or persisting receipt data.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const sessionUser = await getStoreUserWithRole();
  if (!sessionUser) {
    return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const method = body.method === "CASH" ? "CASH" : "CARD";
    const amountIrr = Number(body.amountIrr);
    const referenceCode = body.referenceCode ? String(body.referenceCode).trim().slice(0, 120) : null;
    const payerName = body.payerName ? String(body.payerName).trim().slice(0, 160) : null;
    const payerCard = body.payerCard ? String(body.payerCard).replace(/\D/g, "").slice(-16) : null;
    const note = body.note ? String(body.note).trim().slice(0, 1000) : null;

    if (!orderId) {
      return NextResponse.json({ error: "orderId الزامی است" }, { status: 400 });
    }
    if (!Number.isSafeInteger(amountIrr) || amountIrr <= 0) {
      return NextResponse.json({ error: "مبلغ پرداخت نامعتبر است" }, { status: 400 });
    }

    const result = await storeDb.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true, payments: true },
      });
      if (!order) return { error: "سفارش یافت نشد", status: 404 as const };

      if (!sessionUser.isAdmin) {
        const ownsByUserId = order.userId === sessionUser.id;
        const ownsByVerifiedMobile = Boolean(
          sessionUser.mobileVerified &&
          sessionUser.mobile &&
          order.customer?.phone === sessionUser.mobile
        );
        if (!ownsByUserId && !ownsByVerifiedMobile) {
          return { error: "دسترسی به سفارش مجاز نیست", status: 403 as const };
        }
      }

      if (order.status === "CANCELLED" || order.status === "REFUNDED") {
        return { error: "برای این سفارش نمی‌توان پرداخت ثبت کرد", status: 409 as const };
      }
      if (order.paymentStatus === "PAID") {
        return { error: "این سفارش قبلاً پرداخت شده است", status: 409 as const };
      }

      const pendingPayments = order.payments.filter((payment: any) => payment.status === "PENDING");
      if (pendingPayments.length >= MAX_PENDING_PAYMENTS) {
        return { error: `حداکثر ${MAX_PENDING_PAYMENTS} فیش در انتظار تأیید مجاز است`, status: 409 as const };
      }

      const totalIrr = Number(order.totalIrr ?? 0);
      const committedAmount = order.payments
        .filter((payment: any) => payment.status === "PENDING" || payment.status === "APPROVED")
        .reduce((sum: number, payment: any) => sum + Number(payment.amountIrr ?? 0), 0);
      if (totalIrr <= 0 || committedAmount + amountIrr > totalIrr) {
        return {
          error: totalIrr > 0
            ? `مبلغ پرداخت از مبلغ باقیمانده (${Math.max(0, totalIrr - committedAmount).toLocaleString()} ریال) بیشتر است`
            : "مبلغ سفارش نامعتبر است",
          status: 400 as const,
        };
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr,
          amountUsd: order.currencyRateAtOrder > 0
            ? amountIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100))
            : 0,
          method,
          status: "PENDING",
          referenceCode,
          payerName,
          payerCard,
          note,
        },
      });
      return { payment };
    }, { isolationLevel: "Serializable" });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const payment = result.payment;
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
    if (e?.code === "P2034") {
      return NextResponse.json(
        { error: "هم‌زمان پرداخت دیگری ثبت شده است؛ وضعیت سفارش را تازه‌سازی کنید" },
        { status: 409 },
      );
    }
    console.error("[api/store/payments/manual POST] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
