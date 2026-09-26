import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  ProcurementServiceError,
} from "@/lib/store-procurement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/procurement/[id]/purchase-orders
   PHASE1-PROCUREMENT-SHIPPING-DEEP — Purchase Order lifecycle.

   GET  : list POs for a procurement tender (filter by status/supplier).
   POST : create a new PO (DRAFT) with nested line items.

   Permission: reuses the procurement.* keys (already declared in
   permissions.ts). POs are a procurement sub-domain.
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof ProcurementServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/procurement/[id]/purchase-orders] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'procurement.read');
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires procurement.read" },
      { status: 403 },
    );
  }
  const { id: procurementId } = await params;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const supplierId = url.searchParams.get("supplierId") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await listPurchaseOrders({
      procurementId,
      supplierId,
      status,
      limit,
    });
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
    await requirePermission(user.id, 'procurement.manage');
    if (!checkCsrf(req)) {
      return NextResponse.json(
        { error: "CSRF check failed" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires procurement.manage" },
      { status: 403 },
    );
  }
  const { id: procurementId } = await params;
  try {
    const body = await req.json();
    const { supplierId, items, notes, currency } = body;
    const po = await createPurchaseOrder(
      procurementId,
      supplierId ?? null,
      items,
      user.id,
      { notes: notes ?? null, currency: currency ?? undefined },
    );
    return NextResponse.json({ success: true, data: po });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
