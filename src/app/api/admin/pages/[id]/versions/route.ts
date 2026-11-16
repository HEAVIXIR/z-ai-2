/**
 * HEAVIX — Page Builder: create a new immutable draft version.
 * Version numbering, creation, and audit are serializable and atomic.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { validateLayout } from '@/lib/admin/page-builder/widget-registry';
import { checkCsrf } from '@/lib/csrf';
import { readBoundedJson } from '@/lib/read-bounded-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: pageId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  const parsed = await readBoundedJson<Record<string, unknown>>(req, 512 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!body.layout || typeof body.layout !== 'object' || Array.isArray(body.layout)) {
    return NextResponse.json({ error: 'layout required' }, { status: 400 });
  }
  if (body.changeLog !== undefined && body.changeLog !== null &&
      (typeof body.changeLog !== 'string' || body.changeLog.length > 500)) {
    return NextResponse.json({ error: 'Invalid changeLog' }, { status: 400 });
  }
  const validation = validateLayout(body.layout);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid layout', details: validation.errors }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const page = await tx.adminPage.findUnique({ where: { id: pageId }, select: { id: true } });
      if (!page) return null;
      const latestVersion = await tx.adminPageVersion.findFirst({
        where: { pageId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latestVersion?.version ?? 0) + 1;
      const version = await tx.adminPageVersion.create({
        data: {
          pageId,
          version: nextVersion,
          status: 'DRAFT',
          layout: body.layout as any,
          changeLog: typeof body.changeLog === 'string' && body.changeLog.trim()
            ? body.changeLog.trim()
            : `Version ${nextVersion}`,
          createdBy: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.version.create',
          entityType: 'AdminPage',
          entityId: pageId,
          beforeJson: null,
          afterJson: JSON.stringify({ version: nextVersion, changeLog: version.changeLog }),
          reason: `Created version ${nextVersion}`,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return version;
    }, { isolationLevel: 'Serializable' });

    if (!result) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('[page-versions] create transaction failed:', error);
    return NextResponse.json({ error: 'Unable to create page version' }, { status: 409 });
  }
}
