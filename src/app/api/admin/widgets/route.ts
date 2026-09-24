/**
 * HEAVIX — STEP 14: Widget Registry API
 * GET /api/admin/widgets — list all registered widgets + data sources
 *
 * Returns widget definitions + data source definitions from the
 * code-based registry (NOT from DB — for security).
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { listWidgets, listDataSources } from '@/lib/admin/page-builder/widget-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({
    ok: true,
    data: {
      widgets: listWidgets(),
      dataSources: listDataSources(),
    },
  });
}
