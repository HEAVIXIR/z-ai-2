/**
 * HEAVIX — Store Returns Admin Page
 * /admin/store/returns — returns list with order info.
 * T-A — Store Domain Completion: admin UI for the returns domain.
 *
 * Pattern: server component (same as /admin/conversations +
 * /admin/sellers). Reads URL searchParams for filter state.
 *
 * Permission: store.read (canonical admin read gate; the API
 * route GET /api/admin/store/returns also uses store.read).
 *
 * Audit: logAudit('store.return.list_view', entityType: 'Return')
 *   — best-effort, never throws (see src/lib/admin/audit.ts).
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { storeDb } from "@/lib/store-db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { Undo2, Search } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Return statuses (mirrors /api/admin/store/returns ALLOWED_STATUSES) ──
const RETURN_STATUSES = [
  "REQUESTED",
  "APPROVED",
  "INSPECTED",
  "RESOLVED",
  "REJECTED",
] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "درخواست‌شده",
  APPROVED: "تأییدشده",
  INSPECTED: "کارشناسی‌شده",
  RESOLVED: "حل‌شده",
  REJECTED: "ردشده",
};

const STATUS_CLS: Record<string, string> = {
  REQUESTED: "bg-zinc-100 text-zinc-700",
  APPROVED: "bg-blue-100 text-blue-700",
  INSPECTED: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default async function StoreReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; orderId?: string; limit?: string }>;
}) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="p-8 text-center text-zinc-500">Unauthorized</div>
    );
  }
  try {
    await requirePermission(user.id, "store.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires store.read
      </div>
    );
  }

  // ── 2. Parse filters (URL searchParams) ──
  const sp = await searchParams;
  const statusParam = sp?.status ?? "";
  const orderIdParam = (sp?.orderId ?? "").trim();
  const limitParam = Math.min(500, Number(sp?.limit) || 100);

  const statusFilter: ReturnStatus | undefined = RETURN_STATUSES.includes(
    statusParam as ReturnStatus,
  )
    ? (statusParam as ReturnStatus)
    : undefined;

  // ── 3. Query storeDb.return with order info ──
  const where: {
    status?: ReturnStatus;
    orderId?: string;
  } = {};
  if (statusFilter) where.status = statusFilter;
  if (orderIdParam) where.orderId = orderIdParam;

  let returns: Array<{
    id: string;
    orderId: string;
    reason: string;
    status: string;
    inspection: string | null;
    resolution: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    order: {
      id: string;
      orderNumber: string;
      customer: {
        id: string;
        name: string;
        family: string;
        phone: string;
      } | null;
    } | null;
  }> = [];

  try {
    returns = await storeDb.return.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitParam,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });
  } catch (e) {
    console.error("[admin/store/returns] query failed:", e);
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          خطا در بارگذاری مرجوعی‌ها. لطفاً اتصال به پایگاه دادهٔ فروشگاه
          را بررسی کنید.
        </div>
      </div>
    );
  }

  // ── 4. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "store.return.list_view",
    entityType: "Return",
    reason: "viewed returns list",
  });

  // ── 5. Render ──
  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Filters */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-zinc-400" />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className={INPUT_CLS}
            >
              <option value="">همه وضعیت‌ها</option>
              {RETURN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            name="orderId"
            defaultValue={orderIdParam}
            placeholder="شناسه سفارش (OrderId)…"
            className={INPUT_CLS}
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a]"
          >
            اعمال فیلتر
          </button>
        </div>
      </form>

      {/* Table */}
      {returns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Undo2 className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ مرجوعی‌ای یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            درخواست‌های مرجوعی مشتریان اینجا نمایش داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">سفارش</th>
                  <th className="px-3 py-3 text-right font-bold">مشتری</th>
                  <th className="px-3 py-3 text-right font-bold">دلیل</th>
                  <th className="px-3 py-3 text-right font-bold">وضعیت</th>
                  <th className="px-3 py-3 text-right font-bold">کارشناسی</th>
                  <th className="px-3 py-3 text-right font-bold">راه‌حل</th>
                  <th className="px-3 py-3 text-right font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-mono text-[11px] font-bold text-zinc-900">
                      {r.order ? (
                        <Link
                          href={`/admin/store/orders`}
                          className="hover:text-[#F58220]"
                        >
                          {r.order.orderNumber}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">سفارش حذف‌شده</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.order?.customer ? (
                        <div>
                          <div className="font-medium text-zinc-800">
                            {r.order.customer.name} {r.order.customer.family}
                          </div>
                          <div
                            className="font-mono text-[11px] text-zinc-500"
                            dir="ltr"
                          >
                            {r.order.customer.phone}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      {r.reason}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      {r.inspection ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      {r.resolution ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {faDate(r.createdAt)} · {timeAgo(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(returns.length)} مرجوعی
      </p>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <Undo2 className="h-6 w-6 text-[#F58220]" />
        مرجوعی‌ها
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        مدیریت درخواست‌های مرجوعی سفارشات — جریان: درخواست ← تأیید ←
        کارشناسی ← حل‌وفصل (یا رد)
      </p>
    </div>
  );
}
