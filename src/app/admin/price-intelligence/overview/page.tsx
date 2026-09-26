import Link from "next/link";
import { db } from "@/lib/db";
import { toFa, formatCompactPrice, formatFullPrice, timeAgo } from "@/lib/format";
import {
  Gauge,
  Database,
  Calculator,
  ShieldAlert,
  ListChecks,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Minus,
} from "lucide-react";

export const dynamic = "force-dynamic";

/* ============================================================
   /admin/price-intelligence/overview
   ------------------------------------------------------------
   Admin overview for the HEAVIX Price Intelligence layer.

   Renders three sections:
     1. Stats cards
          • total observations (PriceObservation.count)
          • total estimates    (PriceEstimate.count)
          • overrides count     (PriceOverride.count)
          • avg confidence      (weighted numeric projection of
            PriceEstimate.confidence across all persisted rows)

     2. Recent overrides table (newest-first, top 25)
          • listing title + link
          • originalEstimate / overridePrice
          • overriddenBy / overriddenAt / reason

     3. Price anomaly alerts
          Listings where |asking - estimated| / estimated > 20%
          (top 50 by absolute deviation), with verdict pill:
            BELOW_RANGE  — asking below lower
            ABOVE_RANGE  — asking above upper
            IN_RANGE     — shown only when the engine marks a
                           strong outlier despite being technically
                           in-range (|dev| > 20% of estimated)
            INSUFFICIENT — no usable estimate (informational)

   The page is server-rendered (no client-side JS). It mirrors
   the design of /admin/dashboard — light theme, RTL, lucide
   icons, Tailwind classes.
   ============================================================ */

// ────────────────────────────────────────────────────────────
// Confidence mapping — string enum → numeric weight (0..100)
// Used for the "avg confidence" stat card. The projection is
// a stable, monotonic representation of the engine's
// qualitative verdicts.
// ────────────────────────────────────────────────────────────
const CONFIDENCE_WEIGHT: Record<string, number> = {
  HIGH: 100,
  MEDIUM: 66,
  LOW: 33,
  INSUFFICIENT: 0,
};

function confidenceToWeight(c: string | null | undefined): number {
  if (!c) return 0;
  return CONFIDENCE_WEIGHT[c] ?? 0;
}

function confidenceLabel(avg: number): { label: string; color: string } {
  if (avg >= 75) return { label: "اطمینان بالا", color: "text-emerald-600" };
  if (avg >= 45) return { label: "اطمینان متوسط", color: "text-amber-600" };
  if (avg > 0) return { label: "اطمینان پایین", color: "text-rose-600" };
  return { label: "داده ناکافی", color: "text-zinc-500" };
}

function verdictPill(verdict: string): {
  label: string;
  cls: string;
  icon: any;
} {
  switch (verdict) {
    case "IN_RANGE":
      return {
        label: "داخل بازه",
        cls: "bg-emerald-100 text-emerald-700",
        icon: CheckCircle2,
      };
    case "BELOW_RANGE":
      return {
        label: "پایین‌تر از بازه",
        cls: "bg-amber-100 text-amber-700",
        icon: ArrowDown,
      };
    case "ABOVE_RANGE":
      return {
        label: "بالاتر از بازه",
        cls: "bg-rose-100 text-rose-700",
        icon: ArrowUp,
      };
    default:
      return {
        label: "داده ناکافی",
        cls: "bg-zinc-200 text-zinc-700",
        icon: Minus,
      };
  }
}

function faDateTime(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  try {
    return d.toLocaleString("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type StatCardProps = {
  title: string;
  value: number | string;
  hint?: string;
  icon: any;
  color: string;
  bg: string;
};

function StatCard({ title, value, hint, icon: Icon, color, bg }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500">{title}</p>
          <p className="mt-2 text-2xl font-black text-zinc-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
        </div>
        <div className={`rounded-lg ${bg} p-2.5`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export default async function PriceIntelligenceOverviewPage() {
  // ── Parallel fetch for the four stat aggregates ──
  // Each query is wrapped in a Promise that swallows errors and
  // returns a safe fallback so a transient DB hiccup on one
  // table doesn't take down the whole page.
  const [obsCount, estCount, overrideCount, estimatesForAvg] =
    await Promise.all([
      db.priceObservation
        .count()
        .catch(() => 0),
      db.priceEstimate
        .count()
        .catch(() => 0),
      db.priceOverride
        .count()
        .catch(() => 0),
      db.priceEstimate
        .findMany({
          select: { confidence: true },
          take: 5000,
        })
        .catch(() => [] as Array<{ confidence: string }>),
    ]);

  const avgConfidence =
    estimatesForAvg.length > 0
      ? Math.round(
          estimatesForAvg.reduce(
            (sum, e) => sum + confidenceToWeight(e.confidence),
            0,
          ) / estimatesForAvg.length,
        )
      : 0;

  // ── Recent overrides (newest-first, top 25) ──
  const recentOverridesRaw = await db.priceOverride
    .findMany({
      orderBy: { overriddenAt: "desc" },
      take: 25,
      include: {
        listing: { select: { id: true, title: true, slug: true } },
      },
    })
    .catch(() => [] as Array<Record<string, any>>);

  // ── Price anomaly alerts ──
  // We pull the latest PriceEstimate per listing (top 800 by recency)
  // and join to the corresponding Listing's askingPrice. The 20%
  // deviation threshold catches BOTH "well above market" and
  // "suspiciously cheap" listings — both are interesting signals for
  // a price-intelligence operator.
  //
  // The latest-estimate-per-listing deduplication is done in JS to
  // keep the query portable across SQLite + Postgres (no
  // DISTINCT ON).
  const ANOMALY_THRESHOLD_PCT = 0.2; // 20%
  const ANOMALY_LIMIT = 50;

  const estimatesWithListing = await db.priceEstimate
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 800, // over-fetch, then dedupe in JS to ~latest-per-listing
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            price: true,
            brandId: true,
            brand: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
    })
    .catch(() => [] as Array<Record<string, any>>);

  // Dedupe by listingId — keep the first occurrence (which is the
  // newest, since the query is ordered by createdAt desc).
  const seenListingIds = new Set<string>();
  const latestPerListing: Array<Record<string, any>> = [];
  for (const e of estimatesWithListing) {
    if (!e.listing) continue;
    if (seenListingIds.has(e.listing.id)) continue;
    seenListingIds.add(e.listing.id);
    latestPerListing.push(e);
  }

  type AnomalyRow = {
    listingId: string;
    slug: string;
    title: string;
    brandName: string | null;
    categoryName: string | null;
    askingPrice: number | null;
    estimatedPrice: number;
    priceLower: number;
    priceUpper: number;
    confidence: string;
    deviationPct: number;
    verdict: "IN_RANGE" | "BELOW_RANGE" | "ABOVE_RANGE" | "INSUFFICIENT";
  };

  const anomalies: AnomalyRow[] = [];
  for (const e of latestPerListing) {
    const l = e.listing;
    if (!l || !l.price) continue;
    const asking = Number(l.price);
    const est = Number(e.estimatedPrice);
    if (!Number.isFinite(est) || est <= 0) continue;

    const dev = (asking - est) / est;
    if (Math.abs(dev) < ANOMALY_THRESHOLD_PCT) continue;

    let verdict: AnomalyRow["verdict"] = "IN_RANGE";
    if (asking < Number(e.priceLower)) verdict = "BELOW_RANGE";
    else if (asking > Number(e.priceUpper)) verdict = "ABOVE_RANGE";

    anomalies.push({
      listingId: l.id,
      slug: l.slug,
      title: l.title,
      brandName: l.brand?.name ?? null,
      categoryName: l.category?.name ?? null,
      askingPrice: asking,
      estimatedPrice: est,
      priceLower: Number(e.priceLower),
      priceUpper: Number(e.priceUpper),
      confidence: e.confidence,
      deviationPct: dev,
      verdict,
    });
  }

  // Sort by absolute deviation (desc) and cap.
  anomalies.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
  const topAnomalies = anomalies.slice(0, ANOMALY_LIMIT);

  // ── Render ──
  const conf = confidenceLabel(avgConfidence);

  const stats: StatCardProps[] = [
    {
      title: "کل مشاهدات قیمت",
      value: toFa(obsCount),
      hint: "PriceObservation",
      icon: Database,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "کل تخمین‌ها",
      value: toFa(estCount),
      hint: "PriceEstimate",
      icon: Calculator,
      color: "text-violet-600",
      bg: "bg-violet-100",
    },
    {
      title: "تعدیل‌های دستی",
      value: toFa(overrideCount),
      hint: "PriceOverride",
      icon: ListChecks,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      title: "میانگین اطمینان",
      value: toFa(avgConfidence),
      hint: conf.label,
      icon: Gauge,
      color: conf.color,
      bg: "bg-zinc-100",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-zinc-900">
          نمای کلی هوش قیمتی
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          مرور سریع سلامت لایه تخمین قیمت — تعداد داده‌ها، میانگین اطمینان،
          تعدیل‌های اخیر و هشدارهای ناهنجاری قیمتی.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent overrides */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold text-zinc-900">
              تعدیل‌های دستی اخیر
            </h2>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
            {toFa(recentOverridesRaw.length)} مورد
          </span>
        </header>
        {recentOverridesRaw.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            هیچ تعدیل دستی ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-right font-medium">آگهی</th>
                  <th className="px-5 py-3 text-right font-medium">تخمین اولیه</th>
                  <th className="px-5 py-3 text-right font-medium">قیمت تعدیل‌شده</th>
                  <th className="px-5 py-3 text-right font-medium">توسط</th>
                  <th className="px-5 py-3 text-right font-medium">زمان</th>
                  <th className="px-5 py-3 text-right font-medium">دلیل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentOverridesRaw.map((o: any) => (
                  <tr key={o.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      {o.listing ? (
                        <Link
                          href={`/listings/${o.listing.slug}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {o.listing.title}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">
                      {o.originalEstimate
                        ? formatCompactPrice(Number(o.originalEstimate))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 font-bold text-zinc-900">
                      {o.overridePrice
                        ? formatFullPrice(Number(o.overridePrice))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                        {o.overriddenBy ?? "—"}
                      </code>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {timeAgo(o.overriddenAt)}
                      <span className="block text-[10px] text-zinc-400">
                        {faDateTime(o.overriddenAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">
                      <span className="line-clamp-2 block max-w-xs text-xs">
                        {o.reason ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Price anomaly alerts */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            <h2 className="text-lg font-bold text-zinc-900">
              هشدارهای ناهنجاری قیمتی
            </h2>
          </div>
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700">
            اختلاف &gt; {toFa(20)}٪ نسبت به تخمین
          </span>
        </header>
        <p className="border-b border-zinc-100 bg-amber-50 px-5 py-2 text-xs text-amber-700">
          <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />
          این فهرست صرفاً سیگنال آماری است — نه حکم قطعی «گران» یا «ارزان».
          برای هر آگهی، کارشناسی حضوری لازم است.
        </p>
        {topAnomalies.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            هیچ ناهنجاری قیمتی (&gt; {toFa(20)}٪) یافت نشد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-right font-medium">آگهی</th>
                  <th className="px-5 py-3 text-right font-medium">برند / دسته</th>
                  <th className="px-5 py-3 text-right font-medium">قیمت آگهی</th>
                  <th className="px-5 py-3 text-right font-medium">تخمین</th>
                  <th className="px-5 py-3 text-right font-medium">اختلاف</th>
                  <th className="px-5 py-3 text-right font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {topAnomalies.map((a) => {
                  const pill = verdictPill(a.verdict);
                  const PIcon = pill.icon;
                  const devPct = Math.round(a.deviationPct * 100);
                  return (
                    <tr key={a.listingId} className="hover:bg-zinc-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/listings/${a.slug}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {a.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        <span className="text-xs">
                          {a.brandName ?? "—"} / {a.categoryName ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-zinc-900">
                        {formatCompactPrice(a.askingPrice)}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {formatCompactPrice(a.estimatedPrice)}
                        <span className="block text-[10px] text-zinc-400">
                          بازه: {formatCompactPrice(a.priceLower)} –{" "}
                          {formatCompactPrice(a.priceUpper)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`font-bold ${
                            devPct > 0 ? "text-rose-600" : "text-amber-600"
                          }`}
                        >
                          {devPct > 0 ? "+" : ""}
                          {toFa(devPct)}٪
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${pill.cls}`}
                        >
                          <PIcon className="h-3 w-3" />
                          {pill.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <p className="text-center text-xs text-zinc-400">
        همه ارقام بر اساس داده‌های زنده در PostgreSQL اصلی هستند.
      </p>
    </div>
  );
}
