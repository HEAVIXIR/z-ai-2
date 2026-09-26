/**
 * HEAVIX — RFQ Detail API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Single-record route for the RFQ domain. Delegates business
 * logic to src/lib/rfq-service.ts.
 *
 * Routes:
 *   GET /api/rfq/[id]   — fetch a single RFQ + its quotes
 *                          (newest first).
 *
 * Public route — RFQs and their quotes are visible to all
 * marketplace participants (sellers need to see existing
 * quotes to make competitive decisions).
 */
import { NextResponse } from "next/server";
import { getRFQ, RFQServiceError } from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rfq = await getRFQ(id);
    return NextResponse.json({ success: true, data: rfq });
  } catch (err: any) {
    if (err instanceof RFQServiceError) {
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
