import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/payments/[id] — verify / reject / refund
   ============================================================ */

const ALLOWED_STATUSES = ["APPROVED", "REJECTED"];
const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  REFUNDED: "بازگشت‌خورده",
};
const METHOD_LABELS: Record<string, string> = {
  CARD: "کارت به کارت",
  WALLET: "کیف پول",
  CASH: "نقدی",
  GATEWAY: "درگاه آنلاین",
};

function maskPayerCard(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return `•••• ${digits.slice(-4)}`;
}

function serialize(p: any) {
  // Never spread a payment row: raw card data and internal reviewer/provider
  // metadata must not leak through admin collection or detail responses.
  return {
    id: p.id,
    orderId: p.orderId,
    customerId: p.customerId,
    amountIrr: p.amountIrr?.toString?.() ?? String(p.amountIrr ?? 0),
    amountUsd: p.amountUsd?.toString?.() ?? String(p.amountUsd ?? 0),
    method: p.method,
    status: p.status,
    statusLabel: STATUS_LABELS[p.status] ?? p.status,
    methodLabel: METHOD_LABELS[p.method] ?? p.method,
    receiptImageUrl: p.receiptImageUrl,
    referenceCode: p.referenceCode,
    payerName: p.payerName,
    payerCard: maskPayerCard(p.payerCard),
    note: p.note,
    gateway: p.gateway,
    authority: p.authority,
    refId: p.refId,
    gatewayUrl: p.gatewayUrl,
    reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
    createdAt: p.createdAt?.toISOString?.() ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
    ...(p.order
      ? { order: { id: p.order.id, orderNumber: p.order.orderNumber, totalIrr: p.order.totalIrr?.toString?.() ?? String(p.order.totalIrr ?? 0), status: p.order.status } }
      : {}),
    ...(p.customer
      ? { customer: { id: p.customer.id, name: p.customer.name, family: p.customer.family, phone: p.customer.phone } }
      : {}),
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
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const result = await storeDb.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { id } });
      if (!existing) return { notFound: true as const };

      if (body.status === "REFUNDED") {
        return { conflict: true as const };
      }
      if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) {
        return { invalidStatus: true as const };
      }
      // Approval/rejection are one-way decisions from PENDING. Replaying an
      // approval must not double-count its amount in the parent order total.
      if (body.status !== undefined && existing.status !== "PENDING") {
        return { conflict: true as const };
      }

      const data: any = {};
      if (body.status !== undefined) {
        data.status = body.status;
        data.reviewedAt = new Date();
      }
      if (body.note !== undefined) data.note = body.note || null;
      if (body.referenceCode !== undefined) data.referenceCode = body.referenceCode || null;
      if (body.gateway !== undefined) data.gateway = body.gateway || null;
      if (body.refId !== undefined) data.refId = body.refId || null;
      if (Object.keys(data).length === 0) return { noChanges: true as const };

      const payment = await tx.payment.update({
        where: { id },
        data,
        include: {
          order: { select: { id: true, orderNumber: true, totalIrr: true, status: true } },
          customer: { select: { id: true, name: true, family: true, phone: true } },
        },
      });

      if (body.status === "APPROVED" && existing.orderId) {
        const order = await tx.order.findUnique({ where: { id: existing.orderId } });
        if (order && order.paymentStatus !== "PAID") {
          const approvedSum = await tx.payment.aggregate({
            where: { orderId: order.id, status: "APPROVED" },
            _sum: { amountIrr: true },
          });
          const totalIrrNum = Number(order.totalIrr ?? 0);
          const approvedSumNum = Number(approvedSum._sum.amountIrr ?? 0);
          const nextPaymentStatus = approvedSumNum >= totalIrrNum ? "PAID" : "PARTIAL";
          if (order.paymentStatus !== nextPaymentStatus) {
            await tx.order.update({
              where: { id: order.id },
              data: { paymentStatus: nextPaymentStatus },
            });
            await enqueueAuditOutbox(tx, {
              actorId: user.id,
              actorType: 'ADMIN',
              action: 'store.order.update',
              entityType: 'Order',
              entityId: order.id,
              before: { paymentStatus: order.paymentStatus },
              after: { paymentStatus: nextPaymentStatus },
            });
          }
        }
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.payment.update',
        entityType: 'Payment',
        entityId: payment.id,
        before: {
          status: existing.status,
          amountIrr: String(existing.amountIrr ?? 0),
          amountUsd: String(existing.amountUsd ?? 0),
          method: existing.method,
          referenceCode: existing.referenceCode,
          payerName: existing.payerName,
          payerCard: maskPayerCard(existing.payerCard),
          note: existing.note,
        },
        after: {
          status: payment.status,
          amountIrr: String(payment.amountIrr ?? 0),
          amountUsd: String(payment.amountUsd ?? 0),
          method: payment.method,
          referenceCode: payment.referenceCode,
          payerName: payment.payerName,
          payerCard: maskPayerCard(payment.payerCard),
          note: payment.note,
        },
      });

      return { payment };
    }, { isolationLevel: 'Serializable' });

    if ("notFound" in result) {
      return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    }
    if ("invalidStatus" in result) {
      return NextResponse.json({ success: false, error: "وضعیت نامعتبر" }, { status: 400 });
    }
    if ("noChanges" in result) {
      return NextResponse.json({ success: false, error: "هیچ تغییری برای ثبت ارسال نشده است" }, { status: 400 });
    }
    if ("conflict" in result) {
      return NextResponse.json(
        {
          success: false,
          error: "پرداخت فقط از وضعیت در انتظار قابل تصمیم‌گیری است؛ بازپرداخت نیز به گردش مستند مستقل نیاز دارد",
          code: "STORE_PAYMENT_STATE_CONFLICT",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: serialize(result.payment) });
  } catch (e: any) {
    console.error("[store/payments PATCH] error:", e);
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
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
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
