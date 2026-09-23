/**
 * HEAVIX Admin - Feature flags
 * GET  /api/admin/feature-flags  - list all flags
 * POST /api/admin/feature-flags  - create a new flag
 */

import { db } from '@/lib/db';
import { ok, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_AUDIENCES = ['all', 'admins', 'internal'];

export async function GET() {
  try {
    const flags = await db.featureFlag.findMany({
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
    });
    return ok({ items: flags });
  } catch (err) {
    console.error('[api/admin/feature-flags GET] error:', err);
    return serverError('Failed to list feature flags', String(err));
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<{
      key?: string;
      name?: string;
      description?: string | null;
      enabled?: boolean;
      value?: string | null;
      audience?: string;
    }>(req);

    if (!body?.key || !body?.name) return fail('key and name are required', 400);
    const key = body.key.trim();
    const name = body.name.trim();
    if (!/^[a-z][a-z0-9_.-]*$/i.test(key)) {
      return fail('key must start with a letter and contain only [a-zA-Z0-9_.-]', 400);
    }

    const existing = await db.featureFlag.findUnique({ where: { key } });
    if (existing) return fail(`flag with key "${key}" already exists`, 409);

    const audience = body.audience && VALID_AUDIENCES.includes(body.audience)
      ? body.audience
      : 'all';

    const flag = await db.featureFlag.create({
      data: {
        key,
        name,
        description: body.description?.trim() || null,
        enabled: body.enabled ?? false,
        value: body.value?.trim() || null,
        audience,
      },
    });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'feature_flag.create',
      resource: 'FeatureFlag',
      resourceId: flag.id,
      metadata: { key, name, enabled: flag.enabled, audience },
    });

    return ok(flag, { status: 201 });
  } catch (err) {
    console.error('[api/admin/feature-flags POST] error:', err);
    return serverError('Failed to create feature flag', String(err));
  }
}
