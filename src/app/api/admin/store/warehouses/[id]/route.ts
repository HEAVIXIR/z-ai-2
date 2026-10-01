import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";
import {
  updateWarehouse,
  deleteWarehouse,
  getWarehouse,
  InventoryServiceError,
} from "@/lib/store-inventory-service";
import { createAuthContext } from '@/lib/authorization-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/warehouses/[id] — single Warehouse CRUD
   T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock).

   GET    : fetch a single warehouse + its inventory balances
   PATCH  : update name/code/address/active fields
   DELETE : hard delete when no InventoryBalance rows reference it
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/warehouses/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  try {
    const warehouse = await getWarehouse(id);
    return NextResponse.json({ success: true, data: warehouse });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, code, address, active } = body;
    const warehouse = await updateWarehouse(
      id,
      { name, code, address, active },
      user.id,
      createAuthContext(user.id)
    );
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.warehouse.update',
      entityType: 'Warehouse',
      entityId: id,
      after: { name, code, address, active },
      reason: 'Warehouse updated via admin API',
    });
    return NextResponse.json({ success: true, data: warehouse });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  try {
    const result = await deleteWarehouse(id, user.id,
      createAuthContext(user.id));
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.warehouse.delete',
      entityType: 'Warehouse',
      entityId: id,
      reason: 'Warehouse deleted via admin API',
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
