import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/* DELETE /api/admin/services/[id] — remove a service. Auth required. */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "service.manage");
  try {
    const { id } = await params;
    const existing = await db.service.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.service.delete({ where: { id } });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.services.delete",
      entityType: "Service",
      entityId: id,
      before: { key: existing.key, nameFa: existing.nameFa, nameEn: existing.nameEn, active: existing.active, featured: existing.featured },
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
