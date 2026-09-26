import { NextResponse } from "next/server";
import { getMarketPriceRange } from "@/lib/price-compare-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/pricing/market-range?brandId=&modelId=&year=&condition=
 *
 * Public (no auth). Returns min/median/max asking price + count
 * from PriceObservation, scoped to the given brand+model+year+
 * condition.
 *
 * Query (all optional, but at least brandId OR modelId is
 * strongly recommended — without filters the range covers the
 * whole catalog and is rarely useful):
 *   brandId    — Brand.id
 *   modelId    — ProductModel.id
 *   year       — production year (int)
 *   condition  — NEW | USED | REFURBISHED | FOR_PARTS
 *
 * Returns:
 *   {
 *     min: number | null,
 *     median: number | null,
 *     max: number | null,
 *     count: number,
 *     currency: "IRR"
 *   }
 *
 * When count === 0, all numeric fields are null and the caller
 * should treat the range as unavailable.
 *
 * Spec ref: HEAVIX Master Execution Plan V3.0 Phase 6.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const modelId = url.searchParams.get("modelId");
    const yearRaw = url.searchParams.get("year");
    const condition = url.searchParams.get("condition");

    // Coerce + validate year (must be a positive integer when present).
    let year: number | null = null;
    if (yearRaw != null && yearRaw !== "") {
      const parsed = Number(yearRaw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) {
        return NextResponse.json(
          { error: "year must be a valid integer between 1900 and 2200" },
          { status: 400 },
        );
      }
      year = parsed;
    }

    // Validate condition against the known enum (defensive — the
    // service treats unknown strings as "no filter", but rejecting
    // obvious typos at the API boundary helps callers debug).
    const ALLOWED_CONDITIONS = new Set([
      "NEW",
      "USED",
      "REFURBISHED",
      "FOR_PARTS",
    ]);
    if (condition && !ALLOWED_CONDITIONS.has(condition)) {
      return NextResponse.json(
        {
          error: `condition must be one of NEW | USED | REFURBISHED | FOR_PARTS (got "${condition}")`,
        },
        { status: 400 },
      );
    }

    const result = await getMarketPriceRange({
      brandId: brandId || null,
      modelId: modelId || null,
      year,
      condition: condition || null,
    });

    return NextResponse.json({
      ok: true,
      filters: {
        brandId: brandId || null,
        modelId: modelId || null,
        year,
        condition: condition || null,
      },
      ...result,
      disclaimer:
        "این بازه بر اساس مشاهدات بازار است و جایگزین کارشناسی حضوری نیست.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
