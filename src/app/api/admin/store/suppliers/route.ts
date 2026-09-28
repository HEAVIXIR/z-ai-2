import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  listSuppliers,
  createSupplier,
  SuppliersServiceError,
} from "@/lib/store-suppliers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/suppliers — HEAVIX supplier directory CRUD
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
  console.error("[store/suppliers] error:", err);
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
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const activeParam = url.searchParams.get("active");
    const active =
      activeParam === "true" ? true
      : activeParam === "false" ? false
      : undefined;

    const result = await listSuppliers({ q, active });
    return NextResponse.json({
      success: true,
      data: result.items.map(serialize),
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
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { name, nameFa, phone, email, address, active } = body;
    const s = await createSupplier({
      name,
      nameFa,
      phone,
      email,
      address,
      active,
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.supplier.create',
      entityType: 'Supplier',
      entityId: s.id,
      after: s,
    });

    return NextResponse.json({ success: true, data: serialize(s) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
