import { NextResponse } from "next/server";
import { compareListings } from "@/lib/search-service";
import { trackEvent } from "@/lib/analytics";
import { getClientIp } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/search/compare?ids=id1,id2,id3,id4
 *
 * Side-by-side comparison data for up to 4 PUBLISHED listings.
 *
 * Public (no auth required). Returns:
 *   {
 *     listings: [{ id, slug, title, price, brand, category, attributes[], ... }],
 *     attributeRows: [
 *       { attributeId, key, label, unit, values: [v1, v2, v3, v4] }
 *     ]
 *   }
 *
 * The `attributeRows` array is the union of all attribute keys across
 * the selected listings, with each listing's value aligned in the same
 * order as the `listings` array — so the client can render a single
 * comparison table without doing its own pivot.
 *
 * Per HEAVIX Master Execution Plan V2.0 Phase 4D.
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
        { error: "At least 2 listing ids are required for comparison" },
        { status: 400 },
      );
    }

    const result = await compareListings(ids);

    // Fire-and-forget analytics: track the compare event so the admin
    // dashboard can show "X comparisons today".
    try {
      trackEvent({
        eventType: "COMPARE",
        page: "/api/search/compare",
        ip: getClientIp(req),
      });
    } catch {
      /* analytics must never break the response */
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    trackError(err, { endpoint: "GET /api/search/compare" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
