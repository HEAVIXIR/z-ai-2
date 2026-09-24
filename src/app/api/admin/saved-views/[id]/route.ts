/**
 * HEAVIX — STEP 10: Saved Views — Single Item API
 * PUT    /api/admin/saved-views/:id — update view
 * DELETE /api/admin/saved-views/:id — delete view
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PUT — update saved view
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const existing = await db.adminSavedView.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only owner or admin can update
  if (existing.userId && existing.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const allowed = ['name', 'config', 'isDefault', 'active'];
  const updateData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updateData[key] = body[key];
  }

  // If setting as default, unset others
  if (body.isDefault) {
    await db.adminSavedView.updateMany({
      where: { resourceKey: existing.resourceKey, userId: existing.userId, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const view = await db.adminSavedView.update({ where: { id }, data: updateData });
  return NextResponse.json({ ok: true, data: view });
}

// DELETE — delete saved view
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await db.adminSavedView.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (existing.userId && existing.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.adminSavedView.delete({ where: { id } });
  return NextResponse.json({ ok: true, data: { id, deleted: true } });
}
