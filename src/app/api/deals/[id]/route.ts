/**
 * HEAVIX — Deal Detail API (Phase 9 — Transactions)
 * ------------------------------------------------------------
 * STEP 13.01 P0-4 FIX: @ts-nocheck removed; full TypeScript types
 * restored. Auth checks (buyer/seller ownership) were already in
 * place — this change just makes the types visible so future
 * regressions are caught at compile time.
 *
 * Routes:
 *   GET   /api/deals/[id] — get a single deal (buyer or seller only)
 *   PATCH /api/deals/[id] — transition deal status (state machine)
 */
import { NextResponse } from "next/server";
import { Prisma } from '@prisma/client';
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// STEP 13.36 P2-A: internal error class for compare-and-set conflict detection.
class ConcurrentTransitionError extends Error {
  constructor() {
    super("Concurrent transition detected: deal status changed by another request");
    this.name = "ConcurrentTransitionError";
  }
}

// STEP 13.38 P2-A: thrown when an order's status does not allow a valid
// transition to CONFIRMED (e.g., CANCELLED, PROCESSING, FULFILLED, COMPLETED).
class InvalidOrderTransitionError extends Error {
  constructor(
    public fromStatus: string,
    public toStatus: string,
  ) {
    super(
      `Invalid order transition: ${fromStatus} -> ${toStatus}. Only PENDING -> CONFIRMED is allowed when confirming a deal.`,
    );
    this.name = "InvalidOrderTransitionError";
  }
}

// Valid state transitions
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_CONFIRMATION", "CANCELLED"],
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "DISPUTED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  EXPIRED: [],
};

/* GET /api/deals/[id] — get a single deal. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const deal = await db.deal.findUnique({
      where: { id },
      include: {
        listing: { select: { id: true, title: true, slug: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
        disputes: { select: { id: true, status: true, reason: true } },
      },
    });

    if (!deal)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (deal.buyerId !== userId && deal.sellerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // STEP 13.26 P1 FIX: Explicit DTO allowlist for the detail endpoint.
    // The previous `...deal` spread leaked every scalar Deal field
    // (including cancelReason, notes, updatedAt) and would also surface
    // any future field added to the model. This allowlist mirrors the
    // GET /api/deals list contract (STEP 13.22) and adds the bounded
    // `disputes` relation, which is already constrained at the query
    // layer above (select: { id, status, reason }).
    //
    // Excluded internal fields: cancelReason, notes, updatedAt.
    // Excluded relations: buyer, seller (User PII), review.
    // Bounded relations: listing {id,title,slug}, order {id,orderNumber,status},
    //   disputes {id,status,reason}.
    return NextResponse.json({
      deal: {
        id: deal.id,
        dealNumber: deal.dealNumber,
        sourceType: deal.sourceType,
        sourceId: deal.sourceId,
        buyerId: deal.buyerId,
        sellerId: deal.sellerId,
        listingId: deal.listingId,
        agreedAmount: deal.agreedAmount ? deal.agreedAmount.toString() : null,
        currency: deal.currency,
        transactionType: deal.transactionType,
        status: deal.status,
        agreedAt: deal.agreedAt,
        confirmedAt: deal.confirmedAt,
        completedAt: deal.completedAt,
        cancelledAt: deal.cancelledAt,
        createdAt: deal.createdAt,
        listing: deal.listing,
        order: deal.order,
        disputes: deal.disputes,
      },
    });
  } catch (err: unknown) {
    // STEP 13.31 P2-C FIX: do not leak raw err.message to client.
    console.error("[api/deals/[id] GET] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/deals/[id] — transition deal status (state machine). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const deal = await db.deal.findUnique({
      where: { id },
      include: { order: { select: { id: true } } },
    });
    if (!deal)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (deal.buyerId !== userId && deal.sellerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const newStatus = String((body as { status?: unknown }).status ?? "");

    // Validate transition
    const allowed = TRANSITIONS[deal.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid transition: ${deal.status} → ${newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
        },
        { status: 409 },
      );
    }

    const updateData: {
      status: string;
      confirmedAt?: Date;
      completedAt?: Date;
      cancelledAt?: Date;
      cancelReason?: string | null;
    } = { status: newStatus };
    if (newStatus === "CONFIRMED") updateData.confirmedAt = new Date();
    if (newStatus === "COMPLETED") updateData.completedAt = new Date();
    if (newStatus === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelReason =
        (body as { cancelReason?: string }).cancelReason || null;
    }

    // STEP 13.36 P2-A FIX: compare-and-set atomic transition.
    // The deal.update uses updateMany with where: { id, status: deal.status }
    // so that if another request changed the status between our read and
    // update, the update affects 0 rows → we detect the conflict and
    // return 409. This prevents lost-update race conditions.
    // P2034 (serialization) → 409 retryable (NOT 500 generic).
    // P2002 on dealId → idempotent success (re-read order to confirm).
    // P2002 on orderNumber → must error (NOT idempotent).
    let updated: { id: string; status: string };
    try {
      updated = await db.$transaction(
        async (tx) => {
          // Compare-and-set: only update if status hasn't changed.
          const result = await tx.deal.updateMany({
            where: { id, status: deal.status },
            data: updateData,
          });
          if (result.count === 0) {
            // Another request changed the status first → conflict.
            throw new ConcurrentTransitionError();
          }

          // Re-read the updated deal (updateMany doesn't return the record).
          const dealUpdated = await tx.deal.findUnique({
            where: { id },
            select: { id: true, status: true },
          });
          if (!dealUpdated) {
            throw new ConcurrentTransitionError();
          }

          // Only create an order if transitioning to CONFIRMED.
          if (newStatus === "CONFIRMED") {
            // STEP 13.37 P2-A FIX (dellk00k finding): check existing order's
            // STATUS, not just existence. If an order exists but is NOT
            // CONFIRMED (e.g., PENDING), we must NOT skip — the deal is
            // being confirmed but the order is in an inconsistent state.
            // Only skip creation if the order already EXISTS AND is CONFIRMED.
            const existingOrder = await tx.order.findUnique({
              where: { dealId: id },
              select: { id: true, status: true },
            });

            if (!existingOrder) {
              // No order exists → create a new CONFIRMED order.
              const orderNumber =
                "ORD-" + Date.now().toString(36).toUpperCase();
              const listing = deal.listingId
                ? await tx.listing.findUnique({
                    where: { id: deal.listingId },
                    select: { title: true },
                  })
                : null;

              await tx.order.create({
                data: {
                  orderNumber,
                  dealId: deal.id,
                  titleSnapshot: listing?.title || "Deal " + deal.dealNumber,
                  priceSnapshot: deal.agreedAmount || 0n,
                  currencySnapshot: deal.currency,
                  sellerSnapshot: deal.sellerId,
                  buyerSnapshot: deal.buyerId,
                  quantity: 1,
                  status: "CONFIRMED",
                  confirmedAt: new Date(),
                },
              });

              await logAudit({
                actorId: userId,
                actorType: "USER",
                action: "order.created",
                entityType: "Order",
                after: { dealId: deal.id, status: "CONFIRMED" },
                ip: getClientIp(req),
              }).catch(() => {});
            } else if (existingOrder.status === "PENDING") {
              // PENDING -> CONFIRMED is a valid transition. Update the order.
              await tx.order.update({
                where: { dealId: id },
                data: { status: "CONFIRMED", confirmedAt: new Date() },
              });

              await logAudit({
                actorId: userId,
                actorType: "USER",
                action: "order.confirmed",
                entityType: "Order",
                after: { dealId: deal.id, status: "CONFIRMED" },
                ip: getClientIp(req),
              }).catch(() => {});
            } else if (existingOrder.status === "CONFIRMED") {
              // Already CONFIRMED -> idempotent, skip (no duplicate action)
            } else {
              // CANCELLED, PROCESSING, FULFILLED, COMPLETED, or any other
              // status -> NOT a valid transition. The deal cannot be confirmed
              // when its order is in a terminal or advanced state.
              // Throw to abort the transaction -- deal update is rolled back.
              throw new InvalidOrderTransitionError(
                existingOrder.status,
                "CONFIRMED",
              );
            }
          }

          return dealUpdated;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err: unknown) {
      // ConcurrentTransitionError -> 409 (another request changed status first)
      if (err instanceof ConcurrentTransitionError) {
        return NextResponse.json(
          { error: "وضعیت معامله توسط درخواست دیگری تغییر کرد؛ لطفاً دوباره تلاش کنید" },
          { status: 409 },
        );
      }
      // InvalidOrderTransitionError -> 409 (order is in terminal/advanced state)
      // The deal update is rolled back by the transaction.
      if (err instanceof InvalidOrderTransitionError) {
        return NextResponse.json(
          { error: `سفارش در وضعیت ${err.fromStatus} است و نمی‌تواند به ${err.toStatus} تغییر کند` },
          { status: 409 },
        );
      }
      // P2002 on dealId → idempotent success (concurrent CONFIRMED created
      // the order first). Re-read to confirm the order exists AND its
      // status is CONFIRMED (not just existence — dellk00k finding).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.includes("dealId")) {
          const existingOrder = await db.order.findUnique({
            where: { dealId: id },
            select: { id: true, status: true },
          });
          // Idempotent success ONLY if order exists AND is CONFIRMED
          if (existingOrder && existingOrder.status === "CONFIRMED") {
            updated = { id: deal.id, status: newStatus };
          } else {
            throw err;
          }
        } else {
          // P2002 on orderNumber or other field → NOT idempotent → error
          throw err;
        }
      } else if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034"
      ) {
        // P2034 (serialization failure) → 409 retryable (NOT 500 generic)
        return NextResponse.json(
          { error: "معامله هم‌زمان ثبت شد؛ لطفاً دوباره تلاش کنید" },
          { status: 409 },
        );
      } else {
        throw err;
      }
    }

    await logAudit({
      actorId: userId,
      actorType: "USER",
      action: "deal." + newStatus.toLowerCase(),
      entityType: "Deal",
      entityId: id,
      before: { status: deal.status },
      after: { status: newStatus },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      id: updated.id,
      status: updated.status,
    });
  } catch (err: unknown) {
    // STEP 13.31 P2-C FIX: do not leak raw err.message to client.
    console.error("[api/deals/[id] PATCH] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
