/**
 * HEAVIX — Page Builder rollback.
 * Rollback creates a fresh immutable version; version creation, archive,
 * page pointer update, and audit record commit atomically.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { revalidatePath } from 'next/cache';
import { checkCsrf } from '@/lib/csrf';
import { readBoundedJson } from '@/lib/read-bounded-json';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: pageId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  const parsed = await readBoundedJson<Record<string, unknown>>(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.versionId !== 'string' || !body.versionId.trim()) {
    return NextResponse.json({ error: 'versionId required' }, { status: 400 });
  }
  // Keep the validated identifier in a narrowed local before entering the async transaction callback.
  const versionId = body.versionId as string;

  try {
    const result = await db.$transaction(async (tx) => {
      const [page, targetVersion] = await Promise.all([
        tx.adminPage.findUnique({ where: { id: pageId } }),
        tx.adminPageVersion.findUnique({ where: { id: versionId } }),
      ]);
      if (!page) return { error: 'PAGE_NOT_FOUND' as const };
      if (!targetVersion || targetVersion.pageId !== pageId) return { error: 'VERSION_NOT_FOUND' as const };

      const previousPublishedVersionId = page.publishedVersionId;
      const previousVersion = previousPublishedVersionId
        ? await tx.adminPageVersion.findUnique({ where: { id: previousPublishedVersionId } })
        : null;
      const latestVersion = await tx.adminPageVersion.findFirst({
        where: { pageId },
        orderBy: { version: 'desc' },
      });
      const newVersionNumber = (latestVersion?.version ?? 0) + 1;

      const newVersion = await tx.adminPageVersion.create({
        data: {
          pageId,
          version: newVersionNumber,
          status: 'PUBLISHED',
          layout: targetVersion.layout as any,
          changeLog: `Rollback to version ${targetVersion.version}`,
          createdBy: user.id,
          publishedAt: new Date(),
          publishedBy: user.id,
        },
      });

      if (previousPublishedVersionId) {
        await tx.adminPageVersion.update({
          where: { id: previousPublishedVersionId },
          data: { status: 'ARCHIVED' },
        });
      }
      await tx.adminPage.update({
        where: { id: pageId },
        data: { publishedVersionId: newVersion.id, status: 'PUBLISHED', updatedBy: user.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.rollback',
          entityType: 'AdminPage',
          entityId: pageId,
          beforeJson: JSON.stringify({
            publishedVersionId: previousPublishedVersionId,
            publishedVersion: previousVersion?.version ?? null,
          }),
          afterJson: JSON.stringify({
            publishedVersionId: newVersion.id,
            publishedVersion: newVersionNumber,
            rolledBackFrom: targetVersion.version,
          }),
          reason: typeof body.reason === 'string'
            ? body.reason.slice(0, 500)
            : `Rolled back to version ${targetVersion.version} (created as v${newVersionNumber})`,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return { page, newVersion, newVersionNumber, targetVersionNumber: targetVersion.version };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error === 'PAGE_NOT_FOUND' ? 'Page not found' : 'Version not found' },
        { status: 404 },
      );
    }

    if (result.page.slug) {
      revalidatePath(`/${result.page.slug}`);
      revalidatePath('/');
    }
    revalidatePath(`/admin/pages/${pageId}`);
    return NextResponse.json({
      ok: true,
      data: {
        pageId,
        newVersionId: result.newVersion.id,
        newVersionNumber: result.newVersionNumber,
        rolledBackFrom: result.targetVersionNumber,
        status: 'PUBLISHED',
      },
    });
  } catch (error) {
    console.error('[page-rollback] transaction failed:', error);
    return NextResponse.json({ error: 'Unable to rollback page version' }, { status: 409 });
  }
}
