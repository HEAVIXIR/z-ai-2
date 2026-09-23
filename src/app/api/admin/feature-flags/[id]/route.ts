/**
 * HEAVIX Admin - Single feature flag operations
 * GET    /api/admin/feature-flags/[id]  - fetch one flag
 * PATCH  /api/admin/feature-flags/[id]  - update fields (also toggles)
 * DELETE /api/admin/feature-flags/[id]  - delete a flag
 */

import { db } from '@/lib/db';
import { ok, notFound, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_AUDIENCES = ['all', 'admins', 'internal'];

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const flag = await db.featureFlag.findUnique({ where: { id } });
    if (!flag) return notFound('feature flag not found');
    return ok(flag);
  } catch (err) {
    console.error('[api/admin/feature-flags/[id] GET] error:', err);
    return serverError('Failed to fetch feature flag', String(err));
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) return notFound('feature flag not found');

    const body = await parseJsonBody<{
      name?: string;
      description?: string | null;
      enabled?: boolean;
      value?: string | null;
      audience?: string;
    }>(req);
    if (!body) return fail('invalid JSON body', 400);

    const data: Prisma.FeatureFlagUpdateInput = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.value !== undefined) data.value = body.value?.trim() || null;
    if (body.audience !== undefined) {
      if (!VALID_AUDIENCES.includes(body.audience)) return fail('invalid audience', 400);
      data.audience = body.audience;
    }

    const updated = await db.featureFlag.update({ where: { id }, data });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'feature_flag.update',
      resource: 'FeatureFlag',
      resourceId: id,
      metadata: {
        before: { enabled: existing.enabled, value: existing.value, audience: existing.audience },
        after: { enabled: updated.enabled, value: updated.value, audience: updated.audience },
      },
    });

    return ok(updated);
  } catch (err) {
    console.error('[api/admin/feature-flags/[id] PATCH] error:', err);
    return serverError('Failed to update feature flag', String(err));
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) return notFound('feature flag not found');

    await db.featureFlag.delete({ where: { id } });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'feature_flag.delete',
      resource: 'FeatureFlag',
      resourceId: id,
      metadata: { key: existing.key, name: existing.name },
    });

    return ok({ id, deleted: true });
  } catch (err) {
    console.error('[api/admin/feature-flags/[id] DELETE] error:', err);
    return serverError('Failed to delete feature flag', String(err));
  }
}
