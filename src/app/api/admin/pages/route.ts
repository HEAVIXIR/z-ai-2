/**
 * HEAVIX — STEP 14: Page API
 * GET    /api/admin/pages          — list pages
 * POST   /api/admin/pages          — create page (with initial draft version)
 * GET    /api/admin/pages/:id      — get page with versions
 * PATCH  /api/admin/pages/:id      — update page metadata
 * DELETE /api/admin/pages/:id      — delete page (soft archive)
 * POST   /api/admin/pages/:id/versions    — create new draft version
 * POST   /api/admin/pages/:id/publish      — publish a version (with audit)
 * POST   /api/admin/pages/:id/rollback     — rollback to a previous version (with audit)
 * GET    /api/admin/widgets        — list widget registry
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { can } from '@/lib/authorization';
import { validateLayout } from '@/lib/admin/page-builder/widget-registry';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET — list all pages
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const pages = await db.adminPage.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { versions: true } } },
  });

  return NextResponse.json({ ok: true, data: pages });
}

// POST — create a new page with initial draft version
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.key || !body?.title) {
    return NextResponse.json({ error: 'key and title required' }, { status: 400 });
  }

  // Check key uniqueness
  const existing = await db.adminPage.findUnique({ where: { key: body.key } });
  if (existing) return NextResponse.json({ error: `Page with key "${body.key}" already exists` }, { status: 409 });

  // Validate initial layout if provided
  const layout = body.layout || { sections: [] };
  const validation = validateLayout(layout);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid layout', details: validation.errors }, { status: 400 });
  }

  // Create page + initial draft version
  const page = await db.adminPage.create({
    data: {
      key: body.key,
      title: body.title,
      slug: body.slug || body.key,
      pageType: body.pageType || 'CUSTOM',
      status: 'DRAFT',
      createdBy: user.id,
      updatedBy: user.id,
      versions: {
        create: {
          version: 1,
          status: 'DRAFT',
          layout: layout,
          changeLog: 'Initial draft',
          createdBy: user.id,
        },
      },
    },
    include: { versions: true },
  });

  // Audit
  const h = await headers();
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'page.create',
    entityType: 'AdminPage',
    entityId: page.id,
    after: { key: page.key, title: page.title, pageType: page.pageType },
    reason: `Created page "${body.title}"`,
    ip: h.get('x-forwarded-for') || null,
    userAgent: h.get('user-agent') || null,
  });

  return NextResponse.json({ ok: true, data: page }, { status: 201 });
}
