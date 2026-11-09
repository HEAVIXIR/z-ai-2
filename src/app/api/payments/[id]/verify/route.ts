import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["PAID", "FAILED"]);
const MAX_TRACKING_CODE_LENGTH = 100;
const MAX_REASON_LENGTH = 500;

class PaymentNotFoundError extends Error {}
class PaymentStateConflictError extends Error {}
class PaymentSubscriptionMismatchError extends Error {}

/**
 * POST /api/payments/[id]/verify
 *
 * Privileged manual reconciliation only. This is NOT a public gateway
 * callback. Gateway callbacks must use provider-side verification.
 *
 * Financial invariants:
 * - Only PENDING payments may transition through this endpoint.
 * - PAID + subscription activation + audit record commit atomically.
 * - The linked subscription must belong to the same user as the payment.
 * - Conditional updateMany is the authoritative concurrency/CAS guard.
 * - Refunds use the dedicated transactional refund action, not this route.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePermission(user.id, "payment.manage");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires 'payment.manage' permission" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    if (!id || id.length > 128) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.toUpperCase() : "";
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "status must be PAID or FAILED; refunds use the refund workflow" },
        { status: 400 },
      );
    }

    if (
      payload.trackingCode !== undefined &&
      payload.trackingCode !== null &&
      typeof payload.trackingCode !== "string"
    ) {
      return NextResponse.json({ error: "trackingCode must be a string" }, { status: 400 });
    }
    const trackingCode =
      payload.trackingCode === undefined || payload.trackingCode === null
        ? undefined
        : payload.trackingCode.trim();
    if (trackingCode !== undefined && trackingCode.length > MAX_TRACKING_CODE_LENGTH) {
      return NextResponse.json({ error: "trackingCode is too long" }, { status: 400 });
    }

    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    if (reason.length < 5 || reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: "A reason of 5–500 characters is required" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const before = await tx.payment.findUnique({ where: { id } });
      if (!before) throw new PaymentNotFoundError("Payment not found");
      if (before.status !== "PENDING") {
        throw new PaymentStateConflictError(
          `Payment cannot transition from ${before.status}; only PENDING is eligible`,
        );
      }

      if (status === "PAID" && before.type === "SUBSCRIPTION" && !before.subscriptionId) {
        throw new PaymentSubscriptionMismatchError(
          "Subscription payment has no linked subscription",
        );
      }

      const transition = await tx.payment.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status,
          ...(status === "PAID" ? { paidAt: new Date() } : {}),
          ...(trackingCode !== undefined ? { trackingCode } : {}),
        },
      });
      if (transition.count !== 1) {
        throw new PaymentStateConflictError("Payment was changed by another request");
      }

      if (status === "PAID" && before.type === "SUBSCRIPTION" && before.subscriptionId) {
        const activation = await tx.premiumSubscription.updateMany({
          where: { id: before.subscriptionId, userId: before.userId },
          data: { status: "ACTIVE", paymentRef: id },
        });
        if (activation.count !== 1) {
          throw new PaymentSubscriptionMismatchError(
            "Linked subscription is missing or belongs to a different user",
          );
        }
      }

      const after = await tx.payment.findUnique({ where: { id } });
      if (!after) throw new PaymentNotFoundError("Payment disappeared during verification");

      // Critical payment audit is part of the same transaction. If audit
      // persistence fails, payment state and subscription activation roll back.
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "ADMIN",
          action: "payment.verify",
          entityType: "Payment",
          entityId: id,
          beforeJson: JSON.stringify({
            status: before.status,
            type: before.type,
            userId: before.userId,
            amount: before.amount.toString(),
            subscriptionId: before.subscriptionId,
          }),
          afterJson: JSON.stringify({
            status: after.status,
            type: after.type,
            userId: after.userId,
            amount: after.amount.toString(),
            subscriptionId: after.subscriptionId,
            paidAt: after.paidAt?.toISOString() ?? null,
          }),
          reason,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
        },
      });

      return after;
    });

    return NextResponse.json({
      ok: true,
      payment: { ...result, amount: result.amount.toString() },
    });
  } catch (err: unknown) {
    if (err instanceof PaymentNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (
      err instanceof PaymentStateConflictError ||
      err instanceof PaymentSubscriptionMismatchError
    ) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    trackError(err, { endpoint: "POST /api/payments/[id]/verify", userId: user.id });
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
