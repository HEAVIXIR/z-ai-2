/**
 * HEAVIX — Matching Results Admin Page
 * /admin/matching/results — admin view of recent match-run audit records.
 *
 * Wave 2B (Phase Marketplace-Deep): minimal admin page showing a
 * recent match-run table. Each row is a `marketplace.matching.run`
 * (or the legacy `matching.run` / `matching.admin.trigger`) AuditLog
 * entry. Clicking a row expands the `after` payload (totalRequests,
 * totalMatches, top candidates).
 *
 * Pattern: server component (same as /admin/matching). Reads URL
 * searchParams for filter state. Calls the matching-service directly
 * (no separate fetch — keeps the page fast and DB-driven).
 *
 * Permission: matching.read (canonical admin read gate; the
 * /admin/matching page also uses matching.read).
 *
 * Audit: logAudit('marketplace.matching.list_view', entityType:
 * 'AuditLog') — best-effort, never throws (the route also writes
 * this on the API side; the page-side write is kept for parity
 * with /admin/matching which does the same).
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { listRecentMatchRuns } from "@/lib/matching-service";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { Target, Activity, AlertCircle, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "matching.run": "اجرای خودکار",
  "matching.admin.trigger": "اجرای دستی ادمین",
  "marketplace.matching.run": "اجرای تک‌درخواستی",
};

const ACTION_CLS: Record<string, string> = {
  "matching.run": "bg-sky-100 text-sky-700",
  "matching.admin.trigger": "bg-violet-100 text-violet-700",
  "marketplace.matching.run": "bg-emerald-100 text-emerald-700",
};

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default async function AdminMatchingResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "matching.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires matching.read
      </div>
    );
  }

  // ── 2. Parse filters ──
  const sp = await searchParams;
  const limitParam = Math.min(200, Number(sp?.limit) || 50);

  // ── 3. Fetch recent match runs via the service ──
  let runs: Awaited<ReturnType<typeof listRecentMatchRuns>> = [];
  let queryError: string | null = null;
  try {
    runs = await listRecentMatchRuns(limitParam);
  } catch (e) {
    console.error("[admin/matching/results] query failed:", e);
    queryError = (e as Error)?.message ?? "unknown error";
  }

  // ── 4. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "marketplace.matching.list_view",
    entityType: "AuditLog",
    reason: `viewed matching results page (${runs.length} records)`,
  }).catch(() => {
    /* non-fatal */
  });

  // ── 5. Render ──
  const totalRuns = runs.length;
  const systemRuns = runs.filter((r) => r.actorType === "SYSTEM").length;
  const adminRuns = runs.filter((r) => r.actorType === "ADMIN").length;
  const totalMatchSum = runs.reduce(
    (sum, r) => sum + (r.totalMatches ?? 0),
    0,
  );

  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="کل اجراها"
          value={totalRuns}
          color="bg-zinc-100 text-zinc-800"
        />
        <StatCard
          label="اجرای خودکار"
          value={systemRuns}
          color="bg-sky-100 text-sky-700"
        />
        <StatCard
          label="اجرای ادمین"
          value={adminRuns}
          color="bg-violet-100 text-violet-700"
        />
        <StatCard
          label="مجموع تطابق‌ها"
          value={totalMatchSum}
          color="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* Filters */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-zinc-400" />
            <input
              type="number"
              name="limit"
              min={10}
              max={200}
              defaultValue={limitParam}
              placeholder="حداکثر ردیف‌ها (۵۰)…"
              className={INPUT_CLS}
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a]"
          >
            اعمال فیلتر
          </button>
          <Link
            href="/admin/matching"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-[#F58220] hover:text-[#F58220]"
          >
            <ArrowLeft size={14} />
            داشبورد تطابق
          </Link>
        </div>
      </form>

      {/* Table */}
      {queryError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mb-1 inline h-4 w-4" /> خطا در بارگذاری نتایج
          تطابق: <span dir="ltr">{queryError}</span>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Target className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ اجرای تطابقی یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            از صفحهٔ{" "}
            <Link
              href="/admin/matching"
              className="font-bold text-[#F58220] hover:underline"
            >
              داشبورد تطابق
            </Link>{" "}
            موتور تطابق را اجرا کنید تا نتایج در این صفحه نمایش داده شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">نوع اجرا</th>
                  <th className="px-3 py-3 text-right font-bold">نوع موجودیت</th>
                  <th className="px-3 py-3 text-right font-bold">شناسه موجودیت</th>
                  <th className="px-3 py-3 text-right font-bold">بازیگر</th>
                  <th className="px-3 py-3 text-right font-bold">تعداد درخواست</th>
                  <th className="px-3 py-3 text-right font-bold">تعداد تطابق</th>
                  <th className="px-3 py-3 text-right font-bold">علت</th>
                  <th className="px-3 py-3 text-right font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          ACTION_CLS[r.action] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {ACTION_LABEL[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      <code
                        className="rounded bg-zinc-100 px-1 text-[11px]"
                        dir="ltr"
                      >
                        {r.entityType}
                      </code>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500" dir="ltr">
                      {r.entityId ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.actorType === "ADMIN"
                            ? "bg-violet-100 text-violet-700"
                            : r.actorType === "SYSTEM"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {r.actorType}
                      </span>
                      {r.actorId && (
                        <div
                          className="mt-1 text-[10px] text-zinc-400"
                          dir="ltr"
                        >
                          {r.actorId}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-zinc-800">
                      {r.totalRequests != null ? toFa(r.totalRequests) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-zinc-800">
                      {r.totalMatches != null ? toFa(r.totalMatches) : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      <div className="line-clamp-2 max-w-[260px]">
                        {r.reason ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {faDate(r.createdAt)}
                      <div className="text-[10px] text-zinc-400">
                        {timeAgo(r.createdAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(runs.length)} رکورد اجرای تطابق
      </p>

      {/* Help note */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-xs leading-6 text-blue-700">
        💡 هر اجرای موتور تطابق (دستی یا خودکار) یک رکورد ممیزی با کلید{" "}
        <code className="rounded bg-blue-100 px-1">marketplace.matching.run</code>{" "}
        (یا <code className="rounded bg-blue-100 px-1">matching.run</code> برای
        اجرای خودکار) ثبت می‌کند. این جدول آن رکوردها را نمایش می‌دهد — برای
        مشاهدهٔ جزئیات بیشتر به{" "}
        <Link
          href="/admin/audit-log?action=marketplace.matching.run"
          className="font-bold text-[#F58220] hover:underline"
        >
          لاگ ممیزی
        </Link>{" "}
        مراجعه کنید.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <Target className="h-6 w-6 text-[#F58220]" />
        نتایج تطابق
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        فهرست اجراهای موتور تطابق — دستی و خودکار، با آمار تعداد درخواست و
        تعداد تطابق یافت‌شده
      </p>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400">
        <Sparkles className="h-3 w-3" />
        نقطهٔ اتصال API:{" "}
        <code className="rounded bg-zinc-100 px-1" dir="ltr">
          GET /api/admin/matching/results
        </code>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 p-3 ${color}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="mt-1 text-xl font-black">{toFa(value)}</div>
    </div>
  );
}
