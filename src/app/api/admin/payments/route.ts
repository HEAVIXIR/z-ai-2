import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { trackError } from "@/lib/error-tracking";
import { hasPermission } from "@/lib/rbac";
import { parseManualPaymentAmount } from "@/lib/payments/manual-payment-validation";

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
      { error: err?.message ?? "Server error" },
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
       type:          "FEATURED_LISTING" | "PROMOTION" | "LEAD_FEE" | "INSPECTION_FEE"
       Subscription manual payments are disabled until server-derived billing terms exist.
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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const type = String(body.type ?? "").toUpperCase();
    if (type === "SUBSCRIPTION") {
      return NextResponse.json(
        {
          error: "Manual subscription payments are unavailable until canonical plan amount, currency, and term snapshots are implemented",
          code: "SUBSCRIPTION_BILLING_UNAVAILABLE",
        },
        { status: 409 },
      );
    }
    const ALLOWED = ["FEATURED_LISTING", "PROMOTION", "LEAD_FEE", "INSPECTION_FEE"];
    if (!ALLOWED.includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: " + ALLOWED.join(", ") },
        { status: 400 },
      );
    }
    if (body.subscriptionId !== undefined && body.subscriptionId !== null && String(body.subscriptionId).trim()) {
      return NextResponse.json(
        { error: "subscriptionId cannot be supplied for non-subscription payment types" },
        { status: 400 },
      );
    }

    const userId = String(body.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const amount = parseManualPaymentAmount(body.amount);
    if (amount === null) {
      return NextResponse.json(
        { error: "amount must be a positive whole number of IRR within the supported range" },
        { status: 400 },
      );
    }
    const currency = String(body.currency ?? "IRR").toUpperCase();
    if (currency !== "IRR") {
      return NextResponse.json({ error: "Manual payments currently support IRR only" }, { status: 400 });
    }
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 5 || reason.length > 500) {
      return NextResponse.json({ error: "A reason of 5–500 characters is required" }, { status: 400 });
    }
    const markPaid = body.markPaid !== false;

    const gateway = body.gateway ? String(body.gateway).toUpperCase() : "MANUAL";
    if (gateway !== "MANUAL") {
      return NextResponse.json(
        { error: "This endpoint records offline/manual payments only; online gateways require verified provider callbacks" },
        { status: 400 },
      );
    }
    const trackingCode = body.trackingCode ? String(body.trackingCode).trim() : null;
    if (trackingCode && trackingCode.length > 100) {
      return NextResponse.json({ error: "trackingCode is too long" }, { status: 400 });
    }

    const payment = await db.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!targetUser) throw new Error("PAYMENT_USER_NOT_FOUND");

      const created = await tx.payment.create({
        data: {
          userId,
          subscriptionId: null,
          amount,
          currency,
          type,
          status: markPaid ? "PAID" : "PENDING",
          gateway,
          trackingCode,
          paidAt: markPaid ? new Date() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorType: "ADMIN",
          action: "payment.create_manual",
          entityType: "Payment",
          entityId: created.id,
          afterJson: JSON.stringify({
            userId,
            amount: amount.toString(),
            type,
            gateway,
            status: created.status,
            subscriptionId: null,
          }),
          reason,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
        },
      });

      return created;
    });

    return NextResponse.json({ ok: true, payment: serialize(payment) });
  } catch (err: any) {
    if (err?.message === "PAYMENT_USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    trackError(err, { endpoint: "POST /api/admin/payments" });
    return NextResponse.json(
      { error: "Manual payment creation failed" },
      { status: 500 },
    );
  }
}
