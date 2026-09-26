/**
 * HEAVIX — Store Rental Bookings API (PHASE-P8-TRANSACTION)
 * GET  /api/admin/store/rentals/[id]/bookings — list bookings for a rental
 * POST /api/admin/store/rentals/[id]/bookings — request a new booking
 *
 * Permission: store.read (GET) / store.manage (POST — admin can pre-create
 * a request on behalf of a customer). The POST business logic is delegated
 * to src/lib/rental-service.ts (requestBooking); the route stays thin.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { requestBooking, RentalServiceError } from "@/lib/rental-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toErrorResponse(e: unknown) {
  if (e instanceof RentalServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/rentals/[id]/bookings] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

function serializeBooking(b: any) {
  return {
    ...b,
    startDate: b.startDate?.toISOString?.() ?? null,
    endDate: b.endDate?.toISOString?.() ?? null,
    createdAt: b.createdAt?.toISOString?.() ?? null,
    updatedAt: b.updatedAt?.toISOString?.() ?? null,
  };
}

/* GET /api/admin/store/rentals/[id]/bookings — list bookings */
export async function GET(req: Request, { params }: Params) {
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
  const { id } = await params;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

    const where: any = { rentalListingId: id };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      storeDb.rentalBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      storeDb.rentalBooking.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serializeBooking),
      total,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* POST /api/admin/store/rentals/[id]/bookings — request a new booking */
export async function POST(req: Request, { params }: Params) {
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
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.customerId) {
      return NextResponse.json(
        { success: false, error: 'customerId الزامی است' },
        { status: 400 },
      );
    }
    let startDate: Date;
    let endDate: Date;
    try {
      startDate = new Date(body.startDate);
      endDate = new Date(body.endDate);
    } catch {
      return NextResponse.json(
        { success: false, error: 'تاریخ شروع/پایان نامعتبر است' },
        { status: 400 },
      );
    }
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'تاریخ شروع/پایان نامعتبر است' },
        { status: 400 },
      );
    }

    const booking = await requestBooking({
      rentalListingId: id,
      customerId: body.customerId,
      startDate,
      endDate,
      notes: body.notes ?? null,
      userId: user.id,
    });

    return NextResponse.json(
      { success: true, data: booking },
      { status: 201 },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
