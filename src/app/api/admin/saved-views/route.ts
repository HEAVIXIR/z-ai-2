/**
 * HEAVIX — STEP 10: Saved Views API
 * GET  /api/admin/saved-views?resourceKey=listings — list views for resource
 * POST /api/admin/saved-views — create a new saved view
 *
 * Scopes:
 *   - PERSONAL (userId set): only visible to the owning user.
 *   - SYSTEM   (userId=null, scope=SYSTEM): visible to all admins.
 *   - TEAM     (scope=TEAM): NOT YET IMPLEMENTED.
 *
 * STEP 11.6 (Phase D — Dead-code classification): TEAM scope is declared
 * in the schema (AdminSavedView.scope is a String column, not an enum,
 * to accept 'TEAM' for forward compatibility) but is intentionally
 * NOT exposed via this API:
 *   - GET filters out TEAM (only PERSONAL + SYSTEM are returned).
 *   - POST forces non-SYSTEM scope to PERSONAL (TEAM is rejected).
 * TEAM scope requires Team + TeamMember models that DO NOT EXIST in the
 * current schema. This is documented as a FOLLOW-UP in ADR-004 §D.1.
 *
 * Once Team/TeamMember models are added, this API should:
 *   - GET: OR-clause adds TEAM views where user is a TeamMember.
 *   - POST: accept scope=TEAM with teamId (validated against TeamMember).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET — list saved views for a resource
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const resourceKey = url.searchParams.get('resourceKey');
  if (!resourceKey) return NextResponse.json({ error: 'resourceKey required' }, { status: 400 });

  // Get PERSONAL views + SYSTEM views (TEAM not yet implemented)
  const views = await db.adminSavedView.findMany({
    where: {
      resourceKey,
      active: true,
      OR: [
        { userId: user.id, scope: 'PERSONAL' },
        { scope: 'SYSTEM' },
      ],
    },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json({ ok: true, data: views });
}

// POST — create a new saved view
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.resourceKey || !body?.config) {
    return NextResponse.json({ error: 'name, resourceKey, config required' }, { status: 400 });
  }

  // Only admins can create SYSTEM scope views
  const scope = body.scope === 'SYSTEM' ? 'SYSTEM' : 'PERSONAL';
  if (scope === 'SYSTEM') {
    const admin = await isAdmin(user.id);
    if (!admin) return NextResponse.json({ error: 'Only admins can create SYSTEM views' }, { status: 403 });
  }

  // If isDefault, unset other defaults for this resource+user
  if (body.isDefault) {
    await db.adminSavedView.updateMany({
      where: { resourceKey: body.resourceKey, userId: scope === 'PERSONAL' ? user.id : null },
      data: { isDefault: false },
    });
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'admin.savedViews.update',
      entityType: 'AdminSavedView',
      entityId: null,
      after: { resourceKey: body.resourceKey, scope, isDefault: false, note: 'unset prior defaults before create' },
      reason: 'via admin API',
    });
  }

  const view = await db.adminSavedView.create({
    data: {
      userId: scope === 'PERSONAL' ? user.id : null,
      resourceKey: body.resourceKey,
      name: body.name,
      scope,
      config: body.config,
      isDefault: body.isDefault ?? false,
    },
  });

  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'admin.savedViews.create',
    entityType: 'AdminSavedView',
    entityId: view.id,
    after: {
      name: view.name,
      resourceKey: view.resourceKey,
      scope: view.scope,
      isDefault: view.isDefault,
    },
    reason: 'via admin API',
  });

  return NextResponse.json({ ok: true, data: view }, { status: 201 });
}
