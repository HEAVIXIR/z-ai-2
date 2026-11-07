"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ReturnItem = {
  id: string;
  quantity: number;
  condition: string | null;
  restockable: boolean;
  orderItem: {
    id: string;
    partNameSnapshot: string;
    quantity: number;
    lineTotalIrr: number;
  };
};

type ReturnRecord = {
  id: string;
  status: string;
  reason: string;
  inspection: string | null;
  resolution: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    customer: { id: string; name: string; family: string; phone: string } | null;
  } | null;
  items: ReturnItem[];
};

type Warehouse = { id: string; name: string; code: string };
type WalletTransaction = { id: string; amount: number; type: string; description: string | null; createdAt: string };
type ReturnMovement = {
  id: string;
  quantity: number;
  balanceAfter: number;
  warehouseId: string | null;
  createdAt: string;
  part: { name: string; nameFa: string | null; sku: string } | null;
  warehouse: { name: string; code: string } | null;
};

const CONDITIONS = [
  { value: "UNOPENED", label: "بازنشده" },
  { value: "DAMAGED", label: "آسیب‌دیده" },
  { value: "WRONG_ITEM", label: "کالای اشتباه" },
  { value: "OTHER", label: "سایر" },
];

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "درخواست‌شده",
  APPROVED: "تأییدشده",
  INSPECTED: "کارشناسی‌شده",
  RESOLVED: "حل‌شده",
  REJECTED: "ردشده",
};

const money = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(Math.round(Number(value) || 0)) + " ریال";

export default function ReturnLifecycleClient({
  initialReturn,
  warehouses,
  walletTransactions,
  returnMovements,
  canManage,
}: {
  initialReturn: ReturnRecord;
  warehouses: Warehouse[];
  walletTransactions: WalletTransaction[];
  returnMovements: ReturnMovement[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [inspection, setInspection] = useState(initialReturn.inspection ?? "");
  const [itemConditions, setItemConditions] = useState(
    initialReturn.items.map((item) => ({
      itemId: item.id,
      restockable: item.restockable,
      condition: item.condition ?? "UNOPENED",
    })),
  );
  const [resolution, setResolution] = useState("REFUND");
  const [warehouseId, setWarehouseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hasRestockable = useMemo(
    () => itemConditions.some((item) => item.restockable),
    [itemConditions],
  );

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/store/returns/${initialReturn.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `خطا در ثبت عملیات (HTTP ${response.status})`);
      }
      setNotice("عملیات با موفقیت ثبت شد.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setBusy(false);
    }
  }

  const isTerminal = ["RESOLVED", "REJECTED"].includes(initialReturn.status);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/store/returns" className="text-sm text-zinc-500 hover:text-[#F58220]">
            بازگشت به فهرست مرجوعی‌ها
          </Link>
          <h1 className="mt-2 text-2xl font-black text-zinc-900">
            رسیدگی به مرجوعی {initialReturn.order?.orderNumber ?? "بدون سفارش"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            شناسه: <span dir="ltr" className="font-mono">{initialReturn.id}</span>
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-bold text-zinc-700">
          {STATUS_LABEL[initialReturn.status] ?? initialReturn.status}
        </span>
      </div>

      {(error || notice) && (
        <div role="alert" className={error
          ? "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"}>
          {error || notice}
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 md:grid-cols-2">
        <div>
          <h2 className="font-bold text-zinc-900">اطلاعات سفارش و مشتری</h2>
          <p className="mt-2 text-sm text-zinc-600">شماره سفارش: {initialReturn.order?.orderNumber ?? "—"}</p>
          <p className="mt-1 text-sm text-zinc-600">وضعیت سفارش: {initialReturn.order?.status ?? "—"}</p>
          <p className="mt-1 text-sm text-zinc-600">وضعیت پرداخت: {initialReturn.order?.paymentStatus ?? "—"}</p>
          <p className="mt-1 text-sm text-zinc-600">
            مشتری: {initialReturn.order?.customer
              ? `${initialReturn.order.customer.name} ${initialReturn.order.customer.family}`
              : "—"}
          </p>
          {initialReturn.order?.customer?.phone && (
            <p dir="ltr" className="mt-1 text-right font-mono text-sm text-zinc-500">
              {initialReturn.order.customer.phone}
            </p>
          )}
        </div>
        <div>
          <h2 className="font-bold text-zinc-900">درخواست مرجوعی</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{initialReturn.reason}</p>
          <p className="mt-2 text-xs text-zinc-400">
            ثبت‌شده: {new Date(initialReturn.createdAt).toLocaleString("fa-IR")}
          </p>
          {initialReturn.resolution && (
            <p className="mt-2 text-sm text-zinc-600">نتیجه: {initialReturn.resolution}</p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="font-bold text-zinc-900">اقلام مرجوعی</h2>
        </div>
        {initialReturn.items.length === 0 ? (
          <p className="p-5 text-sm text-amber-700">برای این مرجوعی قلمی ثبت نشده است؛ پیش از حل‌وفصل، اطلاعات آن را بررسی کنید.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {initialReturn.items.map((item, index) => {
              const current = itemConditions.find((entry) => entry.itemId === item.id);
              return (
                <div key={item.id} className="grid gap-3 p-5 md:grid-cols-[1fr_180px_180px] md:items-center">
                  <div>
                    <p className="font-bold text-zinc-800">{item.orderItem?.partNameSnapshot ?? "قطعه"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      تعداد مرجوعی: {item.quantity} از {item.orderItem?.quantity ?? "—"} · مبلغ مبنا: {money(item.orderItem?.lineTotalIrr ?? 0)}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={Boolean(current?.restockable)}
                      disabled={isTerminal || busy || !canManage}
                      onChange={(event) => setItemConditions((prev) => prev.map((entry) =>
                        entry.itemId === item.id ? { ...entry, restockable: event.target.checked } : entry
                      ))}
                      className="h-4 w-4 accent-[#F58220]"
                    />
                    قابل بازگشت به موجودی فروش
                  </label>
                  <label className="text-sm text-zinc-600">
                    وضعیت کالا
                    <select
                      value={current?.condition ?? "UNOPENED"}
                      disabled={isTerminal || busy || !canManage}
                      onChange={(event) => setItemConditions((prev) => prev.map((entry) =>
                        entry.itemId === item.id ? { ...entry, condition: event.target.value } : entry
                      ))}
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                    >
                      {CONDITIONS.map((condition) => (
                        <option key={condition.value} value={condition.value}>{condition.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!canManage && !isTerminal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          دسترسی مشاهده دارید، اما برای تأیید، کارشناسی یا حل‌وفصل مرجوعی مجوز returns.manage لازم است.
        </div>
      )}

      {canManage && !isTerminal && initialReturn.status === "REQUESTED" && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-950">مرحله اول: تأیید درخواست</h2>
          <p className="mt-1 text-sm text-blue-800">پس از تأیید، می‌توانید اقلام را کارشناسی کنید.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => mutate({ status: "APPROVED" })}
            className="mt-4 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "در حال ثبت…" : "تأیید درخواست مرجوعی"}
          </button>
        </section>
      )}

      {canManage && !isTerminal && ["APPROVED", "INSPECTED"].includes(initialReturn.status) && (
        <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5">
          <div>
            <h2 className="font-bold text-zinc-900">مرحله دوم: کارشناسی کالا</h2>
            <p className="mt-1 text-sm text-zinc-500">قابل‌فروش بودن هر قلم را جداگانه تعیین کنید. اقلام غیرقابل‌فروش به موجودی قابل‌فروش اضافه نمی‌شوند.</p>
          </div>
          <label className="block text-sm font-medium text-zinc-700">
            یادداشت کارشناسی
            <textarea
              value={inspection}
              onChange={(event) => setInspection(event.target.value)}
              disabled={busy}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-xl border border-zinc-200 p-3 text-sm"
              placeholder="شرح وضعیت کالا و نتیجه بررسی…"
            />
          </label>
          <button
            type="button"
            disabled={busy || initialReturn.items.length === 0}
            onClick={() => mutate({ action: "inspect", inspection, itemConditions })}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            ثبت کارشناسی
          </button>
        </section>
      )}

      {canManage && !isTerminal && initialReturn.status === "INSPECTED" && (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="font-bold text-zinc-900">مرحله سوم: تصمیم نهایی</h2>
            <p className="mt-1 text-sm text-zinc-500">برای REFUND یا EXCHANGE، اگر قلمی قابل بازگشت به موجودی باشد، انبار مقصد باید صریحاً انتخاب شود.</p>
          </div>
          <label className="block text-sm text-zinc-700">
            نوع تصمیم
            <select
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              disabled={busy}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3"
            >
              <option value="REFUND">بازپرداخت (REFUND)</option>
              <option value="EXCHANGE">تعویض (EXCHANGE)</option>
              <option value="REJECT">رد مرجوعی (REJECT)</option>
            </select>
          </label>
          {resolution !== "REJECT" && hasRestockable && (
            <label className="block text-sm text-zinc-700">
              انبار مقصد <span className="text-red-600">*</span>
              <select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                disabled={busy}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3"
              >
                <option value="">انتخاب انبار فعال…</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
              {warehouses.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">هیچ انبار فعالی در دسترس نیست؛ ابتدا وضعیت انبارها را بررسی کنید.</span>
              )}
            </label>
          )}
          <div className="rounded-xl bg-zinc-50 p-3 text-xs leading-6 text-zinc-600">
            {resolution === "REJECT"
              ? "این تصمیم هیچ موجودی قابل‌فروشی را افزایش نمی‌دهد."
              : hasRestockable
                ? "اقلام قابل‌فروش در انبار انتخابی ثبت می‌شوند؛ اگر مغایرت موجودی وجود داشته باشد، سرویس با خطای 409 عملیات را متوقف می‌کند."
                : "هیچ قلمی برای بازگشت به موجودی قابل‌فروش انتخاب نشده است."}
          </div>
          <button
            type="button"
            disabled={busy || (resolution !== "REJECT" && hasRestockable && !warehouseId)}
            onClick={() => mutate({
              action: "resolve",
              resolution,
              ...(resolution !== "REJECT" && hasRestockable ? { warehouseId } : {}),
            })}
            className="rounded-xl bg-[#F58220] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "در حال ثبت…" : "ثبت تصمیم نهایی"}
          </button>
        </section>
      )}

      {(isTerminal || walletTransactions.length > 0 || returnMovements.length > 0) && (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-bold text-zinc-900">نتیجه مالی و گردش انبار</h2>
          <div>
            <h3 className="text-sm font-bold text-zinc-700">تراکنش‌های کیف پول / بازپرداخت</h3>
            {walletTransactions.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">تراکنش بازپرداختی برای این مرجوعی ثبت نشده است.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {walletTransactions.map((txn) => (
                  <div key={txn.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-bold text-zinc-800">{txn.type === "CREDIT" ? "بستانکار / بازپرداخت" : txn.type}</span>
                      <span className="font-bold text-emerald-700">{money(txn.amount)}</span>
                    </div>
                    <p className="mt-1 break-all text-[11px] text-zinc-500" dir="ltr">{txn.id}</p>
                    <p className="mt-1 text-xs text-zinc-500">{txn.description ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-700">حرکات ورود کالای مرجوعی</h3>
            {returnMovements.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">حرکت ورود به انبار برای این مرجوعی ثبت نشده است.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {returnMovements.map((movement) => (
                  <div key={movement.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                    <p className="font-bold text-zinc-800">{movement.part?.nameFa || movement.part?.name || "قطعه"}</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      تعداد ورودی: {movement.quantity} · موجودی پس از حرکت: {movement.balanceAfter}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      انبار: {movement.warehouse ? `${movement.warehouse.name} (${movement.warehouse.code})` : "انبار مشخص نشده"}
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] text-zinc-400" dir="ltr">{movement.id}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {isTerminal && (
        <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <h2 className="font-bold text-zinc-900">مرجوعی نهایی شده است</h2>
          <p className="mt-1 text-sm text-zinc-600">وضعیت نهایی: {STATUS_LABEL[initialReturn.status] ?? initialReturn.status}</p>
        </section>
      )}
    </div>
  );
}
