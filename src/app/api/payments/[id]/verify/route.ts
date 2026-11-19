import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VerifyStatus = "PAID" | "FAILED" | "REFUNDED";

function snapshot(value: unknown) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

/**
 * Admin-only payment verification.
 * Payment status, linked subscription activation, and audit evidence are
 * committed together. An audit or entitlement failure aborts the mutation.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      return NextResponse.json({ error: "شناسه پرداخت نامعتبر است" }, { status: 400 });
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 8 * 1024) {
      return NextResponse.json({ error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > 8 * 1024) {
      return NextResponse.json({ error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست باید یک شیء معتبر باشد" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["status", "trackingCode", "reason"]);
    for (const key of Object.keys(input)) {
      if (!allowedFields.has(key)) {
        return NextResponse.json({ error: `فیلد غیرمجاز: ${key}` }, { status: 400 });
      }
    }

    const rawStatus = input.status === undefined ? "PAID" : input.status;
    if (typeof rawStatus !== "string") {
      return NextResponse.json({ error: "وضعیت پرداخت نامعتبر است" }, { status: 400 });
    }
    const status = rawStatus.trim().toUpperCase() as VerifyStatus;
    if (!["PAID", "FAILED", "REFUNDED"].includes(status)) {
      return NextResponse.json({ error: "وضعیت پرداخت نامعتبر است" }, { status: 400 });
    }

    let trackingCode: string | undefined;
    if (input.trackingCode !== undefined) {
      if (typeof input.trackingCode !== "string" || input.trackingCode.length > 100) {
        return NextResponse.json({ error: "کد پیگیری نامعتبر است" }, { status: 400 });
      }
      trackingCode = input.trackingCode.trim();
    }
    let reason: string | undefined;
    if (input.reason !== undefined) {
      if (typeof input.reason !== "string" || input.reason.length > 500) {
        return NextResponse.json({ error: "توضیح عملیات نامعتبر است" }, { status: 400 });
      }
      reason = input.reason.trim();
    }

    const outcome = await db.$transaction(async (tx) => {
      const before = await tx.payment.findUnique({ where: { id } });
      if (!before) return { kind: "not-found" as const };
      if (before.status !== "PENDING") return { kind: "not-pending" as const };

      let subscriptionBefore: any = null;
      if (status === "PAID" && before.type === "SUBSCRIPTION" && before.subscriptionId) {
        subscriptionBefore = await tx.premiumSubscription.findUnique({
          where: { id: before.subscriptionId },
        });
        if (!subscriptionBefore) return { kind: "subscription-missing" as const };
        if (subscriptionBefore.userId !== before.userId) {
          return { kind: "subscription-owner-mismatch" as const };
        }
      }

      const after = await tx.payment.update({
        where: { id },
        data: {
          status,
          ...(trackingCode !== undefined ? { trackingCode } : {}),
          ...(status === "PAID" ? { paidAt: new Date() } : {}),
        },
      });

      let subscriptionAfter: any = null;
      if (subscriptionBefore) {
        subscriptionAfter = await tx.premiumSubscription.update({
          where: { id: subscriptionBefore.id },
          data: { status: "ACTIVE", paymentRef: id },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "ADMIN",
          action: "payment.verify",
          entityType: "Payment",
          entityId: id,
          beforeJson: snapshot({ payment: before, premiumSubscription: subscriptionBefore }),
          afterJson: snapshot({ payment: after, premiumSubscription: subscriptionAfter }),
          reason: reason || `Marked ${status}`,
        },
      });

      return { kind: "ok" as const, payment: after };
    });

    if (outcome.kind === "not-found") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (outcome.kind === "not-pending") {
      return NextResponse.json({ error: "فقط پرداخت‌های در انتظار بررسی قابل تعیین تکلیف هستند" }, { status: 409 });
    }
    if (outcome.kind === "subscription-missing") {
      return NextResponse.json({ error: "اشتراک مرتبط با این پرداخت یافت نشد؛ وضعیت پرداخت تغییر نکرد" }, { status: 409 });
    }
    if (outcome.kind === "subscription-owner-mismatch") {
      return NextResponse.json({ error: "مالک اشتراک با مالک پرداخت مطابقت ندارد؛ وضعیت پرداخت تغییر نکرد" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      payment: { ...outcome.payment, amount: outcome.payment.amount.toString() },
    });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/payments/[id]/verify" });
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
