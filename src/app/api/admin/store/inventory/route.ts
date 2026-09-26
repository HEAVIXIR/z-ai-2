import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  createMovement,
  listMovements,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory — HEAVIX stock movement ledger
   T2-W2-A — Inventory domain (balance + movement ledger).
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-inventory-service.ts; route handler stays thin.
   GET  : list recent movements with filters (partId, type, limit)
   POST : record a movement and adjust Part.stock atomically.
   Every mutation to Part.stock MUST be recorded as a StockMovement
   so the ledger reconstructs the balance at any point in time.
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/inventory] error:", err);
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
    return NextResponse.json({ error: "Forbidden: requires inventory.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const partId = url.searchParams.get("partId") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const reference = url.searchParams.get("reference") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await listMovements({ partId, type, reference, limit });
    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'inventory.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires inventory.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { partId, type, quantity, reason, reference } = body;
    const movement = await createMovement(
      partId,
      type,
      quantity,
      reason,
      reference,
      user.id,
    );
    return NextResponse.json({ success: true, data: movement });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
