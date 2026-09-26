/**
 * HEAVIX — Store Inventory Admin Page
 * /admin/store/inventory — stock movement ledger list view.
 * T-A — Store Domain Completion: admin UI for the inventory domain.
 * T1-DEEP — Inventory Deep: shows warehouse column + low-stock alert panel.
 *
 * Pattern: server component (same as /admin/conversations +
 * /admin/sellers). Reads URL searchParams for filter state.
 *
 * Permission: store.read (canonical admin read gate; the API
 * route GET /api/admin/store/inventory also uses store.read).
 *
 * Audit: logAudit('store.inventory.list_view', entityType: 'StockMovement')
 *   — best-effort, never throws (see src/lib/admin/audit.ts).
 *
 * T1-DEEP layout:
 *   - Top: low-stock alert banner (rendered only when there are items
 *     with quantity <= lowStockThreshold across all warehouses).
 *   - Filters: type + reference (same as before).
 *   - Table: added a "انبار" (Warehouse) column between "SKU" and "نوع
 *     حرکت" — shows the warehouse name + code when the movement is
 *     warehouse-scoped, or "—" for legacy system-wide movements.
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { storeDb } from "@/lib/store-db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { Boxes, Search, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Movement types (mirrors /api/admin/store/inventory ALLOWED_TYPES) ──
const MOVEMENT_TYPES = [
  "RECEIVE",
  "SALE",
  "RETURN",
  "TRANSFER",
  "ADJUSTMENT",
  "DAMAGE",
] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const TYPE_LABEL: Record<string, string> = {
  RECEIVE: "دریافت",
  SALE: "فروش",
  RETURN: "مرجوعی",
  TRANSFER: "انتقال",
  ADJUSTMENT: "تعدیل",
  DAMAGE: "ضایعات",
};

const TYPE_CLS: Record<string, string> = {
  RECEIVE: "bg-emerald-100 text-emerald-700",
  SALE: "bg-blue-100 text-blue-700",
  RETURN: "bg-orange-100 text-orange-700",
  TRANSFER: "bg-violet-100 text-violet-700",
  ADJUSTMENT: "bg-amber-100 text-amber-700",
  DAMAGE: "bg-red-100 text-red-700",
};

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default async function StoreInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; reference?: string; limit?: string }>;
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
  const typeParam = sp?.type ?? "";
  const referenceParam = (sp?.reference ?? "").trim();
  const limitParam = Math.min(500, Number(sp?.limit) || 100);

  const typeFilter: MovementType | undefined = MOVEMENT_TYPES.includes(
    typeParam as MovementType,
  )
    ? (typeParam as MovementType)
    : undefined;

  // ── 3. Query storeDb.stockMovement with part info (T1-DEEP: + warehouse) ──
  const where: {
    type?: MovementType;
    reference?: { contains: string };
  } = {};
  if (typeFilter) where.type = typeFilter;
  if (referenceParam) where.reference = { contains: referenceParam };

  let movements: Array<{
    id: string;
    partId: string;
    type: string;
    quantity: number;
    balanceAfter: number;
    reason: string | null;
    reference: string | null;
    createdBy: string | null;
    warehouseId: string | null;
    createdAt: Date;
    part: {
      id: string;
      name: string;
      nameFa: string | null;
      sku: string;
      stock: number;
    } | null;
    warehouse: { id: string; name: string; code: string } | null;
  }> = [];

  try {
    movements = await storeDb.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitParam,
      include: {
        part: {
          select: {
            id: true,
            name: true,
            nameFa: true,
            sku: true,
            stock: true,
          },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  } catch (e) {
    console.error("[admin/store/inventory] query failed:", e);
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          خطا در بارگذاری حرکت‌های انبار. لطفاً اتصال به پایگاه دادهٔ فروشگاه
          را بررسی کنید.
        </div>
      </div>
    );
  }

  // ── 3b. T1-DEEP — fetch low-stock items for the alert banner ──
  // We use the same storeDb call as the /api/admin/store/inventory/low-stock
  // route (just inlined here since this is a server component). Falls back
  // to [] if the table is empty (e.g. before any warehouses are seeded).
  let lowStockItems: Array<{
    id: string;
    quantity: number;
    reserved: number;
    lowStockThreshold: number;
    part: {
      id: string;
      name: string;
      nameFa: string | null;
      sku: string;
    } | null;
    warehouse: { id: string; name: string; code: string } | null;
  }> = [];
  try {
    const allBalances = await storeDb.inventoryBalance.findMany({
      take: 500,
      include: {
        part: { select: { id: true, name: true, nameFa: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { quantity: "asc" },
    });
    lowStockItems = allBalances
      .filter((b) => b.quantity <= b.lowStockThreshold)
      .slice(0, 20);
  } catch (e) {
    // If InventoryBalance table doesn't exist (pre-T1-DEEP db), silently
    // skip the low-stock banner — the movements table is the source of
    // truth for the rest of the page.
    console.warn("[admin/store/inventory] low-stock query skipped:", e);
  }

  // ── 4. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "store.inventory.list_view",
    entityType: "StockMovement",
    reason: "viewed inventory movements list",
  });

  // ── 5. Render ──
  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* T1-DEEP — Low-Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-800">
              هشدار موجودی کم — {toFa(lowStockItems.length)} قلم در آستانهٔ
              اتمام موجودی
            </h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {lowStockItems.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 text-xs text-amber-900"
              >
                <span className="font-medium">
                  {b.part?.nameFa ?? b.part?.name ?? "—"}
                  <span className="font-mono text-[10px] text-amber-700">
                    {" "}
                    ({b.part?.sku ?? "—"})
                  </span>
                </span>
                <span className="font-mono">
                  {b.warehouse ? `${b.warehouse.name} · ` : ""}
                  موجودی: {toFa(b.quantity)} (آستانه:{" "}
                  {toFa(b.lowStockThreshold)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-zinc-400" />
            <select
              name="type"
              defaultValue={typeFilter ?? ""}
              className={INPUT_CLS}
            >
              <option value="">همه انواع</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            name="reference"
            defaultValue={referenceParam}
            placeholder="جستجوی رفرنس (مثلاً شناسه سفارش یا PO)…"
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
      {movements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Boxes className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ حرکت انباری یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            با ثبت دریافت، فروش یا مرجوعی، ردیف‌ها اینجا نمایش داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">قطعه</th>
                  <th className="px-3 py-3 text-right font-bold">SKU</th>
                  <th className="px-3 py-3 text-right font-bold">انبار</th>
                  <th className="px-3 py-3 text-right font-bold">نوع حرکت</th>
                  <th className="px-3 py-3 text-right font-bold">تعداد</th>
                  <th className="px-3 py-3 text-right font-bold">
                    موجودی پس از حرکت
                  </th>
                  <th className="px-3 py-3 text-right font-bold">دلیل</th>
                  <th className="px-3 py-3 text-right font-bold">رفرنس</th>
                  <th className="px-3 py-3 text-right font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-bold text-zinc-800">
                      {m.part ? (
                        <Link
                          href={`/admin/store/parts?partId=${m.part.id}`}
                          className="hover:text-[#F58220]"
                        >
                          {m.part.nameFa ?? m.part.name}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">حذف‌شده</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-zinc-500">
                      {m.part?.sku ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      {m.warehouse ? (
                        <span className="inline-flex flex-col">
                          <span className="font-medium">{m.warehouse.name}</span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {m.warehouse.code}
                          </span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          TYPE_CLS[m.type] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {TYPE_LABEL[m.type] ?? m.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-zinc-700">
                      {m.quantity > 0 ? "+" : ""}
                      {toFa(m.quantity)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-zinc-900">
                      {toFa(m.balanceAfter)}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      {m.reason ?? "—"}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-zinc-500">
                      {m.reference ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {faDate(m.createdAt)} · {timeAgo(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(movements.length)} حرکت انبار
        {lowStockItems.length > 0
          ? ` · ${toFa(lowStockItems.length)} قلم در وضعیت موجودی کم`
          : ""}
      </p>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <Boxes className="h-6 w-6 text-[#F58220]" />
        موجودی انبار
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        دفتر حرکت‌های انبار (Stock Movement Ledger) — ثبت دریافت، فروش،
        مرجوعی، انتقال، تعدیل و ضایعات
      </p>
    </div>
  );
}
