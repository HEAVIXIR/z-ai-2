import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import { toFa } from "@/lib/format";
import InitialStockAllocation from "../initial-stock-allocation";

export const dynamic = "force-dynamic";

type Issue = "MISMATCH" | "RESERVED_EXCEEDS" | "INACTIVE_STOCK" | "LEGACY_UNALLOCATED" | "NEGATIVE_STOCK" | "CONSISTENT" | "NO_STOCK";

const LABEL: Record<Issue, string> = {
  MISMATCH: "مغایرت موجودی کل و انبارها",
  RESERVED_EXCEEDS: "رزرو بیشتر از موجودی",
  INACTIVE_STOCK: "موجودی در انبار غیرفعال",
  LEGACY_UNALLOCATED: "موجودی قدیمی بدون تخصیص انبار",
  NEGATIVE_STOCK: "موجودی منفی",
  CONSISTENT: "همگام",
  NO_STOCK: "بدون موجودی",
};

const STYLE: Record<Issue, string> = {
  MISMATCH: "border-red-200 bg-red-50 text-red-800",
  RESERVED_EXCEEDS: "border-red-200 bg-red-50 text-red-800",
  INACTIVE_STOCK: "border-amber-200 bg-amber-50 text-amber-800",
  LEGACY_UNALLOCATED: "border-amber-200 bg-amber-50 text-amber-800",
  NEGATIVE_STOCK: "border-red-200 bg-red-50 text-red-800",
  CONSISTENT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  NO_STOCK: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

export default async function InventoryReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; onlyIssues?: string; cursor?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  try {
    await requirePermission(user.id, "inventory.read");
  } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires inventory.read</div>;
  }

  let canManageInventory = false;
  let activeWarehouses: Array<{ id: string; name: string; code: string }> = [];
  try {
    await requirePermission(user.id, "inventory.manage");
    canManageInventory = true;
    activeWarehouses = await storeDb.warehouse.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });
  } catch {
    canManageInventory = false;
    activeWarehouses = [];
  }

  const sp = await searchParams;
  const limit = Math.max(1, Math.min(500, Number(sp.limit) || 200));
  const onlyIssues = sp.onlyIssues === "1";
  const cursor = sp.cursor || undefined;

  const [partsPlusOne, totalParts] = await Promise.all([
    storeDb.part.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ sku: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        nameFa: true,
        sku: true,
        stock: true,
        inventoryBalances: {
          orderBy: [{ warehouseId: "asc" }, { id: "asc" }],
          select: {
            id: true,
            warehouseId: true,
            quantity: true,
            reserved: true,
            lowStockThreshold: true,
            warehouse: { select: { id: true, name: true, code: true, active: true } },
          },
        },
      },
    }),
    storeDb.part.count(),
  ]);

  const hasMore = partsPlusOne.length > limit;
  const parts = partsPlusOne.slice(0, limit);
  const report = parts.map((part) => {
    const warehouseTotal = part.inventoryBalances.reduce((sum, row) => sum + row.quantity, 0);
    const reservedInvalid = part.inventoryBalances.some((row) => row.reserved < 0 || row.reserved > row.quantity);
    const inactiveStock = part.inventoryBalances.some((row) => !row.warehouse.active && row.quantity > 0);
    const issues: Issue[] = [];
    if (part.stock < 0 || part.inventoryBalances.some((row) => row.quantity < 0)) {
      issues.push("NEGATIVE_STOCK");
    }
    if (part.inventoryBalances.length === 0) {
      if (part.stock > 0) issues.push("LEGACY_UNALLOCATED");
      else if (part.stock === 0) issues.push("NO_STOCK");
    } else {
      if (warehouseTotal !== part.stock) issues.push("MISMATCH");
      if (reservedInvalid) issues.push("RESERVED_EXCEEDS");
      if (inactiveStock) issues.push("INACTIVE_STOCK");
      if (issues.length === 0) issues.push("CONSISTENT");
    }
    return { ...part, warehouseTotal, delta: part.stock - warehouseTotal, issues };
  });

  const visible = onlyIssues
    ? report.filter((row) => row.issues.some((issue) => !["CONSISTENT", "NO_STOCK"].includes(issue)))
    : report;
  const summary = {
    mismatch: report.filter((row) => row.issues.includes("MISMATCH")).length,
    legacy: report.filter((row) => row.issues.includes("LEGACY_UNALLOCATED")).length,
    negative: report.filter((row) => row.issues.includes("NEGATIVE_STOCK")).length,
    reservation: report.filter((row) => row.issues.includes("RESERVED_EXCEEDS")).length,
    inactive: report.filter((row) => row.issues.includes("INACTIVE_STOCK")).length,
    consistent: report.filter((row) => row.issues.includes("CONSISTENT")).length,
  };

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/store/inventory" className="text-sm text-zinc-500 hover:text-[#F58220]">بازگشت به دفتر انبار</Link>
          <h1 className="mt-2 text-2xl font-black text-zinc-900">گزارش مغایرت‌گیری موجودی</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            گزارش فقط‌خواندنی برای مقایسه Part.stock با مجموع موجودی انبارها، رزروها و وضعیت انبارها.
            این صفحه هیچ اصلاح یا تخصیص خودکاری انجام نمی‌دهد.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageInventory && (
            <Link
              href="/admin/store/inventory/transfers"
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100"
            >
              انتقال بین انبارها
            </Link>
          )}
          <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-600">
            نمایش {toFa(report.length)} از {toFa(totalParts)} قطعه
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Summary label="مغایرت کل" value={summary.mismatch} tone="red" />
        <Summary label="بدون تخصیص انبار" value={summary.legacy} tone="amber" />
        <Summary label="موجودی منفی" value={summary.negative} tone="red" />
        <Summary label="رزرو نامعتبر" value={summary.reservation} tone="red" />
        <Summary label="انبار غیرفعال" value={summary.inactive} tone="amber" />
        <Summary label="همگام" value={summary.consistent} tone="emerald" />
      </div>
      <p className="text-[11px] text-zinc-400">
        اعداد خلاصه فقط مربوط به قطعات همین صفحه هستند؛ تعداد کل قطعات در بالای گزارش نمایش داده شده و با صفحه بعد می‌توانید ادامه دهید.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={onlyIssues ? `/admin/store/inventory/reconciliation?limit=${limit}` : `/admin/store/inventory/reconciliation?limit=${limit}&onlyIssues=1`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 hover:border-[#F58220]"
        >
          {onlyIssues ? "نمایش همه قطعات" : "فقط موارد نیازمند بررسی"}
        </Link>
        <span className="text-xs text-zinc-400">گزارش صفحه‌ای و فقط‌خواندنی است؛ هر صفحه حداکثر ۵۰۰ قطعه دارد.</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          موردی در این صفحه برای بررسی وجود ندارد.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-3 text-right">قطعه / SKU</th>
                <th className="px-3 py-3 text-center">Part.stock</th>
                <th className="px-3 py-3 text-center">جمع انبارها</th>
                <th className="px-3 py-3 text-center">اختلاف</th>
                <th className="px-3 py-3 text-right">جزئیات انبارها</th>
                <th className="px-3 py-3 text-center">نتیجه بررسی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((part) => (
                <tr key={part.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-bold text-zinc-800">{part.nameFa || part.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-400" dir="ltr">{part.sku}</div>
                  </td>
                  <td className="px-3 py-3 text-center font-mono">{toFa(part.stock)}</td>
                  <td className="px-3 py-3 text-center font-mono">{toFa(part.warehouseTotal)}</td>
                  <td className="px-3 py-3 text-center font-mono">{part.delta > 0 ? "+" : ""}{toFa(part.delta)}</td>
                  <td className="px-3 py-3">
                    {part.inventoryBalances.length === 0 ? (
                      <span className="text-xs text-zinc-400">هیچ ردیف انباری ثبت نشده</span>
                    ) : (
                      <div className="space-y-1">
                        {part.inventoryBalances.map((balance) => (
                          <div key={balance.id} className="text-xs text-zinc-600">
                            <span className="font-bold">{balance.warehouse.name} ({balance.warehouse.code})</span>
                            {!balance.warehouse.active && <span className="mr-1 text-amber-700">غیرفعال</span>}
                            <span className="mr-2">موجودی {toFa(balance.quantity)} · رزرو {toFa(balance.reserved)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-wrap justify-center gap-1">
                      {part.issues.map((issue) => (
                        <span key={issue} className={`inline-block rounded-full border px-2 py-1 text-[11px] font-bold ${STYLE[issue]}`}>
                          {LABEL[issue]}
                        </span>
                      ))}
                    </div>
                    {canManageInventory && part.inventoryBalances.length === 0 && part.stock >= 0 && (
                      <InitialStockAllocation
                        part={{
                          id: part.id,
                          name: part.name,
                          nameFa: part.nameFa,
                          sku: part.sku,
                          stock: part.stock,
                        }}
                        warehouses={activeWarehouses}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {cursor ? (
          <Link
            href={`/admin/store/inventory/reconciliation?limit=${limit}${onlyIssues ? "&onlyIssues=1" : ""}`}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700"
          >
            بازگشت به صفحه اول
          </Link>
        ) : <span />}
        {hasMore && parts.length > 0 && (
          <Link
            href={`/admin/store/inventory/reconciliation?limit=${limit}&cursor=${parts[parts.length - 1].id}${onlyIssues ? "&onlyIssues=1" : ""}`}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white"
          >
            صفحه بعد
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
        <strong>قاعده ایمنی:</strong> این گزارش فقط داده‌ها را نشان می‌دهد. برای قطعات قدیمی بدون ردیف انبار،
        هیچ انبار تاریخی حدس زده نمی‌شود. برای مغایرت‌ها نیز هیچ مقدار موجودی به‌صورت خودکار تغییر نمی‌کند.
        هر اصلاح باید پس از بررسی انسانی، با انبار مقصد و دلیل صریح و از مسیر عملیاتی مجاز انجام شود.
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "emerald" }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{toFa(value)}</div>
    </div>
  );
}
