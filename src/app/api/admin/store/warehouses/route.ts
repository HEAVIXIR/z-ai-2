import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";
import {
  createWarehouse,
  listWarehouses,
  InventoryServiceError,
} from "@/lib/store-inventory-service";
import { createAuthContext } from '@/lib/authorization-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/warehouses — HEAVIX warehouse directory CRUD
   T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock).

   GET  : list warehouses (active filter optional)
   POST : create a warehouse (name + unique code + optional address)

   Permission: reuses the inventory.* keys (already declared in
   permissions.ts). The warehouse is an inventory sub-domain.
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/warehouses] error:", err);
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
    const active = url.searchParams.get("active");
    const limit = Number(url.searchParams.get("limit")) || 100;

    const activeFilter =
      active === "true" ? true : active === "false" ? false : undefined;

    const result = await listWarehouses({ active: activeFilter, limit });
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
    const body = await req.json();
    const { name, code, address } = body;
    const warehouse = await createWarehouse(
      name,
      code,
      createAuthContext(user.id),
      address,
      user.id,
    );
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.warehouse.create',
      entityType: 'Warehouse',
      entityId: warehouse?.id ?? null,
      after: { name, code, address },
      reason: 'Warehouse created via admin API',
    });
    return NextResponse.json({ success: true, data: warehouse });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
