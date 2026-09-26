/**
 * HEAVIX — Matching Admin View
 * /admin/matching — minimal admin view of matching engine status
 * T3-W3: Matching admin page (uses AIAgent + Opportunity models)
 */

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export default async function AdminMatchingPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  try { await requirePermission(user.id, 'matching.read'); } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires matching.read</div>;
  }

  // Best-effort stats from existing models
  let stats = { agents: 0, opportunities: 0, buyRequests: 0, rfqs: 0 };
  try {
    const [agents, opportunities, buyRequests, rfqs] = await Promise.all([
      db.aIAgent.count(),
      db.opportunity.count().catch(() => 0),
      db.buyRequest.count(),
      db.rFQ.count(),
    ]);
    stats = { agents, opportunities, buyRequests, rfqs };
  } catch { /* models may vary */ }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">موتور تطابق</h1>
        <p className="mt-1 text-sm text-zinc-500">وضعیت موتور تطابق هوشمند و آمار</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-2xl font-bold text-zinc-900">{stats.agents}</div>
          <div className="text-xs text-zinc-500">عوامل هوش مصنوعی</div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-2xl font-bold text-zinc-900">{stats.opportunities}</div>
          <div className="text-xs text-zinc-500">فرصت‌ها</div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-2xl font-bold text-zinc-900">{stats.buyRequests}</div>
 <div className="text-xs text-zinc-500">درخواست‌های خرید</div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-2xl font-bold text-zinc-900">{stats.rfqs}</div>
          <div className="text-xs text-zinc-500">استعلام قیمت</div>
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        ℹ️ موتور تطابق از طریق API قابل اجراست: <code className="rounded bg-blue-100 px-1">POST /api/admin/matching/run</code>
      </div>
    </div>
  );
}
