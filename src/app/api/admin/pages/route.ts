/**
 * HEAVIX — Page Builder collection API.
 * Page + initial version + audit record are committed atomically.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { validateLayout } from '@/lib/admin/page-builder/widget-registry';
import { checkCsrf } from '@/lib/csrf';
import { readBoundedJson } from '@/lib/read-bounded-json';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const pages = await db.adminPage.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { versions: true } } },
  });
  return NextResponse.json({ ok: true, data: pages });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  const parsed = await readBoundedJson<Record<string, unknown>>(req, 512 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (typeof body.key !== 'string' || !body.key.trim() || body.key.length > 80 ||
      typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) {
    return NextResponse.json({ error: 'key and title are required and must be within limits' }, { status: 400 });
  }
  const key = body.key.trim();
  const title = body.title.trim();
  const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : key;
  if (slug.length > 160) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  const pageType = typeof body.pageType === 'string' && body.pageType.trim()
    ? body.pageType.trim().slice(0, 40)
    : 'CUSTOM';
  const layout = body.layout ?? { sections: [] };
  const validation = validateLayout(layout);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid layout', details: validation.errors }, { status: 400 });
  }

  try {
    const page = await db.$transaction(async (tx) => {
      const created = await tx.adminPage.create({
        data: {
          key, title, slug, pageType, status: 'DRAFT',
          createdBy: user.id, updatedBy: user.id,
          versions: {
            create: {
              version: 1,
              status: 'DRAFT',
              layout: layout as any,
              changeLog: 'Initial draft',
              createdBy: user.id,
            },
          },
        },
        include: { versions: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.create',
          entityType: 'AdminPage',
          entityId: created.id,
          beforeJson: null,
          afterJson: JSON.stringify({ key: created.key, title: created.title, pageType: created.pageType }),
          reason: `Created page "${created.title}"`,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json({ ok: true, data: page }, { status: 201 });
  } catch (error) {
    console.error('[admin-pages] create transaction failed:', error);
    return NextResponse.json({ error: 'Page key may already exist or the page could not be created' }, { status: 409 });
  }
}
