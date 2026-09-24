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
import { auditCreate } from '@/lib/audit-foundation';
import { can } from '@/lib/authorization';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

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
    const [user, error] = await requireAdmin();
    if (error) return error;

    // Check if user has the specific read permission
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

    // 4. Execute query via Data Adapter
    try {
      const result = await listResources(config, queryParams, { userId: user?.id ?? null });

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

  try {
    const item = await createResource(config, body, { userId: user?.id ?? null });

    // Audit
    if (config.audit?.enabled && item?.id) {
      await auditCreate(
        user?.id ?? null,
        config.audit.actions.find(a => a.includes('.create')) || `${config.key}.create`,
        config.audit.entityType,
        String(item.id),
        body,
        'Created via Universal Resource API',
      );
    }

    // STEP 15-B.5.4-C.2-P1: Invalidate Homepage cache for affected resources
    // Only fires for resources that have Homepage impact (listings, brands, buy-requests).
    // Other resources have no cache tags and are silently skipped.
    const cacheTags = getHomepageCacheTags(resourceKey);
    for (const tag of cacheTags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        // Per Cache Contract §11: invalidation failure must not block the mutation.
        // Log but don't throw — the mutation already succeeded.
        console.error(`[resources/${resourceKey}] revalidateTag('${tag}') failed:`, e);
      }
    }

    return NextResponse.json({ ok: true, data: item }, { status: 201 });
  } catch (err) {
    console.error(`[resources/${resourceKey}] POST error:`, err);
    return NextResponse.json(
      { error: 'Failed to create resource', details: (err as Error).message },
      { status: 500 },
    );
  }
}
