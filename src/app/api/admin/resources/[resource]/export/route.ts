/**
 * HEAVIX — STEP 09: Export API
 * GET /api/admin/resources/:resource/export?format=csv&fields=title,status
 *
 * Exports resource data as CSV or JSON.
 * Uses separate export permission (canExport) — NOT just read.
 *
 * STEP 11.10 (Authorization Closure + BigInt fix):
 *   - Pass `exportPerm` to requireAdmin() so non-admin users WITH the
 *     resource's export permission can export (was bare requireAdmin()).
 *   - Look up the config to derive `exportPerm` (config.permissions.export
 *     || config.permissions.read) — matches the engine's policy.
 *   - BigInt JSON serialization fix (same monkey-patch as List/Detail
 *     routes): without it, exporting any resource with BigInt fields
 *     (Listing.price, Payment.amount, etc.) throws
 *     `TypeError: Do not know how to serialize a BigInt`.
 */

// STEP 16-D: BigInt JSON serialization fix.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString() + 'n';
};

import { NextResponse, type NextRequest } from 'next/server';
import '@/lib/admin/resource-index';
import { executeExport } from '@/lib/admin/bulk-export-engine';
import { requireAdmin } from '@/lib/admin-guard';
import { registry } from '@/lib/admin/resource-registry';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { resource: resourceKey } = await params;

  // STEP 11.10: Look up config to derive export permission (matches the
  // engine's canExport policy: prefer permissions.export, fall back to
  // permissions.read).
  const config = registry.get(resourceKey);
  if (!config) {
    return NextResponse.json(
      { error: `Unknown resource: "${resourceKey}"` },
      { status: 404 },
    );
  }
  const exportPerm = config.permissions.export || config.permissions.read;

  // STEP 11.10: Auth with the export permission (was bare requireAdmin()).
  // Non-admin users WITH the export permission can now export. Previously
  // they got 403 because requireAdmin() (no arg) required ADMIN role.
  const [user, authError] = await requireAdmin(exportPerm);
  if (authError) return authError;

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'csv') as 'csv' | 'json';
  const fields = url.searchParams.get('fields')?.split(',').filter(Boolean) || undefined;

  // Parse filters from query params (same as table)
  const filters: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!['format', 'fields', 'page', 'pageSize', 'search', 'sort'].includes(key) && value) {
      filters[key] = value;
    }
  }

  try {
    const result = await executeExport({
      resourceKey,
      format,
      fields,
      filters,
      ctx: { userId: user?.id ?? null },
    });

    // Return as downloadable file
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json';
    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Export-Row-Count': String(result.rowCount),
        'X-Export-Fields': result.fields.join(','),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Export failed', details: (err as Error).message },
      { status: 500 },
    );
  }
}
