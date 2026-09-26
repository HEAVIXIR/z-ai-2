import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrder,
  submitPurchaseOrder,
  ProcurementServiceError,
} from "@/lib/store-procurement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/procurement/[id]/purchase-orders/[poId]
   PHASE1-PROCUREMENT-SHIPPING-DEEP — single PO lifecycle.

   GET   : fetch a single PO with items + supplier + procurement context.
   PATCH : advance the PO state machine. Body:
       { action: "submit" | "approve" | "cancel", reason?: string }
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof ProcurementServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/procurement/[id]/purchase-orders/[poId]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
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
  const { poId } = await params;
  try {
    const po = await getPurchaseOrder(poId);
    return NextResponse.json({ success: true, data: po });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(
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
  const { poId } = await params;
  try {
    const body = await req.json();
    const { action, reason } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "action الزامی است (submit | approve | cancel)" },
        { status: 400 },
      );
    }

    let po;
    switch (action) {
      case "submit":
        po = await submitPurchaseOrder(poId, user.id);
        break;
      case "approve":
        po = await approvePurchaseOrder(poId, user.id);
        break;
      case "cancel":
        po = await cancelPurchaseOrder(poId, reason ?? null, user.id);
        break;
      default:
        return NextResponse.json(
          { success: false, error: "action نامعتبر (submit | approve | cancel)" },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, data: po });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
