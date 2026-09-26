/**
 * HEAVIX — RFQ Quotes API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Routes for managing quotes (RFQQuote) on an RFQ. Delegates
 * business logic to src/lib/rfq-service.ts.
 *
 * Routes:
 *   GET  /api/rfq/[id]/quotes   — list quotes for an RFQ
 *   POST /api/rfq/[id]/quotes   — submit a quote (auth, seller)
 *
 * Body (POST):
 *   { price, deliveryTime?, validity?, notes? }
 *
 * The POST handler authenticates via getCurrentUser(). The
 * service resolves the seller's identity from the User record
 * (firstName/lastName/mobile) and writes audit
 * `marketplace.rfq.quote.submit`.
 *
 * Quote accept/reject are NOT exposed here — they're lifecycle
 * actions owned by the buyer (rfq.buyerId). They live under
 * /api/rfq/[id]/quotes/[quoteId] (PATCH action=accept|reject)
 * for fine-grained RBAC; this file deliberately stays narrow.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getRFQ,
  submitQuote,
  RFQServiceError,
} from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/rfq/[id]/quotes — list quotes for an RFQ.
 * The RFQ details are also returned so the client can render
 * the quote form without a second round-trip. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rfq = await getRFQ(id);
    return NextResponse.json({
      success: true,
      data: rfq.quotes,
      rfq: {
        id: rfq.id,
        title: rfq.title,
        status: rfq.status,
        deadline: rfq.deadline,
        quantity: rfq.quantity,
        budgetMin: rfq.budgetMin,
        budgetMax: rfq.budgetMax,
        brandPref: rfq.brandPref,
        machineType: rfq.machineType,
      },
    });
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

/* POST /api/rfq/[id]/quotes — submit a quote (authenticated
 * seller). Body: { price, deliveryTime?, validity?, notes? }. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای ثبت پیشنهاد ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { price, deliveryTime, validity, notes } = body;

    const quote = await submitQuote(id, user.id, {
      price,
      deliveryTime,
      validity,
      notes,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      id: quote.id,
      status: quote.status,
    });
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
