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

  // STEP 11.10: pass readPerm to requireAdmin so non-admin users WITH the
  // resource read permission can access Detail view. See [resource]/route.ts
  // GET handler for full rationale.
  const [user, error] = await requireAdmin(readPerm);
  if (error) return error;

  const hasReadPerm = await can(user?.id ?? null, readPerm);
  if (!hasReadPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const item = await getResource(config, id, { userId: user?.id ?? null });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // P0-2 HARDENING: Apply field-level read filtering (same as List route).
    // Sensitive fields with `permissions.read` are removed if user lacks
    // the required field-level read permission. This makes Detail route
    // consistent with List route — Detail must not expose fields that
    // List wouldn't show.
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

  // P1 SERVER-SIDE VALIDATION: Validate payload against resource field config
  // (required, type, enum, min/max, string constraints, pattern)
  // This is server-authoritative — client validation is UX only.
  const validation = validateResourcePayload(config, body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 422 },
    );
  }

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
        database: config.database, // P1: route snapshot capture to the right Prisma client
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
    // P0-1: Field write permission rejection → 403 (not 500)
    const errorWithStatus = err as Error & { statusCode?: number; rejectedField?: string; requiredPermission?: string };
    if (errorWithStatus.statusCode === 403) {
      console.error(`[resources/${resourceKey}] PATCH field-write forbidden:`, err);
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

  try {
    // P0-3 HARDENING: Wrap deleteResource inside auditMutation so:
    //   - If mutation succeeds → audit logged (with before-state captured via captureSnapshot)
    //   - If mutation fails → audit logged (.failed suffix)
    //   - Audit captures Who/What/When/Where/Before/After(null)/Why
    // This makes audit enforcement CENTRAL for Universal Resource API DELETE,
    // consistent with PATCH (which already used auditMutation).
    // Note: before-state is captured automatically via captureSnapshot + beforeModel.
    await auditMutation(
      {
        actorId: user?.id ?? null,
        action: `${config.key}.delete`,
        entityType: config.audit?.entityType || resourceKey,
        entityId: id,
        reason: 'Deleted via Universal Resource API',
        captureSnapshot: true,
        beforeModel: config.model,
        // No afterModel — after-state will be null (deleted)
        database: config.database, // P1: route snapshot capture to the right Prisma client
      },
      async () => {
        // Verify existence before delete (return 404 if not found)
        const existing = await getResource(config, id, { userId: user?.id ?? null });
        if (!existing) {
          const notFound = new Error('Not found') as Error & { statusCode: number };
          notFound.statusCode = 404;
          throw notFound;
        }
        await deleteResource(config, id);
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
