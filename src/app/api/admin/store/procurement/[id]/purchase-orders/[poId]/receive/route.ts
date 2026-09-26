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
          Body: { poItemId, receivedQty }
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
  // The procurementId + poId path params exist to scope the URL; the
  // service validates the POItem independently. We don't need to read
  // them beyond the destructure (they're used for route clarity + the
  // audit trail reconstructs the PO from the POItem).
  await params;
  try {
    const body = await req.json();
    const { poItemId, receivedQty } = body;
    const result = await receivePurchaseOrderItem(
      poItemId,
      receivedQty,
      user.id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
