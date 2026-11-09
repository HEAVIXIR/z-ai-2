import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_I64 = 9223372036854775807n;
const ALLOWED_TYPES = [
  "SUBSCRIPTION",
  "FEATURED_LISTING",
  "PROMOTION",
  "LEAD_FEE",
  "INSPECTION_FEE",
] as const;
const ALLOWED_GATEWAYS = ["ZARINPAL", "PAYIR", "MANUAL"] as const;

function parseAmount(value: unknown): bigint | null {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  try {
    const amount = BigInt(raw);
    return amount > 0n && amount <= MAX_I64 ? amount : null;
  } catch {
    return null;
  }
}

/**
 * Opens a pending payment ledger entry for the authenticated user.
 * The payment row and its audit event are committed atomically.
 */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
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
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json({ error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست باید یک شیء معتبر باشد" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set([
      "amount", "type", "subscriptionId", "gateway", "trackingCode", "currency",
    ]);
    for (const key of Object.keys(input)) {
      if (!allowedFields.has(key)) {
        return NextResponse.json({ error: `فیلد غیرمجاز: ${key}` }, { status: 400 });
      }
    }

    const amount = parseAmount(input.amount);
    if (amount === null) {
      return NextResponse.json({ error: "مبلغ پرداخت باید عدد صحیح مثبت و معتبر باشد" }, { status: 400 });
    }

    if (typeof input.type !== "string") {
      return NextResponse.json({ error: "نوع پرداخت نامعتبر است" }, { status: 400 });
    }
    const type = input.type.trim().toUpperCase();
    if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "نوع پرداخت پشتیبانی نمی‌شود" }, { status: 400 });
    }

    const gatewayValue = input.gateway === undefined ? "ZARINPAL" : input.gateway;
    if (typeof gatewayValue !== "string") {
      return NextResponse.json({ error: "درگاه پرداخت نامعتبر است" }, { status: 400 });
    }
    const gateway = gatewayValue.trim().toUpperCase();
    if (!(ALLOWED_GATEWAYS as readonly string[]).includes(gateway)) {
      return NextResponse.json({ error: "درگاه پرداخت پشتیبانی نمی‌شود" }, { status: 400 });
    }

    const currencyValue = input.currency === undefined ? "IRR" : input.currency;
    if (typeof currencyValue !== "string" || !/^[A-Za-z]{3,8}$/.test(currencyValue.trim())) {
      return NextResponse.json({ error: "واحد پول نامعتبر است" }, { status: 400 });
    }
    const currency = currencyValue.trim().toUpperCase();

    let subscriptionId: string | null = null;
    if (input.subscriptionId !== undefined && input.subscriptionId !== null && input.subscriptionId !== "") {
      if (typeof input.subscriptionId !== "string" || input.subscriptionId.length > 128) {
        return NextResponse.json({ error: "شناسه اشتراک نامعتبر است" }, { status: 400 });
      }
      if (type !== "SUBSCRIPTION") {
        return NextResponse.json({ error: "شناسه اشتراک فقط برای پرداخت اشتراک مجاز است" }, { status: 400 });
      }
      subscriptionId = input.subscriptionId.trim();
      if (!subscriptionId) {
        return NextResponse.json({ error: "شناسه اشتراک نامعتبر است" }, { status: 400 });
      }
    }

    let trackingCode: string | null = null;
    if (input.trackingCode !== undefined && input.trackingCode !== null && input.trackingCode !== "") {
      if (typeof input.trackingCode !== "string" || input.trackingCode.length > 100) {
        return NextResponse.json({ error: "کد پیگیری نامعتبر است" }, { status: 400 });
      }
      trackingCode = input.trackingCode.trim() || null;
    }

    const payment = await db.$transaction(async (tx) => {
      if (subscriptionId) {
        const subscription = await tx.premiumSubscription.findUnique({
          where: { id: subscriptionId },
          select: { id: true, userId: true },
        });
        if (!subscription || subscription.userId !== userId) {
          throw new Error("PAYMENT_SUBSCRIPTION_NOT_OWNED");
        }
      }

      const created = await tx.payment.create({
        data: {
          userId,
          subscriptionId,
          amount,
          currency,
          type,
          status: "PENDING",
          gateway,
          trackingCode,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          actorType: "USER",
          action: "payment.create",
          entityType: "Payment",
          entityId: created.id,
          beforeJson: null,
          afterJson: JSON.stringify({
            ...created,
            amount: created.amount.toString(),
          }),
          reason: "User initiated payment",
        },
      });
      return created;
    });

    return NextResponse.json({
      ok: true,
      payment: { ...payment, amount: payment.amount.toString() },
    });
  } catch (err: any) {
    if (err?.message === "PAYMENT_SUBSCRIPTION_NOT_OWNED") {
      return NextResponse.json({ error: "اشتراک یافت نشد یا متعلق به این حساب نیست" }, { status: 404 });
    }
    trackError(err, { endpoint: "POST /api/payments/create", userId });
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
