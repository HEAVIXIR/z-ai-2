/**
 * HEAVIX — Store Logistics Dashboard API (PHASE-P9-LOGISTICS)
 * GET /api/admin/store/logistics/dashboard — logistics stats
 *
 * Permission: store.read. The read logic is delegated to
 * src/lib/logistics-service.ts (getLogisticsDashboard); the route stays
 * thin (parse, RBAC, call service, map thrown
 * LogisticsServiceError → HTTP).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { getLogisticsDashboard, LogisticsServiceError } from "@/lib/logistics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(e: unknown) {
  if (e instanceof LogisticsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/logistics/dashboard] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* GET /api/admin/store/logistics/dashboard */
export async function GET() {
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
    const dashboard = await getLogisticsDashboard();
    return NextResponse.json({ success: true, data: dashboard });
  } catch (e) {
    return toErrorResponse(e);
  }
}
