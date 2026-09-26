/**
 * HEAVIX — T9: Analytics/Observability Control Plane (standalone)
 * /admin/observability — unified analytics + technical observability hub.
 *
 * This page is the foundation of the Analytics/Observability Control
 * Plane. It aggregates BOTH halves of system visibility into a single
 * admin overview so operators can correlate business activity with
 * technical health at a glance:
 *
 *   Business Analytics section:
 *     • Counts for the canonical marketplace entities (users, listings,
 *       orders, payments, deals, rfqs) — same set the Prometheus
 *       /api/metrics endpoint exposes but rendered for humans.
 *     • Source models: User, Listing, Order, Payment, Deal, RFQ — all
 *       already live in prisma/schema.prisma.
 *
 *   Technical Observability section:
 *     • db.aIGatewayLog.count() — AI gateway traffic volume
 *       (model AIGatewayLog, schema line ~726).
 *     • db.auditLog.count() — admin/audit trail volume
 *       (model AuditLog, schema line ~1677).
 *     • Process uptime (process.uptime()) — current Node process age.
 *     • Health probe for the MAIN PostgreSQL DB (db.$queryRaw SELECT 1).
 *     • Health probe for the STORE SQLite DB (storeDb.$queryRaw SELECT 1).
 *
 * Pattern: server component (same as /admin/ai + /admin/verifications).
 * Uses getCurrentUser + requirePermission for the canonical
 * `analytics.read` RBAC gate. Deep-link management surfaces live at:
 *   /admin/analytics       — full BI dashboard
 *   /admin/audit-log       — admin audit trail
 *   /admin/ai              — AI control plane (T8)
 *   /api/metrics           — Prometheus text format (T5-W2)
 *
 * Audit: logAudit('observability.list_view',
 *   entityType: 'Observability') — best-effort, never throws.
 *
 * Constraint (T9): NO .env/schema/migration changes. The four
 * observability models already exist in prisma/schema.prisma:
 *   - AnalyticsEvent  (line ~2217) — user-flow event stream
 *   - SiteStat        (line ~1999) — admin-curated homepage metrics
 *   - SearchQuery     (line ~1867) — search analytics
 *   - DemandSignal    (line ~815)  — zero-result AI demand signals
 * Permission keys `analytics.read` / `analytics.manage` already
 * exist in src/lib/authorization/permissions.ts.
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { storeDb } from "@/lib/store-db";
import { toFa, timeAgo } from "@/lib/format";
import {
  getSlowRequests,
  getStats,
  type RequestRecord,
} from "@/lib/performance-monitor";
import {
  Gauge,
  Users,
  Megaphone,
  ShoppingCart,
  CreditCard,
  Handshake,
  FileText,
  Activity,
  ShieldCheck,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Timer,
  Zap,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Uptime formatting helpers ─────────────────────────────────
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${toFa(d)} روز`);
  if (h > 0) parts.push(`${toFa(h)} ساعت`);
  if (m > 0) parts.push(`${toFa(m)} دقیقه`);
  parts.push(`${toFa(s)} ثانیه`);
  return parts.join(" و ");
}

// Best-effort epoch anchor for "process started at" display. Date.now()
// minus uptime in ms yields an approximate boot timestamp.
function processStartedAt(): Date {
  // process.uptime() is seconds since the process started; fall back to 0
  // if process is undefined (shouldn't happen on the server, but keep the
  // page resilient so type-checks don't trip on a missing global).
  const uptimeSec =
    typeof process !== "undefined" && typeof process.uptime === "function"
      ? process.uptime()
      : 0;
  return new Date(Date.now() - uptimeSec * 1000);
}

export default async function ObservabilityPage() {
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

  // ── 2. Business Analytics counts ──
  // Run in parallel so a slow model doesn't block the others.
  const [userCount, listingCount, orderCount, paymentCount, dealCount, rfqCount] =
    await Promise.all([
      db.user.count(),
      db.listing.count(),
      db.order.count(),
      db.payment.count(),
      db.deal.count(),
      db.rFQ.count(),
    ]);

  // ── 3. Technical Observability counts ──
  const [aiGatewayLogCount, auditLogCount] = await Promise.all([
    db.aIGatewayLog.count(),
    db.auditLog.count(),
  ]);

  // ── 4. Health probes — best effort, never throws ──
  // Main DB (PostgreSQL) — raw SELECT 1 liveness probe.
  let mainDbHealthy = false;
  let mainDbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    mainDbHealthy = true;
  } catch (err) {
    mainDbError = err instanceof Error ? err.message : String(err);
  }

  // Store DB (SQLite) — raw SELECT 1 liveness probe.
  let storeDbHealthy = false;
  let storeDbError: string | null = null;
  try {
    await storeDb.$queryRaw`SELECT 1`;
    storeDbHealthy = true;
  } catch (err) {
    storeDbError = err instanceof Error ? err.message : String(err);
  }

  // ── 5. Process uptime — Node process age in seconds ──
  const uptimeSeconds =
    typeof process !== "undefined" && typeof process.uptime === "function"
      ? process.uptime()
      : 0;
  const startedAt = processStartedAt();

  // ── 5b. Performance Monitor — slow request samples (T5-A) ──
  // Best-effort snapshot of the in-process ring buffer kept by
  // src/lib/performance-monitor.ts. Single-process scope: each Node
  // worker sees its own view, which is fine for a tactical "what's
  // slow right now" panel. No DB calls — pure in-memory read.
  const perfStats = getStats();
  const slowRequests = getSlowRequests(20);

  // ── 6. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "observability.list_view",
    entityType: "Observability",
    reason: `viewed observability overview (users=${userCount}, listings=${listingCount}, orders=${orderCount}, payments=${paymentCount}, deals=${dealCount}, rfqs=${rfqCount}, aiGatewayLogs=${aiGatewayLogCount}, auditLogs=${auditLogCount}, mainDb=${mainDbHealthy ? "ok" : "down"}, storeDb=${storeDbHealthy ? "ok" : "down"})`,
  });

  // ── 7. Render ──
  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
          <Gauge className="h-6 w-6 text-[#F58220]" />
          مشاهده‌پذیری
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          داشبورد یکپارچهٔ تحلیل کسب‌وکار و سلامت فنی — شمارش نهادهای کلیدی،
          حجم لاگ، آپ‌تایم فرآیند و وضعیت اتصال پایگاه‌های داده.
        </p>
      </div>

      {/* Sovereignty banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">قانون مشاهده‌پذیری</p>
            <p className="text-xs leading-6">
              همهٔ شاخص‌ها در لحظه محاسبه می‌شوند. داده‌های کسب‌وکار از
              PostgreSQL اصلی و لاگ‌های فنی از جدول‌های{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">
                AIGatewayLog
              </code>{" "}
              و{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">
                AuditLog
              </code>{" "}
              خوانده می‌شوند. این صفحه فقط خواندنی است — هیچ تغییری اعمال
              نمی‌کند.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 1: Business Analytics ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <Activity className="h-5 w-5 text-[#F58220]" />
            تحلیل کسب‌وکار
          </h2>
          <Link
            href="/admin/analytics"
            className="text-xs font-bold text-[#F58220] hover:underline"
          >
            داشبورد تحلیل کامل ←
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            icon={<Users className="h-5 w-5 text-blue-500" />}
            label="کاربران"
            value={toFa(userCount)}
          />
          <StatCard
            icon={<Megaphone className="h-5 w-5 text-[#F58220]" />}
            label="آگهی‌ها"
            value={toFa(listingCount)}
          />
          <StatCard
            icon={<ShoppingCart className="h-5 w-5 text-emerald-500" />}
            label="سفارش‌ها"
            value={toFa(orderCount)}
          />
          <StatCard
            icon={<CreditCard className="h-5 w-5 text-violet-500" />}
            label="پرداخت‌ها"
            value={toFa(paymentCount)}
          />
          <StatCard
            icon={<Handshake className="h-5 w-5 text-amber-500" />}
            label="معاملات"
            value={toFa(dealCount)}
          />
          <StatCard
            icon={<FileText className="h-5 w-5 text-rose-500" />}
            label="RFQ (B2B)"
            value={toFa(rfqCount)}
          />
        </div>
      </section>

      {/* ── Section 2: Technical Observability ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <Server className="h-5 w-5 text-[#F58220]" />
            مشاهده‌پذیری فنی
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/audit-log"
              className="text-xs font-bold text-[#F58220] hover:underline"
            >
              لاگ ممیزی ←
            </Link>
            <Link
              href="/api/metrics"
              className="text-xs font-bold text-[#F58220] hover:underline"
            >
              Prometheus metrics ←
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Activity className="h-5 w-5 text-blue-500" />}
            label="لاگ‌های دروازه AI"
            value={toFa(aiGatewayLogCount)}
            href="/admin/ai-gateway"
            hrefLabel="داشبورد دروازه"
          />
          <StatCard
            icon={<ShieldCheck className="h-5 w-5 text-emerald-500" />}
            label="لاگ‌های ممیزی"
            value={toFa(auditLogCount)}
            href="/admin/audit-log"
            hrefLabel="مشاهده لاگ‌ها"
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            label="آپ‌تایم فرآیند"
            value={formatUptime(uptimeSeconds)}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-zinc-500" />}
            label="شروع فرآیند"
            value={timeAgo(startedAt)}
          />
        </div>

        {/* Health probes */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HealthCard
            label="پایگاه داده اصلی (PostgreSQL)"
            icon={<Database className="h-5 w-5 text-[#F58220]" />}
            healthy={mainDbHealthy}
            error={mainDbError}
            details="db.$queryRaw`SELECT 1`"
          />
          <HealthCard
            label="پایگاه داده فروشگاه (SQLite)"
            icon={<Database className="h-5 w-5 text-blue-500" />}
            healthy={storeDbHealthy}
            error={storeDbError}
            details="storeDb.$queryRaw`SELECT 1`"
          />
        </div>
      </section>

      {/* ── Section 3: Slow Requests (T5-A Performance Monitor) ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <Timer className="h-5 w-5 text-[#F58220]" />
            درخواست‌های کند
          </h2>
          <span className="text-[11px] text-zinc-500">
            آستانه: {toFa(perfStats.slowThresholdMs)}ms · نمونه‌ها از بافر همین فرآیند
          </span>
        </div>

        <p className="text-xs leading-6 text-zinc-500">
          این بخش درخواست‌های API را که بیش از{" "}
          {toFa(perfStats.slowThresholdMs)} میلی‌ثانیه طول کشیده‌اند، فهرست
          می‌کند. داده‌ها در حافظه همین فرآیند نگه‌داری می‌شوند و با راه‌اندازی
          مجدد پاک می‌شوند — این نمای تاکتیکی برای پاسخ سریع به کندی‌های زنده
          است، نه یک ذخیرهٔ تاریخی بلندمدت.
        </p>

        {/* Perf stat tiles */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <PerfStatCard
            icon={<Activity className="h-4 w-4 text-blue-500" />}
            label="کل نمونه‌ها"
            value={
              perfStats.total === 0
                ? "—"
                : toFa(perfStats.total)
            }
          />
          <PerfStatCard
            icon={<Zap className="h-4 w-4 text-amber-500" />}
            label="درخواست‌های کند"
            value={
              perfStats.total === 0
                ? "—"
                : toFa(perfStats.slowCount)
            }
          />
          <PerfStatCard
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            label="میانگین تأخیر (ms)"
            value={
              perfStats.avgLatencyMs < 0
                ? "—"
                : toFa(perfStats.avgLatencyMs)
            }
          />
          <PerfStatCard
            icon={<Clock className="h-4 w-4 text-violet-500" />}
            label="P۹۵ تأخیر (ms)"
            value={
              perfStats.p95LatencyMs < 0
                ? "—"
                : toFa(perfStats.p95LatencyMs)
            }
          />
          <PerfStatCard
            icon={<Clock className="h-4 w-4 text-rose-500" />}
            label="بیشینه تأخیر (ms)"
            value={
              perfStats.maxLatencyMs < 0
                ? "—"
                : toFa(perfStats.maxLatencyMs)
            }
          />
        </div>

        {/* Slow requests list */}
        {slowRequests.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                هیچ درخواست کندی در همین فرآیند ثبت نشده — همه زیر آستانه{" "}
                {toFa(perfStats.slowThresholdMs)}ms بوده‌اند.
              </span>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-right text-xs" dir="rtl">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-bold">اندپوینت</th>
                  <th className="px-3 py-2 font-bold">تأخیر (ms)</th>
                  <th className="px-3 py-2 font-bold">وضعیت</th>
                  <th className="px-3 py-2 font-bold">زمان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {slowRequests.map((r, idx) => (
                  <SlowRequestRow key={`${r.timestamp}-${idx}`} rec={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        نمای کلی مشاهده‌پذیری — کاربران: {toFa(userCount)}، آگهی‌ها:{" "}
        {toFa(listingCount)}، سفارش‌ها: {toFa(orderCount)}، پرداخت‌ها:{" "}
        {toFa(paymentCount)}، معاملات: {toFa(dealCount)}، RFQ: {toFa(rfqCount)}
        ، لاگ‌های دروازه AI: {toFa(aiGatewayLogCount)}، لاگ‌های ممیزی:{" "}
        {toFa(auditLogCount)}، آپ‌تایم: {formatUptime(uptimeSeconds)}.
      </p>
    </div>
  );
}

// ── PerfStatCard sub-component (T5-A) ──────────────────────────
function PerfStatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-50">
          {icon}
        </span>
        <p className="text-[11px] text-zinc-500">{label}</p>
      </div>
      <p className="mt-2 text-lg font-black text-zinc-900" dir="ltr">
        {value}
      </p>
    </div>
  );
}

// ── SlowRequestRow sub-component (T5-A) ────────────────────────
function SlowRequestRow({ rec }: { rec: RequestRecord }) {
  const status = rec.status;
  let statusPill = "bg-zinc-100 text-zinc-600";
  if (status !== undefined) {
    if (status >= 500) statusPill = "bg-red-100 text-red-700";
    else if (status >= 400) statusPill = "bg-amber-100 text-amber-700";
    else if (status >= 200 && status < 300)
      statusPill = "bg-emerald-100 text-emerald-700";
  }
  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-3 py-2 font-mono text-[11px] text-zinc-700" dir="ltr">
        {rec.endpoint}
      </td>
      <td className="px-3 py-2 font-mono font-bold text-rose-600" dir="ltr">
        {toFa(rec.latencyMs)}
      </td>
      <td className="px-3 py-2">
        {status !== undefined ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill}`}
            dir="ltr"
          >
            {toFa(status)}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-[11px] text-zinc-500" dir="ltr">
        {timeAgo(rec.timestamp)}
      </td>
    </tr>
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
  href?: string;
  hrefLabel?: string;
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
      {href && hrefLabel ? (
        <Link
          href={href}
          className="mt-2 inline-block text-[11px] font-bold text-[#F58220] hover:underline"
        >
          {hrefLabel} ←
        </Link>
      ) : null}
    </div>
  );
}

// ── HealthCard sub-component ─────────────────────────────────
function HealthCard({
  label,
  icon,
  healthy,
  error,
  details,
}: {
  label: string;
  icon: React.ReactNode;
  healthy: boolean;
  error: string | null;
  details: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50">
            {icon}
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-900">{label}</p>
            <p className="font-mono text-[10px] text-zinc-400" dir="ltr">
              {details}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            healthy
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {healthy ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              سالم
            </>
          ) : (
            <>
              <XCircle className="h-3 w-3" />
              از کار افتاده
            </>
          )}
        </span>
      </div>
      {!healthy && error ? (
        <p
          className="mt-3 break-words rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600"
          dir="ltr"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
