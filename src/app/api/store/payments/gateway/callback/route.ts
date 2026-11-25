import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { verifyPayment } from "@/lib/store-zarinpal";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/payments/gateway/callback — Gateway callback

   STEP 12.86 P0 SECURITY FIX:
   This endpoint is legitimately public (Zarinpal calls it), but:
   - Amount is verified from server-side Payment record, not from query
   - Payment must be PENDING (prevents double-callback/replay)
   - Order must not be CANCELLED/REFUNDED
   - After success, payment is marked APPROVED (not re-processable)

   Query params: ?orderId=X&phone=Y&Authority=Z&Status=OK|NOK
                 (or ?payment=mock for sandbox)
   ============================================================ */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId") || "";
    const authority = url.searchParams.get("Authority") || "";
    const status = url.searchParams.get("Status") || "";
    const isMock = url.searchParams.get("payment") === "mock";

    // No order context — go back to /store
    if (!orderId) {
      return NextResponse.redirect(new URL("/store?payment=failed", url.origin));
    }

    const order = await storeDb.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) {
      return NextResponse.redirect(new URL("/store?payment=failed", url.origin));
    }

    // P0 FIX: Order state validation — ignore callback for cancelled/refunded orders.
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return NextResponse.redirect(new URL(`/store?payment=failed&order=${order.orderNumber}`, url.origin));
    }

    const payment = order.payments.find(
      (p) => p.authority === authority || (isMock && p.gateway === "MOCK" && p.status === "PENDING"),
    );
    if (!payment) {
      return NextResponse.redirect(new URL(`/store?payment=failed&order=${order.orderNumber}`, url.origin));
    }

    // P0 FIX: Duplicate prevention — payment must be PENDING (not already APPROVED/REJECTED).
    if (payment.status !== "PENDING") {
      // Already processed — redirect with appropriate message.
      const param = payment.status === "APPROVED" ? "success" : "failed";
      return NextResponse.redirect(new URL(`/store?payment=${param}&order=${order.orderNumber}`, url.origin));
    }

    // P0 FIX: Amount from server-side Payment record, not from query params.
    const verify = await verifyPayment({
      authority: payment.authority || authority,
      status: status || (isMock ? "OK" : "NOK"),
      amountIrr: Number(payment.amountIrr),
    });

    if (!verify.success) {
      await storeDb.$transaction(async (tx: any) => {
        const rejected = await tx.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "REJECTED" },
        });
        if (rejected.count === 0) return;
        const approvedPayments = await tx.payment.findMany({
          where: { orderId: order.id, status: "APPROVED" },
        });
        const approvedSum = approvedPayments.reduce((sum: number, item: any) => sum + Number(item.amountIrr), 0);
        const totalIrr = Number(order.totalIrr);
        const paymentStatus = approvedSum >= totalIrr ? "PAID" : approvedSum > 0 ? "PARTIAL" : "UNPAID";
        const currentOrder = await tx.order.findUnique({
          where: { id: order.id },
          select: { paymentStatus: true },
        });
        if (currentOrder && currentOrder.paymentStatus !== paymentStatus) {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus },
          });
          await enqueueAuditOutbox(tx, {
            actorId: null,
            actorType: "SYSTEM",
            action: "store.order.payment_status.sync",
            entityType: "Order",
            entityId: order.id,
            before: { paymentStatus: currentOrder.paymentStatus },
            after: { paymentStatus },
          });
        }
        await enqueueAuditOutbox(tx, {
          actorId: null,
          actorType: "SYSTEM",
          action: "store.payment.gateway.reject",
          entityType: "Payment",
          entityId: payment.id,
          before: { status: "PENDING" },
          after: { status: "REJECTED", orderId: order.id, amountIrr: String(payment.amountIrr) },
        });
      });
      return NextResponse.redirect(new URL(`/store?payment=failed&order=${order.orderNumber}`, url.origin));
    }

    // Keep the payment transition and the derived order payment state atomic.
    const transition = await storeDb.$transaction(async (tx: any) => {
      const approved = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          refId: verify.refId,
          reviewedAt: new Date(),
        },
      });
      if (approved.count === 0) {
        const latest = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
        return { changed: false, status: latest?.status ?? "UNKNOWN" };
      }

      const approvedPayments = await tx.payment.findMany({
        where: { orderId: order.id, status: "APPROVED" },
      });
      const approvedSum = approvedPayments.reduce((sum: number, item: any) => sum + Number(item.amountIrr), 0);
      const totalIrr = Number(order.totalIrr);
      const paymentStatus = approvedSum >= totalIrr ? "PAID" : approvedSum > 0 ? "PARTIAL" : "UNPAID";
      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { paymentStatus: true, status: true },
      });
      if (!currentOrder || ["CANCELLED", "REFUNDED"].includes(currentOrder.status)) {
        throw new Error("STORE_ORDER_CLOSED_DURING_PAYMENT_CALLBACK");
      }
      const nextOrderStatus = currentOrder.status === "PENDING" ? "CONFIRMED" : currentOrder.status;
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus, status: nextOrderStatus },
      });
      await enqueueAuditOutbox(tx, {
        actorId: null,
        actorType: "SYSTEM",
        action: "store.payment.gateway.approve",
        entityType: "Payment",
        entityId: payment.id,
        before: { status: "PENDING" },
        after: { status: "APPROVED", orderId: order.id, amountIrr: String(payment.amountIrr), refId: verify.refId },
      });
      if (currentOrder.paymentStatus !== paymentStatus || currentOrder.status !== nextOrderStatus) {
        await enqueueAuditOutbox(tx, {
          actorId: null,
          actorType: "SYSTEM",
          action: "store.order.payment_status.sync",
          entityType: "Order",
          entityId: order.id,
          before: { paymentStatus: currentOrder.paymentStatus, status: currentOrder.status },
          after: { paymentStatus, status: nextOrderStatus },
        });
      }
      return { changed: true, status: "APPROVED" };
    });

    if (!transition.changed) {
      const param = transition.status === "APPROVED" ? "success" : "failed";
      return NextResponse.redirect(new URL(`/store?payment=${param}&order=${order.orderNumber}`, url.origin));
    }

    return NextResponse.redirect(new URL(`/store?payment=success&order=${order.orderNumber}`, url.origin));
  } catch (e: any) {
    console.error("[api/store/payments/gateway/callback GET] error:", e);
    const url = new URL(req.url);
    return NextResponse.redirect(new URL("/store?payment=failed", url.origin));
  }
}
