/**
 * HEAVIX — Store Shipping API
 * GET  /api/admin/store/shipments — list shipments
 * POST /api/admin/store/shipments — create shipment for an order
 * T2-W3: Wire existing Shipment model to admin API.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'store.read'); } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const carrier = url.searchParams.get("carrier");
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);

    const where: any = {};
    if (status) where.status = status;
    if (carrier) where.carrier = carrier;

    const items = await storeDb.shipment.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit,
      include: { order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true, family: true } } } } },
    });
    return NextResponse.json({ success: true, data: items });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await requirePermission(user.id, 'store.manage'); } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { orderId, carrier, trackingCode, note } = body;
    if (!orderId || !carrier) return NextResponse.json({ success: false, error: "orderId و carrier الزامی هستند" }, { status: 400 });

    const existing = await storeDb.shipment.findUnique({ where: { orderId } });
    if (existing) return NextResponse.json({ success: false, error: "سفارش قبلاً محموله دارد" }, { status: 400 });

    const shipment = await storeDb.shipment.create({
      data: { orderId, carrier, trackingCode: trackingCode || null, note: note || null },
    });
    await logAudit({ actorId: user.id, actorType: 'ADMIN', action: 'store.shipment.create', entityType: 'Shipment', entityId: shipment.id, after: shipment });
    return NextResponse.json({ success: true, data: shipment });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
