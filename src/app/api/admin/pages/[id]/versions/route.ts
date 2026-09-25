/**
 * HEAVIX — Page Builder: Create New Draft Version
 * POST /api/admin/pages/:id/versions — create new draft version
 *
 * Track D P0 Fix: POST_version was dead code in [id]/route.ts (never exported).
 * This file provides the proper POST export so new draft versions can be created.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { validateLayout } from '@/lib/admin/page-builder/widget-registry';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/* POST /api/admin/pages/:id/versions
   Body: { layout: {...}, changeLog?: string }
   Creates a new DRAFT version of the page.
*/
export async function POST(req: NextRequest, { params }: Params) {
  const { id: pageId } = await params;

  // Auth: admin only
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

  // Validate page exists
  const page = await db.adminPage.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  // Parse + validate layout
  const body = await req.json().catch(() => null);
  if (!body?.layout) return NextResponse.json({ error: 'layout required' }, { status: 400 });

  const validation = validateLayout(body.layout);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid layout', details: validation.errors }, { status: 400 });
  }

  // Create new draft version
  const latestVersion = await db.adminPageVersion.findFirst({
    where: { pageId },
    orderBy: { version: 'desc' },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const version = await db.adminPageVersion.create({
    data: {
      pageId,
      version: nextVersion,
      status: 'DRAFT',
      layout: body.layout,
      changeLog: body.changeLog || `Version ${nextVersion}`,
      createdBy: user.id,
    },
  });

  // Audit
  const h = await headers();
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'page.version.create',
    entityType: 'AdminPage',
    entityId: pageId,
    after: { version: nextVersion, changeLog: body.changeLog },
    reason: `Created version ${nextVersion}`,
    ip: h.get('x-forwarded-for') || null,
    userAgent: h.get('user-agent') || null,
  });

  return NextResponse.json({ ok: true, data: version }, { status: 201 });
}
