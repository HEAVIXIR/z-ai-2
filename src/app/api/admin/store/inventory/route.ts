import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  createMovement,
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
   T1-DEEP — POST now accepts an optional `warehouseId`. When
   provided, the route calls adjustStock() (per-warehouse path:
   updates InventoryBalance + writes StockMovement with warehouseId
   set + syncs Part.stock). When omitted, the legacy createMovement()
   path runs (Part.stock only — backward-compat for clients that
   don't know about warehouses).
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
  console.error("[store/inventory] error:", e);
  return NextResponse.json(
    { success: false, error: "خطای داخلی سرور" },
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
    const allowedFields = new Set(["partId", "type", "quantity", "reason", "reference", "warehouseId"]);
    if (Object.keys(input).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ success: false, error: "فیلد غیرمجاز در درخواست موجودی" }, { status: 400 });
    }

    const { partId, type, quantity, reason, reference, warehouseId } = input;
    const qty = Number(quantity);
    if (
      typeof partId !== "string" || !partId.trim() || partId.length > 128 ||
      typeof type !== "string" || !type.trim() ||
      !Number.isSafeInteger(qty) || qty === 0 ||
      (warehouseId !== undefined && (typeof warehouseId !== "string" || !warehouseId.trim() || warehouseId.length > 128)) ||
      (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > 500)) ||
      (reference !== undefined && reference !== null && (typeof reference !== "string" || reference.length > 120))
    ) {
      return NextResponse.json({ success: false, error: "اطلاعات حرکت موجودی نامعتبر است" }, { status: 400 });
    }

    // T1-DEEP — when warehouseId is present, use the per-warehouse path
    // (updates InventoryBalance + writes StockMovement with warehouseId
    // set + syncs Part.stock). When absent, fall back to the legacy
    // createMovement() which only touches Part.stock (backward compat).
    if (warehouseId) {
      const result = await adjustStock(
        partId,
        warehouseId,
        qty,
        type,
        reason as string | null | undefined,
        reference as string | null | undefined,
        user.id,
      );
      // P2 (Contract Drift Remediation): Removed the route-scope
      // store.inventory.adjust audit — the service adjustStock() already
      // audits this operation as store.inventory.balance.update (with
      // the proper before/after fields). The duplicate route audit was
      // missing before: and used a non-canonical action key.
      return NextResponse.json({ success: true, data: result });
    }

    const movement = await createMovement(
      partId,
      type,
      qty,
      reason as string | null | undefined,
      reference as string | null | undefined,
      user.id,
    );
    // P2: Same as above — createMovement() audits as
    // store.inventory.movement.create in the service. Removed the
    // duplicate route-scope store.inventory.create audit.
    return NextResponse.json({ success: true, data: movement });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
