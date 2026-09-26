/**
 * HEAVIX — Store Inventory Admin Page
 * /admin/store/inventory — stock movement ledger list view.
 * T-A — Store Domain Completion: admin UI for the inventory domain.
 *
 * Pattern: server component (same as /admin/conversations +
 * /admin/sellers). Reads URL searchParams for filter state.
 *
 * Permission: store.read (canonical admin read gate; the API
 * route GET /api/admin/store/inventory also uses store.read).
 *
 * Audit: logAudit('store.inventory.list_view', entityType: 'StockMovement')
 *   — best-effort, never throws (see src/lib/admin/audit.ts).
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { storeDb } from "@/lib/store-db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { Boxes, Search } from "lucide-react";
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

  // ── 3. Query storeDb.stockMovement with part info ──
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
    createdAt: Date;
    part: {
      id: string;
      name: string;
      nameFa: string | null;
      sku: string;
      stock: number;
    } | null;
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
