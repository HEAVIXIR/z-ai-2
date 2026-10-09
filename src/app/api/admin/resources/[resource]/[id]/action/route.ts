/**
 * HEAVIX — STEP 09: Action API
 * POST /api/admin/resources/:resource/:id/action
 *
 * Body: { action: "publish", reason: "..." }
 *
 * Executes a single resource action (publish, suspend, verify, etc.)
 * with permission check + precondition + audit.
 *
 * STEP 11.10 (Authorization Closure): pass `actionDef.permission` to
 * requireAdmin() so non-admin users WITH the action's permission can
 * execute the action (was bare requireAdmin()).
 */

import { NextResponse, type NextRequest } from 'next/server';
import '@/lib/admin/resource-index';
import { executeAction } from '@/lib/admin/action-engine';
import { requireAdmin } from '@/lib/admin-guard';
import { can } from '@/lib/authorization';
import { registry } from '@/lib/admin/resource-registry';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string; id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: 'Action key required' }, { status: 400 });

  const actionDef = config.actions?.find(a => a.key === body.action);
  if (!actionDef) return NextResponse.json({ error: 'Action not defined' }, { status: 400 });

  // STEP 11.10: Auth with the action's permission key (was bare requireAdmin()).
  const [user, authError] = await requireAdmin(actionDef.permission);
  if (authError) return authError;

  const hasPerm = await can(user?.id ?? null, actionDef.permission);
  if (!hasPerm) {
    return NextResponse.json({ error: `Forbidden: requires "${actionDef.permission}"` }, { status: 403 });
  }

  // Execute
  const result = await executeAction(resourceKey, id, body.action, {
    userId: user?.id ?? null,
    reason: body.reason,
    metadata: body.metadata,
  });

  return NextResponse.json({ ok: result.success, data: result }, { status: result.success ? 200 : 400 });
}
