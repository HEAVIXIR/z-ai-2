/**
 * HEAVIX — Store Services Marketplace — Providers API (PHASE-P9-SERVICES)
 * GET  /api/admin/store/services/providers — list service providers
 * POST /api/admin/store/services/providers — create service provider
 *
 * Permission: store.read (GET) / store.manage (POST). The POST business
 * logic is delegated to src/lib/services-service.ts (createProvider); the
 * route stays thin (parse, RBAC, call service, map thrown
 * ServicesServiceError → HTTP).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { createProvider, ServicesServiceError } from "@/lib/services-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeProvider(row: any) {
  return {
    ...row,
    rating: row.rating ?? 0,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    serviceRequestCount: row._count?.serviceRequests ?? 0,
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
  console.error('[store/services/providers] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

/* GET /api/admin/store/services/providers — list providers */
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
    const type = url.searchParams.get('type') || undefined;
    const active = url.searchParams.get('active');
    const verified = url.searchParams.get('verified');
    const q = url.searchParams.get('q')?.trim() || undefined;
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

    const where: any = {};
    if (type) where.type = type;
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;
    if (verified === 'true') where.verified = true;
    if (verified === 'false') where.verified = false;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { nameFa: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { address: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      storeDb.serviceProvider.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { _count: { select: { serviceRequests: true } } },
      }),
      storeDb.serviceProvider.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serializeProvider),
      total,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* POST /api/admin/store/services/providers — create provider */
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
    const provider = await createProvider({
      name: body.name,
      nameFa: body.nameFa ?? null,
      type: body.type,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
      active: body.active ?? true,
      verified: body.verified ?? false,
      rating: body.rating ?? 0,
      userId: user.id,
    });
    return NextResponse.json(
      { success: true, data: provider },
      { status: 201 },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
