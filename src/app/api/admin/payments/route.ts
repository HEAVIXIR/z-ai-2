import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { trackError } from "@/lib/error-tracking";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(p: any) {
  return {
    ...p,
    amount: p.amount ? p.amount.toString() : null,
  };
}

/* GET /api/admin/payments
   --------------------------------
   Admin-only. Lists all payments, newest first. Supports:
     ?status=PENDING|PAID|FAILED|REFUNDED
     ?type=SUBSCRIPTION|FEATURED_LISTING|PROMOTION|LEAD_FEE|INSPECTION_FEE
     ?userId=<id>
     ?take=<n>  (default 100, max 500)

   Includes the user's name/mobile for the admin table. */
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "payment.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires payment.read" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const take = Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("take") ?? 100)),
    );
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const userId = url.searchParams.get("userId");

    const where: any = {};
    if (status) where.status = String(status).toUpperCase();
    if (type) where.type = String(type).toUpperCase();
    if (userId) where.userId = String(userId);

    const [items, total, stats] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mobile: true,
              email: true,
            },
          },
        },
      }),
      db.payment.count({ where }),
      {
        pending: await db.payment.count({ where: { status: "PENDING" } }),
        paid: await db.payment.count({ where: { status: "PAID" } }),
        failed: await db.payment.count({ where: { status: "FAILED" } }),
        refunded: await db.payment.count({ where: { status: "REFUNDED" } }),
        revenuePaid: (await db.payment.aggregate({
          where: { status: "PAID" },
          _sum: { amount: true },
        }))._sum.amount?.toString() ?? "0",
      },
    ]);

    return NextResponse.json({
      payments: items.map(serialize),
      total,
      stats,
    });
  } catch (err: any) {
    trackError(err, { endpoint: "GET /api/admin/payments" });
    return NextResponse.json(
      { error: "Unable to process payment request" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/payments
   --------------------------------
   Admin-only. Creates a MANUAL payment row on behalf of a user
   (for offline / cash / bank-transfer payments). Body:
     {
       userId:        string  (required)
       amount:        string|number  (required, IRR)
       type:          "SUBSCRIPTION" | "FEATURED_LISTING" | ...
       subscriptionId?: string
       gateway?:      "MANUAL" (default)
       trackingCode?: string  (e.g. bank receipt number)
       markPaid?:     boolean (default true — admin is creating
                              an already-paid offline payment)
     }

   The payment is created with gateway="MANUAL" and (by default)
   status=PAID + paidAt=now, because the typical flow is: user
   pays offline → admin records the payment as already-settled.
   Pass `markPaid: false` to create a PENDING manual payment
   (e.g. awaiting bank confirmation). */
export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "payment.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires payment.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const amount = parseBig(body.amount);
    if (!amount || amount <= 0n) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }
    const type = String(body.type ?? "SUBSCRIPTION").toUpperCase();
    const ALLOWED = [
      "SUBSCRIPTION",
      "FEATURED_LISTING",
      "PROMOTION",
      "LEAD_FEE",
      "INSPECTION_FEE",
    ];
    if (!ALLOWED.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${ALLOWED.join(", ")}` },
        { status: 400 },
      );
    }
    const markPaid = body.markPaid !== false; // default true

    const subscriptionId = body.subscriptionId ? String(body.subscriptionId) : null;
    const gateway = body.gateway ? String(body.gateway).toUpperCase() : "MANUAL";
    if (!["ZARINPAL", "PAYIR", "MANUAL"].includes(gateway)) {
      return NextResponse.json({ error: "gateway is invalid" }, { status: 400 });
    }
    const trackingCode = body.trackingCode ? String(body.trackingCode) : null;
    if (trackingCode && trackingCode.length > 100) {
      return NextResponse.json({ error: "trackingCode must not exceed 100 characters" }, { status: 400 });
    }
    const currency = String(body.currency ?? "IRR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "currency must be a 3-letter code" }, { status: 400 });
    }

    const payment = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return { kind: "USER_NOT_FOUND" as const };

      if (subscriptionId) {
        const subscription = await tx.premiumSubscription.findFirst({
          where: { id: subscriptionId, userId },
          select: { id: true },
        });
        if (!subscription) return { kind: "SUBSCRIPTION_NOT_FOUND" as const };
      }

      const created = await tx.payment.create({
        data: {
          userId,
          subscriptionId,
          amount,
          currency,
          type,
          status: markPaid ? "PAID" : "PENDING",
          gateway,
          trackingCode,
          paidAt: markPaid ? new Date() : null,
        },
      });

      if (markPaid && type === "SUBSCRIPTION" && subscriptionId) {
        await tx.premiumSubscription.update({
          where: { id: subscriptionId },
          data: { status: "ACTIVE", paymentRef: created.id },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorType: "ADMIN",
          action: "payment.create_manual",
          entityType: "Payment",
          entityId: created.id,
          afterJson: JSON.stringify({
            userId,
            subscriptionId,
            amount: amount.toString(),
            currency,
            type,
            gateway: created.gateway,
            status: created.status,
            trackingCode,
          }),
          reason: "via admin API",
        },
      });

      return { kind: "CREATED" as const, payment: created };
    });

    if (payment.kind === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (payment.kind === "SUBSCRIPTION_NOT_FOUND") {
      return NextResponse.json({ error: "Subscription not found for this user" }, { status: 404 });
    }
    const createdPayment = payment.payment;
    return NextResponse.json({ ok: true, payment: serialize(createdPayment) });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/admin/payments" });
    return NextResponse.json(
      { error: "Unable to process payment request" },
      { status: 500 },
    );
  }
}
