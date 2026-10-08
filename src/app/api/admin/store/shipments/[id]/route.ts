/**
 * HEAVIX — Store Shipping Detail API
 * GET   /api/admin/store/shipments/[id] — get shipment
 * PATCH /api/admin/store/shipments/[id] — update tracking/status
 * T2-W3
 * T-A-DEEP-STORE — PATCH business logic extracted to
 * src/lib/store-shipments-service.ts; GET stays inline (rich read).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import {
  updateShipment,
  ShipmentsServiceError,
} from "@/lib/store-shipments-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toErrorResponse(e: unknown) {
  if (e instanceof ShipmentsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/shipments/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'shipping.read'); } catch {
    return NextResponse.json({ error: "Forbidden: requires shipping.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const shipment = await storeDb.shipment.findUnique({ where: { id }, include: { order: true } });
    if (!shipment) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'shipping.manage'); } catch {
    return NextResponse.json({ error: "Forbidden: requires shipping.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const shipment = await updateShipment(
      id,
      body.trackingCode,
      body.carrier,
      body.status,
      body.note,
      user.id,
    );
    // P2 (Contract Drift Remediation): Removed the route-scope
    // store.shipments.update audit — updateShipment() already audits
    // this in the service as store.shipment.update (with before/after).
    // The route audit used a plural `shipments` action key inconsistent
    // with the service's singular `shipment` convention.
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
