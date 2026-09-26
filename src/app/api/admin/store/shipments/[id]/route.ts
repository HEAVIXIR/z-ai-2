/**
 * HEAVIX — Store Shipping Detail API
 * GET   /api/admin/store/shipments/[id] — get shipment
 * PATCH /api/admin/store/shipments/[id] — update tracking/status
 * T2-W3
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'store.read'); } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const shipment = await storeDb.shipment.findUnique({ where: { id }, include: { order: true } });
    if (!shipment) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'store.manage'); } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const existing = await storeDb.shipment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "یافت نشد" }, { status: 404 });

    const data: any = {};
    if (body.trackingCode !== undefined) data.trackingCode = body.trackingCode || null;
    if (body.carrier !== undefined) data.carrier = body.carrier;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "DISPATCHED" && !existing.shippedAt) data.shippedAt = new Date();
      if (body.status === "DELIVERED" && !existing.deliveredAt) data.deliveredAt = new Date();
    }
    if (body.note !== undefined) data.note = body.note || null;

    const shipment = await storeDb.shipment.update({ where: { id }, data });
    await logAudit({ actorId: user.id, actorType: 'ADMIN', action: 'store.shipment.update', entityType: 'Shipment', entityId: id, before: existing, after: shipment });
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
