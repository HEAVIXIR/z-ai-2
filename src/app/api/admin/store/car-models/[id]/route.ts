import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  updateCarModel,
  deleteCarModel,
  CarModelsServiceError,
} from "@/lib/store-car-models-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/car-models/[id] — HEAVIX car model PATCH/DELETE
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-car-models-service.ts; route handler stays thin.
   Audit logging remains in the route to preserve the exact
   audit JSON shape that existed pre-extraction.
   ============================================================ */

function serialize(c: any) {
  return {
    ...c,
    createdAt: c.createdAt?.toISOString?.() ?? null,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof CarModelsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/car-models/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
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
    const { existing, carModel: c } = await updateCarModel(id, body);
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.car_model.update',
      entityType: 'CarModel',
      entityId: c.id,
      before: existing,
      after: c,
    });

    return NextResponse.json({ success: true, data: serialize(c) });
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
    const { existing } = await deleteCarModel(id);
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.car_model.delete",
      entityType: "CarModel",
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
