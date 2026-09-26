import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserId } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { trackEvent } from "@/lib/analytics";
import { getClientIp } from "@/lib/request-context";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { MESSAGING } from "@/lib/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(o: any) {
  return {
    ...o,
    offerAmount: o.offerAmount ? o.offerAmount.toString() : null,
    counterAmount: o.counterAmount ? o.counterAmount.toString() : null,
  };
}

/* GET /api/offers — buyer/seller offers for current user. */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [asBuyer, asSeller] = await Promise.all([
      db.listingOffer.findMany({
        where: { buyerId: userId },
        include: { listing: { select: { id: true, title: true, slug: true, sellerId: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.listingOffer.findMany({
        where: { listing: { sellerId: userId } },
        include: { listing: { select: { id: true, title: true, slug: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      asBuyer: asBuyer.map(serialize),
      asSeller: asSeller.map(serialize),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/offers — submit offer, creates notification + lead. */
export async function POST(req: Request) {
  try {
    // ── Rate limit (MESSAGING preset, 30/h per identity) ──
    // The MESSAGING preset (per src/lib/rate-limit-presets.ts) covers
    // "offers / messages / contact-seller". Anonymous buyers fall
    // back to IP, authenticated users are throttled by userId.
    const user = await getCurrentUser();
    const identity = user?.id ?? getClientIp(req);
    const rl = enforceRateLimit(identity, MESSAGING);
    if (!rl.ok) return rl.response;

    const body = await req.json().catch(() => ({}));
    const listingId = String(body.listingId ?? "");
    const offerAmount = parseBig(body.offerAmount);
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    if (!offerAmount) {
      return NextResponse.json({ error: "مبلغ پیشنهاد الزامی است" }, { status: 400 });
    }
    if (!body.buyerPhone) {
      return NextResponse.json({ error: "شماره تماس الزامی است" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({ where: { id: listingId } });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // `user` was resolved above for the rate-limit identity bucket.

    const offer = await db.listingOffer.create({
      data: {
        listingId,
        offerAmount,
        message: body.message ?? null,
        status: "PENDING",
        buyerName: body.buyerName ?? null,
        buyerPhone: String(body.buyerPhone),
        buyerEmail: body.buyerEmail ?? null,
        buyerId: user?.id ?? null,
      },
    });

    // Create lead
    await db.lead.create({
      data: {
        listingId,
        leadType: "OFFER",
        viewerPhone: String(body.buyerPhone),
        viewerName: body.buyerName ?? null,
        note: `پیشنهاد قیمت: ${offerAmount.toString()}`,
      },
    });

    // Notify seller if registered
    if (listing.sellerId) {
      await db.notification.create({
        data: {
          userId: listing.sellerId,
          type: "NEW_OFFER",
          title: "پیشنهاد قیمت جدید",
          body: `برای آگهی «${listing.title}» پیشنهاد ${offerAmount.toString()} تومان ثبت شد.`,
          link: `/listings/${listing.slug}`,
          data: JSON.stringify({ offerId: offer.id, amount: offerAmount.toString() }),
        },
      });
    }

    // P1-2 — track OFFER_MAKE (fire-and-forget).
    trackEvent({
      eventType: "OFFER_MAKE",
      listingId,
      userId: user?.id ?? null,
      categoryId: listing.categoryId ?? null,
      brandId: listing.brandId ?? null,
      page: "/api/offers",
    });

    return NextResponse.json({ ok: true, id: offer.id, status: offer.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
