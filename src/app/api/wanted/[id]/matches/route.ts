/**
 * HEAVIX — Wanted Matches API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * GET /api/wanted/[id]/matches
 *
 * Returns the matching-engine candidates for a wanted request.
 * Delegates to wanted-service.getWantedMatches (which wraps
 * matching-service.matchBuyRequest + audit + 404/error mapping).
 *
 * The matching engine scores BuyRequest ↔ Listing compatibility
 * using category, brand, price range, location, and transaction
 * type. Each candidate carries:
 *   - listingId, title, slug, price, city, province
 *   - brandName, categoryName, primaryImage
 *   - score (0..1), reason (human-readable)
 *
 * Public route — no auth required (matches are computed from
 * PUBLISHED listings, which are already public). The service
 * writes an audit `marketplace.matching.run` (entityType:
 * BuyRequest) so the human trigger is recorded.
 */
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getWantedMatches, WantedServiceError } from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Best-effort: include the user id in the audit trail when
    // the caller is authenticated. Anonymous calls still get
    // matches (the data is public) but the audit actorId is null.
    const userId = await getCurrentUserId().catch(() => null);
    const result = await getWantedMatches(id, userId);
    return NextResponse.json({
      success: true,
      data: {
        request: result.request,
        candidates: result.candidates,
        count: result.candidates.length,
      },
    });
  } catch (err: any) {
    if (err instanceof WantedServiceError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
