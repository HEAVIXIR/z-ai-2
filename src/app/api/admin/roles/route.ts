/**
 * HEAVIX Admin - Roles
 * GET  /api/admin/roles  - list roles
 * POST /api/admin/roles  - create a new custom role
 */

import { db } from '@/lib/db';
import { ok, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const roles = await db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    // Add member count per role
    const counts = await db.user.groupBy({
      by: ['role'],
      _count: { _all: true },
      where: { deletedAt: null },
    });
    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.role] = c._count._all;

    const withCount = roles.map((r) => ({
      ...r,
      // Match against the UserRole enum name; super_admin role -> SUPER_ADMIN count, etc.
      memberCount: countMap[r.name.toUpperCase()] ?? 0,
    }));

    return ok({ items: withCount });
  } catch (err) {
    console.error('[api/admin/roles GET] error:', err);
    return serverError('Failed to list roles', String(err));
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<{
      name?: string;
      description?: string | null;
      permissions?: string[];
      color?: string | null;
    }>(req);

    if (!body?.name) return fail('name is required', 400);
    const name = body.name.trim();
    if (name.length < 2) return fail('name must be at least 2 characters', 400);

    const existing = await db.role.findUnique({ where: { name } });
    if (existing) return fail(`role "${name}" already exists`, 409);

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    // Validate: each permission must be a non-empty string
    if (permissions.some((p) => typeof p !== 'string' || !p.trim())) {
      return fail('permissions must be an array of non-empty strings', 400);
    }

    const role = await db.role.create({
      data: {
        name,
        description: body.description?.trim() || null,
        permissions,
        color: body.color?.trim() || null,
        isSystem: false,
      },
    });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'role.create',
      resource: 'Role',
      resourceId: role.id,
      metadata: { name, permissions, description: body.description ?? null },
    });

    return ok(role, { status: 201 });
  } catch (err) {
    console.error('[api/admin/roles POST] error:', err);
    return serverError('Failed to create role', String(err));
  }
}
