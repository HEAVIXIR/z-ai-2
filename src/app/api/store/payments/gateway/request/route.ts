import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { requestPayment } from "@/lib/store-zarinpal";
import { getStoreUserWithRole } from "@/lib/store-auth";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

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
    if (Object.keys(input).some((key) => key !== "orderId")) {
      return NextResponse.json({ error: "فیلد غیرمجاز در درخواست پرداخت" }, { status: 400 });
    }
    if (typeof input.orderId !== "string" || !input.orderId.trim() || input.orderId.length > 128) {
      return NextResponse.json({ error: "orderId معتبر الزامی است" }, { status: 400 });
    }
    const orderId = input.orderId.trim();

    const incoming = new URL(req.url);
    const origin = `${incoming.protocol}//${incoming.host}`;

    const outcome = await storeDb.$transaction(async (tx) => {
      // Serialize all gateway initiation attempts for this order. This is
      // transaction-scoped and does not mutate the Order row.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });
      if (!order) return { kind: "not-found" as const };

      if (!sessionUser.isAdmin) {
        const isOwner =
          order.userId === sessionUser.id ||
          (order.customer && order.customer.phone === sessionUser.mobile);
        if (!isOwner) return { kind: "forbidden" as const };
      }

      if (order.status === "CANCELLED" || order.status === "REFUNDED") {
        return { kind: "closed" as const };
      }
      if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
        return { kind: "paid" as const };
      }

      const existingGateway = await tx.payment.findFirst({
        where: { orderId: order.id, method: "GATEWAY", status: "PENDING" },
      });
      if (existingGateway) {
        return { kind: "existing" as const, payment: existingGateway };
      }

      // A pending manual receipt must be reviewed before another payment
      // channel is opened; otherwise both channels can collect the same balance.
      const pendingCount = await tx.payment.count({
        where: { orderId: order.id, status: "PENDING" },
      });
      if (pendingCount > 0) return { kind: "pending-manual" as const };

      const approved = await tx.payment.aggregate({
        where: { orderId: order.id, status: "APPROVED" },
        _sum: { amountIrr: true },
      });
      const approvedTotal = Number(approved._sum.amountIrr ?? 0);
      const remaining = Number(order.totalIrr ?? 0) - approvedTotal;
      const amountIrr = Math.round(remaining);
      if (!Number.isSafeInteger(amountIrr) || amountIrr <= 0) {
        return { kind: "invalid-balance" as const };
      }

      const phone = sessionUser.mobile || order.customer?.phone || "";
      const callbackUrl = `${origin}/api/store/payments/gateway/callback?orderId=${order.id}&phone=${encodeURIComponent(phone)}`;

      // External gateway request remains inside the serialized transaction so
      // a second request for the same order cannot create another authority.
      const gateway = await requestPayment({
        amountIrr,
        description: `سفارش ${order.orderNumber} — فروشگاه هویکس`,
        callbackUrl,
        mobile: phone,
        orderNumber: order.orderNumber,
      });

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amountIrr,
          amountUsd: order.currencyRateAtOrder > 0
            ? amountIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100))
            : 0,
          method: "GATEWAY",
          status: "PENDING",
          gateway: gateway.method,
          authority: gateway.authority,
          gatewayUrl: gateway.gatewayUrl,
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
          amountIrr,
          method: "GATEWAY",
          gateway: gateway.method,
          status: "PENDING",
          authority: gateway.authority,
        },
        reason: "Gateway payment initiated",
      });

      return { kind: "created" as const, payment };
    });

    if (outcome.kind === "not-found") {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }
    if (outcome.kind === "forbidden") {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    if (outcome.kind === "closed") {
      return NextResponse.json({ error: "برای این سفارش نمی‌توان پرداخت ثبت کرد" }, { status: 409 });
    }
    if (outcome.kind === "paid") {
      return NextResponse.json({ error: "این سفارش قبلاً پرداخت شده است" }, { status: 409 });
    }
    if (outcome.kind === "pending-manual") {
      return NextResponse.json({ error: "یک فیش پرداخت در انتظار بررسی است؛ ابتدا نتیجه آن مشخص شود" }, { status: 409 });
    }
    if (outcome.kind === "invalid-balance") {
      return NextResponse.json({ error: "مبلغ باقیمانده سفارش نامعتبر است" }, { status: 409 });
    }

    const payment = outcome.payment;
    return NextResponse.json({
      ok: true,
      authority: payment.authority,
      gatewayUrl: payment.gatewayUrl,
      method: payment.gateway,
      paymentId: payment.id,
      message: outcome.kind === "existing" ? "درخواست پرداخت قبلی همچنان فعال است" : undefined,
    });
  } catch (error: any) {
    if (error?.code === "P2034") {
      return NextResponse.json({ error: "درخواست پرداخت هم‌زمان پردازش شد؛ وضعیت سفارش را تازه‌سازی کنید" }, { status: 409 });
    }
    console.error("[api/store/payments/gateway/request POST] error:", error);
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
