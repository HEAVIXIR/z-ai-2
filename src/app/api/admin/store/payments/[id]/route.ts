import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

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
    const body = await req.json();
    const existing = await storeDb.payment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });

    const data: any = {};
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: "وضعیت نامعتبر" }, { status: 400 });
      }
      data.status = body.status;
      data.reviewedAt = new Date();
    }
    if (body.note !== undefined) data.note = body.note || null;
    if (body.referenceCode !== undefined) data.referenceCode = body.referenceCode || null;
    if (body.gateway !== undefined) data.gateway = body.gateway || null;
    if (body.refId !== undefined) data.refId = body.refId || null;

    // If approving, mark the related order as PAID if not already.
    if (body.status === "APPROVED" && existing.orderId) {
      const order = await storeDb.order.findUnique({
        where: { id: existing.orderId },
        include: { _count: { select: { payments: true } } },
      });
      if (order && order.paymentStatus !== "PAID") {
        const approvedSum = await storeDb.payment.aggregate({
          where: { orderId: order.id, status: "APPROVED" },
          _sum: { amountIrr: true },
        });
        const totalIrrNum = Number(order.totalIrr ?? 0);
        const approvedSumNum = Number(approvedSum._sum.amountIrr ?? 0) + Number(existing.amountIrr ?? 0);
        await storeDb.order.update({
          where: { id: order.id },
          data: { paymentStatus: approvedSumNum >= totalIrrNum ? "PAID" : "PARTIAL" },
        });
        await logAudit({
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'store.order.update',
          entityType: 'Order',
          entityId: order.id,
          before: { paymentStatus: order.paymentStatus },
          after: { paymentStatus: approvedSumNum >= totalIrrNum ? "PAID" : "PARTIAL" },
        });
      }
    }

    const payment = await storeDb.payment.update({
      where: { id },
      data,
      include: {
        order: { select: { id: true, orderNumber: true, totalIrr: true, status: true } },
        customer: { select: { id: true, name: true, family: true, phone: true } },
      },
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.payment.update',
      entityType: 'Payment',
      entityId: payment.id,
      before: existing,
      after: payment,
    });


    return NextResponse.json({ success: true, data: serialize(payment) });
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
