import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PENDING_PAYMENTS = 3;
const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_METHODS = ["CARD", "CASH"] as const;

function parsePositiveSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalText(value: unknown, maxLength: number, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`INVALID_FIELD:${field}`);
  }
  return value.trim() || null;
}

/** Store only the last four digits; never persist a full payer card number. */
function cardLastFour(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 19) {
    throw new Error("INVALID_FIELD:payerCard");
  }
  return digits.slice(-4);
}

export async function POST(req: Request) {
  try {
    const sessionUser = await getStoreUserWithRole();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json({ error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست باید یک شیء معتبر باشد" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set([
      "orderId", "phone", "method", "amountIrr", "referenceCode", "payerName", "payerCard", "note",
    ]);
    for (const key of Object.keys(input)) {
      if (!allowedFields.has(key)) {
        return NextResponse.json({ error: `فیلد غیرمجاز: ${key}` }, { status: 400 });
      }
    }

    if (typeof input.orderId !== "string" || !input.orderId.trim() || input.orderId.length > 128) {
      return NextResponse.json({ error: "orderId معتبر الزامی است" }, { status: 400 });
    }
    const orderId = input.orderId.trim();
    const method = input.method === undefined ? "CARD" : input.method;
    if (typeof method !== "string" || !(ALLOWED_METHODS as readonly string[]).includes(method)) {
      return NextResponse.json({ error: "روش پرداخت پشتیبانی نمی‌شود" }, { status: 400 });
    }
    const amountIrr = parsePositiveSafeInteger(input.amountIrr);
    if (amountIrr === null) {
      return NextResponse.json({ error: "مبلغ پرداخت باید عدد صحیح مثبت و امن باشد" }, { status: 400 });
    }

    let referenceCode: string | null;
    let payerName: string | null;
    let payerCardInput: string | null;
    let note: string | null;
    try {
      referenceCode = optionalText(input.referenceCode, 120, "referenceCode");
      payerName = optionalText(input.payerName, 120, "payerName");
      payerCardInput = optionalText(input.payerCard, 32, "payerCard");
      note = optionalText(input.note, 1000, "note");
    } catch {
      return NextResponse.json({ error: "یکی از فیلدهای اطلاعات پرداخت نامعتبر است" }, { status: 400 });
    }
    let payerCard: string | null;
    try {
      payerCard = cardLastFour(payerCardInput);
    } catch {
      return NextResponse.json({ error: "شماره کارت باید معتبر باشد؛ فقط چهار رقم پایانی ذخیره می‌شود" }, { status: 400 });
    }

    const outcome = await storeDb.$transaction(async (tx) => {
      // Shared per-order lock serializes manual and gateway payment attempts.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });
      if (!order) return { kind: "not-found" as const };

      // Never trust the client-supplied phone; ownership is bound to the session.
      if (!sessionUser.isAdmin) {
        const isOwner =
          order.userId === sessionUser.id ||
          (order.customer && order.customer.phone === sessionUser.mobile);
        if (!isOwner) return { kind: "forbidden" as const };
      }

      if (order.status === "CANCELLED" || order.status === "REFUNDED" || order.paymentStatus === "REFUNDED") {
        return { kind: "closed" as const };
      }
      if (order.paymentStatus === "PAID") {
        return { kind: "already-paid" as const };
      }

      const pendingCount = await tx.payment.count({
        where: { orderId: order.id, status: "PENDING" },
      });
      if (pendingCount >= MAX_PENDING_PAYMENTS) {
        return { kind: "too-many-pending" as const };
      }

      const totals = await tx.payment.aggregate({
        where: { orderId: order.id, status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountIrr: true },
      });
      const existingTotal = Number(totals._sum.amountIrr ?? 0);
      const orderTotal = Number(order.totalIrr ?? 0);
      if (!Number.isSafeInteger(orderTotal) || orderTotal <= 0) {
        return { kind: "invalid-order-total" as const };
      }
      if (existingTotal + amountIrr > orderTotal) {
        return { kind: "overpayment", remaining: Math.max(0, orderTotal - existingTotal) } as const;
      }

      const amountUsd =
        order.currencyRateAtOrder > 0
          ? Number((amountIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100))).toFixed(2))
          : 0;

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr,
          amountUsd,
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
        action: "store.payment.create",
        entityType: "Payment",
        entityId: payment.id,
        after: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr,
          amountUsd,
          method,
          status: "PENDING",
          referenceCode,
          payerName,
          payerCardLastFour: payerCard,
        },
        reason: "Manual payment receipt submitted",
      });

      return { kind: "created" as const, payment };
    }, { isolationLevel: "Serializable" });

    if (outcome.kind === "not-found") {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }
    if (outcome.kind === "forbidden") {
      return NextResponse.json({ error: "این سفارش متعلق به حساب شما نیست" }, { status: 403 });
    }
    if (outcome.kind === "closed") {
      return NextResponse.json({ error: "برای این سفارش نمی‌توان پرداخت ثبت کرد" }, { status: 409 });
    }
    if (outcome.kind === "already-paid") {
      return NextResponse.json({ error: "این سفارش قبلاً به‌طور کامل پرداخت شده است" }, { status: 409 });
    }
    if (outcome.kind === "too-many-pending") {
      return NextResponse.json({ error: `حداکثر ${MAX_PENDING_PAYMENTS} فیش در انتظار تأیید مجاز است` }, { status: 409 });
    }
    if (outcome.kind === "invalid-order-total") {
      return NextResponse.json({ error: "مبلغ سفارش نامعتبر است" }, { status: 409 });
    }
    if (outcome.kind === "overpayment") {
      return NextResponse.json({
        error: `مبلغ پرداخت از مبلغ باقیمانده (${outcome.remaining.toLocaleString()} ریال) بیشتر است`,
      }, { status: 400 });
    }

    const payment = outcome.payment;
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
  } catch (error: any) {
    if (error?.code === "P2034") {
      return NextResponse.json({ error: "درخواست پرداخت هم‌زمان ثبت شده است؛ وضعیت سفارش را تازه‌سازی کنید" }, { status: 409 });
    }
    console.error("[api/store/payments/manual POST] error:", error);
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
