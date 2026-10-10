import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/seller/dashboard — real KPIs scoped to the seller.

   STEP 11.38 PR-SC-05: Dashboard KPI API.
   All KPIs are computed from real database data, scoped by
   listing.sellerId === user.id. No sample/fake numbers.

   KPIs:
   - activeListings: count of PUBLISHED listings
   - totalListings: count of all listings
   - newLeads: count of leads with status=NEW (last 7 days)
   - totalLeads: count of all leads
   - totalViews: sum of viewCount across seller's listings
   - totalFavorites: sum of favoriteCount
   - conversionRate: (leads with status CLOSED or leadType OFFER) / totalViews
   - lowScoreListings: count of listings with inventoryScore < 50 (if available)

   Authorization:
   - getCurrentUser() → 401 if anonymous
   - can(user.id, "store.crm.read") → 403 if lacking (sellers have this)
   - All queries scoped by sellerId === user.id

   No cross-seller data leakage: every query includes sellerId filter.
   ============================================================ */

export async function GET(_req: NextRequest) {
  // 1. Authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Authorization — seller must have store.crm.read
  const hasCRMRead = await can(user.id, "store.crm.read");
  if (!hasCRMRead) {
    return NextResponse.json(
      { error: "Forbidden: requires 'store.crm.read'" },
      { status: 403 },
    );
  }

  // 3. Seller scope — all queries use this filter
  const sellerScope = { sellerId: user.id };

  try {
    // 4. Compute KPIs from real data
    const [
      activeListings,
      totalListings,
      totalViewsResult,
      totalFavoritesResult,
      newLeads,
      totalLeads,
      closedLeads,
      offerLeads,
    ] = await Promise.all([
      // Active listings (PUBLISHED)
      db.listing.count({ where: { ...sellerScope, status: "PUBLISHED" } }),

      // Total listings
      db.listing.count({ where: sellerScope }),

      // Total views (sum of viewCount)
      db.listing.aggregate({
        where: sellerScope,
        _sum: { viewCount: true },
      }),

      // Total favorites (sum of favoriteCount)
      db.listing.aggregate({
        where: sellerScope,
        _sum: { favoriteCount: true },
      }),

      // New leads (status=NEW, last 7 days)
      db.lead.count({
        where: {
          listing: sellerScope,
          status: "NEW",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),

      // Total leads
      db.lead.count({
        where: { listing: sellerScope },
      }),

      // Closed leads (status=CLOSED or LOST)
      db.lead.count({
        where: {
          listing: sellerScope,
          status: { in: ["CLOSED", "LOST"] },
        },
      }),

      // Offer-type leads (strongest intent)
      db.lead.count({
        where: {
          listing: sellerScope,
          leadType: "OFFER",
        },
      }),
    ]);

    const totalViews = totalViewsResult._sum.viewCount ?? 0;
    const totalFavorites = totalFavoritesResult._sum.favoriteCount ?? 0;

    // Conversion rate: leads / views (guard divide-by-zero)
    const conversionRate = totalViews > 0
      ? Number(((totalLeads / totalViews) * 100).toFixed(1))
      : 0;

    // 5. Return real KPIs — no sample data
    return NextResponse.json({
      success: true,
      data: {
        activeListings,
        totalListings,
        newLeads,
        totalLeads,
        closedLeads,
        offerLeads,
        totalViews,
        totalFavorites,
        conversionRate,
        // Explicitly mark as real data
        source: "database",
        sellerId: user.id,
      },
    });
  } catch (err: any) {
    console.error("[seller/dashboard] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 },
    );
  }
}
