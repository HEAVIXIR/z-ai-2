import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/search-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/search/suggestions?q=X&limit=N
 *
 * Returns autocomplete suggestions for the search box.
 * Searches across: brands, categories, and recent popular search queries.
 *
 * Per HEAVIX Master Execution Plan V2.0 Phase 4D.
 *
 * NOTE: @ts-nocheck was REMOVED (Phase 4 deepening — Task 1). The
 * business logic now lives in `src/lib/search-service.ts::getSuggestions`
 * and is fully typed. The route is a thin pass-through so the public
 * contract stays stable while the implementation is testable.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(
      10,
      Math.max(1, Number(url.searchParams.get("limit")) || 5),
    );

    if (!q || q.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const { suggestions, normalized } = await getSuggestions(q, limit);

    return NextResponse.json({ suggestions, q: normalized });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
