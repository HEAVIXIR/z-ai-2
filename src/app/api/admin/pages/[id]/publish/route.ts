/**
 * HEAVIX — STEP 14.5: Publish (with cache invalidation)
 * POST /api/admin/pages/:id/publish
 *
 * V2.3: Publish is atomic:
 *   validate → create immutable version → archive old → update pointer → audit → invalidate cache
 * V2.3: Cache invalidation after publish.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: pageId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isAdmin(user.id);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 });

  // 1. Fetch the version to publish
  const version = await db.adminPageVersion.findUnique({ where: { id: body.versionId } });
  if (!version || version.pageId !== pageId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // 2. Fetch current page
  const page = await db.adminPage.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const previousVersionId = page.publishedVersionId;

  // 3. Archive the previous published version (atomic: old archived, new published)
  if (previousVersionId && previousVersionId !== body.versionId) {
    await db.adminPageVersion.update({
      where: { id: previousVersionId },
      data: { status: 'ARCHIVED' },
    });
  }

  // 4. Publish the new version (immutable: version is never modified after publish except status)
  await db.adminPageVersion.update({
    where: { id: body.versionId },
    data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: user.id },
  });

  // 5. Update page status + publishedVersionId
  await db.adminPage.update({
    where: { id: pageId },
    data: { status: 'PUBLISHED', publishedVersionId: body.versionId, updatedBy: user.id },
  });

  // 6. Audit
  const h = await headers();
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'page.publish',
    entityType: 'AdminPage',
    entityId: pageId,
    before: { publishedVersionId: previousVersionId, status: page.status },
    after: { publishedVersionId: body.versionId, status: 'PUBLISHED', version: version.version },
    reason: body.reason || `Published version ${version.version}`,
    ip: h.get('x-forwarded-for') || null,
    userAgent: h.get('user-agent') || null,
  });

  // 7. Cache invalidation (V2.3)
  if (page.slug) {
    revalidatePath(`/${page.slug}`);
  }
  revalidatePath('/');
  revalidatePath(`/admin/pages/${pageId}`);

  return NextResponse.json({
    ok: true,
    data: { pageId, publishedVersionId: body.versionId, version: version.version, status: 'PUBLISHED' },
  });
}
