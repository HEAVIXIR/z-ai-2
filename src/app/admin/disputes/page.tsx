/**
 * HEAVIX — Marketplace Disputes Admin Page
 * /admin/disputes — standalone admin page with lifecycle actions.
 * T-B-DEEP-MARKETPLACE: Marketplace deep domain completion.
 *
 * Pattern: server component (same as /admin/store/returns +
 * /admin/sellers). Reads URL searchParams for filter state.
 *
 * Permission: dispute.read (canonical admin read gate; the
 * universal resource engine at /admin/resources/disputes
 * uses deal.read for read operations; this page uses the
 * dispute.read domain key as the canonical marketplace gate).
 *
 * Audit: logAudit('marketplace.dispute.list_view',
 *   entityType: 'Dispute') — best-effort, never throws
 *   (see src/lib/admin/audit.ts).
 *
 * Detail/actions: each row links to the universal resource
 * engine at /admin/resources/disputes/[id] for full
 * lifecycle management (review → resolve → cancel).
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { AlertTriangle, Search, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Dispute statuses (mirrors the schema lifecycle:
//    OPEN → UNDER_REVIEW → RESOLVED | CANCELLED) ──
const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "CANCELLED",
] as const;
type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  OPEN: "باز",
  UNDER_REVIEW: "در حال بررسی",
  RESOLVED: "حل‌شده",
  CANCELLED: "لغوشده",
};

const STATUS_CLS: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  UNDER_REVIEW: "bg-sky-100 text-sky-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-600",
};

// Subject/Type derivation. The Dispute schema does not have
// dedicated `subject` or `type` columns, so:
//   - subject: short summary (prefer description; fall back to reason)
//   - type:    derived from whether the dispute is attached to a
//              Deal (DEAL) or an Order (ORDER)
const TYPE_LABEL: Record<string, string> = {
  DEAL: "معامله",
  ORDER: "سفارش",
  UNKNOWN: "نامعلوم",
};

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; limit?: string }>;
}) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "dispute.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires dispute.read
      </div>
    );
  }

  // ── 2. Parse filters (URL searchParams) ──
  const sp = await searchParams;
  const statusParam = sp?.status ?? "";
  const limitParam = Math.min(500, Number(sp?.limit) || 100);

  const statusFilter: DisputeStatus | undefined = DISPUTE_STATUSES.includes(
    statusParam as DisputeStatus,
  )
    ? (statusParam as DisputeStatus)
    : undefined;

  // ── 3. Query db.dispute with include (order, deal, parties) ──
  // Parties are resolved via the Deal's buyer/seller relations and
  // the opener (openedBy is a userId string; resolved separately
  // to a User record for display).
  const where: { status?: DisputeStatus } = {};
  if (statusFilter) where.status = statusFilter;

  let disputes: Array<{
    id: string;
    reason: string;
    description: string | null;
    status: string;
    openedBy: string;
    openedAt: Date;
    createdAt: Date;
    dealId: string | null;
    orderId: string | null;
    deal: {
      id: string;
      dealNumber: string;
      buyer: { id: string; firstName: string; lastName: string } | null;
      seller: { id: string; firstName: string; lastName: string } | null;
    } | null;
    order: { id: string; orderNumber: string } | null;
  }> = [];

  try {
    disputes = await db.dispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitParam,
      include: {
        deal: {
          select: {
            id: true,
            dealNumber: true,
            buyer: {
              select: { id: true, firstName: true, lastName: true },
            },
            seller: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        order: {
          select: { id: true, orderNumber: true },
        },
      },
    });
  } catch (e) {
    console.error("[admin/disputes] query failed:", e);
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          خطا در بارگذاری اختلافات. لطرفاً اتصال به پایگاه دادهٔ اصلی
          (PostgreSQL) را بررسی کنید.
        </div>
      </div>
    );
  }

  // ── 4. Best-effort resolve "openedBy" (userId strings) to User names ──
  // Dispute.openedBy is a free-text userId column (not a relation),
  // so we resolve party names in a single best-effort lookup. If a
  // user has been deleted or the value is non-cuid, we fall back
  // to the raw value.
  const openerIds = Array.from(
    new Set(disputes.map((d) => d.openedBy).filter(Boolean)),
  );
  let openerMap: Record<string, { firstName: string; lastName: string }> = {};
  if (openerIds.length > 0) {
    try {
      const openers = await db.user.findMany({
        where: { id: { in: openerIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      openerMap = Object.fromEntries(
        openers.map((u) => [u.id, { firstName: u.firstName, lastName: u.lastName }]),
      );
    } catch (e) {
      console.error("[admin/disputes] opener lookup failed:", e);
    }
  }

  // ── 5. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "marketplace.dispute.list_view",
    entityType: "Dispute",
    reason: "viewed disputes list",
  });

  // ── 6. Render ──
  const openCount = disputes.filter((d) => d.status === "OPEN").length;
  const reviewCount = disputes.filter((d) => d.status === "UNDER_REVIEW").length;
  const resolvedCount = disputes.filter((d) => d.status === "RESOLVED").length;

  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="کل اختلافات"
          value={disputes.length}
          color="bg-zinc-100 text-zinc-800"
        />
        <StatCard label="باز" value={openCount} color="bg-amber-100 text-amber-700" />
        <StatCard
          label="در حال بررسی"
          value={reviewCount}
          color="bg-sky-100 text-sky-700"
        />
        <StatCard
          label="حل‌شده"
          value={resolvedCount}
          color="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* Filters */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-zinc-400" />
            <select name="status" defaultValue={statusFilter ?? ""} className={INPUT_CLS}>
              <option value="">همه وضعیت‌ها</option>
              {DISPUTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="number"
            name="limit"
            min={10}
            max={500}
            defaultValue={limitParam}
            placeholder="حداکثر ردیف‌ها (۱۰۰)…"
            className={INPUT_CLS}
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a]"
          >
            اعمال فیلتر
          </button>
          <Link
            href="/admin/resources/disputes"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-[#F58220] hover:text-[#F58220]"
          >
            <ArrowLeft size={14} />
            موتور منابع جامع
          </Link>
        </div>
      </form>

      {/* Table */}
      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ اختلافی یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            اختلافات باز‌شده توسط خریداران یا فروشندگان در این فهرست نمایش
            داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">موضوع</th>
                  <th className="px-3 py-3 text-right font-bold">نوع</th>
                  <th className="px-3 py-3 text-right font-bold">وضعیت</th>
                  <th className="px-3 py-3 text-right font-bold">بازکننده</th>
                  <th className="px-3 py-3 text-right font-bold">دلیل</th>
                  <th className="px-3 py-3 text-right font-bold">تاریخ ایجاد</th>
                  <th className="px-3 py-3 text-right font-bold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {disputes.map((d) => {
                  const subject =
                    (d.description && d.description.trim()) ||
                    d.reason ||
                    "—";
                  const type = d.dealId
                    ? "DEAL"
                    : d.orderId
                      ? "ORDER"
                      : "UNKNOWN";
                  const opener = openerMap[d.openedBy];
                  const openerLabel = opener
                    ? `${opener.firstName} ${opener.lastName}`
                    : (d.openedBy || "—");
                  return (
                    <tr key={d.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-3 text-xs text-zinc-700">
                        <div className="line-clamp-2 max-w-[280px]">
                          {subject}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
                          {TYPE_LABEL[type] ?? type}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STATUS_CLS[d.status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {STATUS_LABEL[d.status] ?? d.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-zinc-600">
                        <div className="truncate max-w-[160px]">{openerLabel}</div>
                        {d.deal?.buyer && (
                          <div className="text-[10px] text-zinc-400" dir="ltr">
                            خریدار: {d.deal.buyer.firstName} {d.deal.buyer.lastName}
                          </div>
                        )}
                        {d.deal?.seller && (
                          <div className="text-[10px] text-zinc-400" dir="ltr">
                            فروشنده: {d.deal.seller.firstName} {d.deal.seller.lastName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-zinc-600">
                        <div className="line-clamp-2 max-w-[200px]">
                          {d.reason}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-zinc-500">
                        {faDate(d.createdAt)}
                        <div className="text-[10px] text-zinc-400">
                          {timeAgo(d.createdAt)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/resources/disputes/${d.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 transition hover:border-[#F58220] hover:text-[#F58220]"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          جزئیات و اقدام
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(disputes.length)} اختلاف
      </p>

      {/* Help note */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-xs leading-6 text-blue-700">
        💡 برای اقدامات چرخهٔ عمر اختلاف (شروع بررسی ← حل ← لغو) روی هر ردیف،
        از لینک «جزئیات و اقدام» استفاده کنید. این صفحه به موتور منابع
        جامع (Universal Resource Engine) متصل است تا اقدامات در همان جا با
        ممیزی کامل ثبت شوند.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <AlertTriangle className="h-6 w-6 text-[#F58220]" />
        اختلافات
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        مدیریت اختلافات مارکت‌پلیس — جریان: باز ← در حال بررسی ← حل‌شده (یا
        لغوشده)
      </p>
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
