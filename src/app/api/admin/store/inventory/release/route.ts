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
  console.error("[store/inventory/release] error:", e);
  return NextResponse.json(
    { success: false, error: "خطای داخلی سرور" },
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
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 8 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 8 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    let body: unknown;
    try {
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json({ success: false, error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست باید یک شیء معتبر باشد" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["partId", "warehouseId", "quantity", "reason"]);
    const { partId, warehouseId, quantity, reason } = input;
    const qty = Number(quantity);
    if (
      Object.keys(input).some((key) => !allowedFields.has(key)) ||
      typeof partId !== "string" || !partId.trim() || partId.length > 128 ||
      typeof warehouseId !== "string" || !warehouseId.trim() || warehouseId.length > 128 ||
      !Number.isSafeInteger(qty) || qty <= 0 ||
      (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > 500))
    ) {
      return NextResponse.json({ success: false, error: "اطلاعات درخواست رزرو موجودی نامعتبر است" }, { status: 400 });
    }
    const balance = await releaseStock(
      partId,
      warehouseId,
      qty,
      user.id,
      reason as string | null | undefined,
    );
    return NextResponse.json({ success: true, data: balance });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
