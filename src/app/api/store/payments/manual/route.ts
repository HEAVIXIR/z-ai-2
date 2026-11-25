import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";
import { readBoundedJsonObject } from "@/lib/http/bounded-json";

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
    const parsed = await readBoundedJsonObject(req, 16 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;
    const allowedFields = new Set(["orderId", "method", "amountIrr", "referenceCode", "payerName", "payerCard", "note"]);
    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ error: "Unknown payment field" }, { status: 400 });
    }
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (typeof body.method !== "string" || !["CARD", "CASH"].includes(body.method)) {
      return NextResponse.json({ error: "method must be CARD or CASH" }, { status: 400 });
    }
    const method = body.method as "CARD" | "CASH";
    if (typeof body.amountIrr !== "number" || !Number.isSafeInteger(body.amountIrr)) {
      return NextResponse.json({ error: "amountIrr must be a safe integer" }, { status: 400 });
    }
    const amountIrr = body.amountIrr;
    for (const [field, max] of [["referenceCode", 120], ["payerName", 160], ["note", 1000]] as const) {
      if (body[field] !== undefined && body[field] !== null &&
          (typeof body[field] !== "string" || body[field].length > max)) {
        return NextResponse.json({ error: `${field} is invalid` }, { status: 400 });
      }
    }
    if (body.payerCard !== undefined && body.payerCard !== null && typeof body.payerCard !== "string") {
      return NextResponse.json({ error: "payerCard is invalid" }, { status: 400 });
    }
    const payerCardDigits = typeof body.payerCard === "string" ? body.payerCard.replace(/\D/g, "") : "";
    if (payerCardDigits.length > 4) {
      return NextResponse.json({ error: "Only the last four card digits may be submitted" }, { status: 400 });
    }
    const referenceCode = typeof body.referenceCode === "string" ? body.referenceCode.trim() || null : null;
    const payerName = typeof body.payerName === "string" ? body.payerName.trim() || null : null;
    const payerCard = payerCardDigits || null;
    const note = typeof body.note === "string" ? body.note.trim() || null : null;

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
      await enqueueAuditOutbox(tx, {
        actorId: sessionUser.id,
        actorType: sessionUser.isAdmin ? "ADMIN" : "USER",
        action: "store.payment.submit_manual",
        entityType: "Payment",
        entityId: payment.id,
        after: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr: String(amountIrr),
          method,
          status: payment.status,
          referenceCode,
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
        id: payment.id,
        orderId: payment.orderId,
        amountIrr: Number(payment.amountIrr),
        amountUsd: Number(payment.amountUsd),
        method: payment.method,
        status: payment.status,
        referenceCode: payment.referenceCode,
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
      { error: "ثبت فیش پرداخت انجام نشد" },
      { status: 500 },
    );
  }
}
