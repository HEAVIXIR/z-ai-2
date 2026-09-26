/**
 * HEAVIX — T8: AI Control Plane admin page (standalone)
 * /admin/ai — unified AI control plane hub.
 *
 * This is the foundation page for the AI Control Plane. It aggregates
 * the four canonical AI domain models (AIAgent, AIGatewayLog,
 * AITaskPolicy, AIBudget) into a single admin overview so operators can
 * inspect provider/model/agent state + recent gateway traffic at a
 * glance. Deep-link management surfaces live at:
 *   /admin/ai-agents   — agent registry + run trigger
 *   /admin/ai-gateway  — live gateway logs dashboard (client)
 *   /admin/ai-budget   — budget + per-task policy editor
 *
 * Pattern: server component (same as /admin/verifications +
 * /admin/conversations). Uses getCurrentUser + requirePermission
 * for the canonical `ai.read` RBAC gate. The API routes
 * GET/PATCH /api/admin/ai-* also enforce ai.manage / ai.execute.
 *
 * Audit: logAudit('ai.control_plane.list_view',
 *   entityType: 'AIAgent') — best-effort, never throws.
 *
 * Constraint (T8): NO .env/schema/migration changes. The four AI
 * models already exist in prisma/schema.prisma:
 *   - AIAgent       (line ~1891) — agent registry
 *   - AIBudget      (line ~752)  — singleton USD spend caps
 *   - AIGatewayLog  (line ~726)  — per-request routing/cost log
 *   - AITaskPolicy   (line ~775)  — per-task allow-list policy
 * Permission keys `ai.read` / `ai.manage` / `ai.execute` already
 * exist in src/lib/authorization/permissions.ts.
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import {
  Brain,
  Bot,
  Activity,
  Wallet,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Task-type labels (mirrors /admin/ai-gateway + /admin/ai-budget) ──
const TASK_LABELS: Record<string, string> = {
  SEARCH: "جستجو",
  SEMANTIC_SEARCH: "جستجوی معنایی",
  LISTING_BUILDER: "سازنده آگهی",
  PRICE_ANALYSIS: "تحلیل قیمت",
  MARKET_ANALYST: "تحلیل‌گر بازار",
  SELLER_ASSISTANT: "دستیار فروشنده",
  SCRAPER: "استخراج آگهی",
  MODERATION: "مدیریت محتوا",
};

const STATUS_CLS: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  RUNNING: "bg-amber-100 text-amber-700",
};

export default async function AIControlPlanePage() {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "ai.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires ai.read
      </div>
    );
  }

  // ── 2. Stats grid (4 canonical AI domain counts) ──
  // Run in parallel so a slow model doesn't block the others.
  const [agentCount, gatewayLogCount, taskPolicyCount, budgetCount] =
    await Promise.all([
      db.aIAgent.count(),
      db.aIGatewayLog.count(),
      db.aITaskPolicy.count(),
      db.aIBudget.count(),
    ]);

  // ── 3. Recent AI gateway logs (limit 20, orderBy createdAt desc) ──
  const recentLogs = await db.aIGatewayLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      taskType: true,
      model: true,
      latencyMs: true,
      tokensUsed: true,
      cost: true,
      success: true,
      error: true,
      userId: true,
      createdAt: true,
    },
  });

  // ── 4. AI agents list (limit 20) ──
  const agents = await db.aIAgent.findMany({
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      key: true,
      nameFa: true,
      nameEn: true,
      taskType: true,
      active: true,
      lastStatus: true,
      lastRunAt: true,
      createdAt: true,
    },
  });

  // ── 5. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "ai.control_plane.list_view",
    entityType: "AIAgent",
    reason: `viewed AI control plane overview (agents=${agentCount}, gatewayLogs=${gatewayLogCount}, policies=${taskPolicyCount}, budgets=${budgetCount})`,
  });

  // ── 6. Render ──
  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
          <Brain className="h-6 w-6 text-[#F58220]" />
          صفحه کنترل هوش مصنوعی
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          مرکز فرماندهی هوش مصنوعی — نمای کلی ایجنت‌ها، دروازه، سیاست‌ها و
          بودجه. هوش مصنوعی پیشنهاد می‌دهد — تأیید نهایی با ادمین است
          (اصل ۸ HBR-1.0).
        </p>
      </div>

      {/* Sovereignty banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">قانون حاکمیت هوش مصنوعی</p>
            <p className="text-xs leading-6">
              هرگونه خروجی ایجنت به‌صورت{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">
                AI_SUGGESTED
              </code>{" "}
              و{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">
                verified=false
              </code>{" "}
              ذخیره می‌شود. اجرای هر ایجنت و درخواست دروازه در لاگ ممیزی ثبت
              می‌شود.
            </p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Bot className="h-5 w-5 text-[#F58220]" />}
          label="ایجنت‌های هوش مصنوعی"
          value={toFa(agentCount)}
          href="/admin/ai-agents"
          hrefLabel="مدیریت ایجنت‌ها"
        />
        <StatCard
          icon={<Activity className="h-5 w-5 text-blue-500" />}
          label="لاگ‌های دروازه"
          value={toFa(gatewayLogCount)}
          href="/admin/ai-gateway"
          hrefLabel="داشبورد دروازه"
        />
        <StatCard
          icon={<Cpu className="h-5 w-5 text-emerald-500" />}
          label="سیاست‌های تسک"
          value={toFa(taskPolicyCount)}
          href="/admin/ai-budget"
          hrefLabel="ویرایش سیاست‌ها"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5 text-amber-500" />}
          label="بودجه فعال"
          value={toFa(budgetCount)}
          href="/admin/ai-budget"
          hrefLabel="مدیریت بودجه"
        />
      </div>

      {/* Recent gateway logs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <Activity className="h-5 w-5 text-[#F58220]" />
            ۲۰ لاگ اخیر دروازه هوش مصنوعی
          </h2>
          <Link
            href="/admin/ai-gateway"
            className="text-xs font-bold text-[#F58220] hover:underline"
          >
            مشاهده همه ←
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <Activity className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
            <p className="text-sm text-zinc-400">
              هنوز درخواست AI‌ای ثبت نشده است.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-bold">نوع تسک</th>
                    <th className="px-3 py-3 text-right font-bold">مدل</th>
                    <th className="px-3 py-3 text-center font-bold">وضعیت</th>
                    <th className="px-3 py-3 text-center font-bold">تأخیر</th>
                    <th className="px-3 py-3 text-center font-bold">توکن</th>
                    <th className="px-3 py-3 text-center font-bold">هزینه</th>
                    <th className="px-3 py-3 text-center font-bold">تاریخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recentLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-[#F58220]/10 px-2 py-0.5 text-[10px] font-bold text-[#F58220]">
                          {TASK_LABELS[l.taskType] ?? l.taskType}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-zinc-600">
                        {l.model || "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {l.success ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {l.latencyMs != null ? `${toFa(l.latencyMs)}ms` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-zinc-500">
                        {l.tokensUsed != null ? toFa(l.tokensUsed) : "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-zinc-500">
                        {l.cost != null ? `$${toFa(l.cost.toFixed(4))}` : "—"}
                      </td>
                      <td
                        className="px-3 py-3 text-center text-[11px] text-zinc-500"
                        title={l.error ?? undefined}
                      >
                        {faDate(l.createdAt)}
                        <div className="text-[10px] text-zinc-400">
                          {timeAgo(l.createdAt)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* AI agents list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <Bot className="h-5 w-5 text-[#F58220]" />
            ایجنت‌های هوش مصنوعی
          </h2>
          <Link
            href="/admin/ai-agents"
            className="text-xs font-bold text-[#F58220] hover:underline"
          >
            مدیریت همه ایجنت‌ها ←
          </Link>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <Bot className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
            <p className="text-sm text-zinc-400">
              هیچ ایجنت ثبت‌شده‌ای وجود ندارد.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-bold">کلید</th>
                    <th className="px-3 py-3 text-right font-bold">نام</th>
                    <th className="px-3 py-3 text-right font-bold">تسک</th>
                    <th className="px-3 py-3 text-center font-bold">فعال</th>
                    <th className="px-3 py-3 text-center font-bold">
                      آخرین وضعیت
                    </th>
                    <th className="px-3 py-3 text-center font-bold">
                      آخرین اجرا
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {agents.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-3">
                        <code className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-bold text-[#F58220]">
                          {a.key}
                        </code>
                      </td>
                      <td className="px-3 py-3 font-medium text-zinc-800">
                        {a.nameFa}
                        {a.nameEn ? (
                          <span className="block text-[10px] text-zinc-400">
                            {a.nameEn}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs text-zinc-600">
                        {TASK_LABELS[a.taskType] ?? a.taskType}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            a.active ? "bg-emerald-500" : "bg-zinc-300"
                          }`}
                          title={a.active ? "فعال" : "غیرفعال"}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {a.lastStatus ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              STATUS_CLS[a.lastStatus] ??
                              "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {a.lastStatus}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-[11px] text-zinc-500">
                        {a.lastRunAt ? (
                          <>
                            {faDate(a.lastRunAt)}
                            <div className="text-[10px] text-zinc-400">
                              {timeAgo(a.lastRunAt)}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        نمای کلی صفحه کنترل هوش مصنوعی — ایجنت‌ها: {toFa(agentCount)}، لاگ‌های
        دروازه: {toFa(gatewayLogCount)}، سیاست‌های تسک: {toFa(taskPolicyCount)}
        ، بودجه: {toFa(budgetCount)}.
      </p>
    </div>
  );
}

// ── StatCard sub-component ───────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  href,
  hrefLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black text-zinc-900">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
      <Link
        href={href}
        className="mt-2 inline-block text-[11px] font-bold text-[#F58220] hover:underline"
      >
        {hrefLabel} ←
      </Link>
    </div>
  );
}
