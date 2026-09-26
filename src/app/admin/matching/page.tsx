/**
 * HEAVIX — Matching Admin View
 * /admin/matching — admin view of matching engine status + recent AI agent runs
 *
 * T3-W3: Matching admin page (uses AIAgent + Opportunity models).
 * T-B-DEEP-MARKETPLACE: Enhanced with recent AI agent runs table
 *   + explicit "Run matching engine" button (client component).
 *
 * Permission: matching.read
 * Audit: logAudit('matching.admin.list_view', entityType: 'AIAgent').
 */

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { toFa, timeAgo, faDate } from '@/lib/format';
import { Sparkles, Bot, Activity, Clock, ListChecks, AlertCircle } from 'lucide-react';
import { RunMatchingButton } from './RunMatchingButton';

export const dynamic = 'force-dynamic';

// Agent run-status display (mirrors AIAgent.lastStatus values).
const LAST_STATUS_LABEL: Record<string, string> = {
  SUCCESS: 'موفق',
  FAILED: 'ناموفق',
  RUNNING: 'در حال اجرا',
};
const LAST_STATUS_CLS: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  RUNNING: 'bg-sky-100 text-sky-700',
};

type AgentRow = {
  id: string;
  key: string;
  nameFa: string;
  nameEn: string | null;
  taskType: string;
  active: boolean;
  lastRunAt: Date | null;
  lastStatus: string | null;
  taskCount: number;
};

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

  // ── Recent AI agent runs (limit 10) ──
  // taskCount: number of AIGatewayLog rows logged for the agent's
  // taskType (best-effort; falls back to 0 if the log table is
  // empty or the query fails).
  let agentRows: AgentRow[] = [];
  let agentsError: string | null = null;
  try {
    const agents = await db.aIAgent.findMany({
      orderBy: { lastRunAt: 'desc' },
      take: 10,
    });

    // Resolve task counts in a single groupBy (best-effort).
    let logCounts: Record<string, number> = {};
    try {
      const grouped = await db.aIGatewayLog.groupBy({
        by: ['taskType'],
        _count: { _all: true },
      });
      logCounts = Object.fromEntries(
        grouped.map((g) => [g.taskType, g._count._all]),
      );
    } catch (e) {
      console.error('[admin/matching] task-count lookup failed:', e);
    }

    agentRows = agents.map((a) => ({
      id: a.id,
      key: a.key,
      nameFa: a.nameFa,
      nameEn: a.nameEn,
      taskType: a.taskType,
      active: a.active,
      lastRunAt: a.lastRunAt,
      lastStatus: a.lastStatus,
      taskCount: logCounts[a.taskType] ?? 0,
    }));
  } catch (e) {
    console.error('[admin/matching] agent query failed:', e);
    agentsError = (e as Error)?.message ?? 'unknown error';
  }

  // Best-effort audit (list_view) — never throws
  await logAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'matching.admin.list_view',
    entityType: 'AIAgent',
    reason: 'viewed matching admin page',
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
          <Sparkles className="h-6 w-6 text-[#F58220]" />
          موتور تطابق
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          وضعیت موتور تطابق هوشمند، آمار و عوامل هوش مصنوعی
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="عوامل هوش مصنوعی"
          value={stats.agents}
          icon={Bot}
          color="text-[#F58220]"
          bg="bg-[#F58220]/10"
        />
        <StatTile
          label="فرصت‌ها"
          value={stats.opportunities}
          icon={Sparkles}
          color="text-violet-600"
          bg="bg-violet-100"
        />
        <StatTile
          label="درخواست‌های خرید"
          value={stats.buyRequests}
          icon={ListChecks}
          color="text-emerald-600"
          bg="bg-emerald-100"
        />
        <StatTile
          label="استعلام قیمت"
          value={stats.rfqs}
          icon={ListChecks}
          color="text-sky-600"
          bg="bg-sky-100"
        />
      </div>

      {/* Run engine block */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-800">اجرای دستی موتور تطابق</h2>
            <p className="mt-1 text-xs leading-6 text-zinc-500">
              موتور تطابق، تمام درخواست‌های خرید فعال را اسکن کرده و بهترین
              تطابق‌ها را شناسایی می‌کند. این عمل با مجوز <code className="rounded bg-zinc-100 px-1">matching.read</code> و
              شناسه کاربر شما در ممیزی ثبت می‌شود.
            </p>
          </div>
          <RunMatchingButton />
        </div>
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
          ℹ️ نقطهٔ اتصال API: <code className="rounded bg-blue-100 px-1">POST /api/admin/matching/run</code>
        </div>
      </div>

      {/* Recent AI agent runs table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-zinc-700" />
          <h2 className="text-sm font-bold text-zinc-900">آخرین اجراهای عوامل هوش مصنوعی</h2>
          <span className="text-[11px] text-zinc-500">(۱۰ مورد اخیر)</span>
        </div>

        {agentsError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mb-1 inline h-4 w-4" /> خطا در بارگذاری
            عوامل: <span dir="ltr">{agentsError}</span>
          </div>
        ) : agentRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <Bot className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
            <p className="text-sm text-zinc-400">هیچ عامل هوش مصنوعی‌ای تعریف نشده است.</p>
            <p className="mt-1 text-xs text-zinc-400">
              عوامل از طریق <code className="rounded bg-zinc-100 px-1">seed-ai-policies.ts</code> یا پنل
              <code className="mx-1 rounded bg-zinc-100 px-1">/admin/ai-agents</code> قابل مدیریت هستند.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-bold">نام عامل</th>
                    <th className="px-3 py-3 text-right font-bold">کلید</th>
                    <th className="px-3 py-3 text-right font-bold">نوع وظیفه</th>
                    <th className="px-3 py-3 text-right font-bold">وضعیت آخرین اجرا</th>
                    <th className="px-3 py-3 text-right font-bold">تعداد وظایف</th>
                    <th className="px-3 py-3 text-right font-bold">آخرین اجرا</th>
                    <th className="px-3 py-3 text-right font-bold">فعال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {agentRows.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-3 font-bold text-zinc-800">
                        {a.nameFa}
                        {a.nameEn && (
                          <div className="text-[10px] font-normal text-zinc-400" dir="ltr">
                            {a.nameEn}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <code className="rounded bg-zinc-100 px-1 text-[11px] text-zinc-700" dir="ltr">
                          {a.key}
                        </code>
                      </td>
                      <td className="px-3 py-3">
                        <code className="rounded bg-zinc-100 px-1 text-[11px] text-zinc-700" dir="ltr">
                          {a.taskType}
                        </code>
                      </td>
                      <td className="px-3 py-3">
                        {a.lastStatus ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              LAST_STATUS_CLS[a.lastStatus] ?? 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            {LAST_STATUS_LABEL[a.lastStatus] ?? a.lastStatus}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">هنوز اجرا نشده</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-zinc-800">
                        {toFa(a.taskCount)}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-zinc-500">
                        {a.lastRunAt ? (
                          <>
                            <Clock className="mb-0.5 inline h-3 w-3" /> {timeAgo(a.lastRunAt)}
                            <div className="text-[10px] text-zinc-400">{faDate(a.lastRunAt)}</div>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {a.active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> فعال
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> غیرفعال
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-zinc-900">{toFa(value)}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}
