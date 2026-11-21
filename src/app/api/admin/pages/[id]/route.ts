/**
 * HEAVIX — Page Builder single-page API.
 * Metadata/archive mutations are committed with their audit record.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { checkCsrf } from '@/lib/csrf';
import { readBoundedJson } from '@/lib/read-bounded-json';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const page = await db.adminPage.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: page });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  const parsed = await readBoundedJson<Record<string, unknown>>(req, 32 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  const stringLimits: Record<string, number> = {
    title: 160, slug: 160, pageType: 40, seoTitle: 180,
    seoDescription: 320, seoCanonical: 2048, seoOgImage: 2048,
  };
  for (const [key, max] of Object.entries(stringLimits)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null && key !== 'title' && key !== 'slug' && key !== 'pageType') {
      data[key] = null;
      continue;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    data[key] = value.trim();
  }
  for (const key of ['seoRobotsIndex', 'seoRobotsFollow'] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] !== 'boolean') return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    data[key] = body[key];
  }
  for (const key of ['scheduledPublishAt', 'scheduledUnpublishAt'] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '') { data[key] = null; continue; }
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    data[key] = new Date(value);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No supported fields supplied' }, { status: 400 });
  }
  data.updatedBy = user.id;

  try {
    const page = await db.$transaction(async (tx) => {
      const before = await tx.adminPage.findUnique({ where: { id } });
      if (!before) return null;
      const nextPublishAt: Date | null = 'scheduledPublishAt' in data
        ? data.scheduledPublishAt as Date | null
        : before.scheduledPublishAt;
      const nextUnpublishAt: Date | null = 'scheduledUnpublishAt' in data
        ? data.scheduledUnpublishAt as Date | null
        : before.scheduledUnpublishAt;
      if (nextPublishAt && nextUnpublishAt && nextPublishAt >= nextUnpublishAt) {
        throw new Error('INVALID_SCHEDULE_RANGE');
      }
      const updated = await tx.adminPage.update({ where: { id }, data: data as any });
      const auditFields = Object.keys(data).filter((key) => key !== 'updatedBy');
      const snapshot = (row: Record<string, unknown>) =>
        Object.fromEntries(auditFields.map((key) => [key, row[key]]));
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.update',
          entityType: 'AdminPage',
          entityId: id,
          beforeJson: JSON.stringify(snapshot(before as unknown as Record<string, unknown>)),
          afterJson: JSON.stringify(snapshot(updated as unknown as Record<string, unknown>)),
          reason: 'Updated page metadata',
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: page });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_SCHEDULE_RANGE') {
      return NextResponse.json({ error: 'Publish time must be earlier than unpublish time' }, { status: 400 });
    }
    console.error('[admin-page] update transaction failed:', error);
    return NextResponse.json({ error: 'Unable to update page' }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.adminPage.findUnique({ where: { id } });
      if (!before) return null;
      await tx.adminPage.update({
        where: { id },
        data: { status: 'ARCHIVED', updatedBy: user.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'page.archive',
          entityType: 'AdminPage',
          entityId: id,
          beforeJson: JSON.stringify({ status: before.status }),
          afterJson: JSON.stringify({ status: 'ARCHIVED' }),
          reason: `Archived page "${before.key}"`,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return { id, status: 'ARCHIVED' as const };
    }, { isolationLevel: 'Serializable' });
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error('[admin-page] archive transaction failed:', error);
    return NextResponse.json({ error: 'Unable to archive page' }, { status: 409 });
  }
}
