import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  releaseStock,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory/release — release reserved stock
   T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock).

   POST: decrements InventoryBalance.reserved for a (part, warehouse)
   pair without changing the on-hand quantity. Use case: order
   shipped (reservation consumed) or order cancelled (reservation
   reverted).

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
  console.error("[store/inventory/release] error:", err);
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "بدنه درخواست JSON معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "ساختار درخواست آزادسازی نامعتبر است" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    if (typeof payload.partId !== "string" || !payload.partId.trim()
      || typeof payload.warehouseId !== "string" || !payload.warehouseId.trim()
      || typeof payload.quantity !== "number" || !Number.isSafeInteger(payload.quantity) || payload.quantity <= 0
      || (payload.reason != null && typeof payload.reason !== "string")
      || (typeof payload.reason === "string" && payload.reason.length > 500)) {
      return NextResponse.json({ success: false, error: "پارامترهای آزادسازی نامعتبر است" }, { status: 400 });
    }
    const balance = await releaseStock(
      payload.partId,
      payload.warehouseId,
      payload.quantity,
      user.id,
      typeof payload.reason === "string" ? payload.reason : null,
    );
    return NextResponse.json({ success: true, data: balance });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
