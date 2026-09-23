/**
 * HEAVIX Admin - Audit logs
 * GET /api/admin/audit-logs - paginated, filterable audit log
 */

import { db } from '@/lib/db';
import { ok, serverError } from '@/lib/admin/response';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10)));
    const search = url.searchParams.get('search')?.trim() || '';
    const actionFilter = url.searchParams.get('action')?.trim() || '';
    const resourceFilter = url.searchParams.get('resource')?.trim() || '';
    const statusFilter = url.searchParams.get('status')?.trim() || '';
    const since = url.searchParams.get('since');
    const until = url.searchParams.get('until');

    const where: Prisma.AuditLogWhereInput = {};
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { actorEmail: { contains: search, mode: 'insensitive' } },
        { resourceId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (actionFilter) where.action = { contains: actionFilter, mode: 'insensitive' };
    if (resourceFilter) where.resource = { equals: resourceFilter };
    if (statusFilter) where.status = statusFilter;
    if (since || until) {
      where.createdAt = {};
      if (since) where.createdAt.gte = new Date(since);
      if (until) where.createdAt.lte = new Date(until);
    }

    const [total, items] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { id: true, email: true, name: true } } },
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
    console.error('[api/admin/audit-logs GET] error:', err);
    return serverError('Failed to list audit logs', String(err));
  }
}
