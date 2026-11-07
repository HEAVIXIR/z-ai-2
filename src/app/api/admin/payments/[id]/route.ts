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

// ── PATCH: update non-financial metadata only ─────────────
// Financial status/type/gateway/paidAt are immutable through generic PATCH.
// Verification/refund transitions must go through the transactional
// payment action-engine so linked entitlements and audit state stay atomic.
export async function PATCH(req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "payment.manage");
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const forbiddenFields = ["status", "type", "gateway", "paidAt"];
    const attemptedFinancialMutation = forbiddenFields.find((field) =>
      Object.prototype.hasOwnProperty.call(body, field),
    );
    if (attemptedFinancialMutation) {
      return NextResponse.json(
        {
          error: `Payment ${attemptedFinancialMutation} cannot be changed through PATCH; use the audited verify/refund action`,
          code: "PAYMENT_STATE_ACTION_REQUIRED",
        },
        { status: 409 },
      );
    }

    if (!Object.prototype.hasOwnProperty.call(body, "trackingCode")) {
      return NextResponse.json(
        { error: "Only trackingCode metadata can be updated through PATCH" },
        { status: 400 },
      );
    }

    const trackingCode =
      body.trackingCode === null ? null : String(body.trackingCode).trim();
    if (trackingCode !== null && trackingCode.length > 100) {
      return NextResponse.json(
        { error: "trackingCode must not exceed 100 characters" },
        { status: 400 },
      );
    }

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const payment = await db.payment.update({
      where: { id },
      data: { trackingCode },
    });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "payment.update",
      entityType: "Payment",
      entityId: payment.id,
      before: { trackingCode: existing.trackingCode },
      after: { trackingCode: payment.trackingCode },
      reason: "trackingCode metadata update via admin API",
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
