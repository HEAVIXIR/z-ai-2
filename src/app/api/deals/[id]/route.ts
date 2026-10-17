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
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    // STEP 13.31 P2-A FIX: wrap deal.update + order.create in a single
    // Serializable transaction so that:
    //  1. If order.create fails, the deal update is rolled back (atomicity).
    //  2. Concurrent CONFIRMED transitions cannot create duplicate orders:
    //     we re-check for an existing order INSIDE the txn (the pre-update
    //     `deal.order` fetch outside is stale by the time we create).
    // The order.create uses dealId as a unique key (@unique on Order.dealId
    // in the schema), so a concurrent insert would also be rejected by the
    // unique constraint — the Serializable isolation + re-check is
    // defense-in-depth.
    const updated = await db
      .$transaction(
        async (tx) => {
          const dealUpdated = await tx.deal.update({
            where: { id },
            data: updateData,
          });

          // Only create an order if transitioning to CONFIRMED.
          if (newStatus === "CONFIRMED") {
            // Re-check for an existing order inside the txn (idempotency).
            const existingOrder = await tx.order.findUnique({
              where: { dealId: id },
              select: { id: true },
            });

            if (!existingOrder) {
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
            }
          }

          return dealUpdated;
        },
        { isolationLevel: "Serializable" },
      )
      .catch((err: unknown) => {
        // P2002 = unique constraint violation on Order.dealId (concurrent
        // CONFIRMED created the order first). Treat as success — the deal
        // was already confirmed + order already exists.
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("P2002") || msg.includes("Unique constraint")) {
          // Return a minimal deal object; the caller only needs id + status.
          return { id: deal.id, status: newStatus };
        }
        throw err;
      });

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
