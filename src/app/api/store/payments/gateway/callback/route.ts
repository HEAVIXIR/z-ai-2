import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { verifyPayment } from "@/lib/store-zarinpal";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function computeLedgerPaymentStatus(
  orderTotalIrr: number,
  approvedPaymentsIrr: number,
  refundedPaymentsIrr: number,
): "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" {
  const netApproved = approvedPaymentsIrr - refundedPaymentsIrr;
  const hasRefund = refundedPaymentsIrr > 0;
  if (hasRefund && netApproved <= 0) return "REFUNDED";
  if (netApproved <= 0) return "UNPAID";
  if (netApproved >= orderTotalIrr) return hasRefund ? "REFUNDED" : "PAID";
  return "PARTIAL";
}

function redirectPayment(req: Request, outcome: "success" | "failed", orderNumber?: string, review = false) {
  const url = new URL(req.url);
  const params = new URLSearchParams({ payment: outcome });
  if (orderNumber) params.set("order", orderNumber);
  if (review) params.set("review", "1");
  return NextResponse.redirect(new URL(`/store?${params.toString()}`, url.origin));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const orderId = url.searchParams.get("orderId") || "";
    const authority = url.searchParams.get("Authority") || "";
    const status = url.searchParams.get("Status") || "";
    const isMock = url.searchParams.get("payment") === "mock";

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

    const payment = order.payments.find(
      (p: any) =>
        p.authority === authority ||
        (isMock && p.gateway === "MOCK" && p.status === "PENDING"),
    );
    if (!payment) {
      return redirectPayment(req, "failed", order.orderNumber);
    }

    // Replays are harmless: a prior successful transaction has already
    // committed payment, order snapshot, and both outbox events together.
    if (payment.status !== "PENDING") {
      return redirectPayment(
        req,
        payment.status === "APPROVED" ? "success" : "failed",
        order.orderNumber,
        payment.status === "APPROVED" && (order.status === "CANCELLED" || order.status === "REFUNDED"),
      );
    }

    const verify = await verifyPayment({
      authority: payment.authority || authority,
      status: status || (isMock ? "OK" : "NOK"),
      amountIrr: Number(payment.amountIrr),
    });

    const outcome = await storeDb.$transaction(async (tx) => {
      // Use the same per-order lock as gateway initiation and manual receipts.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.id}, 0))`;

      const beforePayment = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!beforePayment) return { kind: "not-found" as const };
      if (beforePayment.status !== "PENDING") {
        return { kind: "already-processed" as const, status: beforePayment.status };
      }

      const beforeOrder = await tx.order.findUnique({ where: { id: order.id } });
      if (!beforeOrder) return { kind: "not-found" as const };

      const nextStatus = verify.success ? "APPROVED" : "REJECTED";
      const changed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: nextStatus,
          ...(verify.success ? { refId: verify.refId } : {}),
          reviewedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        const current = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
        return { kind: "already-processed" as const, status: current?.status ?? null };
      }

      const afterPayment = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!afterPayment) throw new Error("GATEWAY_PAYMENT_MISSING_AFTER_UPDATE");

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
      const nextPaymentStatus = computeLedgerPaymentStatus(
        Number(beforeOrder.totalIrr ?? 0),
        approvedTotal,
        refundedTotal,
      );

      // A cancellation can race a gateway callback. Record the real money
      // movement, but never silently resurrect a cancelled/refunded order.
      const wasClosed = beforeOrder.status === "CANCELLED" || beforeOrder.status === "REFUNDED";
      const nextOrderStatus = verify.success && !wasClosed ? "CONFIRMED" : beforeOrder.status;
      const afterOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: nextPaymentStatus,
          status: nextOrderStatus,
        },
      });

      await enqueueAuditOutbox(tx, {
        actorId: null,
        actorType: "SYSTEM",
        action: verify.success ? "store.payment.verify" : "store.payment.reject",
        entityType: "Payment",
        entityId: payment.id,
        before: {
          status: beforePayment.status,
          amountIrr: Number(beforePayment.amountIrr),
          refId: beforePayment.refId,
        },
        after: {
          status: afterPayment.status,
          amountIrr: Number(afterPayment.amountIrr),
          refId: afterPayment.refId,
        },
        reason: verify.success ? "Gateway verification succeeded" : "Gateway verification failed",
      });

      if (
        beforeOrder.paymentStatus !== afterOrder.paymentStatus ||
        beforeOrder.status !== afterOrder.status
      ) {
        await enqueueAuditOutbox(tx, {
          actorId: null,
          actorType: "SYSTEM",
          action: "store.order.update",
          entityType: "Order",
          entityId: order.id,
          before: {
            status: beforeOrder.status,
            paymentStatus: beforeOrder.paymentStatus,
          },
          after: {
            status: afterOrder.status,
            paymentStatus: afterOrder.paymentStatus,
          },
          reason: wasClosed && verify.success
            ? "Gateway payment arrived after order closure; manual reconciliation required"
            : "Order payment status recalculated from payment ledger",
        });
      }

      return {
        kind: verify.success ? "approved" as const : "rejected" as const,
        reviewRequired: wasClosed && verify.success,
      };
    });

    if (outcome.kind === "approved") {
      return redirectPayment(req, "success", order.orderNumber, outcome.reviewRequired);
    }
    if (outcome.kind === "already-processed") {
      return redirectPayment(
        req,
        outcome.status === "APPROVED" ? "success" : "failed",
        order.orderNumber,
      );
    }
    return redirectPayment(req, "failed", order.orderNumber);
  } catch (error) {
    console.error("[api/store/payments/gateway/callback GET] error:", error);
    return NextResponse.redirect(new URL("/store?payment=failed", url.origin));
  }
}
