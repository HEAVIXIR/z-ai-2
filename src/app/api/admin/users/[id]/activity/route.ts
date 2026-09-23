/**
 * HEAVIX Admin - User activity timeline
 * GET /api/admin/users/[id]/activity
 *
 * Returns the recent audit log entries for a specific user (as actor or resource).
 */

import { db } from '@/lib/db';
import { ok, notFound, serverError } from '@/lib/admin/response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));

    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
    if (!user) return notFound('user not found');

    // Find audit logs where the user is the actor OR the resourceId (e.g., user.update)
    const logs = await db.auditLog.findMany({
      where: {
        OR: [
          { actorId: id },
          { resourceId: id, resource: 'User' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Stats summary
    const total = logs.length;
    const successes = logs.filter((l) => l.status === 'success').length;
    const failures = logs.filter((l) => l.status === 'failure').length;
    const lastActivity = logs[0]?.createdAt ?? null;

    return ok({
      user,
      logs,
      summary: {
        total,
        successes,
        failures,
        lastActivity,
      },
    });
  } catch (err) {
    console.error('[api/admin/users/[id]/activity] error:', err);
    return serverError('Failed to load user activity', String(err));
  }
}
