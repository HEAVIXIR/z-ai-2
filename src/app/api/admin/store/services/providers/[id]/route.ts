/**
 * HEAVIX — Store Services Marketplace — Provider Detail API (PHASE-P9-SERVICES)
 * GET    /api/admin/store/services/providers/[id] — get provider + requests
 * PATCH  /api/admin/store/services/providers/[id] — update provider fields
 * DELETE /api/admin/store/services/providers/[id] — hard delete (cascades requests)
 *
 * Permission: store.read (GET) / store.manage (PATCH, DELETE).
 * NOTE: the PATCH here is a thin inline field-update (no service mutation
 * required — the provider is the static catalog row, no state machine).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { SERVICE_TYPES, ServicesServiceError } from "@/lib/services-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function serializeProvider(row: any) {
  return {
    ...row,
    rating: row.rating ?? 0,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    serviceRequests: (row.serviceRequests ?? []).map((r: any) => ({
      ...r,
      scheduledDate: r.scheduledDate?.toISOString?.() ?? null,
      completedAt: r.completedAt?.toISOString?.() ?? null,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    })),
    serviceRequestCount: row._count?.serviceRequests ?? row.serviceRequests?.length ?? 0,
    _count: undefined,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof ServicesServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/services/providers/[id]] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* GET /api/admin/store/services/providers/[id] */
export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.read' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const provider = await storeDb.serviceProvider.findUnique({
      where: { id },
      include: {
        serviceRequests: { orderBy: { createdAt: 'desc' }, take: 50 },
        _count: { select: { serviceRequests: true } },
      },
    });
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serializeProvider(provider) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* PATCH /api/admin/store/services/providers/[id] */
export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const existing = await storeDb.serviceProvider.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }

    const data: any = {};
    for (const k of ['name', 'nameFa', 'phone', 'email', 'address']) {
      if (body[k] !== undefined) data[k] = body[k] || null;
    }
    if (body.type !== undefined) {
      if (!SERVICE_TYPES.includes(body.type)) {
        return NextResponse.json(
          { success: false, error: 'نوع خدمت نامعتبر است' },
          { status: 400 },
        );
      }
      data.type = body.type;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.verified !== undefined) data.verified = Boolean(body.verified);
    if (body.rating !== undefined) {
      const v = Number(body.rating);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'امتیاز نامعتبر است' },
          { status: 400 },
        );
      }
      data.rating = v;
    }

    const updated = await storeDb.serviceProvider.update({
      where: { id },
      data,
      include: { _count: { select: { serviceRequests: true } } },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.service.provider.update',
      entityType: 'ServiceProvider',
      entityId: id,
      before: existing,
      after: updated,
      reason: `ویرایش ارائه‌دهنده خدمت ${id}`,
    });

    return NextResponse.json({ success: true, data: serializeProvider(updated) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* DELETE /api/admin/store/services/providers/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const existing = await storeDb.serviceProvider.findUnique({
      where: { id },
      include: { _count: { select: { serviceRequests: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }
    await storeDb.serviceProvider.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.service.provider.delete',
      entityType: 'ServiceProvider',
      entityId: id,
      before: {
        name: existing.name,
        type: existing.type,
        active: existing.active,
        serviceRequestCount: existing._count.serviceRequests,
      },
      reason: `حذف ارائه‌دهنده خدمت ${id} و ${existing._count.serviceRequests} درخواست مرتبط`,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
