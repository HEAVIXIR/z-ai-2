/**
 * HEAVIX — Admin Auction End API (PHASE-P8-TRANSACTION)
 * POST /api/admin/auctions/[id]/end — end an auction + pick winner
 *
 * Permission: auction.manage (admin guard via requireAdmin from
 * @/lib/admin-guard). The state-machine + winner-selection + audit
 * lives in src/lib/auction-service.ts (endAuction).
 *
 * STEP 16.83 (Issue #112): Replaced the previous getCurrentUser()-only
 * check (which admitted ANY authenticated user, including BUYERs) with
 * requireAdmin("auction.manage") — the canonical RBAC guard. The dead
 * import of requirePermission (never called) was removed. Audit
 * attribution now uses the verified admin user id (never null).
 * Same fix class as STEP 11.35 isAuthenticated()-IDOR pattern.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from "@/lib/admin-guard";
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

/* POST /api/admin/auctions/[id]/end — end auction + set winner
 *
 * Authorization: requireAdmin("auction.manage") returns
 *   [null, 401] if not authenticated,
 *   [null, 403] if authenticated but lacks admin role + permission,
 *   [user, null] if authorized.
 * The verified user.id is passed to endAuction for audit attribution
 * (never null — the previous `user?.id ?? null` could misattribute
 * audit logs to a null userId). */
export async function POST(_req: Request, { params }: Args) {
  const [user, error] = await requireAdmin("auction.manage");
  if (error) return error;
  try {
    const { id } = await params;
    const auction = await endAuction(id, user!.id);
    return NextResponse.json({ success: true, data: auction });
  } catch (err) {
    return toErrorResponse(err);
  }
}
