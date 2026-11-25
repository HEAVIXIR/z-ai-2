"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Part = { id: string; name: string; nameFa: string | null; sku: string; stock: number };
type Warehouse = { id: string; name: string; code: string };
type Payload = { parts: Part[]; warehouses: Warehouse[] };

export default function OpeningBalanceAllocationPanel() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload>({ parts: [], warehouses: [] });
  const [partId, setPartId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/store/inventory/opening-balance", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `خطا در دریافت فهرست (HTTP ${response.status})`);
      const data = result.data as Payload;
      setPayload(data);
      setPartId((current) => data.parts.some((part) => part.id === current) ? current : data.parts[0]?.id ?? "");
      setQuantities({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedPart = useMemo(
    () => payload.parts.find((part) => part.id === partId),
    [payload.parts, partId],
  );
  const invalidQuantity = payload.warehouses.some((warehouse) => {
    const quantity = quantities[warehouse.id] ?? 0;
    return quantity !== 0 && (!Number.isSafeInteger(quantity) || quantity < 0);
  });
  const allocated = payload.warehouses.reduce((sum, warehouse) => {
    const quantity = quantities[warehouse.id] ?? 0;
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  const allocationCount = payload.warehouses.filter((warehouse) => {
    const quantity = quantities[warehouse.id] ?? 0;
    return Number.isSafeInteger(quantity) && quantity > 0;
  }).length;
  const exact = Boolean(selectedPart && !invalidQuantity && allocated === selectedPart.stock && allocationCount > 0);

  async function submit() {
    if (!selectedPart || !exact || !reason.trim() || !confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const allocations = payload.warehouses
        .map((warehouse) => ({ warehouseId: warehouse.id, quantity: quantities[warehouse.id] ?? 0 }))
        .filter((item) => item.quantity > 0);
      const response = await fetch("/api/admin/store/inventory/opening-balance", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          partId: selectedPart.id,
          allocations,
          reason: reason.trim(),
          reference: reference.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `خطا در تخصیص (HTTP ${response.status})`);
      setNotice(`موجودی ${selectedPart.sku} با موفقیت بین ${allocations.length} انبار تخصیص یافت. موجودی کل قطعه تغییر نکرد.`);
      setReason("");
      setReference("");
      setQuantities({});
      setConfirmed(false);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای پیش‌بینی‌نشده");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5">
      <div>
        <h2 className="font-bold text-zinc-900">تخصیص صریح موجودی اولیه به انبارها</h2>
        <p className="mt-1 text-xs leading-6 text-zinc-600">
          فقط قطعات فعال دارای موجودی مثبت و فاقد هرگونه ردیف موجودی نمایش داده می‌شوند.
          موجودی تاریخی به‌صورت خودکار توزیع نمی‌شود؛ تخصیص باید دقیقاً با موجودی فعلی قطعه برابر باشد.
        </p>
      </div>
      {loading ? <p className="text-sm text-zinc-500">در حال دریافت اطلاعات...</p> : null}
      {!loading && (payload.parts.length === 0 || payload.warehouses.length === 0) ? (
        <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
          {payload.parts.length === 0
            ? "در حال حاضر قطعه فعالِ دارای موجودی تخصیص‌نیافته وجود ندارد."
            : "برای تخصیص موجودی، ابتدا حداقل یک انبار فعال ایجاد کنید."}
        </p>
      ) : null}
      {!loading && payload.parts.length > 0 && payload.warehouses.length > 0 ? (
        <div className="space-y-4">
          <label className="block text-xs font-bold text-zinc-600">
            قطعهٔ تخصیص‌نیافته
            <select
              value={partId}
              onChange={(event) => { setPartId(event.target.value); setQuantities({}); setConfirmed(false); }}
              disabled={busy}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            >
              {payload.parts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.nameFa || part.name} · {part.sku} · موجودی فعلی: {part.stock}
                </option>
              ))}
            </select>
          </label>
          {selectedPart ? (
            <>
              <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>موجودی فعلی و تغییرناپذیر قطعه</span>
                  <strong dir="ltr">{selectedPart.stock}</strong>
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2">
                  <span>مجموع تخصیص در پیش‌نمایش</span>
                  <strong dir="ltr">{allocated}</strong>
                </div>
                <p className={`mt-2 text-xs ${exact ? "text-emerald-700" : "text-amber-700"}`}>
                  {invalidQuantity
                    ? "همه مقادیر باید عدد صحیح امن و غیرمنفی باشند."
                    : exact
                      ? "مجموع تخصیص دقیقاً برابر موجودی قطعه است."
                      : `اختلاف با موجودی قطعه: ${selectedPart.stock - allocated}`}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {payload.warehouses.map((warehouse) => (
                  <label key={warehouse.id} className="text-xs font-bold text-zinc-600">
                    {warehouse.name} · {warehouse.code}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={quantities[warehouse.id] ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const value = raw === "" ? 0 : Number(raw);
                        setQuantities((current) => ({ ...current, [warehouse.id]: value }));
                        setConfirmed(false);
                      }}
                      disabled={busy}
                      className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                      placeholder="۰ یعنی بدون تخصیص"
                    />
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-zinc-600">
                  دلیل و مستند مبنای تخصیص
                  <input
                    value={reason}
                    onChange={(event) => { setReason(event.target.value); setConfirmed(false); }}
                    maxLength={500}
                    disabled={busy}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                    placeholder="مثلاً شمارش فیزیکی انبار در تاریخ..."
                  />
                </label>
                <label className="text-xs font-bold text-zinc-600">
                  شناسه مرجع (اختیاری)
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={160}
                    disabled={busy}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                    placeholder="شماره صورت‌جلسه یا سند"
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 rounded-xl border border-zinc-200 p-3 text-xs leading-6 text-zinc-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={busy}
                  className="mt-1"
                />
                تخصیص‌های بالا و تطابق کامل مجموع با موجودی فعلی را بررسی کرده‌ام و ثبت دائمی آن‌ها را تأیید می‌کنم.
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !exact || !reason.trim() || !confirmed}
                className="h-11 rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "در حال ثبت اتمیک..." : "تأیید و ثبت تخصیص اولیه"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
    </section>
  );
}
