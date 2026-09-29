import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/* ============================================================
   /api/admin/menu/[id] — update + delete a single menu item.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(sessionUser.id, "admin.navigation.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.navigation.manage" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const before = await db.menuItem.findUnique({ where: { id }, select: { id: true, title: true, href: true, parentId: true, icon: true, order: true, active: true, openInNew: true } });
    const item = await db.menuItem.update({
      where: { id },
      data: {
        title: body.title !== undefined ? String(body.title) : undefined,
        href: body.href !== undefined ? (body.href || null) : undefined,
        parentId: body.parentId !== undefined ? (body.parentId || null) : undefined,
        icon: body.icon !== undefined ? (body.icon || null) : undefined,
        order: body.order !== undefined ? Number(body.order) : undefined,
        active: body.active !== undefined ? Boolean(body.active) : undefined,
        openInNew: body.openInNew !== undefined ? Boolean(body.openInNew) : undefined,
      },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.menuItems.update",
      entityType: "MenuItem",
      entityId: item.id,
      before,
      after: { title: item.title, href: item.href, parentId: item.parentId, icon: item.icon, order: item.order, active: item.active, openInNew: item.openInNew },
      reason: "via admin API",
    });
    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(sessionUser.id, "admin.navigation.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.navigation.manage" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    // Build update data — accept any subset of the editable fields.
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = String(body.title);
    if (body.href !== undefined) data.href = body.href ? String(body.href) : null;
    if (body.parentId !== undefined) data.parentId = body.parentId ? String(body.parentId) : null;
    if (body.icon !== undefined) data.icon = body.icon ? String(body.icon) : null;
    if (body.order !== undefined) {
      const n = Number(body.order);
      if (Number.isFinite(n)) data.order = Math.trunc(n);
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.openInNew !== undefined) data.openInNew = Boolean(body.openInNew);

    const item = await db.menuItem.update({ where: { id }, data });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.menuItems.update",
      entityType: "MenuItem",
      entityId: item.id,
      after: { title: item.title, href: item.href, parentId: item.parentId, icon: item.icon, order: item.order, active: item.active, openInNew: item.openInNew },
      reason: "via admin API",
    });
    return NextResponse.json({ ok: true, success: true, item });
  } catch (e) {
    return NextResponse.json({ error: "Patch failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(sessionUser.id, "admin.navigation.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.navigation.manage" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const before = await db.menuItem.findUnique({ where: { id }, select: { id: true, title: true, href: true, parentId: true, order: true, active: true } });
    await db.menuItem.delete({ where: { id } });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.menuItems.delete",
      entityType: "MenuItem",
      entityId: id,
      before,
      reason: "via admin API",
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
