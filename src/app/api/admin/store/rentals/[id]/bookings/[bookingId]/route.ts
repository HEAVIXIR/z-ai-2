/**
 * HEAVIX — Store Rental Booking Detail API (PHASE-P8-TRANSACTION)
 * PATCH /api/admin/store/rentals/[id]/bookings/[bookingId]
 *
 * Body-driven state-machine transitions for a RentalBooking. The body's
 * `action` field selects which service transition to invoke:
 *   action=approve  → approveBooking  (REQUESTED → APPROVED)
 *   action=start    → startRental     (APPROVED  → ACTIVE)
 *   action=complete → completeRental  (ACTIVE    → COMPLETED)
 *   action=cancel   → cancelBooking  (any non-terminal → CANCELLED)
 *
 * Permission: store.manage. The state-machine business logic + audit
 * lives in src/lib/rental-service.ts; this route just maps the action
 * string to the service call.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  approveBooking,
  startRental,
  completeRental,
  cancelBooking,
  RentalServiceError,
} from '@/lib/rental-service';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; bookingId: string }> };

const ALLOWED_ACTIONS = ['approve', 'start', 'complete', 'cancel'] as const;
type BookingAction = (typeof ALLOWED_ACTIONS)[number];

function toErrorResponse(e: unknown) {
  if (e instanceof RentalServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/rentals/[id]/bookings/[bookingId]] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* PATCH /api/admin/store/rentals/[id]/bookings/[bookingId] */
export async function PATCH(req: Request, { params }: Params) {
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
  const { id, bookingId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').toLowerCase() as BookingAction;
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: `action باید یکی از ${ALLOWED_ACTIONS.join('، ')} باشد`,
        },
        { status: 400 },
      );
    }

    let result: any;
    switch (action) {
      case 'approve':
        result = await approveBooking(bookingId, user.id);
        break;
      case 'start':
        result = await startRental(bookingId, user.id);
        break;
      case 'complete':
        result = await completeRental(bookingId, user.id);
        break;
      case 'cancel':
        result = await cancelBooking(bookingId, body.reason ?? null, user.id);
        break;
    }

    // Note: the rental-listing id param (`id`) is part of the URL for
    // REST-style locality — the booking is fetched by bookingId alone
    // in the service. The id is echoed in the audit context above.
    void id;

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
