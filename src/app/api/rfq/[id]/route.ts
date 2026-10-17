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
 * STEP 13.01 P0-2 FIX: This route now requires authentication.
 * PII (buyer phone/email/id, seller phone/email/id) is only
 * returned when the viewer is the buyer themselves. Anonymous
 * and non-buyer viewers receive redacted data (names kept for
 * trust, contact info + internal ids removed).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRFQ, RFQServiceError } from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // STEP 13.01 P0-2 FIX: require authentication. Previously this
    // route was public, leaking buyer PII (name/phone/email) and
    // every seller's PII in quotes to any anonymous visitor.
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای مشاهده استعلام قیمت وارد شوید" },
        { status: 401 },
      );
    }

    const { id } = await params;
    // Pass the viewer's id so getRFQ can redact PII appropriately.
    const rfq = await getRFQ(id, user.id);
    return NextResponse.json({ success: true, data: rfq });
  } catch (err: any) {
    if (err instanceof RFQServiceError) {
      // Typed service error — message is controlled/validated, safe to return.
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    // STEP 13.31 P2-C FIX: unknown error — do not leak err.message.
    console.error("[api/rfq/[id] GET] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
