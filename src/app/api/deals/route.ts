/**
 * HEAVIX — Deals API (Phase 9 — Transactions)
 * ------------------------------------------------------------
 * STEP 13.01 P0-4 FIX: This file was previously @ts-nocheck and
 * accepted buyerId/sellerId from the request body, allowing an
 * attacker to impersonate another user as a deal party.
 *
 * Fix:
 *  - @ts-nocheck removed; full TypeScript types restored.
 *  - buyerId/sellerId/listingId are NEVER read from the body.
 *  - Both buyerId and sellerId are derived from the source entity
 *    (ListingOffer+Listing, DealRoom, or RFQQuote+RFQ) so the
 *    authenticated user cannot attribute a deal to another user.
 *
 * Routes:
 *   GET  /api/deals — list current user's deals (as buyer or seller)
 *   POST /api/deals — create a deal from an accepted offer/quote/dealroom
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// STEP 13.02 P0-4 FIX v3: internal error class for duplicate-deal
// detection inside the Serializable transaction.
class DealAlreadyExistsError extends Error {
  constructor(
    public existingId: string,
    public existingDealNumber: string,
  ) {
    super("Deal already exists for this sourceId");
    this.name = "DealAlreadyExistsError";
  }
}

/* GET /api/deals — list current user's deals (as buyer or seller). */
export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.trim();
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit")) || 20),
    );

    const where: { OR: Array<Record<string, string>>; status?: string } = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };
    if (status) where.status = status;

    const deals = await db.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        listing: { select: { id: true, title: true, slug: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });

    // STEP 13.22: Explicit DTO — no spread of internal model fields.
    // Allowlist: only fields consumers need. Internal fields (cancelReason,
    // notes, updatedAt, order/disputes/review relations) are excluded.
    return NextResponse.json({
      deals: deals.map((d) => ({
        id: d.id,
        dealNumber: d.dealNumber,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        buyerId: d.buyerId,
        sellerId: d.sellerId,
        listingId: d.listingId,
        agreedAmount: d.agreedAmount ? d.agreedAmount.toString() : null,
        currency: d.currency,
        transactionType: d.transactionType,
        status: d.status,
        agreedAt: d.agreedAt,
        confirmedAt: d.confirmedAt,
        completedAt: d.completedAt,
        cancelledAt: d.cancelledAt,
        createdAt: d.createdAt,
        listing: d.listing,
        order: d.order,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* POST /api/deals — create a deal from an accepted offer/quote/dealroom.
 * Body: { sourceType, sourceId }
 *
 * STEP 13.01-R1 P0-4 FIX v2 (Senior Manager Directive):
 *  1. Party-membership check: actor must be buyer or seller of the source
 *  2. agreedAmount NO LONGER accepted from body — always from source
 *  3. transactionType validated against allowed enum
 *  4. Duplicate deal prevention: one deal per sourceId
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { sourceType, sourceId, transactionType } = body as {
      sourceType?: string;
      sourceId?: string;
      transactionType?: string;
    };

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { error: "sourceType and sourceId are required" },
        { status: 400 },
      );
    }

    // STEP 13.01-R1 P0-4 FIX v2: validate sourceType against allowed enum.
    const VALID_SOURCE_TYPES = ["LISTING_OFFER", "DEAL_ROOM", "RFQ_QUOTE"];
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
      return NextResponse.json(
        { error: "Invalid sourceType" },
        { status: 400 },
      );
    }

    // STEP 13.01-R1 P0-4 FIX v2: validate transactionType against
    // allowed enum. Default to SALE if not provided.
    const VALID_TRANSACTION_TYPES = ["SALE", "RENT", "LEASE", "AUCTION"];
    const resolvedTransactionType =
      transactionType && VALID_TRANSACTION_TYPES.includes(transactionType)
        ? transactionType
        : "SALE";

    // STEP 13.02 P0-4 FIX v3: duplicate deal prevention is now INSIDE
    // a Serializable transaction (was TOCTOU in v2). See $transaction
    // below. Source entity resolution stays outside (read-only).
    //
    // Residual risk: the ideal fix is a @@unique([sourceId]) schema
    // constraint, but that requires a migration which is out of scope
    // per owner directive. The Serializable transaction is a
    // defense-in-depth measure; the schema constraint should be added
    // in a separate PR with proper migration + rollback plan.

    // STEP 13.01 P0-4 FIX: derive buyerId, sellerId, listingId, and
    // amount from the SOURCE entity — never from the request body.
    let verifiedAmount: bigint | null = null;
    let verifiedBuyerId: string | null = null;
    let verifiedSellerId: string | null = null;
    let verifiedListingId: string | null = null;

    if (sourceType === "LISTING_OFFER") {
      const offer = await db.listingOffer.findUnique({
        where: { id: sourceId },
        include: { listing: { select: { sellerId: true } } },
      });
      if (!offer)
        return NextResponse.json({ error: "Offer not found" }, { status: 404 });
      if (offer.status !== "ACCEPTED")
        return NextResponse.json(
          { error: "Offer must be ACCEPTED" },
          { status: 409 },
        );
      verifiedAmount = offer.offerAmount;
      verifiedBuyerId = offer.buyerId;
      verifiedSellerId = offer.listing.sellerId;
      verifiedListingId = offer.listingId;
    } else if (sourceType === "DEAL_ROOM") {
      const room = await db.dealRoom.findUnique({
        where: { id: sourceId },
      });
      if (!room)
        return NextResponse.json(
          { error: "Deal room not found" },
          { status: 404 },
        );
      if (room.status !== "AGREED" && room.status !== "NEGOTIATING") {
        return NextResponse.json(
          { error: "Deal room must be AGREED" },
          { status: 409 },
        );
      }
      verifiedAmount = room.agreedPrice;
      verifiedBuyerId = room.buyerId;
      verifiedSellerId = room.sellerId;
      verifiedListingId = room.listingId;
    } else if (sourceType === "RFQ_QUOTE") {
      const quote = await db.rFQQuote.findUnique({
        where: { id: sourceId },
        include: { rfq: { select: { buyerId: true } } },
      });
      if (!quote)
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      if (quote.status !== "ACCEPTED")
        return NextResponse.json(
          { error: "Quote must be ACCEPTED" },
          { status: 409 },
        );
      verifiedAmount = quote.totalPrice;
      verifiedBuyerId = quote.rfq.buyerId;
      verifiedSellerId = quote.sellerId;
    }

    // STEP 13.01-R1 P0-4 FIX v2: party-membership check.
    // The actor (userId) MUST be one of the deal parties (buyer or
    // seller). This prevents a logged-in user from creating a deal
    // for a source entity they are not a party to (e.g., knowing a
    // valid sourceId from another user's activity).
    if (verifiedBuyerId !== userId && verifiedSellerId !== userId) {
      return NextResponse.json(
        { error: "شما مجاز به ایجاد معامله برای این منبع نیستید" },
        { status: 403 },
      );
    }

    // Generate deal number
    const dealNumber =
      "DEAL-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    // STEP 13.02 P0-4 FIX v3: wrap duplicate-check + create in a
    // Serializable transaction to prevent TOCTOU race condition.
    let deal: { id: string; dealNumber: string; status: string };
    try {
      deal = await db.$transaction(
        async (tx) => {
          const existing = await tx.deal.findFirst({
            where: { sourceId },
            select: { id: true, dealNumber: true, status: true },
          });
          if (existing) {
            throw new DealAlreadyExistsError(existing.id, existing.dealNumber);
          }
          // STEP 13.01-R1 P0-4 FIX v2: agreedAmount NO LONGER accepted
          // from body. Always use verifiedAmount from the source entity.
          return await tx.deal.create({
            data: {
              dealNumber,
              sourceType,
              sourceId,
              buyerId: verifiedBuyerId,
              sellerId: verifiedSellerId,
              listingId: verifiedListingId,
              agreedAmount: verifiedAmount,
              currency: "IRR",
              transactionType: resolvedTransactionType,
              status: "PENDING_CONFIRMATION",
              agreedAt: new Date(),
            },
            select: { id: true, dealNumber: true, status: true },
          });
        },
        {
          isolationLevel: "Serializable",
        },
      );
    } catch (err) {
      if (err instanceof DealAlreadyExistsError) {
        return NextResponse.json(
          {
            error: "برای این منبع قبلاً معامله ثبت شده است",
            existingDealId: err.existingId,
            existingDealNumber: err.existingDealNumber,
          },
          { status: 409 },
        );
      }
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("could not serialize") || msg.includes("P2034")) {
        return NextResponse.json(
          { error: "معامله هم‌زمان ثبت شد؛ لطفاً دوباره تلاش کنید" },
          { status: 409 },
        );
      }
      throw err;
    }

    await logAudit({
      actorId: userId,
      actorType: "USER",
      action: "deal.created",
      entityType: "Deal",
      entityId: deal.id,
      after: { dealNumber, sourceType, status: "PENDING_CONFIRMATION" },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      id: deal.id,
      dealNumber,
      status: deal.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
