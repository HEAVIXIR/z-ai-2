import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { requirePermission } from "@/lib/authorization";
import {
  listMovements,
  adjustStock,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory — HEAVIX stock movement ledger
   T2-W2-A — Inventory domain (balance + movement ledger).
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-inventory-service.ts; route handler stays thin.
   POST requires an explicit warehouseId and uses adjustStock().
   Legacy Part-only movements are no longer exposed through this route.
   GET  : list recent movements with filters (partId, type, limit)
   POST : record a movement and adjust stock atomically.
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
  if (!checkCsrf(req)) {
    return NextResponse.json({ success: false, error: "CSRF check failed" }, { status: 403 });
  }
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
    const { partId, type, quantity, reason, reference, warehouseId } = body;
    if (typeof warehouseId !== "string" || !warehouseId.trim()) {
      return NextResponse.json(
        { success: false, error: "برای ثبت حرکت موجودی، انتخاب صریح انبار الزامی است" },
        { status: 400 },
      );
    }
    const result = await adjustStock(
      partId,
      warehouseId,
      quantity,
      type,
      reason,
      reference,
      user.id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
