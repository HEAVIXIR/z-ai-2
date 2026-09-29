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

export async function GET(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const part = await db.part.findUnique({
      where: { id },
      include: {
        product: {
          select: { id: true, canonicalName: true, slug: true },
          include: { brand: { select: { id: true, name: true } } },
        },
      },
    });
    if (!part) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ part });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "part.update");
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.part.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    const allowed = ["partNumber", "oemNumber", "condition", "status"];
    for (const k of allowed) {
      if (k in body) data[k] = body[k] === undefined ? null : body[k];
    }
    if ("productId" in body) {
      data.productId = body.productId === null || body.productId === "" ? null : String(body.productId);
    }

    const part = await db.part.update({ where: { id }, data });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.parts.update",
      entityType: "Part",
      entityId: part.id,
      before: { partNumber: existing.partNumber, oemNumber: existing.oemNumber, condition: existing.condition, status: existing.status, productId: existing.productId },
      after: { partNumber: part.partNumber, oemNumber: part.oemNumber, condition: part.condition, status: part.status, productId: part.productId },
      reason: "via admin API",
    });
    return NextResponse.json({ ok: true, part });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "part.update");
  try {
    const { id } = await params;
    const before = await db.part.findUnique({ where: { id } });
    await db.part.delete({ where: { id } });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.parts.delete",
      entityType: "Part",
      entityId: id,
      before: before ? { partNumber: before.partNumber, oemNumber: before.oemNumber, condition: before.condition, status: before.status, productId: before.productId } : null,
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
