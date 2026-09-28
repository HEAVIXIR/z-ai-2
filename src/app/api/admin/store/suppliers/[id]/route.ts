import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  getSupplier,
  updateSupplier,
  deleteSupplier,
  SuppliersServiceError,
} from "@/lib/store-suppliers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/suppliers/[id] — single supplier CRUD
   T2-W1-A — Store Gap Domain #3 (Suppliers)
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-suppliers-service.ts; route handler stays thin.
   Audit logging remains in the route to preserve the exact
   audit JSON shape that existed pre-extraction.
   ============================================================ */

function serialize(s: any) {
  return {
    ...s,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    updatedAt: s.updatedAt?.toISOString?.() ?? null,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof SuppliersServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/suppliers/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const s = await getSupplier(id);
    return NextResponse.json({ success: true, data: serialize(s) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const { existing, supplier: s } = await updateSupplier(id, body);
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.supplier.update',
      entityType: 'Supplier',
      entityId: s.id,
      before: existing,
      after: s,
    });

    return NextResponse.json({ success: true, data: serialize(s) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const { existing } = await deleteSupplier(id);
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.supplier.delete",
      entityType: "Supplier",
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
