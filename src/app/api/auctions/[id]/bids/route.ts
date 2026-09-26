import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { placeBid, AuctionServiceError } from "@/lib/auction-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/auctions/[id]/bids  (AUTH REQUIRED)
   POST — place a bid on an auction.
   - requires user session
   - amount must be a positive integer (Toman)
   - amount must be > current highest bid (or startPrice if none) + minIncrement
   - auction must be LIVE (not SCHEDULED, ENDED, or CANCELLED)

   PHASE-P8-TRANSACTION — business logic extracted to
   src/lib/auction-service.ts (placeBid); this route is now thin
   (parse, auth, call service, map errors to HTTP responses).
   ============================================================ */

interface Args {
  params: Promise<{ id: string }>;
}

function toErrorResponse(e: unknown) {
  if (e instanceof AuctionServiceError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const err = e as Error;
  return NextResponse.json(
    { error: err?.message ?? "Server error" },
    { status: 500 },
  );
}

export async function POST(req: Request, { params }: Args) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "برای شرکت در مزایده باید وارد شوید" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const amount = body.amount;

    const bid = await placeBid(id, user.id, amount);

    return NextResponse.json({
      ok: true,
      bid,
      currentBid: bid.amount,
      minimumNextBid: bid.minimumNextBid,
    });
  } catch (err: any) {
    return toErrorResponse(err);
  }
}
