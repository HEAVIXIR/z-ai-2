/**
 * HEAVIX — STEP 09: Bulk Action API
 * POST /api/admin/resources/:resource/bulk
 *
 * Body: { action: "publish", ids: ["id1","id2",...], reason: "..." }
 *
 * Executes a bulk action with partial failure handling.
 * Returns: { succeeded, failed, results: [{id, success, error}] }
 *
 * STEP 11.10 (Authorization Closure):
 *   - Pass `actionDef.permission` to requireAdmin() so non-admin users
 *     with the specific action permission can perform bulk operations.
 *   - Pass `resourceKey` to canBulkAction() so the resource-aware lookup
 *     finds the declared `bulkActions[]` permission (was using the
 *     hardcoded 6-entry map which only knew about listing/user/company).
 */

import { NextResponse, type NextRequest } from 'next/server';
import '@/lib/admin/resource-index';
import { executeBulkAction } from '@/lib/admin/bulk-export-engine';
import { requireAdmin } from '@/lib/admin-guard';
import { can, canBulkAction } from '@/lib/authorization';
import { registry } from '@/lib/admin/resource-registry';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { resource: resourceKey } = await params;
  const config = registry.get(resourceKey);
  if (!config) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.action || !Array.isArray(body.ids)) {
    return NextResponse.json({ error: 'action and ids[] required' }, { status: 400 });
  }

  // Permission check — find the declared action.
  // STEP 11.10: look up by the single-item action key (e.g., "verify") —
  // the bulk variant ("bulk-verify") is declared in bulkActions[] and
  // checked separately via canBulkAction.
  const actionDef = config.actions?.find(a => a.key === body.action)
    ?? config.bulkActions?.find(ba => ba.key === body.action);
  if (!actionDef) {
    return NextResponse.json({ error: 'Action not defined' }, { status: 400 });
  }

  // STEP 11.10: Auth with the action's permission key.
  const [user, authError] = await requireAdmin(actionDef.permission);
  if (authError) return authError;

  // Permission check (resource-aware bulk lookup).
  // STEP 11.10: Pass resourceKey so canBulkAction looks up the resource's
  // declared bulkActions[] (resource-aware) instead of the legacy 6-entry
  // hardcoded map (which only knew listing/user/company).
  const hasPerm = await can(user?.id ?? null, actionDef.permission);
  const canBulk = await canBulkAction(user?.id ?? null, `bulk-${body.action}`, resourceKey);
  if (!hasPerm && !canBulk) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Execute bulk
  const result = await executeBulkAction({
    resourceKey,
    actionKey: body.action,
    ids: body.ids,
    ctx: { userId: user?.id ?? null, reason: body.reason },
  });

  return NextResponse.json({
    ok: true,
    data: {
      action: result.action,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results,
      durationMs: result.durationMs,
    },
  });
}
