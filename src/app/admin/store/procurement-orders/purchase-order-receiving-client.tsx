"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Warehouse = { id: string; name: string; code: string };
type POItem = {
  id: string;
  quantity: number;
  received: number;
  part: {
    id: string;
    name: string;
    nameFa: string | null;
    sku: string;
    stock: number;
    inventoryBalances: Array<{ warehouseId: string }>;
  };
};
type PurchaseOrder = {
  id: string;
  procurementId: string;
  status: string;
  createdAt: string;
  procurement: { id: string; title: string };
  items: POItem[];
};

export default function PurchaseOrderReceivingClient({
  purchaseOrders,
  warehouses,
  canReceive,
}: {
  purchaseOrders: PurchaseOrder[];
  warehouses: Warehouse[];
  canReceive: boolean;
}) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500">
        سفارش خرید تأییدشده یا تکمیل‌شده‌ای برای نمایش وجود ندارد.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {purchaseOrders.map((po) => (
        <section key={po.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-5 py-4">
            <div>
              <h2 className="font-bold text-zinc-900">{po.procurement.title}</h2>
              <p className="mt-1 font-mono text-[11px] text-zinc-400" dir="ltr">{po.id}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${po.status === "RECEIVED" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
              {po.status === "RECEIVED" ? "دریافت کامل" : "آماده دریافت"}
            </span>
          </div>
          <div className="divide-y divide-zinc-100">
            {po.items.map((item) => (
              <ReceiveLine
                key={item.id}
                procurementId={po.procurementId}
                purchaseOrderId={po.id}
                item={item}
                warehouses={warehouses}
                canReceive={canReceive && po.status === "APPROVED"}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReceiveLine({
  procurementId,
  purchaseOrderId,
  item,
  warehouses,
  canReceive,
}: {
  procurementId: string;
  purchaseOrderId: string;
  item: POItem;
  warehouses: Warehouse[];
  canReceive: boolean;
}) {
  const router = useRouter();
  const availableIds = useMemo(
    () => new Set(item.part.inventoryBalances.map((balance) => balance.warehouseId)),
    [item.part.inventoryBalances],
  );
  const availableWarehouses = useMemo(
    () => warehouses.filter((warehouse) => availableIds.has(warehouse.id)),
    [warehouses, availableIds],
  );
  const [warehouseId, setWarehouseId] = useState(availableWarehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const remaining = Math.max(0, item.quantity - item.received);

  useEffect(() => {
    if (!availableWarehouses.some((warehouse) => warehouse.id === warehouseId)) {
      setWarehouseId(availableWarehouses[0]?.id ?? "");
    }
  }, [availableWarehouses, warehouseId]);

  async function receive() {
    if (!warehouseId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > remaining) {
      setError("انبار و تعداد معتبر در محدوده باقی‌مانده سفارش را انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/store/procurement/${procurementId}/purchase-orders/${purchaseOrderId}/receive`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            poItemId: item.id,
            receivedQty: quantity,
            warehouseId,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `خطا در دریافت کالا (HTTP ${response.status})`);
      setNotice("دریافت کالا ثبت شد.");
      setQuantity(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_100px_100px_1fr_auto] md:items-center">
      <div>
        <div className="font-bold text-sm text-zinc-800">{item.part.nameFa || item.part.name}</div>
        <div className="mt-1 font-mono text-[10px] text-zinc-400" dir="ltr">{item.part.sku}</div>
        <div className="mt-1 text-[11px] text-zinc-500">موجودی کل فعلی: {item.part.stock}</div>
      </div>
      <div className="text-xs text-zinc-600">سفارش: <strong>{item.quantity}</strong></div>
      <div className="text-xs text-zinc-600">دریافت: <strong>{item.received}</strong></div>
      <div className="space-y-2">
        {remaining > 0 && canReceive ? (
          <>
            {availableWarehouses.length === 0 ? (
              <p className="text-xs text-amber-700">برای این قطعه در انبار فعال ردیف موجودی وجود ندارد؛ ابتدا تخصیص اولیه صریح لازم است.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={busy} className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-xs">
                  {availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}
                </select>
                <input type="number" min={1} max={remaining} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={busy} className="h-10 rounded-lg border border-zinc-200 px-2 text-xs" />
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-zinc-500">{remaining === 0 ? "این قلم کامل دریافت شده است." : "دسترسی ثبت دریافت ندارید."}</span>
        )}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
      </div>
      {remaining > 0 && canReceive && availableWarehouses.length > 0 && (
        <button type="button" onClick={receive} disabled={busy || !warehouseId} className="h-10 rounded-lg bg-zinc-900 px-4 text-xs font-bold text-white disabled:opacity-50">
          {busy ? "در حال ثبت..." : "ثبت دریافت"}
        </button>
      )}
    </div>
  );
}
