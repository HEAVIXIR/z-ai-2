import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import {
  listMechanics,
  createMechanic,
  MechanicsServiceError,
} from "@/lib/store-mechanics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/mechanics — HEAVIX mechanics CRUD
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
    orderCount: m._count?.orders ?? 0,
    _count: undefined,
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
  console.error("[store/mechanics] error:", err);
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
    const status = url.searchParams.get("status") || undefined;
    const verifiedParam = url.searchParams.get("verified");
    const verified =
      verifiedParam === "1" ? true
      : verifiedParam === "0" ? false
      : undefined;

    const result = await listMechanics({ q, status, verified });
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
    const { phone, name, family, shopName, specialty, city, address, verified, status, rating, notes } = body;

    const m = await createMechanic({
      phone,
      name,
      family,
      shopName,
      specialty,
      city,
      address,
      verified,
      status,
      rating,
      notes,
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.mechanic.create',
      entityType: 'Mechanic',
      entityId: m.id,
      after: m,
    });

    return NextResponse.json({ success: true, data: serialize(m) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
