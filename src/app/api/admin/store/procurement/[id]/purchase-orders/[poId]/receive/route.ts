import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  receivePurchaseOrderItem,
  ProcurementServiceError,
} from "@/lib/store-procurement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/procurement/[id]/purchase-orders/[poId]/receive
   PHASE1-PROCUREMENT-SHIPPING-DEEP — partial receiving endpoint.

   POST : receive `receivedQty` units against a single PurchaseOrderItem.
          Body: { poItemId, receivedQty, warehouseId }
          Side-effects:
            - increments PurchaseOrderItem.received
            - creates StockMovement (RECEIVE) + adjusts Part.stock
            - if all items fully received, flips PO status to RECEIVED

   The endpoint is per-PO so the route enforces procurement-scoped RBAC
   (procurement.manage) and accepts a poItemId in the body rather than
   a [poItemId] path segment (partial receive is a POST-only operation;
   the admin UI sends the target line id in the payload).
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof ProcurementServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error(
    "[store/procurement/[id]/purchase-orders/[poId]/receive] error:",
    err,
  );
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkCsrf(req)) {
    return NextResponse.json(
      { error: "CSRF check failed" },
      { status: 403 },
    );
  }
  try {
    await requirePermission(user.id, 'procurement.manage');
    await requirePermission(user.id, 'inventory.manage');
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires procurement.manage and inventory.manage" },
      { status: 403 },
    );
  }
  const { id: procurementId, poId: purchaseOrderId } = await params;
  try {
    const body = await req.json();
    const { poItemId, receivedQty, warehouseId } = body;
    if (
      typeof poItemId !== "string" || !poItemId.trim() ||
      typeof warehouseId !== "string" || !warehouseId.trim() ||
      !Number.isSafeInteger(receivedQty) || receivedQty <= 0
    ) {
      return NextResponse.json(
        { success: false, error: "شناسه قلم، انبار و تعداد صحیح مثبت الزامی است" },
        { status: 400 },
      );
    }
    const result = await receivePurchaseOrderItem(
      poItemId,
      receivedQty,
      warehouseId,
      user.id,
      procurementId,
      purchaseOrderId,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
