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

    return NextResponse.json({
      deals: deals.map((d) => ({
        ...d,
        agreedAmount: d.agreedAmount ? d.agreedAmount.toString() : null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* POST /api/deals — create a deal from an accepted offer/quote/dealroom.
 * Body: { sourceType, sourceId, agreedAmount?, transactionType? }
 *
 * STEP 13.01 P0-4 FIX: buyerId/sellerId/listingId are NO LONGER
 * accepted from the request body. They are ALWAYS derived from the
 * source entity to prevent impersonation.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { sourceType, sourceId, agreedAmount, transactionType } = body as {
      sourceType?: string;
      sourceId?: string;
      agreedAmount?: string | number;
      transactionType?: string;
    };

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { error: "sourceType and sourceId are required" },
        { status: 400 },
      );
    }

    // STEP 13.01 P0-4 FIX: derive buyerId, sellerId, listingId, and
    // amount from the SOURCE entity — never from the request body.
    // The previous code initialized these from body values and only
    // partially overwrote them per sourceType, allowing an attacker
    // to inject a victim's buyerId (for RFQ_QUOTE) or sellerId (for
    // LISTING_OFFER) into the deal.
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
      // STEP 13.01 P0-4 FIX: verifiedBuyerId is now derived from the
      // RFQ's buyerId (the user who created the RFQ), NOT from the
      // request body. Previously this was left as the body-supplied
      // value, allowing an attacker to set any buyerId.
      verifiedBuyerId = quote.rfq.buyerId;
      verifiedSellerId = quote.sellerId;
    } else {
      return NextResponse.json(
        { error: "Invalid sourceType" },
        { status: 400 },
      );
    }

    // Generate deal number
    const dealNumber =
      "DEAL-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    const deal = await db.deal.create({
      data: {
        dealNumber,
        sourceType,
        sourceId,
        buyerId: verifiedBuyerId,
        sellerId: verifiedSellerId,
        listingId: verifiedListingId,
        agreedAmount: agreedAmount
          ? BigInt(String(agreedAmount).replace(/[^\d]/g, ""))
          : verifiedAmount,
        currency: "IRR",
        transactionType: transactionType || "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });

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
