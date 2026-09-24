// STEP 6B.5: @ts-nocheck REMOVED — now type-safe.
// STEP 6B.5: Import redirected from price-engine.ts to price-history-engine.ts (canonical).
import { NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/price-history-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/price-history?brandId=X&categoryId=X&modelId=X&months=N
 *
 * Returns historical price data points for charting.
 * Canonical source: price-history-engine.ts (reads PriceObservation + PUBLISHED Listings).
 * Response shape: { month, medianPrice, count, range }[] (gap-filled).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId")?.trim() || null;
    const categoryId = url.searchParams.get("categoryId")?.trim() || null;
    const modelId = url.searchParams.get("modelId")?.trim() || null;
    const monthsRaw = url.searchParams.get("months");
    const months = monthsRaw ? Number(monthsRaw) : 12;

    if (!brandId && !categoryId && !modelId) {
      return NextResponse.json(
        { error: "At least one of brandId/categoryId/modelId is required" },
        { status: 400 },
      );
    }

    const history = await getPriceHistory({
      brandId,
      categoryId,
      modelId,
      months,
    });

    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
