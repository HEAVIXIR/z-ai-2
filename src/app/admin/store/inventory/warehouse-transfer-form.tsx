"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2, Package, Warehouse } from "lucide-react";

type WarehouseOption = { id: string; name: string; code: string };
type PartOption = {
  id: string;
  name: string;
  nameFa: string | null;
  sku: string;
  stock: number;
  inventoryBalances: Array<{
    warehouseId: string;
    quantity: number;
    reserved: number;
  }>;
};

const INPUT =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

export default function WarehouseTransferForm({
  parts,
  warehouses,
  initialHasMore,
  initialCursor,
  pageSize,
}: {
  parts: PartOption[];
  warehouses: WarehouseOption[];
  initialHasMore: boolean;
  initialCursor: string | null;
  pageSize: number;
}) {
  const router = useRouter();
  const [loadedParts, setLoadedParts] = useState(parts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [sourceWarehouseId, setSourceWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(warehouses.find((w) => w.id !== warehouses[0]?.id)?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const firstRender = useRef(true);
  const activeSearch = useRef<AbortController | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearching(true);
    setLoadingMore(false);
    setSearchError("");

    const params = new URLSearchParams({ limit: String(pageSize) });
    if (search.trim()) params.set("q", search.trim());

    fetch(`/api/admin/store/inventory/transfer-parts?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          throw new Error(payload?.error || "جستجوی قطعات انجام نشد");
        }
        setLoadedParts(payload.data);
        setHasMore(payload.hasMore === true);
        setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
        setPartId((current) =>
          payload.data.some((part: PartOption) => part.id === current)
            ? current
            : payload.data[0]?.id ?? "",
        );
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setSearchError(err instanceof Error ? err.message : "خطای نامشخص در جستجوی قطعات");
        setLoadedParts([]);
        setHasMore(false);
        setNextCursor(null);
        setPartId("");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });

    return () => controller.abort();
  }, [search, pageSize]);

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore || searching) return;
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setLoadingMore(true);
    setSearchError("");

    const params = new URLSearchParams({
      limit: String(pageSize),
      cursor: nextCursor,
    });
    if (search.trim()) params.set("q", search.trim());

    try {
      const response = await fetch(`/api/admin/store/inventory/transfer-parts?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
        throw new Error(payload?.error || "بارگذاری صفحه بعد انجام نشد");
      }
      setLoadedParts((current) => {
        const seen = new Set(current.map((part) => part.id));
        return [...current, ...payload.data.filter((part: PartOption) => !seen.has(part.id))];
      });
      setHasMore(payload.hasMore === true);
      setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSearchError(err instanceof Error ? err.message : "خطای نامشخص در بارگذاری قطعات");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  const selectedPart = loadedParts.find((part) => part.id === partId);
  const sourceBalance = selectedPart?.inventoryBalances.find(
    (balance) => balance.warehouseId === sourceWarehouseId,
  );
  const available = sourceBalance
    ? Math.max(0, sourceBalance.quantity - sourceBalance.reserved)
    : 0;
  const qty = Number(quantity);
  const valid = Boolean(
    selectedPart &&
    partId &&
    sourceWarehouseId &&
    destinationWarehouseId &&
    sourceWarehouseId !== destinationWarehouseId &&
    Number.isSafeInteger(qty) &&
    qty > 0 &&
    qty <= available &&
    reason.trim() &&
    !searching,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!valid) {
      setError("قطعه، دو انبار متفاوت، تعداد مجاز و دلیل انتقال را بررسی کنید.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/store/inventory/transfers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          sourceWarehouseId,
          destinationWarehouseId,
          quantity: qty,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "انتقال موجودی انجام نشد.");
      }

      const transfer = payload.data;
      setSuccess(
        `انتقال ${qty.toLocaleString("fa-IR")} عدد با موفقیت ثبت شد. رفرنس: ${transfer.transferReference}`,
      );
      setReason("");
      setQuantity("1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای نامشخص در انتقال موجودی");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-900">
            <ArrowLeftRight className="h-5 w-5 text-violet-700" />
            انتقال موجودی بین انبارها
          </h2>
          <p className="mt-1 text-xs leading-6 text-zinc-600">
            انتقال فقط موجودی آزاد را جابه‌جا می‌کند؛ موجودی کل قطعه تغییر نمی‌کند و دو حرکت جفت‌شده در دفتر انبار ثبت می‌شوند.
          </p>
        </div>
        <span className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-800">
          تراکنش اتمیک
        </span>
      </div>

      {parts.length === 0 && warehouses.length < 2 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          برای انتقال، حداقل یک قطعه و دو انبار فعال لازم است.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" aria-busy={searching || loadingMore}>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              جستجوی قطعه در کل فهرست فعال
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
                placeholder="نام فارسی، نام انگلیسی یا SKU"
                className={INPUT}
                aria-describedby="transfer-part-search-status"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              قطعه
              <select
                value={partId}
                onChange={(event) => setPartId(event.target.value)}
                className={INPUT}
                disabled={searching || loadedParts.length === 0}
              >
                {loadedParts.length === 0 ? (
                  <option value="">نتیجه‌ای پیدا نشد</option>
                ) : loadedParts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {(part.nameFa || part.name)} · {part.sku}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div id="transfer-part-search-status" role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
            {searching && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال جستجوی سمت سرور...</span>}
            {!searching && !searchError && <span>{loadedParts.length.toLocaleString("fa-IR")} قطعه در نتایج بارگذاری شده است.</span>}
            {searchError && <span className="text-red-700">{searchError}</span>}
            {hasMore && !searching && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 font-bold text-violet-800 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {loadingMore ? "در حال بارگذاری..." : "بارگذاری قطعات بیشتر"}
              </button>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              <span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" /> انبار مبدأ</span>
              <select
                value={sourceWarehouseId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSourceWarehouseId(next);
                  if (next === destinationWarehouseId) {
                    setDestinationWarehouseId(warehouses.find((warehouse) => warehouse.id !== next)?.id ?? "");
                  }
                }}
                className={INPUT}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} · {warehouse.code}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] font-medium text-zinc-500">
                قابل انتقال: {available.toLocaleString("fa-IR")} از {sourceBalance?.quantity?.toLocaleString("fa-IR") ?? "۰"} (پس از کسر رزرو)
              </span>
            </label>

            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              <span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" /> انبار مقصد</span>
              <select
                value={destinationWarehouseId}
                onChange={(event) => setDestinationWarehouseId(event.target.value)}
                className={INPUT}
              >
                {warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} · {warehouse.code}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] font-medium text-zinc-500">
                اگر برای این قطعه موجودی مقصد وجود نداشته باشد، ردیف صفر به‌صورت امن ساخته می‌شود.
              </span>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              تعداد انتقال
              <input
                type="number"
                min="1"
                max={available}
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className={INPUT}
                required
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-zinc-700">
              دلیل انتقال (اجباری)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="مثلاً جابه‌جایی موجودی برای سفارش شعبه شمال"
                className={INPUT}
                required
              />
            </label>
          </div>

          {selectedPart && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs text-zinc-600">
              <Package className="h-4 w-4 text-violet-700" />
              موجودی کل قطعه: <strong className="font-mono text-zinc-900">{selectedPart.stock.toLocaleString("fa-IR")}</strong>
              <span className="text-zinc-300">|</span>
              این مقدار پس از انتقال ثابت می‌ماند.
            </div>
          )}

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
          {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{success}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-zinc-500">
              رزروها قابل انتقال نیستند. عملیات در یک تراکنش PostgreSQL انجام می‌شود و در صورت شکست هر مرحله، کل انتقال Rollback خواهد شد.
            </p>
            <button
              type="submit"
              disabled={!valid || submitting}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
              {submitting ? "در حال انتقال..." : "ثبت انتقال اتمیک"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
