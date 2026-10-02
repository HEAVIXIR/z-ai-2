/**
 * HEAVIX — Store Shipment Delivery Confirmation API (PHASE-P9-LOGISTICS)
 * POST /api/admin/store/shipments/[id]/deliver — confirm delivery with proof
 *
 * Permission: shipping.manage. The POST business logic is delegated to
 * src/lib/logistics-service.ts (confirmDelivery); the route stays thin.
 *
 * Body: { proofUrl?: string }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { confirmDelivery, LogisticsServiceError } from "@/lib/logistics-service";
import { createAuthContext } from '@/lib/authorization-context';

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
  console.error('[store/shipments/[id]/deliver] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* POST /api/admin/store/shipments/[id]/deliver */
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
  const { id: shipmentId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await confirmDelivery(
      shipmentId,
      body.proofUrl ?? null,
      createAuthContext(user.id),
      user.id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
