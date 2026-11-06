import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPublicApiRateLimit } from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/sellers/[id]/reputation — comprehensive reputation profile.
 *
 * Returns:
 * - Review stats (count, avgRating, rating distribution)
 * - Transaction stats (deals, completed, cancelled, disputed)
 * - Response metrics (offers, quotes)
 * - Verification signals (phone, email, company)
 * - Listing stats (total, published, verified)
 *
 * Per HEAVIX Master Execution Plan V3.0 Phase 10.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimit = checkPublicApiRateLimit(req, "seller-reputation");
  const noStoreHeaders = { "Cache-Control": "private, no-store" };
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...noStoreHeaders, "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  try {
    const { id } = await params;

    const user = await db.user.findFirst({
      where: {
        id,
        role: "SELLER",
        status: "ACTIVE",
        OR: [
          { foundingStatus: null },
          { foundingStatus: { is: { active: true } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        mobileVerified: true,
        status: true,
        avgRating: true,
        reviewCount: true,
        company: { select: { id: true, name: true, verified: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404, headers: noStoreHeaders });
    }

    // Review stats
    const reviews = await db.review.findMany({
      where: { sellerId: id, status: "PUBLISHED" },
      select: { rating: true, verifiedDeal: true, createdAt: true },
    });

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let verifiedDealCount = 0;
    for (const r of reviews) {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      if (r.verifiedDeal) verifiedDealCount++;
    }

    // Deal stats
    const dealsAsSeller = await db.deal.count({ where: { sellerId: id } }).catch(() => 0);
    const completedDeals = await db.deal.count({ where: { sellerId: id, status: "COMPLETED" } }).catch(() => 0);
    const cancelledDeals = await db.deal.count({ where: { sellerId: id, status: "CANCELLED" } }).catch(() => 0);
    const disputedDeals = await db.deal.count({ where: { sellerId: id, status: "DISPUTED" } }).catch(() => 0);

    // Public reputation metrics expose only published inventory.
    const publishedListings = await db.listing.count({
      where: { sellerId: id, status: "PUBLISHED" },
    });
    const totalListings = publishedListings;
    const verifiedListings = await db.listing.count({
      where: { sellerId: id, status: "PUBLISHED", verified: true },
    });

    // Offer stats are also scoped to published listings.
    const offersReceived = await db.listingOffer.count({
      where: { listing: { sellerId: id, status: "PUBLISHED" } },
    }).catch(() => 0);

    // Build reputation signals
    const signals: any[] = [
      { type: "PHONE", label: "تأیید تلفن", status: user.mobileVerified ? "VERIFIED" : "UNVERIFIED" },
      { type: "EMAIL", label: "تأیید ایمیل", status: user.emailVerified ? "VERIFIED" : "UNVERIFIED" },
    ];

    if (user.company) {
      signals.push({
        type: "COMPANY",
        label: "شرکت",
        status: user.company.verified ? "VERIFIED" : "UNVERIFIED",
        detail: user.company.name,
      });
    }

    if (publishedListings > 0) {
      signals.push({
        type: "LISTINGS",
        label: "آگهی‌های فعال",
        status: "INFO",
        detail: publishedListings + " آگهی",
      });
    }

    if (verifiedListings > 0) {
      signals.push({
        type: "VERIFIED_LISTINGS",
        label: "آگهی‌های تأییدشده",
        status: "VERIFIED",
        detail: verifiedListings + " آگهی",
      });
    }

    if (completedDeals > 0) {
      signals.push({
        type: "COMPLETED_DEALS",
        label: "معاملات موفق",
        status: "VERIFIED",
        detail: completedDeals + " معامله",
      });
    }

    return NextResponse.json({
      seller: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        status: user.status,
      },
      reputation: {
        avgRating: user.avgRating,
        reviewCount: user.reviewCount,
        ratingDistribution,
        verifiedDealReviews: verifiedDealCount,
      },
      transactions: {
        totalDeals: dealsAsSeller,
        completedDeals,
        cancelledDeals,
        disputedDeals,
        disputeRate: dealsAsSeller > 0 ? (disputedDeals / dealsAsSeller) : 0,
        cancellationRate: dealsAsSeller > 0 ? (cancelledDeals / dealsAsSeller) : 0,
      },
      listings: {
        total: totalListings,
        published: publishedListings,
        verified: verifiedListings,
      },
      engagement: {
        offersReceived,
      },
      signals,
    }, { headers: noStoreHeaders });
  } catch (err: any) {
    console.error("[reputation] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: noStoreHeaders });
  }
}
