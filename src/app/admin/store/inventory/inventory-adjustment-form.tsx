"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WarehouseOption = { id: string; name: string; code: string };
type PartOption = {
  id: string;
  name: string;
  nameFa: string | null;
  sku: string;
  inventoryBalances: Array<{ warehouseId: string }>;
};
type MovementType = "RECEIVE" | "RETURN" | "SALE" | "DAMAGE" | "ADJUSTMENT";

export default function InventoryAdjustmentForm({
  parts,
  warehouses,
}: {
  parts: PartOption[];
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const selectedPart = useMemo(() => parts.find((part) => part.id === partId), [parts, partId]);
  const availableWarehouses = useMemo(() => {
    const ids = new Set(selectedPart?.inventoryBalances.map((balance) => balance.warehouseId) ?? []);
    return warehouses.filter((warehouse) => ids.has(warehouse.id));
  }, [selectedPart, warehouses]);
  const [warehouseId, setWarehouseId] = useState(availableWarehouses[0]?.id ?? "");
  const [type, setType] = useState<MovementType>("RECEIVE");
  const [quantity, setQuantity] = useState(1);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"IN" | "OUT">("IN");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function changePart(nextPartId: string) {
    setPartId(nextPartId);
    const nextPart = parts.find((part) => part.id === nextPartId);
    const nextIds = new Set(nextPart?.inventoryBalances.map((balance) => balance.warehouseId) ?? []);
    setWarehouseId(warehouses.find((warehouse) => nextIds.has(warehouse.id))?.id ?? "");
  }

  async function submit() {
    if (!partId || !warehouseId || !Number.isSafeInteger(quantity) || quantity <= 0 || !reason.trim()) {
      setError("قطعه، انبار، تعداد صحیح مثبت و دلیل عملیات الزامی است.");
      return;
    }
    const signedQuantity =
      type === "SALE" || type === "DAMAGE" || (type === "ADJUSTMENT" && adjustmentDirection === "OUT")
        ? -quantity
        : quantity;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/store/inventory", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          warehouseId,
          type,
          quantity: signedQuantity,
          reason: reason.trim(),
          reference: reference.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `خطا در ثبت حرکت (HTTP ${response.status})`);
      setNotice("حرکت موجودی با موفقیت ثبت شد.");
      setQuantity(1);
      setReason("");
      setReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="font-bold text-zinc-900">ثبت حرکت موجودی انبار</h2>
        <p className="mt-1 text-xs text-zinc-500">
          فقط قطعات دارای ردیف موجودی در انبار فعال نمایش داده می‌شوند. موجودی قدیمیِ تخصیص‌نیافته باید ابتدا از مسیر مغایرت‌گیری بررسی شود.
        </p>
      </div>
      {parts.length === 0 || warehouses.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          قطعه و انبار فعالِ دارای ردیف موجودی مشترک برای ثبت حرکت پیدا نشد.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-zinc-600">
            قطعه
            <select value={partId} onChange={(event) => changePart(event.target.value)} disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
              {parts.map((part) => <option key={part.id} value={part.id}>{part.nameFa || part.name} · {part.sku}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-zinc-600">
            انبار
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={busy || availableWarehouses.length === 0} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
              {availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-zinc-600">
            نوع حرکت
            <select value={type} onChange={(event) => setType(event.target.value as MovementType)} disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
              <option value="RECEIVE">دریافت (+)</option>
              <option value="RETURN">مرجوعی (+)</option>
              <option value="SALE">فروش (−)</option>
              <option value="DAMAGE">ضایعات (−)</option>
              <option value="ADJUSTMENT">تعدیل دستی</option>
            </select>
          </label>
          {type === "ADJUSTMENT" && (
            <label className="text-xs font-bold text-zinc-600">
              جهت تعدیل
              <select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value as "IN" | "OUT")} disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                <option value="IN">افزایش</option>
                <option value="OUT">کاهش</option>
              </select>
            </label>
          )}
          <label className="text-xs font-bold text-zinc-600">
            تعداد
            <input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-zinc-600 md:col-span-2">
            دلیل عملیات
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy} placeholder="مثلاً رسید خرید، شمارش فیزیکی، ضایعات..." className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-zinc-600">
            مرجع (اختیاری)
            <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} disabled={busy} placeholder="شناسه سند یا سفارش" className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={submit} disabled={busy || !warehouseId || !partId} className="h-11 w-full rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "در حال ثبت..." : "ثبت حرکت انبار"}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    </section>
  );
}
