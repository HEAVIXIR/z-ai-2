import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  reserveStock,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory/reserve — soft-reserve stock
   T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock).

   POST: increments InventoryBalance.reserved for a (part, warehouse)
   pair without changing the on-hand quantity. Use case: hold stock
   for an order/invoice that hasn't shipped yet.

   Body: { partId, warehouseId, quantity, reason? }
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/inventory/reserve] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'inventory.manage');
    if (!checkCsrf(req)) {
      return NextResponse.json(
        { error: "CSRF check failed" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires inventory.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json();
    const { partId, warehouseId, quantity, reason } = body;
    const balance = await reserveStock(
      partId,
      warehouseId,
      quantity,
      user.id,
      reason ?? null,
    );
    return NextResponse.json({ success: true, data: balance });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
