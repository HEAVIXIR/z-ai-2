/**
 * HEAVIX — Store Shipment Delivery Exception API (PHASE-P9-LOGISTICS)
 * POST /api/admin/store/shipments/[id]/exception — report exception
 *
 * Permission: shipping.manage. The POST business logic is delegated to
 * src/lib/logistics-service.ts (reportDeliveryException); the route
 * stays thin.
 *
 * Body: { exceptionType: string, notes?: string }
 * The exceptionType is operator-classification (FAILED_ATTEMPT | DAMAGED |
 * REFUSED | ADDRESS_ISSUE | LOST | OTHER) — kept as a free-form string
 * here so the operator can encode carrier-specific codes; the service
 * records it verbatim in the audit + tracking description.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { reportDeliveryException, LogisticsServiceError } from "@/lib/logistics-service";

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
  console.error('[store/shipments/[id]/exception] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* POST /api/admin/store/shipments/[id]/exception */
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
    if (!body.exceptionType) {
      return NextResponse.json(
        { success: false, error: 'exceptionType الزامی است' },
        { status: 400 },
      );
    }
    const result = await reportDeliveryException(
      shipmentId,
      String(body.exceptionType),
      body.notes ?? null,
      user.id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
