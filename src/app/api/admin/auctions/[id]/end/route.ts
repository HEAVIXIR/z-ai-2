/**
 * HEAVIX — Admin Auction End API (PHASE-P8-TRANSACTION)
 * POST /api/admin/auctions/[id]/end — end an auction + pick winner
 *
 * Permission: marketplace (admin guard via isAuthenticated for legacy
 * parity with the existing /api/admin/auctions/* routes; the deep
 * RBAC layer is auction.manage). The state-machine + winner-selection
 * + audit lives in src/lib/auction-service.ts (endAuction).
 */

import { NextResponse } from 'next/server';
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { endAuction, AuctionServiceError } from "@/lib/auction-service";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Args {
  params: Promise<{ id: string }>;
}

function toErrorResponse(e: unknown) {
  if (e instanceof AuctionServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[admin/auctions/[id]/end] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Server error' },
    { status: 500 },
  );
}

/* POST /api/admin/auctions/[id]/end — end auction + set winner */
export async function POST(_req: Request, { params }: Args) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  try {
    const { id } = await params;
    const auction = await endAuction(id, userId);
    return NextResponse.json({ success: true, data: auction });
  } catch (err) {
    return toErrorResponse(err);
  }
}
