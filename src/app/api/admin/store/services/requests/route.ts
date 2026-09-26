/**
 * HEAVIX — Store Services Marketplace — Requests API (PHASE-P9-SERVICES)
 * GET  /api/admin/store/services/requests — list service requests
 * POST /api/admin/store/services/requests — create service request
 *
 * Permission: store.read (GET) / store.manage (POST). The POST business
 * logic is delegated to src/lib/services-service.ts (createServiceRequest);
 * the route stays thin (parse, RBAC, call service, map thrown
 * ServicesServiceError → HTTP).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { createServiceRequest, ServicesServiceError } from "@/lib/services-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeRequest(r: any) {
  return {
    ...r,
    scheduledDate: r.scheduledDate?.toISOString?.() ?? null,
    completedAt: r.completedAt?.toISOString?.() ?? null,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
    provider: r.provider
      ? {
          id: r.provider.id,
          name: r.provider.name,
          nameFa: r.provider.nameFa,
          type: r.provider.type,
          phone: r.provider.phone,
        }
      : null,
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
  console.error('[store/services/requests] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* GET /api/admin/store/services/requests — list requests */
export async function GET(req: Request) {
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
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const type = url.searchParams.get('type') || undefined;
    const providerId = url.searchParams.get('providerId') || undefined;
    const customerId = url.searchParams.get('customerId') || undefined;
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (providerId) where.providerId = providerId;
    if (customerId) where.customerId = customerId;

    const [items, total] = await Promise.all([
      storeDb.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          provider: {
            select: { id: true, name: true, nameFa: true, type: true, phone: true },
          },
        },
      }),
      storeDb.serviceRequest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serializeRequest),
      total,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* POST /api/admin/store/services/requests — create request */
export async function POST(req: Request) {
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
  try {
    const body = await req.json().catch(() => ({}));
    const request = await createServiceRequest({
      customerId: body.customerId,
      type: body.type,
      description: body.description ?? null,
      providerId: body.providerId ?? null,
      userId: user.id,
    });
    return NextResponse.json(
      { success: true, data: request },
      { status: 201 },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
