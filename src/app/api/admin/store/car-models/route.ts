import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  listCarModels,
  createCarModel,
  CarModelsServiceError,
} from "@/lib/store-car-models-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/car-models — HEAVIX car models CRUD
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-car-models-service.ts; route handler stays thin.
   Audit logging remains in the route to preserve the exact
   audit JSON shape that existed pre-extraction.
   ============================================================ */

function serialize(c: any) {
  return {
    ...c,
    createdAt: c.createdAt?.toISOString?.() ?? null,
    partCount: c._count?.parts ?? 0,
    _count: undefined,
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
  console.error("[store/car-models] error:", err);
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
    const type = url.searchParams.get("type") || undefined;
    const brand = url.searchParams.get("brand") || undefined;

    const result = await listCarModels({ q, type, brand });
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
    const { brand, model, yearFrom, yearTo, type } = body;
    const c = await createCarModel({ brand, model, yearFrom, yearTo, type });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.car_model.create',
      entityType: 'CarModel',
      entityId: c.id,
      after: c,
    });

    return NextResponse.json({ success: true, data: serialize(c) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
