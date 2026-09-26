/**
 * HEAVIX — Phase 11B: Growth / BI Dashboard
 * ------------------------------------------------------------
 * /admin/growth — comprehensive growth dashboard rendering the
 * six BI service metric sets in a single admin page so operators
 * can see funnel conversion, acquisition, marketplace liquidity,
 * revenue, search, and retention in one place.
 *
 * Pattern (server component, same as /admin/observability):
 *   1. getCurrentUser()  — auth.
 *   2. requirePermission(user.id, 'analytics.read')  — RBAC.
 *   3. logAudit('growth.list_view', entityType: 'Growth')  — trail.
 *   4. await bi-service metric sets in parallel.
 *   5. render KPI cards + funnel stage bars + search list.
 *
 * Constraints (Phase 11B):
 *   • NO .env / schema / migration changes — every metric reads
 *     from already-existing models (AnalyticsEvent + marketplace
 *     domain tables).
 *   • All BI service functions are resilient (never throw on DB
 *     errors; they degrade to zero values). The dashboard wraps
 *     the await in try/catch as a second layer of safety.
 *
 * Deep-link surface:
 *   • Funnel deep-link: ?funnel=SEARCH_TO_DEAL   (selector)
 *   • Range deep-link:  ?days=7 | 30 | 90         (window)
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { toFa } from "@/lib/format";
import {
  getFunnelMetrics,
  getAcquisitionMetrics,
  getMarketplaceLiquidity,
  getRevenueMetrics,
  getSearchMetrics,
  getRetentionMetrics,
} from "@/lib/bi-service";
import {
  FUNNEL_NAMES,
  FUNNEL_LABELS_FA,
  type FunnelName,
  isFunnelName,
} from "@/lib/funnel-definitions";
import { EVENT_TYPE_LABELS_FA } from "@/lib/event-taxonomy";
import {
  TrendingUp,
  Users,
  Search as SearchIcon,
  ShoppingBag,
  Activity,
  Repeat,
  Filter,
  ChevronLeft,
  Eye,
  CreditCard,
  Handshake,
  Megaphone,
  BarChart3,
} from "lucide-react";
import TimeRangeSelector from "@/app/admin/analytics/TimeRangeSelector";
import Link from "next/link";

export const dynamic = "force-dynamic";

function faNumber(n: number): string {
  try {
    return toFa(n.toLocaleString("en-US"));
  } catch {
    return toFa(String(n));
  }
}

function formatBigIntString(s: string): string {
  if (!s) return toFa(0);
  try {
    // The string may contain the BigInt value as a decimal integer.
    const n = Number(s);
    if (Number.isFinite(n)) {
      return faNumber(n);
    }
    return toFa(s);
  } catch {
    return toFa(s);
  }
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return toFa(0);
  const rounded = Math.round(n * 10) / 10;
  return toFa(rounded);
}

export default async function GrowthDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; funnel?: string }>;
}) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "analytics.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires analytics.read
      </div>
    );
  }

  // ── 2. Parse params (range + funnel selector) ──
  const sp = await searchParams;
  const daysRaw = Number(sp.days ?? "30");
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const funnelRaw = (sp.funnel ?? "SEARCH_TO_DEAL").toUpperCase();
  const selectedFunnel: FunnelName = isFunnelName(funnelRaw)
    ? funnelRaw
    : "SEARCH_TO_DEAL";

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const dateRange = { from, to };

  // ── 3. Run BI metric sets in parallel ──
  let funnelMetrics, acquisition, liquidity, revenue, search, retention;
  try {
    [
      funnelMetrics,
      acquisition,
      liquidity,
      revenue,
      search,
      retention,
    ] = await Promise.all([
      getFunnelMetrics(selectedFunnel, dateRange),
      getAcquisitionMetrics(dateRange),
      getMarketplaceLiquidity(dateRange),
      getRevenueMetrics(dateRange),
      getSearchMetrics(dateRange),
      getRetentionMetrics(dateRange),
    ]);
  } catch (err) {
    // Should not happen — each function is resilient — but render
    // a graceful error if a true surprise occurs.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[/admin/growth] BI metric fetch failed:", msg);
    return (
      <div className="p-8 text-center text-zinc-500">
        خطا در بارگذاری شاخص‌های رشد. لطفاً بعداً تلاش کنید.
      </div>
    );
  }

  // ── 4. Best-effort audit (never throws) ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "growth.list_view",
    entityType: "Growth",
    reason: `funnel=${selectedFunnel}, days=${days}, visits=${acquisition.visits}, signups=${acquisition.signups}, deals=${liquidity.deals}, gmv=${revenue.totalGmv}`,
  });

  const maxFunnelUsers = Math.max(
    1,
    ...funnelMetrics.stages.map((s) => s.users),
  );

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
            <TrendingUp className="h-6 w-6 text-[#F58220]" />
            داشبورد رشد
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            قیف‌های تبدیل، کسب‌وکار، نقدینگی بازار، درآمد، جستجو و بازگشت کاربر
            — همگی از دادهٔ خام AnalyticsEvent و جداول بازار محاسبه می‌شوند.
          </p>
        </div>
        <TimeRangeSelector current={days} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={<Eye className="h-5 w-5 text-blue-500" />}
          label="بازدید"
          value={faNumber(acquisition.visits)}
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-teal-500" />}
          label="ثبت‌نام"
          value={faNumber(acquisition.signups)}
          sub={`نرخ فعال‌سازی: ${formatPercent(acquisition.activationRate)}٪`}
        />
        <KpiCard
          icon={<Megaphone className="h-5 w-5 text-[#F58220]" />}
          label="آگهی جدید"
          value={faNumber(liquidity.listings)}
        />
        <KpiCard
          icon={<Handshake className="h-5 w-5 text-emerald-500" />}
          label="معامله"
          value={faNumber(liquidity.deals)}
          sub={`نرخ تطابق: ${formatPercent(liquidity.matchRate)}٪`}
        />
        <KpiCard
          icon={<CreditCard className="h-5 w-5 text-violet-500" />}
          label="GMV کل"
          value={formatBigIntString(revenue.totalGmv)}
          sub={`${faNumber(revenue.orderCount)} سفارش`}
        />
        <KpiCard
          icon={<Repeat className="h-5 w-5 text-rose-500" />}
          label="MAU"
          value={faNumber(retention.mau)}
          sub={`نرخ بازگشت: ${formatPercent(retention.repeatRate)}٪`}
        />
      </div>

      {/* Funnel visualization */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[#F58220]" />
            <h2 className="text-sm font-bold text-zinc-800">
              قیف تبدیل
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FUNNEL_NAMES.map((name) => {
              const active = name === selectedFunnel;
              return (
                <Link
                  key={name}
                  href={`/admin/growth?days=${days}&funnel=${name}`}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[#F58220] text-white shadow-sm"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {FUNNEL_LABELS_FA[name]}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Stage bars */}
        <div className="space-y-3">
          {funnelMetrics.stages.map((stage, idx) => {
            const widthPct = (stage.users / maxFunnelUsers) * 100;
            const label =
              EVENT_TYPE_LABELS_FA[stage.stage] ?? stage.stage;
            return (
              <div key={`${stage.stage}-${idx}`} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs font-medium text-zinc-600">
                  {label}
                </div>
                <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-zinc-100">
                  <div
                    className="absolute inset-y-0 right-0 bg-gradient-to-l from-[#F58220] to-amber-300 transition-all"
                    style={{ width: `${Math.max(2, widthPct)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-bold text-zinc-700">
                    <span>{faNumber(stage.users)} کاربر</span>
                    <span className="text-[11px] text-zinc-500">
                      تبدیل: {formatPercent(stage.conversionFromPrevious)}٪
                      {idx > 0 && (
                        <span className="ml-1 text-rose-500">
                          {" "}
                          · ریزش: {formatPercent(stage.dropOffRate)}٪
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall conversion summary */}
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#F58220]" />
            <span className="font-bold text-amber-800">
              {FUNNEL_LABELS_FA[selectedFunnel]}
            </span>
          </div>
          <span className="text-amber-700">
            کاربر در مرحله اول:{" "}
            <strong>{faNumber(funnelMetrics.totalUsersAtStart)}</strong>
          </span>
          <span className="text-amber-700">
            کاربر در مرحله آخر:{" "}
            <strong>{faNumber(funnelMetrics.totalUsersAtEnd)}</strong>
          </span>
          <span className="font-black text-[#F58220]">
            تبدیل کلی: {formatPercent(funnelMetrics.overallConversion)}٪
          </span>
        </div>
      </section>

      {/* Marketplace liquidity + Revenue + Search + Retention */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Marketplace liquidity */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-800">
            <ShoppingBag size={16} className="text-[#F58220]" />
            نقدینگی بازار
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="آگهی جدید"
              value={faNumber(liquidity.listings)}
            />
            <MiniStat
              label="درخواست خرید"
              value={faNumber(liquidity.wanted)}
            />
            <MiniStat
              label="فروشنده فعال"
              value={faNumber(liquidity.sellers)}
            />
            <MiniStat
              label="خریدار فعال"
              value={faNumber(liquidity.buyers)}
            />
            <MiniStat
              label="نرخ تطابق"
              value={`${formatPercent(liquidity.matchRate)}٪`}
            />
            <MiniStat
              label="زمان تا تطابق (ساعت)"
              value={
                liquidity.timeToMatchHours === null
                  ? "—"
                  : faNumber(liquidity.timeToMatchHours)
              }
            />
          </div>
        </section>

        {/* Revenue */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-800">
            <CreditCard size={16} className="text-violet-500" />
            درآمد
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="تعداد سفارش"
              value={faNumber(revenue.orderCount)}
            />
            <MiniStat
              label="GMV کل"
              value={formatBigIntString(revenue.totalGmv)}
            />
            <MiniStat
              label="میانگین ارزش سفارش"
              value={formatBigIntString(revenue.avgOrderValue)}
            />
            <MiniStat
              label="نرخ تکمیل پرداخت"
              value={`${formatPercent(revenue.paymentCompletionRate)}٪`}
            />
          </div>
        </section>

        {/* Search analytics */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-800">
            <SearchIcon size={16} className="text-amber-600" />
            تحلیل جستجو
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="تعداد جستجو"
              value={faNumber(search.searchCount)}
            />
            <MiniStat
              label="جستجوی بدون نتیجه"
              value={faNumber(search.zeroResultCount)}
            />
            <MiniStat
              label="نرخ بدون‌نتیجه"
              value={`${formatPercent(search.zeroResultRate)}٪`}
            />
            <MiniStat
              label="CTR"
              value={`${formatPercent(search.ctr)}٪`}
            />
          </div>
          {search.topQueries.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-zinc-600">
                پرجستجوترین عبارت‌ها
              </div>
              <div className="space-y-1.5">
                {search.topQueries.map((q, i) => (
                  <div
                    key={`${q.query}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-1.5"
                  >
                    <div className="truncate text-sm font-medium text-zinc-700">
                      {q.query || "—"}
                    </div>
                    <div className="shrink-0 text-xs font-bold text-[#F58220]">
                      {faNumber(q.count)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Retention */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-800">
            <Activity size={16} className="text-rose-500" />
            بازگشت کاربر
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="DAU" value={faNumber(retention.dau)} />
            <MiniStat label="WAU" value={faNumber(retention.wau)} />
            <MiniStat label="MAU" value={faNumber(retention.mau)} />
            <MiniStat
              label="نرخ بازگشت"
              value={`${formatPercent(retention.repeatRate)}٪`}
            />
            <MiniStat
              label="حفظ کوهورت"
              value={`${formatPercent(retention.cohortRetention)}٪`}
            />
            <MiniStat
              label="کل کاربران فعال"
              value={faNumber(retention.totalActiveUsers)}
            />
          </div>
        </section>
      </div>

      {/* Deep link to /admin/analytics */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500">
        <div>
          داده‌ها از{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
            AnalyticsEvent
          </code>{" "}
          و جداول بازار خوانده می‌شوند. محاسبه‌ها در لحظه انجام می‌شوند.
        </div>
        <Link
          href="/admin/analytics"
          className="flex items-center gap-1 font-bold text-[#F58220] hover:underline"
        >
          داشبورد تحلیل کامل
          <ChevronLeft size={14} />
        </Link>
      </div>
    </div>
  );
}

/* ── Presentational sub-components ──────────────────────────── */

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        {icon}
      </div>
      <div className="truncate text-2xl font-black text-zinc-900">{value}</div>
      <div className="truncate text-xs font-semibold text-zinc-500">{label}</div>
      {sub && (
        <div className="mt-0.5 truncate text-[11px] text-zinc-400">{sub}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="truncate text-lg font-black text-zinc-900">{value}</div>
      <div className="truncate text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
