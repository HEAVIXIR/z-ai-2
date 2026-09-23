/**
 * HEAVIX Admin - Single user operations
 * GET    /api/admin/users/[id]  - fetch one user
 * PATCH  /api/admin/users/[id]  - update (role, status, name, etc.)
 * DELETE /api/admin/users/[id]  - soft delete (sets deletedAt)
 */

import { db } from '@/lib/db';
import { ok, notFound, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST'];
const VALID_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'PENDING', 'INVITED', 'DELETED'];

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await db.user.findUnique({ where: { id }, include: { posts: true } });
    if (!user) return notFound('user not found');
    return ok(user);
  } catch (err) {
    console.error('[api/admin/users/[id] GET] error:', err);
    return serverError('Failed to fetch user', String(err));
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return notFound('user not found');

    const body = await parseJsonBody<{
      name?: string | null;
      role?: UserRole;
      status?: UserStatus;
      avatarUrl?: string | null;
    }>(req);
    if (!body) return fail('invalid JSON body', 400);

    const data: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) data.name = body.name?.trim() || null;
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role)) return fail('invalid role', 400);
      data.role = body.role;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) return fail('invalid status', 400);
      data.status = body.status;
    }
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl?.trim() || null;

    const updated = await db.user.update({ where: { id }, data });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'user.update',
      resource: 'User',
      resourceId: id,
      metadata: { before: { role: existing.role, status: existing.status, name: existing.name }, after: { role: updated.role, status: updated.status, name: updated.name } },
    });

    return ok(updated);
  } catch (err) {
    console.error('[api/admin/users/[id] PATCH] error:', err);
    return serverError('Failed to update user', String(err));
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return notFound('user not found');

    // Soft delete: set deletedAt and status
    const updated = await db.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'user.delete',
      resource: 'User',
      resourceId: id,
      metadata: { email: existing.email, softDelete: true },
    });

    return ok({ id, deleted: true, deletedAt: updated.deletedAt });
  } catch (err) {
    console.error('[api/admin/users/[id] DELETE] error:', err);
    return serverError('Failed to delete user', String(err));
  }
}
