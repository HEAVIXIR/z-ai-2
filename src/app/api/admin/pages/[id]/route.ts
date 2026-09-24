/**
 * HEAVIX — STEP 14: Single Page API
 * GET    /api/admin/pages/:id              — get page with versions
 * PATCH  /api/admin/pages/:id              — update page metadata
 * DELETE /api/admin/pages/:id              — archive page
 * POST   /api/admin/pages/:id/versions     — create new draft version
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { validateLayout } from '@/lib/admin/page-builder/widget-registry';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

// GET — page with versions
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const page = await db.adminPage.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true, data: page });
}

// PATCH — update page metadata (NOT layout — use versions for that)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const allowed = ['title', 'slug', 'pageType', 'seoTitle', 'seoDescription', 'seoCanonical', 'seoOgImage', 'seoRobotsIndex', 'seoRobotsFollow', 'scheduledPublishAt', 'scheduledUnpublishAt'];
  const data: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  data.updatedBy = user.id;

  const page = await db.adminPage.update({ where: { id }, data });
  return NextResponse.json({ ok: true, data: page });
}

// DELETE — archive (soft delete)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const before = await db.adminPage.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const page = await db.adminPage.update({ where: { id }, data: { status: 'ARCHIVED', updatedBy: user.id } });

  const h = await headers();
  await logAudit({
    actorId: user.id, actorType: 'ADMIN', action: 'page.archive',
    entityType: 'AdminPage', entityId: id,
    before: { status: before.status }, after: { status: 'ARCHIVED' },
    reason: `Archived page "${before.key}"`,
    ip: h.get('x-forwarded-for') || null, userAgent: h.get('user-agent') || null,
  });

  return NextResponse.json({ ok: true, data: { id, status: 'ARCHIVED' } });
}

// POST /:id/versions — create new draft version
export async function POST_version(req: NextRequest, pageId: string, userId: string) {
  const body = await req.json().catch(() => null);
  if (!body?.layout) return NextResponse.json({ error: 'layout required' }, { status: 400 });

  const validation = validateLayout(body.layout);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid layout', details: validation.errors }, { status: 400 });
  }

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
      createdBy: userId,
    },
  });

  const h = await headers();
  await logAudit({
    actorId: userId, actorType: 'ADMIN', action: 'page.version.create',
    entityType: 'AdminPage', entityId: pageId,
    after: { version: nextVersion, changeLog: body.changeLog },
    reason: `Created version ${nextVersion}`,
    ip: h.get('x-forwarded-for') || null, userAgent: h.get('user-agent') || null,
  });

  return NextResponse.json({ ok: true, data: version }, { status: 201 });
}
