// STEP 14.8-E: @ts-nocheck removed — Universal Engine must be type-safe.
/**
 * HEAVIX — STEP 06: Universal Resource API
 *
 * GET  /api/admin/resources/:resource     — list with filters/sort/pagination/search
 * POST /api/admin/resources/:resource     — create new resource
 *
 * This is the single API endpoint that serves ALL registered resources.
 * It uses the Resource Registry to look up the config, the Query Engine
 * to parse params, and the Data Adapter to execute queries.
 *
 * Security:
 *   - Resource must be registered
 *   - User must have the resource's read permission
 *   - Filters only use fields declared as filterable in config
 *   - No arbitrary queries from frontend
 */

// STEP 16-D: BigInt JSON serialization fix.
// Several Prisma models (Listing, BuyRequest, Deal, Payment, Order, Auction, etc.)
// use BigInt for currency/amount fields (price, budgetMin, budgetMax, agreedAmount,
// amount, etc.). JSON.stringify cannot serialize BigInt by default — it throws
// "TypeError: Do not know how to serialize a BigInt". This monkey-patches the
// BigInt.prototype.toJSON so all BigInt values are serialized as strings (with
// a trailing "n" suffix to disambiguate from numbers). This is a well-known
// workaround documented in the TC39 BigInt JSON proposal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString() + 'n';
};

import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import '@/lib/admin/resource-index'; // ensures all resources are registered
import { registry } from '@/lib/admin/resource-registry';
import { parseQueryParams } from '@/lib/admin/query/query-builder';
import { listResources, createResource } from '@/lib/admin/data-adapter';
import { filterReadableFieldsAsync } from '@/lib/admin/field-policy';
import { requireAdmin } from '@/lib/admin-guard';
import { validateResourcePayload } from '@/lib/admin/resource-validator';
import { auditCreate, auditMutation } from '@/lib/audit-foundation';
import { can, isAdmin } from '@/lib/authorization';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';
import type { TenantAccessContext } from '@/lib/admin/tenant-scope';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

// PR-SC-00: resolve the server-side tenant access context. The userId is
// the authenticated session user; isAdmin + hasModeratePerm are resolved
// via RBAC (never from the request body / query). Returns null if the
// user is not authenticated (caller already handled 401 via requireAdmin).
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

// ── GET: List resources ────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { resource: resourceKey } = await params;

  // 1. Look up resource config
  const config = registry.get(resourceKey);
  if (!config) {
    return NextResponse.json(
      { error: `Unknown resource: "${resourceKey}"` },
      { status: 404 },
    );
  }

  // 2. Check read permission
  const readPerm = config.permissions.read;
  if (readPerm) {
    const [user, error] = await requireAdmin(readPerm);
    if (error) return error;

    const hasReadPerm = await can(user?.id ?? null, readPerm);
    if (!hasReadPerm) {
      return NextResponse.json(
        { error: `Forbidden: requires "${readPerm}"` },
        { status: 403 },
      );
    }

    // 3. Parse query params
    const url = new URL(req.url);
    const queryParams = parseQueryParams(url.searchParams, config);

    // PR-SC-00: resolve tenant context from the authenticated session.
    const tenantCtx = await resolveTenantCtx(user?.id ?? null, config);

    // 4. Execute query via Data Adapter (with tenant scoping)
    try {
      const result = await listResources(config, queryParams, { userId: user?.id ?? null }, tenantCtx);

      // 5. Apply field policy (filter restricted fields)
      const filteredItems = await filterReadableFieldsAsync(
        config,
        result.items as Record<string, unknown>[],
        user?.id ?? null,
      );

      return NextResponse.json({
        ok: true,
        data: {
          items: filteredItems,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (err) {
      console.error(`[resources/${resourceKey}] GET error:`, err);
      return NextResponse.json(
        { error: 'Failed to list resources' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: 'Resource has no read permission defined' },
    { status: 500 },
  );
}

// ── POST: Create resource ──────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { resource: resourceKey } = await params;

  const config = registry.get(resourceKey);
  if (!config) {
    return NextResponse.json({ error: `Unknown resource: "${resourceKey}"` }, { status: 404 });
  }

  // Check create permission
  const createPerm = config.permissions.create;
  if (!createPerm) {
    return NextResponse.json({ error: 'Create not supported for this resource' }, { status: 400 });
  }

  const [user, error] = await requireAdmin(createPerm);
  if (error) return error;

  // Parse body
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // P1 SERVER-SIDE VALIDATION: Validate payload against resource field config
  const validation = validateResourcePayload(config, body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 422 },
    );
  }

  // PR-SC-00: resolve tenant context for create (enforces owner).
  const tenantCtx = await resolveTenantCtx(user?.id ?? null, config);

  try {
    const auditResult = await auditMutation(
      {
        actorId: user?.id ?? null,
        action: config.audit?.actions.find(a => a.includes('.create')) || `${config.key}.create`,
        entityType: config.audit?.entityType || resourceKey,
        entityId: null, // unknown until after create; after-state captures the new entity
        reason: 'Created via Universal Resource API',
        captureSnapshot: false, // no before-state for creates
        database: config.database, // P1: route snapshot capture to the right Prisma client
      },
      async () => {
        return await createResource(config, body, { userId: user?.id ?? null }, tenantCtx);
      },
    );
    const item = auditResult.result;

    // STEP 15-B.5.4-C.2-P1: Invalidate Homepage cache for affected resources
    const cacheTags = getHomepageCacheTags(resourceKey);
    for (const tag of cacheTags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        console.error(`[resources/${resourceKey}] revalidateTag('${tag}') failed:`, e);
      }
    }

    return NextResponse.json({ ok: true, data: item }, { status: 201 });
  } catch (err) {
    // P0-1 / PR-SC-00: Field write permission OR tenant-scope rejection → 403 (not 500)
    const errorWithStatus = err as Error & { statusCode?: number; rejectedField?: string; requiredPermission?: string };
    if (errorWithStatus.statusCode === 403) {
      console.error(`[resources/${resourceKey}] POST forbidden:`, err);
      return NextResponse.json(
        {
          error: errorWithStatus.message,
          field: errorWithStatus.rejectedField,
          requiredPermission: errorWithStatus.requiredPermission,
        },
        { status: 403 },
      );
    }
    console.error(`[resources/${resourceKey}] POST error:`, err);
    return NextResponse.json(
      { error: 'Failed to create resource', details: (err as Error).message },
      { status: 500 },
    );
  }
}
