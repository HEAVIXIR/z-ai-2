import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/site-widgets — list all widgets. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "admin.settings.manage");
  try {
    const widgets = await db.siteWidget.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ widgets });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/site-widgets — create or update by key.
   Body: { key, title, content, active? }
*/
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "admin.settings.manage");
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.key || !body.title) {
      return NextResponse.json(
        { error: "key and title are required" },
        { status: 400 },
      );
    }
    const data: any = {
      title: String(body.title),
      content: String(body.content ?? ""),
      active: body.active !== false,
    };
    const widget = await db.siteWidget.upsert({
      where: { key: String(body.key) },
      create: { key: String(body.key), ...data },
      update: data,
    });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.siteWidgets.upsert",
      entityType: "SiteWidget",
      entityId: widget.id,
      after: { key: widget.key, title: widget.title, active: widget.active },
      reason: "via admin API",
    });
    return NextResponse.json({ ok: true, widget });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
