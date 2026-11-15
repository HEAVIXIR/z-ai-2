import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import WarehouseTransferForm from "../warehouse-transfer-form";
import { ArrowRight, ArrowLeftRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryTransfersPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "inventory.read");
    await requirePermission(user.id, "inventory.manage");
  } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires inventory.manage</div>;
  }

  let warehouses: Array<{ id: string; name: string; code: string }> = [];
  let parts: Array<{
    id: string;
    name: string;
    nameFa: string | null;
    sku: string;
    stock: number;
    inventoryBalances: Array<{ warehouseId: string; quantity: number; reserved: number }>;
  }> = [];
  let loadError = false;

  try {
    [warehouses, parts] = await Promise.all([
      storeDb.warehouse.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true },
      }),
      storeDb.part.findMany({
        where: { active: true },
        orderBy: [{ sku: "asc" }, { id: "asc" }],
        take: 1000,
        select: {
          id: true,
          name: true,
          nameFa: true,
          sku: true,
          stock: true,
          inventoryBalances: {
            where: { warehouse: { active: true } },
            select: { warehouseId: true, quantity: true, reserved: true },
          },
        },
      }),
    ]);
  } catch (error) {
    loadError = true;
    console.error("[admin/store/inventory/transfers] load failed:", error);
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/store/inventory" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-[#F58220]">
            <ArrowRight className="h-4 w-4" />
            بازگشت به دفتر انبار
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-black text-zinc-900">
            <ArrowLeftRight className="h-6 w-6 text-violet-700" />
            انتقال بین انبارها
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
            انتقال موجودی آزاد بین دو انبار فعال با ثبت دو حرکت جفت‌شده، رفرنس مشترک و Audit Outbox اتمیک.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/store/inventory/reconciliation" className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:border-[#F58220]">
            گزارش مغایرت‌گیری
          </Link>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          بارگذاری قطعات و انبارها انجام نشد. اتصال پایگاه داده فروشگاه را بررسی کنید.
        </div>
      ) : (
        <>
          <WarehouseTransferForm parts={parts} warehouses={warehouses} />
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs leading-6 text-zinc-600">
            <strong className="text-zinc-900">قواعد انتقال:</strong>
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>انبار مبدأ و مقصد باید متفاوت و هر دو فعال باشند.</li>
              <li>مقدار قابل انتقال از موجودی فیزیکی پس از کسر رزرو محاسبه می‌شود.</li>
              <li>در صورت نبود ردیف مقصد، موجودی صفر ایجاد می‌شود؛ هیچ موجودی جدیدی خلق نمی‌شود.</li>
              <li>موجودی کل قطعه ثابت می‌ماند؛ دو حرکت با رفرنس مشترک ثبت می‌شوند.</li>
              <li>اگر هر مرحله شکست بخورد، تغییر هر دو انبار، دفتر حرکت و Audit به‌صورت کامل Rollback می‌شود.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
