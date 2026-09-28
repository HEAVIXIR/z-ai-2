import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  updateMechanic,
  deleteMechanic,
  MechanicsServiceError,
} from "@/lib/store-mechanics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/mechanics/[id] — HEAVIX mechanic PATCH/DELETE
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-mechanics-service.ts; route handler stays thin.
   Audit logging remains in the route to preserve the exact
   audit JSON shape that existed pre-extraction.
   ============================================================ */

function serialize(m: any) {
  return {
    ...m,
    rating: m.rating?.toString?.() ?? String(m.rating ?? 0),
    createdAt: m.createdAt?.toISOString?.() ?? null,
    updatedAt: m.updatedAt?.toISOString?.() ?? null,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof MechanicsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/mechanics/[id]] error:", err);
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
    const { existing, mechanic: m } = await updateMechanic(id, body);
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.mechanic.update',
      entityType: 'Mechanic',
      entityId: m.id,
      before: existing,
      after: m,
    });

    return NextResponse.json({ success: true, data: serialize(m) });
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
    const { existing } = await deleteMechanic(id);
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.mechanic.delete",
      entityType: "Mechanic",
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
