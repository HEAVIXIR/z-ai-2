/**
 * HEAVIX — Store Shipment Assign API (PHASE-P9-LOGISTICS)
 * POST /api/admin/store/shipments/[id]/assign — assign carrier to shipment
 *
 * Permission: shipping.manage. The POST business logic is delegated to
 * src/lib/logistics-service.ts (assignShipment); the route stays thin.
 *
 * NOTE: the [id] param here is the ORDER id (assignShipment looks up
 * by orderId; if the shipment exists it updates, otherwise it creates).
 * This keeps the API surface consistent with the existing
 * /api/admin/store/shipments POST handler which also operates on orderId.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { assignShipment, LogisticsServiceError } from "@/lib/logistics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toErrorResponse(e: unknown) {
  if (e instanceof LogisticsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/shipments/[id]/assign] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* POST /api/admin/store/shipments/[id]/assign */
export async function POST(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'shipping.manage');
    if (!checkCsrf(req)) {
      return NextResponse.json(
        { error: 'CSRF check failed' },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires shipping.manage' },
      { status: 403 },
    );
  }
  const { id: orderId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const shipment = await assignShipment(
      orderId,
      body.carrier,
      body.trackingCode ?? null,
      user.id,
    );
    return NextResponse.json({ success: true, data: shipment });
  } catch (e) {
    return toErrorResponse(e);
  }
}
