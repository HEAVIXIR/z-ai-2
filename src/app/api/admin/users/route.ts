/**
 * HEAVIX Admin - Users list & create
 * GET  /api/admin/users        - list with pagination, search, filters
 * POST /api/admin/users        - create a new user
 */

import { db } from '@/lib/db';
import { ok, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST'];
const VALID_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'PENDING', 'INVITED', 'DELETED'];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
    const search = url.searchParams.get('search')?.trim() || '';
    const roleFilter = url.searchParams.get('role') as UserRole | null;
    const statusFilter = url.searchParams.get('status') as UserStatus | null;
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
    const sort = url.searchParams.get('sort') ?? 'createdAt';
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    const where: Prisma.UserWhereInput = {};
    if (!includeDeleted) where.deletedAt = null;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (roleFilter && VALID_ROLES.includes(roleFilter)) where.role = roleFilter;
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) where.status = statusFilter;

    const [total, items] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: sort === 'email'
          ? { email: order }
          : sort === 'name'
            ? { name: order }
            : sort === 'lastLoginAt'
              ? { lastLoginAt: { sort: order, nulls: 'last' } }
              : { createdAt: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('[api/admin/users GET] error:', err);
    return serverError('Failed to list users', String(err));
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<{
      email?: string;
      name?: string | null;
      role?: UserRole;
      status?: UserStatus;
    }>(req);

    if (!body?.email) return fail('email is required', 400);
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('invalid email format', 400);

    const role: UserRole = body.role && VALID_ROLES.includes(body.role) ? body.role : 'MEMBER';
    const status: UserStatus = body.status && VALID_STATUSES.includes(body.status) ? body.status : 'ACTIVE';

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return fail(`email already exists: ${email}`, 409);

    const user = await db.user.create({
      data: {
        email,
        name: body.name?.trim() || null,
        role,
        status,
      },
    });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'user.create',
      resource: 'User',
      resourceId: user.id,
      metadata: { email, role, status, name: body.name ?? null },
    });

    return ok(user, { status: 201 });
  } catch (err) {
    console.error('[api/admin/users POST] error:', err);
    return serverError('Failed to create user', String(err));
  }
}
