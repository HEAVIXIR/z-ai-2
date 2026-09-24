/**
 * HEAVIX — STEP 14: Rollback Page Version
 * POST /api/admin/pages/:id/rollback
 *
 * Body: { versionId: "..." }
 *
 * V2.3: Rollback publishes a PREVIOUS version. Never deletes anything.
 * V2.3: Audit required.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
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

  // Fetch target version
  const targetVersion = await db.adminPageVersion.findUnique({ where: { id: body.versionId } });
  if (!targetVersion || targetVersion.pageId !== pageId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Fetch current page
  const page = await db.adminPage.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const previousVersionId = page.publishedVersionId;

  // Archive current published version
  if (previousVersionId && previousVersionId !== body.versionId) {
    await db.adminPageVersion.update({
      where: { id: previousVersionId },
      data: { status: 'ARCHIVED' },
    });
  }

  // Re-publish the target version
  await db.adminPageVersion.update({
    where: { id: body.versionId },
    data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: user.id },
  });

  // Update page
  await db.adminPage.update({
    where: { id: pageId },
    data: { publishedVersionId: body.versionId, updatedBy: user.id },
  });

  // Audit
  const h = await headers();
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'page.rollback',
    entityType: 'AdminPage',
    entityId: pageId,
    before: { publishedVersionId: previousVersionId },
    after: { publishedVersionId: body.versionId, version: targetVersion.version },
    reason: body.reason || `Rolled back to version ${targetVersion.version}`,
    ip: h.get('x-forwarded-for') || null,
    userAgent: h.get('user-agent') || null,
  });

  return NextResponse.json({
    ok: true,
    data: { pageId, publishedVersionId: body.versionId, version: targetVersion.version, rolledBack: true },
  });
}
