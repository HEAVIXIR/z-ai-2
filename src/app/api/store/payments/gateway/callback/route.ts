import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { verifyPayment } from "@/lib/store-zarinpal";

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
      await storeDb.payment.update({
        where: { id: payment.id },
        data: { status: "REJECTED" },
      });
      await storeDb.order.update({
        where: { id: order.id },
        data: { paymentStatus: "UNPAID" },
      });
      return NextResponse.redirect(new URL(`/store?payment=failed&order=${order.orderNumber}`, url.origin));
    }

    // success — mark APPROVED + flip order to PAID
    await storeDb.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        refId: verify.refId,
        reviewedAt: new Date(),
      },
    });

    // recompute order's payment status from approved payments sum
    const approvedPayments = await storeDb.payment.findMany({
      where: { orderId: order.id, status: "APPROVED" },
    });
    const approvedSum = approvedPayments.reduce((s, p) => s + Number(p.amountIrr), 0);
    const totalIrr = Number(order.totalIrr);
    const newPayStatus = approvedSum >= totalIrr ? "PAID" : approvedSum > 0 ? "PARTIAL" : "UNPAID";
    await storeDb.order.update({
      where: { id: order.id },
      data: { paymentStatus: newPayStatus, status: "CONFIRMED" },
    });

    return NextResponse.redirect(new URL(`/store?payment=success&order=${order.orderNumber}`, url.origin));
  } catch (e: any) {
    console.error("[api/store/payments/gateway/callback GET] error:", e);
    const url = new URL(req.url);
    return NextResponse.redirect(new URL("/store?payment=failed", url.origin));
  }
}
