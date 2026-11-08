"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WarehouseOption = { id: string; name: string; code: string };

export default function InitialStockAllocation({
  part,
  warehouses,
}: {
  part: { id: string; name: string; nameFa: string | null; sku: string; stock: number };
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    if (!warehouseId || !reason.trim()) {
      setError("انتخاب انبار و ثبت دلیل تخصیص الزامی است.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/store/inventory/initial-allocation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, warehouseId, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || `خطا در تخصیص موجودی (HTTP ${response.status})`);
      }
      setNotice("موجودی اولیه با موفقیت به انبار انتخاب‌شده تخصیص یافت.");
      setReason("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-right">
      <div className="text-xs font-bold text-amber-900">تخصیص صریح موجودی اولیه</div>
      <div className="mt-1 text-[11px] text-amber-800">
        موجودی ثبت‌شده قطعه: <strong className="font-mono">{part.stock.toLocaleString("fa-IR")}</strong>
        {" "}· این مقدار بدون افزایش یا کاهش، به یک انبار فعال منتقل و فقط یک‌بار تخصیص داده می‌شود.
      </div>
      {warehouses.length === 0 ? (
        <p className="mt-2 text-xs text-amber-800">برای تخصیص، ابتدا باید حداقل یک انبار فعال تعریف شود.</p>
      ) : (
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1.5fr_auto]">
          <select
            aria-label="انبار مقصد"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            disabled={busy}
            className="h-9 rounded-lg border border-amber-300 bg-white px-2 text-xs"
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>
            ))}
          </select>
          <input
            aria-label="دلیل تخصیص"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            disabled={busy}
            placeholder="دلیل و مرجع شمارش یا سند موجودی اولیه"
            className="h-9 rounded-lg border border-amber-300 bg-white px-2 text-xs"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !warehouseId || !reason.trim()}
            className="h-9 rounded-lg bg-amber-800 px-3 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "در حال ثبت..." : "تخصیص موجودی"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    </div>
  );
}
