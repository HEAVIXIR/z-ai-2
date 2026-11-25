/**
 * HEAVIX — Page Builder publish.
 * The version transition, page pointer, and audit record commit atomically.
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
      const [page, version] = await Promise.all([
        tx.adminPage.findUnique({ where: { id: pageId } }),
        tx.adminPageVersion.findUnique({ where: { id: versionId } }),
      ]);
      if (!page) return { error: 'PAGE_NOT_FOUND' as const };
      if (!version || version.pageId !== pageId) return { error: 'VERSION_NOT_FOUND' as const };

      const previousVersionId = page.publishedVersionId;
      if (previousVersionId && previousVersionId !== version.id) {
        await tx.adminPageVersion.update({
          where: { id: previousVersionId },
          data: { status: 'ARCHIVED' },
        });
      }

      const publishedVersion = await tx.adminPageVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: user.id },
      });
      await tx.adminPage.update({
        where: { id: pageId },
        data: { status: 'PUBLISHED', publishedVersionId: version.id, updatedBy: user.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.publish',
          entityType: 'AdminPage',
          entityId: pageId,
          beforeJson: JSON.stringify({ publishedVersionId: previousVersionId, status: page.status }),
          afterJson: JSON.stringify({ publishedVersionId: version.id, status: 'PUBLISHED', version: version.version }),
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : `Published version ${version.version}`,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return { page, version: publishedVersion };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error === 'PAGE_NOT_FOUND' ? 'Page not found' : 'Version not found' },
        { status: 404 },
      );
    }

    if (result.page.slug) revalidatePath(`/${result.page.slug}`);
    revalidatePath('/');
    revalidatePath(`/admin/pages/${pageId}`);
    return NextResponse.json({
      ok: true,
      data: { pageId, publishedVersionId: result.version.id, version: result.version.version, status: 'PUBLISHED' },
    });
  } catch (error) {
    console.error('[page-publish] transaction failed:', error);
    return NextResponse.json({ error: 'Unable to publish page version' }, { status: 409 });
  }
}
