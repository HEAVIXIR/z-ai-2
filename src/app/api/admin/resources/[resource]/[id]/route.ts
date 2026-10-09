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
import { filterReadableFieldsAsync } from '@/lib/admin/field-policy';
import { validateResourcePayload } from '@/lib/admin/resource-validator';
import { requireAdmin } from '@/lib/admin-guard';
import { can, isAdmin } from '@/lib/authorization';
import { auditMutation, auditDelete } from '@/lib/audit-foundation';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';
import type { TenantAccessContext } from '@/lib/admin/tenant-scope';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string; id: string }> };

// PR-SC-00: resolve server-side tenant access context (mirrors [resource]/route.ts).
async function resolveTenantCtx(
  userId: string | null,
  config: { ownership?: { moderatePermission?: string } },
): Promise<TenantAccessContext> {
  const admin = userId ? await isAdmin(userId) : false;
  let hasModeratePerm = false;
  if (userId && config.ownership?.moderatePermission) {
    hasModeratePerm = await can(userId, config.ownership.moderatePermission);
  }
  return { userId, isAdmin: admin, hasModeratePerm };
}

// ── GET: Single resource ───────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const readPerm = config.permissions.read;
  if (!readPerm) return NextResponse.json({ error: 'No read permission' }, { status: 500 });

  const [user, error] = await requireAdmin(readPerm);
  if (error) return error;

  const hasReadPerm = await can(user?.id ?? null, readPerm);
  if (!hasReadPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // PR-SC-00: tenant-scoped fetch — non-owners get 404.
  const tenantCtx = await resolveTenantCtx(user?.id ?? null, config);

  try {
    const item = await getResource(config, id, { userId: user?.id ?? null }, tenantCtx);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // P0-2 HARDENING: Apply field-level read filtering (same as List route).
    const [filteredItem] = await filterReadableFieldsAsync(
      config,
      [item as Record<string, unknown>],
      user?.id ?? null,
    );

    return NextResponse.json({ ok: true, data: filteredItem });
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

  // P1 SERVER-SIDE VALIDATION
  const validation = validateResourcePayload(config, body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 422 },
    );
  }

  // PR-SC-00: tenant-scoped update — non-owners get 404.
  const tenantCtx = await resolveTenantCtx(user?.id ?? null, config);

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
        database: config.database,
      },
      async () => {
        return await updateResource(config, id, body, { userId: user?.id ?? null }, tenantCtx);
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
    const errorWithStatus = err as Error & { statusCode?: number; rejectedField?: string; requiredPermission?: string };
    // PR-SC-00: tenant-scope rejection → 404 (not-found, don't leak existence)
    if (errorWithStatus.statusCode === 404) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // P0-1 / PR-SC-00: field-write OR ownership-reassignment rejection → 403
    if (errorWithStatus.statusCode === 403) {
      console.error(`[resources/${resourceKey}] PATCH forbidden:`, err);
      return NextResponse.json(
        {
          error: errorWithStatus.message,
          field: errorWithStatus.rejectedField,
          requiredPermission: errorWithStatus.requiredPermission,
        },
        { status: 403 },
      );
    }
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

  // PR-SC-00: tenant-scoped delete — non-owners get 404.
  const tenantCtx = await resolveTenantCtx(user?.id ?? null, config);

  try {
    await auditMutation(
      {
        actorId: user?.id ?? null,
        action: `${config.key}.delete`,
        entityType: config.audit?.entityType || resourceKey,
        entityId: id,
        reason: 'Deleted via Universal Resource API',
        captureSnapshot: true,
        beforeModel: config.model,
        database: config.database,
      },
      async () => {
        // PR-SC-00: pre-check existence under tenant filter (return 404 if not found / not owner).
        const existing = await getResource(config, id, { userId: user?.id ?? null }, tenantCtx);
        if (!existing) {
          const notFound = new Error('Not found') as Error & { statusCode: number };
          notFound.statusCode = 404;
          throw notFound;
        }
        await deleteResource(config, id, tenantCtx);
        return { id, deleted: true };
      },
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
    const errorWithStatus = err as Error & { statusCode?: number };
    if (errorWithStatus.statusCode === 404) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete', details: (err as Error).message }, { status: 500 });
  }
}
