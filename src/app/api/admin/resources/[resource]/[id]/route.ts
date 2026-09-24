/**
 * HEAVIX — STEP 06: Universal Resource API — Single Item
 *
 * GET    /api/admin/resources/:resource/:id  — get single resource
 * PATCH  /api/admin/resources/:resource/:id  — update resource
 * DELETE /api/admin/resources/:resource/:id  — delete resource
 */

// STEP 16-D: BigInt JSON serialization fix (same as [resource]/route.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString() + 'n';
};

import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import { getResource, updateResource, deleteResource } from '@/lib/admin/data-adapter';
import { requireAdmin } from '@/lib/admin-guard';
import { can } from '@/lib/authorization';
import { auditMutation, auditDelete } from '@/lib/audit-foundation';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string; id: string }> };

// ── GET: Single resource ───────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const readPerm = config.permissions.read;
  if (!readPerm) return NextResponse.json({ error: 'No read permission' }, { status: 500 });

  const [user, error] = await requireAdmin();
  if (error) return error;

  const hasReadPerm = await can(user?.id ?? null, readPerm);
  if (!hasReadPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const item = await getResource(config, id, { userId: user?.id ?? null });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: item });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// ── PATCH: Update resource ─────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const updatePerm = config.permissions.update;
  if (!updatePerm) return NextResponse.json({ error: 'No update permission' }, { status: 400 });

  const [user, error] = await requireAdmin(updatePerm);
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  try {
    const result = await auditMutation(
      {
        actorId: user?.id ?? null,
        action: `${config.key}.update`,
        entityType: config.audit?.entityType || resourceKey,
        entityId: id,
        reason: 'Updated via Universal Resource API',
        captureSnapshot: true,
        beforeModel: config.model,
        afterModel: config.model,
      },
      async () => {
        return await updateResource(config, id, body, { userId: user?.id ?? null });
      },
    );

    // STEP 15-B.5.4-C.2-P1: Invalidate Homepage cache for affected resources
    const cacheTags = getHomepageCacheTags(resourceKey);
    for (const tag of cacheTags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        console.error(`[resources/${resourceKey}] revalidateTag('${tag}') failed:`, e);
      }
    }

    return NextResponse.json({ ok: true, data: result.result });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update', details: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE: Delete resource ───────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const deletePerm = config.permissions.delete;
  if (!deletePerm) return NextResponse.json({ error: 'No delete permission' }, { status: 400 });

  const [user, error] = await requireAdmin(deletePerm);
  if (error) return error;

  try {
    // Capture before-state for audit
    const before = await getResource(config, id, { userId: user?.id ?? null });
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await deleteResource(config, id);

    await auditDelete(
      user?.id ?? null,
      `${config.key}.delete`,
      config.audit?.entityType || resourceKey,
      id,
      before,
      'Deleted via Universal Resource API',
    );

    // STEP 15-B.5.4-C.2-P1: Invalidate Homepage cache for affected resources
    const cacheTags = getHomepageCacheTags(resourceKey);
    for (const tag of cacheTags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        console.error(`[resources/${resourceKey}] revalidateTag('${tag}') failed:`, e);
      }
    }

    return NextResponse.json({ ok: true, data: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete', details: (err as Error).message }, { status: 500 });
  }
}
