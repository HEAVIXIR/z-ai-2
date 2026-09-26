import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  getLowStockItems,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory/low-stock — low-stock alert report
   T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock).

   GET: returns InventoryBalance rows where quantity <= lowStockThreshold.
   Optional query: ?warehouseId=... & limit=...

   Use case: reorder-alert dashboard on /admin/store/inventory?tab=low.
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/inventory/low-stock] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'inventory.read');
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires inventory.read" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get("warehouseId") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await getLowStockItems({ warehouseId, limit });
    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
