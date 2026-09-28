/**
 * HEAVIX — Store Shipping API
 * GET  /api/admin/store/shipments — list shipments
 * POST /api/admin/store/shipments — create shipment for an order
 * T2-W3: Wire existing Shipment model to admin API.
 * T-A-DEEP-STORE — Business logic extracted to
 * src/lib/store-shipments-service.ts; route handler stays thin.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  createShipment,
  listShipments,
  ShipmentsServiceError,
} from "@/lib/store-shipments-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(e: unknown) {
  if (e instanceof ShipmentsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/shipments] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'shipping.read'); } catch {
    return NextResponse.json({ error: "Forbidden: requires shipping.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const carrier = url.searchParams.get("carrier") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await listShipments({ status, carrier, limit });
    return NextResponse.json({ success: true, data: result.items });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'shipping.manage'); } catch {
    return NextResponse.json({ error: "Forbidden: requires shipping.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { orderId, carrier, trackingCode, note } = body;
    const shipment = await createShipment(
      orderId,
      carrier,
      trackingCode,
      note,
      user.id,
    );
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.shipments.create',
      entityType: 'Shipment',
      entityId: shipment?.id ?? null,
      after: { orderId, carrier, trackingCode, note },
      reason: 'Shipment created via admin API',
    });
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
