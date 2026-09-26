/**
 * HEAVIX — Store Shipments Admin Page
 * /admin/store/shipments — shipments list with order info.
 * T-A — Store Domain Completion: admin UI for the shipping domain.
 *
 * Pattern: server component (same as /admin/conversations +
 * /admin/sellers). Reads URL searchParams for filter state.
 *
 * Permission: store.read (canonical admin read gate; the API
 * route GET /api/admin/store/shipments also uses store.read).
 *
 * Audit: logAudit('store.shipment.list_view', entityType: 'Shipment')
 *   — best-effort, never throws (see src/lib/admin/audit.ts).
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { storeDb } from "@/lib/store-db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { Truck, Search } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Shipment statuses (mirrors store-schema.prisma Shipment.status) ──
const SHIPMENT_STATUSES = [
  "PENDING",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
] as const;
type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار",
  DISPATCHED: "ارسال‌شده",
  IN_TRANSIT: "در حال حمل",
  DELIVERED: "تحویل‌شده",
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  DISPATCHED: "bg-violet-100 text-violet-700",
  IN_TRANSIT: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
};

// ── Common carriers in the HEAVIX store ──
const CARRIERS = ["پست", "تیپاکس", "چاپار"] as const;

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default async function StoreShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    carrier?: string;
    limit?: string;
  }>;
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
  const carrierParam = sp?.carrier ?? "";
  const limitParam = Math.min(200, Number(sp?.limit) || 100);

  const statusFilter: ShipmentStatus | undefined = SHIPMENT_STATUSES.includes(
    statusParam as ShipmentStatus,
  )
    ? (statusParam as ShipmentStatus)
    : undefined;
  const carrierFilter: string | undefined = carrierParam || undefined;

  // ── 3. Query storeDb.shipment with order info ──
  const where: {
    status?: ShipmentStatus;
    carrier?: string;
  } = {};
  if (statusFilter) where.status = statusFilter;
  if (carrierFilter) where.carrier = carrierFilter;

  let shipments: Array<{
    id: string;
    orderId: string;
    carrier: string;
    trackingCode: string | null;
    status: string;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    order: {
      id: string;
      orderNumber: string;
      customer: {
        id: string;
        name: string;
        family: string;
      } | null;
    } | null;
  }> = [];

  try {
    shipments = await storeDb.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitParam,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: { select: { id: true, name: true, family: true } },
          },
        },
      },
    });
  } catch (e) {
    console.error("[admin/store/shipments] query failed:", e);
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          خطا در بارگذاری محموله‌ها. لطفاً اتصال به پایگاه دادهٔ فروشگاه
          را بررسی کنید.
        </div>
      </div>
    );
  }

  // ── 4. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "store.shipment.list_view",
    entityType: "Shipment",
    reason: "viewed shipments list",
  });

  // ── 5. Render ──
  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Filters */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-zinc-400" />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className={INPUT_CLS}
            >
              <option value="">همه وضعیت‌ها</option>
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <select
            name="carrier"
            defaultValue={carrierFilter ?? ""}
            className={INPUT_CLS}
          >
            <option value="">همه شرکت‌ها</option>
            {CARRIERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a]"
          >
            اعمال فیلتر
          </button>
        </div>
      </form>

      {/* Table */}
      {shipments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Truck className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ محموله‌ای یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            با ایجاد محموله برای سفارش‌ها، ردیف‌ها اینجا نمایش داده می‌شوند.
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
                  <th className="px-3 py-3 text-right font-bold">شرکت حمل</th>
                  <th className="px-3 py-3 text-right font-bold">
                    کد رهگیری
                  </th>
                  <th className="px-3 py-3 text-right font-bold">وضعیت</th>
                  <th className="px-3 py-3 text-right font-bold">ارسال</th>
                  <th className="px-3 py-3 text-right font-bold">تحویل</th>
                  <th className="px-3 py-3 text-right font-bold">یادداشت</th>
                  <th className="px-3 py-3 text-right font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-mono text-[11px] font-bold text-zinc-900">
                      {s.order ? (
                        <Link
                          href={`/admin/store/orders`}
                          className="hover:text-[#F58220]"
                        >
                          {s.order.orderNumber}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">سفارش حذف‌شده</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {s.order?.customer ? (
                        <div className="font-medium text-zinc-800">
                          {s.order.customer.name} {s.order.customer.family}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      {s.carrier}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-zinc-600">
                      {s.trackingCode ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_CLS[s.status] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {s.shippedAt ? faDate(s.shippedAt) : "—"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {s.deliveredAt ? faDate(s.deliveredAt) : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      {s.note ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {faDate(s.createdAt)} · {timeAgo(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(shipments.length)} محموله
      </p>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <Truck className="h-6 w-6 text-[#F58220]" />
        محموله‌ها
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        مدیریت محموله‌های ارسال سفارشات — پست، تیپاکس و چاپار
      </p>
    </div>
  );
}
