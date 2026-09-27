import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* PATCH /api/admin/compatibility-edges/[id] — mainly for verify/unverify. */
export async function PATCH(req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "compatibility.manage");
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.compatibilityEdge.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    if ("verified" in body) {
      data.verified = Boolean(body.verified);
      data.verifiedAt = body.verified ? new Date() : null;
    }
    if ("verifiedBy" in body) data.verifiedBy = body.verifiedBy ?? null;
    if ("confidence" in body) {
      data.confidence =
        body.confidence === null || body.confidence === ""
          ? null
          : Number(body.confidence);
    }
    if ("source" in body) data.source = body.source ?? null;

    const edge = await db.compatibilityEdge.update({ where: { id }, data });
    return NextResponse.json({ ok: true, edge });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/compatibility-edges/[id] */
export async function DELETE(_req: Request, { params }: Args) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "compatibility.manage");
  try {
    const { id } = await params;
    await db.compatibilityEdge.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
