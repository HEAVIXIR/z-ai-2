/**
 * HEAVIX — STEP 09: Export API
 * GET /api/admin/resources/:resource/export?format=csv&fields=title,status
 *
 * Exports resource data as CSV or JSON.
 * Uses separate export permission (canExport) — NOT just read.
 */

import { NextResponse, type NextRequest } from 'next/server';
import '@/lib/admin/resource-index';
import { executeExport } from '@/lib/admin/bulk-export-engine';
import { requireAdmin } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { resource: resourceKey } = await params;

  // Auth
  const [user, authError] = await requireAdmin();
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
