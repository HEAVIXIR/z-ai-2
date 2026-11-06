import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/payments/[id] — verify / reject / refund
   ============================================================ */

const ALLOWED_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REFUNDED"];

function serialize(p: any) {
  return {
    ...p,
    amountIrr: p.amountIrr?.toString?.() ?? String(p.amountIrr ?? 0),
    amountUsd: p.amountUsd?.toString?.() ?? String(p.amountUsd ?? 0),
    createdAt: p.createdAt?.toISOString?.() ?? null,
    reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > 16 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    let body: any;
    try {
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json({ success: false, error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
    }
    const allowedFields = new Set(["status", "note", "referenceCode", "gateway", "refId"]);
    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ success: false, error: "فیلد درخواست نامعتبر است" }, { status: 400 });
    }

    const data: any = {};
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: "وضعیت نامعتبر" }, { status: 400 });
      }
      data.status = body.status;
      data.reviewedAt = new Date();
    }
    if (body.note !== undefined) {
      if (body.note !== null && (typeof body.note !== "string" || body.note.length > 2000)) {
        return NextResponse.json({ success: false, error: "یادداشت نامعتبر است" }, { status: 400 });
      }
      data.note = body.note || null;
    }
    if (body.referenceCode !== undefined) {
      if (body.referenceCode !== null && (typeof body.referenceCode !== "string" || body.referenceCode.length > 200)) {
        return NextResponse.json({ success: false, error: "کد مرجع نامعتبر است" }, { status: 400 });
      }
      data.referenceCode = body.referenceCode || null;
    }
    if (body.gateway !== undefined) {
      if (body.gateway !== null && (typeof body.gateway !== "string" || body.gateway.length > 40)) {
        return NextResponse.json({ success: false, error: "درگاه نامعتبر است" }, { status: 400 });
      }
      data.gateway = body.gateway || null;
    }
    if (body.refId !== undefined) {
      if (body.refId !== null && (typeof body.refId !== "string" || body.refId.length > 200)) {
        return NextResponse.json({ success: false, error: "شناسه مرجع نامعتبر است" }, { status: 400 });
      }
      data.refId = body.refId || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "هیچ تغییری ارسال نشده است" }, { status: 400 });
    }

    const result = await storeDb.$transaction(async (tx) => {
      const initial = await tx.payment.findUnique({ where: { id } });
      if (!initial) return { kind: "NOT_FOUND" as const };

      // All payment channels serialize ledger mutations on the parent order.
      if (initial.orderId) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.orderId}, 0))`;
      }
      const existing = await tx.payment.findUnique({ where: { id } });
      if (!existing) return { kind: "NOT_FOUND" as const };

      if (body.status !== undefined && body.status !== existing.status) {
        const allowedNext: Record<string, string[]> = {
          PENDING: ["APPROVED", "REJECTED"],
          APPROVED: ["REFUNDED"],
          REJECTED: [],
          REFUNDED: [],
        };
        if (!(allowedNext[existing.status] || []).includes(body.status)) {
          return { kind: "INVALID_TRANSITION" as const };
        }
      }

      const changed = await tx.payment.updateMany({
        where: { id, status: existing.status },
        data,
      });
      if (changed.count !== 1) return { kind: "CONFLICT" as const };

      const payment = await tx.payment.findUnique({
        where: { id },
        include: {
          order: { select: { id: true, orderNumber: true, totalIrr: true, status: true } },
          customer: { select: { id: true, name: true, family: true, phone: true } },
        },
      });
      if (!payment) return { kind: "NOT_FOUND" as const };

      if (body.status !== undefined && existing.orderId) {
        const order = await tx.order.findUnique({
          where: { id: existing.orderId },
          select: { id: true, paymentStatus: true, totalIrr: true },
        });
        if (order) {
          const [approved, refunded] = await Promise.all([
            tx.payment.aggregate({
              where: { orderId: order.id, status: "APPROVED" },
              _sum: { amountIrr: true },
            }),
            tx.payment.aggregate({
              where: { orderId: order.id, status: "REFUNDED" },
              _sum: { amountIrr: true },
            }),
          ]);
          const approvedTotal = Number(approved._sum.amountIrr ?? 0);
          const refundedTotal = Number(refunded._sum.amountIrr ?? 0);
          const netApproved = approvedTotal - refundedTotal;
          const hasRefund = refundedTotal > 0;
          const orderTotal = Number(order.totalIrr ?? 0);
          const nextPaymentStatus =
            hasRefund && netApproved <= 0 ? "REFUNDED" :
            netApproved <= 0 ? "UNPAID" :
            netApproved >= orderTotal ? (hasRefund ? "REFUNDED" : "PAID") :
            "PARTIAL";

          if (nextPaymentStatus !== order.paymentStatus) {
            await tx.order.update({
              where: { id: order.id },
              data: { paymentStatus: nextPaymentStatus },
            });
            await enqueueAuditOutbox(tx, {
              actorId: user.id,
              actorType: "ADMIN",
              action: "store.order.update",
              entityType: "Order",
              entityId: order.id,
              before: { paymentStatus: order.paymentStatus },
              after: { paymentStatus: nextPaymentStatus },
              reason: "payment status recalculated from approved and refunded payment ledger",
            });
          }
        }
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: "ADMIN",
        action: "store.payment.update",
        entityType: "Payment",
        entityId: payment.id,
        before: {
          orderId: existing.orderId,
          customerId: existing.customerId,
          amountIrr: existing.amountIrr,
          amountUsd: existing.amountUsd,
          method: existing.method,
          status: existing.status,
          gateway: existing.gateway,
          referenceCode: existing.referenceCode,
          refId: existing.refId,
          reviewedById: existing.reviewedById,
          reviewedAt: existing.reviewedAt,
        },
        after: {
          orderId: payment.orderId,
          customerId: payment.customerId,
          amountIrr: payment.amountIrr,
          amountUsd: payment.amountUsd,
          method: payment.method,
          status: payment.status,
          gateway: payment.gateway,
          referenceCode: payment.referenceCode,
          refId: payment.refId,
          reviewedById: payment.reviewedById,
          reviewedAt: payment.reviewedAt,
        },
      });

      return { kind: "OK" as const, payment };
    });

    if (result.kind === "NOT_FOUND") {
      return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    }
    if (result.kind === "INVALID_TRANSITION") {
      return NextResponse.json({ success: false, error: "انتقال وضعیت پرداخت مجاز نیست" }, { status: 409 });
    }
    if (result.kind === "CONFLICT") {
      return NextResponse.json({ success: false, error: "پرداخت هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید" }, { status: 409 });
    }
    const payment = result.payment;
    return NextResponse.json({ success: true, data: serialize(payment) });
  } catch (e: any) {
    if (e?.code === "P2034") {
      return NextResponse.json({ success: false, error: "پرداخت هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید" }, { status: 409 });
    }
    console.error("[store/payments PATCH] request failed:", e);
    return NextResponse.json({ success: false, error: "پردازش پرداخت ناموفق بود" }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const payment = await storeDb.payment.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderNumber: true, totalIrr: true, status: true } },
        customer: { select: { id: true, name: true, family: true, phone: true } },
      },
    });
    if (!payment) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    return NextResponse.json({ success: true, data: serialize(payment) });
  } catch (e: any) {
    console.error("[store/payments GET] request failed:", e);
    return NextResponse.json({ success: false, error: "دریافت اطلاعات پرداخت ناموفق بود" }, { status: 500 });
  }
}
