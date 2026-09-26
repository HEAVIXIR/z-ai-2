/**
 * HEAVIX — STEP 14.5: Rollback (FIXED — creates NEW version, never overwrites)
 * POST /api/admin/pages/:id/rollback
 *
 * V2.3: Rollback creates a NEW version with the same layout as the target.
 * The old published version is archived, not deleted.
 * The target version itself is NOT modified (immutable).
 *
 * V2.3: Audit required (before/after/reason).
 * V2.3: Cache invalidation after rollback.
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

  // 1. Fetch the target version (the one to rollback TO)
  const targetVersion = await db.adminPageVersion.findUnique({ where: { id: body.versionId } });
  if (!targetVersion || targetVersion.pageId !== pageId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // 2. Fetch current page
  const page = await db.adminPage.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const previousPublishedVersionId = page.publishedVersionId;
  const previousVersion = previousPublishedVersionId
    ? await db.adminPageVersion.findUnique({ where: { id: previousPublishedVersionId } })
    : null;

  // 3. Get the latest version number
  const latestVersion = await db.adminPageVersion.findFirst({
    where: { pageId },
    orderBy: { version: 'desc' },
  });
  const newVersionNumber = (latestVersion?.version ?? 0) + 1;

  // 4. Create a NEW version with the same layout as the target (V2.3: immutable, never overwrite)
  const newVersion = await db.adminPageVersion.create({
    data: {
      pageId,
      version: newVersionNumber,
      status: 'PUBLISHED',
      layout: targetVersion.layout as any, // copy layout from target version
      changeLog: `Rollback to version ${targetVersion.version}`,
      createdBy: user.id,
      publishedAt: new Date(),
      publishedBy: user.id,
    },
  });

  // 5. Archive the current published version (if exists and different)
  if (previousPublishedVersionId && previousPublishedVersionId !== body.versionId) {
    await db.adminPageVersion.update({
      where: { id: previousPublishedVersionId },
      data: { status: 'ARCHIVED' },
    });
  }

  // 6. Update page to point to the new version
  await db.adminPage.update({
    where: { id: pageId },
    data: { publishedVersionId: newVersion.id, status: 'PUBLISHED', updatedBy: user.id },
  });

  // 7. Audit (before/after/reason)
  const h = await headers();
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'page.rollback',
    entityType: 'AdminPage',
    entityId: pageId,
    before: {
      publishedVersionId: previousPublishedVersionId,
      publishedVersion: previousVersion?.version,
    },
    after: {
      publishedVersionId: newVersion.id,
      publishedVersion: newVersionNumber,
      rolledBackFrom: targetVersion.version,
    },
    reason: body.reason || `Rolled back to version ${targetVersion.version} (created as v${newVersionNumber})`,
    ip: h.get('x-forwarded-for') || null,
    userAgent: h.get('user-agent') || null,
  });

  // 8. Cache invalidation
  if (page.slug) {
    revalidatePath(`/${page.slug}`);
    revalidatePath('/');
  }
  revalidatePath(`/admin/pages/${pageId}`);

  return NextResponse.json({
    ok: true,
    data: {
      pageId,
      newVersionId: newVersion.id,
      newVersionNumber,
      rolledBackFrom: targetVersion.version,
      status: 'PUBLISHED',
    },
  });
}
