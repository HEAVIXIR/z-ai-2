/**
 * HEAVIX — Store Rentals API (PHASE-P8-TRANSACTION)
 * GET  /api/admin/store/rentals          — list rental listings
 * POST /api/admin/store/rentals          — create rental listing
 *
 * Permission: store.read (GET) / store.manage (POST). The POST business
 * logic is delegated to src/lib/rental-service.ts; the route stays thin
 * (parse, RBAC, call service, map thrown RentalServiceError → HTTP).
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { createRentalListing, RentalServiceError } from "@/lib/rental-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeListing(row: any) {
  return {
    ...row,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    bookingCount: row._count?.bookings ?? 0,
    _count: undefined,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof RentalServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/rentals] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* GET /api/admin/store/rentals — list rentals with filters */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.read' },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const available = url.searchParams.get('available'); // 'true' | 'false'
    const partId = url.searchParams.get('partId') || undefined;
    const listingId = url.searchParams.get('listingId') || undefined;
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

    const where: any = {};
    if (available === 'true') where.available = true;
    if (available === 'false') where.available = false;
    if (partId) where.partId = partId;
    if (listingId) where.listingId = listingId;

    const [items, total] = await Promise.all([
      storeDb.rentalListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          _count: { select: { bookings: true } },
        },
      }),
      storeDb.rentalListing.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serializeListing),
      total,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* POST /api/admin/store/rentals — create rental listing */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const listing = await createRentalListing({
      partId: body.partId ?? null,
      listingId: body.listingId ?? null,
      dailyRate: body.dailyRate,
      weeklyRate: body.weeklyRate ?? null,
      monthlyRate: body.monthlyRate ?? null,
      deposit: body.deposit ?? null,
      available: body.available ?? true,
      minDuration: body.minDuration ?? 1,
      maxDuration: body.maxDuration ?? null,
      userId: user.id,
    });
    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
