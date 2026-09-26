import { NextResponse } from "next/server";
import { compareListings, MAX_COMPARE_LISTINGS } from "@/lib/price-compare-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/pricing/compare?ids=id1,id2,id3
 *
 * Public (no auth). Side-by-side comparison of up to 4 listings
 * with price estimates + verdict + attributes + trust status.
 *
 * Query:
 *   ids  — comma-separated listing ids (min 2, max 4)
 *
 * Returns:
 *   {
 *     listings: ComparisonListingRow[],          // up to 4
 *     attributeRows: ComparisonAttributeRow[]    // pivot table
 *   }
 *
 * The verdict per listing is one of:
 *   IN_RANGE     — asking falls inside [lower, upper]
 *   BELOW_RANGE  — asking below lower
 *   ABOVE_RANGE  — asking above upper
 *   INSUFFICIENT — no usable estimate
 *
 * Spec ref: HEAVIX Master Execution Plan V3.0 Phase 6.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idsRaw = url.searchParams.get("ids") ?? "";
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ids.length < 2) {
      return NextResponse.json(
        {
          error: `At least 2 listing ids are required for comparison (got ${ids.length})`,
        },
        { status: 400 },
      );
    }
    if (ids.length > MAX_COMPARE_LISTINGS) {
      return NextResponse.json(
        {
          error: `At most ${MAX_COMPARE_LISTINGS} listing ids are supported (got ${ids.length})`,
        },
        { status: 400 },
      );
    }

    const result = await compareListings(ids);
    return NextResponse.json({
      ok: true,
      count: result.listings.length,
      ...result,
      disclaimer:
        "این مقایسه داده‌محور است و جایگزین کارشناسی حضوری نیست.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
