import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* GET /api/admin/machines/[id] */
export async function GET(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const machine = await db.machine.findUnique({
      where: { id },
      include: {
        product: {
          select: { id: true, canonicalName: true, slug: true },
          include: { brand: { select: { id: true, name: true } } },
        },
        listing: { select: { id: true, slug: true, title: true, status: true } },
      },
    });
    if (!machine) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ machine });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/admin/machines/[id] */
export async function PATCH(req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "machine.update");
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.machine.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    const allowed = [
      "serialNumber", "condition", "ownershipHistory", "status",
    ];
    for (const k of allowed) {
      if (k in body) data[k] = body[k] === undefined ? null : body[k];
    }
    if ("productId" in body) {
      data.productId = body.productId === null || body.productId === "" ? null : String(body.productId);
    }
    if ("listingId" in body) {
      data.listingId = body.listingId === null || body.listingId === "" ? null : String(body.listingId);
    }
    if ("manufactureYear" in body) {
      data.manufactureYear =
        body.manufactureYear === null || body.manufactureYear === ""
          ? null
          : Number(body.manufactureYear);
    }
    if ("hours" in body) {
      data.hours = body.hours === null || body.hours === "" ? null : Number(body.hours);
    }

    const machine = await db.machine.update({ where: { id }, data });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.machines.update",
      entityType: "Machine",
      entityId: machine.id,
      before: { serialNumber: existing.serialNumber, condition: existing.condition, status: existing.status, productId: existing.productId, listingId: existing.listingId, manufactureYear: existing.manufactureYear, hours: existing.hours },
      after: { serialNumber: machine.serialNumber, condition: machine.condition, status: machine.status, productId: machine.productId, listingId: machine.listingId, manufactureYear: machine.manufactureYear, hours: machine.hours },
      reason: "via admin API",
    });
    return NextResponse.json({ ok: true, machine });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/machines/[id] */
export async function DELETE(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "machine.update");
  try {
    const { id } = await params;
    const before = await db.machine.findUnique({ where: { id } });
    await db.machine.delete({ where: { id } });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.machines.delete",
      entityType: "Machine",
      entityId: id,
      before: before ? { serialNumber: before.serialNumber, condition: before.condition, status: before.status, productId: before.productId, listingId: before.listingId, manufactureYear: before.manufactureYear, hours: before.hours } : null,
      reason: "via admin API",
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
