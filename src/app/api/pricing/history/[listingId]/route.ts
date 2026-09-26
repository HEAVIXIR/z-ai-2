import { NextResponse } from "next/server";
import { getPriceHistoryForListing } from "@/lib/price-compare-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/pricing/history/[listingId]
 *
 * Public (no auth). Returns price observation rows + persisted
 * estimate rows for a single listing, ordered newest-first.
 *
 * Path:
 *   listingId  — the Listing.id to fetch history for
 *
 * Returns:
 *   {
 *     listingId: string,
 *     observations: PriceObservation[],  // newest-first
 *     estimates:     PriceEstimate[]      // newest-first
 *   }
 *
 * The two arrays are returned SEPARATELY (not merged) so the
 * caller can render them in distinct UI sections — observations
 * are market-sourced data points, estimates are computed by
 * the HEAVIX price-engine and carry confidence + comparableCount.
 *
 * Spec ref: HEAVIX Master Execution Plan V3.0 Phase 6.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const { listingId } = await params;
    if (!listingId) {
      return NextResponse.json(
        { error: "listingId path parameter is required" },
        { status: 400 },
      );
    }

    const result = await getPriceHistoryForListing(listingId);
    return NextResponse.json({
      ok: true,
      ...result,
      disclaimer:
        "این داده بر اساس مشاهدات بازار است و جایگزین کارشناسی حضوری نیست.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
