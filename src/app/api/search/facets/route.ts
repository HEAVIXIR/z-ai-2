import { NextResponse } from "next/server";
import { getFacets, type FacetFilters } from "@/lib/search-service";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/search/facets
 *
 * Returns the available facet values for filtering, with counts of
 * matching PUBLISHED listings per bucket.
 *
 * Public (no auth required). Computed against PUBLISHED listings only.
 *
 * Query (all optional, for scoped facets — e.g. "given the user picked
 * category X, what brand buckets are still available?"):
 *   ?category=<slug>          scope to a category
 *   ?brand=<slug>             scope to a brand
 *   ?transactionType=<key>    scope to SALE | RENT | WANTED | ...
 *   ?province=<id|text>       scope to a province
 *   ?city=<id|text>           scope to a city
 *   ?condition=NEW|USED|REFURBISHED
 *
 * Returns:
 *   {
 *     categories:        [{ id, name, slug, count }],
 *     brands:            [{ id, name, slug, count }],
 *     transactionTypes:  [{ id, value, name, label, count }],
 *     provinces:         [{ name, count }],
 *     conditions:        [{ value, label, count }],
 *     priceRange:        { min, max }
 *   }
 *
 * Per HEAVIX Master Execution Plan V2.0 Phase 4D. The legacy
 * `/api/search/filters` route stays around for backward compat;
 * new code should use this `/api/search/facets` route — its
 * business logic lives in `src/lib/search-service.ts::getFacets`,
 * is fully typed, and is the canonical entry point.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const category = url.searchParams.get("category")?.trim() || null;
    const brand = url.searchParams.get("brand")?.trim() || null;
    const transactionType = url.searchParams.get("transactionType")?.trim() || null;
    const province = url.searchParams.get("province")?.trim() || null;
    const city = url.searchParams.get("city")?.trim() || null;
    const conditionRaw = (url.searchParams.get("condition") ?? "").trim().toUpperCase();
    const condition: "NEW" | "USED" | "REFURBISHED" | null =
      conditionRaw === "NEW" || conditionRaw === "USED" || conditionRaw === "REFURBISHED"
        ? conditionRaw
        : null;
    const priceMin = url.searchParams.get("priceMin")?.trim() || null;
    const priceMax = url.searchParams.get("priceMax")?.trim() || null;

    const filters: FacetFilters = {
      category,
      brand,
      transactionType,
      province,
      city,
      condition,
      priceMin,
      priceMax,
    };

    const facets = await getFacets(filters);

    return NextResponse.json({ ok: true, ...facets });
  } catch (err: any) {
    trackError(err, { endpoint: "GET /api/search/facets" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
