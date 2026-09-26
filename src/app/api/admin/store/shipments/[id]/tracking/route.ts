import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  addTrackingEvent,
  getTrackingHistory,
  ShipmentsServiceError,
} from "@/lib/store-shipments-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/shipments/[id]/tracking
   PHASE1-PROCUREMENT-SHIPPING-DEEP — Shipment tracking history.

   GET  : list tracking events for a shipment (oldest → newest).
   POST : append a tracking event (DISPATCHED | IN_TRANSIT |
          OUT_FOR_DELIVERY | DELIVERED | EXCEPTION) + sync the parent
          Shipment snapshot fields.
          Body: { status, location?, description? }
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof ShipmentsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/shipments/[id]/tracking] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'shipping.read');
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires shipping.read" },
      { status: 403 },
    );
  }
  const { id: shipmentId } = await params;
  try {
    const result = await getTrackingHistory(shipmentId);
    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'shipping.manage');
    if (!checkCsrf(req)) {
      return NextResponse.json(
        { error: "CSRF check failed" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires shipping.manage" },
      { status: 403 },
    );
  }
  const { id: shipmentId } = await params;
  try {
    const body = await req.json();
    const { status, location, description } = body;
    const result = await addTrackingEvent(
      shipmentId,
      status,
      location ?? null,
      description ?? null,
      user.id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
