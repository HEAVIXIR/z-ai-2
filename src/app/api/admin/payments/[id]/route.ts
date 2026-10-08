import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* ============================================================
   /api/admin/payments/[id] — Single-payment CRUD
   ------------------------------------------------------------
   ARCHITECTURE NOTE (P1 forensic investigation):
   The admin UI (universal-table / universal-form / universal-detail)
   calls the Universal Resource API at:
     /api/admin/resources/payments/[id]
   — NOT this dedicated route. This dedicated route exists for:
     1. Programmatic / API-client access with richer includes (user relation).
     2. Consistency with parts/[id], users/[id], companies/[id], listings/[id]
        which all have dedicated [id] routes following the same canonical pattern.
     3. Payment-specific PATCH semantics (status transitions, tracking code
        update) that are safer than a generic Universal-API PATCH because
        they validate allowed-status transitions and serialize BigInt.amount.

   Permission contract (matches paymentConfig in store-resources.ts):
     GET    → payment.read
     PATCH  → payment.manage
     DELETE → payment.manage

   Audit contract (matches paymentConfig.audit):
     entityType = "Payment"
     actions    = payment.manage, payment.refund
   (This route logs payment.update / payment.delete; the `refund` and
   `verify` actions are handled by the action-engine via the Universal
   action endpoint, NOT here.)
   ============================================================ */

function serialize(p: any) {
  return {
    ...p,
    amount: p.amount ? p.amount.toString() : null,
  };
}

// ── GET: single payment with user relation ────────────────
export async function GET(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "payment.read");
  try {
    const { id } = await params;
    const payment = await db.payment.findUnique({
      where: { id },
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
        order: {
          select: { id: true, orderNumber: true, status: true },
        },
      },
    });
    if (!payment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ payment: serialize(payment) });
  } catch (err: any) {
    trackError(err, { endpoint: "GET /api/admin/payments/[id]" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

// ── PATCH: update editable fields ─────────────────────────
// Allowed fields: trackingCode, gateway, status, type, paidAt.
// NOT allowed (immutable after creation): userId, amount, currency,
// idempotencyKey, orderId, subscriptionId, providerReference.
const ALLOWED_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];
const ALLOWED_TYPES = [
  "SUBSCRIPTION",
  "FEATURED_LISTING",
  "PROMOTION",
  "LEAD_FEE",
  "INSPECTION_FEE",
  "ORDER_PAYMENT",
  "COMMISSION",
  "REFUND",
];
const ALLOWED_GATEWAYS = ["ZARINPAL", "PAYIR", "MANUAL"];

export async function PATCH(req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "payment.manage");
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: any = {};

    // status (validated against allowed enum)
    if ("status" in body) {
      const status = body.status === null ? null : String(body.status).toUpperCase();
      if (status !== null && !ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
          { status: 400 },
        );
      }
      data.status = status ?? existing.status;
    }

    // type (validated against allowed enum)
    if ("type" in body) {
      const type = body.type === null ? null : String(body.type).toUpperCase();
      if (type !== null && !ALLOWED_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `type must be one of: ${ALLOWED_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      data.type = type ?? existing.type;
    }

    // gateway (validated against allowed enum)
    if ("gateway" in body) {
      const gateway =
        body.gateway === null ? null : String(body.gateway).toUpperCase();
      if (gateway !== null && !ALLOWED_GATEWAYS.includes(gateway)) {
        return NextResponse.json(
          { error: `gateway must be one of: ${ALLOWED_GATEWAYS.join(", ")}` },
          { status: 400 },
        );
      }
      data.gateway = gateway;
    }

    // trackingCode (maxLength 100 per paymentConfig validation contract)
    if ("trackingCode" in body) {
      const tc = body.trackingCode === null ? null : String(body.trackingCode);
      if (tc !== null && tc.length > 100) {
        return NextResponse.json(
          { error: "trackingCode must not exceed 100 characters" },
          { status: 400 },
        );
      }
      data.trackingCode = tc;
    }

    // paidAt (ISO date string or null)
    if ("paidAt" in body) {
      data.paidAt = body.paidAt === null ? null : new Date(body.paidAt);
    }

    // If status is being set to PAID and paidAt is not explicitly provided,
    // auto-set paidAt to now (matches POST /api/admin/payments markPaid semantics).
    if (data.status === "PAID" && !("paidAt" in data) && !existing.paidAt) {
      data.paidAt = new Date();
    }

    const payment = await db.payment.update({ where: { id }, data });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "payment.update",
      entityType: "Payment",
      entityId: payment.id,
      before: {
        status: existing.status,
        type: existing.type,
        gateway: existing.gateway,
        trackingCode: existing.trackingCode,
        paidAt: existing.paidAt?.toISOString() ?? null,
      },
      after: {
        status: payment.status,
        type: payment.type,
        gateway: payment.gateway,
        trackingCode: payment.trackingCode,
        paidAt: payment.paidAt?.toISOString() ?? null,
      },
      reason: "via admin API",
    });

    return NextResponse.json({ ok: true, payment: serialize(payment) });
  } catch (err: any) {
    trackError(err, { endpoint: "PATCH /api/admin/payments/[id]" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

// ── DELETE: remove a payment ──────────────────────────────
export async function DELETE(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "payment.manage");
  try {
    const { id } = await params;
    const before = await db.payment.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.payment.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "payment.delete",
      entityType: "Payment",
      entityId: id,
      before: {
        userId: before.userId,
        amount: before.amount.toString(),
        currency: before.currency,
        type: before.type,
        status: before.status,
        gateway: before.gateway,
        trackingCode: before.trackingCode,
      },
      reason: "via admin API",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    trackError(err, { endpoint: "DELETE /api/admin/payments/[id]" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
