"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/* Transaction type cards for the listing wizard and quick filters. */

export type TransactionTypeOption = {
  id: string;
  key: string;
  nameFa: string;
  nameEn: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
};

const ICON_FALLBACK: Record<string, string> = {
  SALE: "🏷️",
  RENT: "🛠️",
  WANTED: "📢",
  QUOTE: "💬",
  AUCTION: "🔨",
  SERVICE_REQUEST: "🤝",
  SERVICE_OFFER: "🧰",
};

export default function TransactionTypePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (key: string) => void;
  compact?: boolean;
}) {
  const [types, setTypes] = useState<TransactionTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const canonicalLabels: Record<string, string> = {"SALE":"فروش","RENT":"اجاره","WANTED":"درخواست خرید","QUOTE":"پیشنهاد قیمت","AUCTION":"مزایده","SERVICE_REQUEST":"درخواست خدمت","SERVICE_OFFER":"ارائه خدمت"};
  const canonicalIcons: Record<string, string> = {"SALE":"🏷️","RENT":"🔑","WANTED":"📢","QUOTE":"📄","AUCTION":"🔨","SERVICE_REQUEST":"🛠️","SERVICE_OFFER":"🧰"};

  useEffect(() => {
    let alive = true;
    setError(false);
    setLoading(true);
    setTypes([]);
    (async () => {
      try {
        const res = await fetch("/api/transaction-types", { cache: "no-store" });
        if (!res.ok) throw new Error("transaction types unavailable");
        const data = (await res.json()) as { types: TransactionTypeOption[] };
        if (!alive) return;
        const received = data.types ?? [];
        // Keep WANTED selectable even if a seed/admin toggle accidentally hides it.
        const wanted = received.find((item) => item.key === "WANTED") ?? {
          id: "local-wanted-fallback", key: "WANTED", nameFa: "درخواست خرید", nameEn: "Wanted",
          description: null, icon: null, sortOrder: 30,
        };
        const normalized = received.map((item) => ({
          ...item,
          nameFa: canonicalLabels[item.key] ?? item.nameFa,
          icon: canonicalIcons[item.key] ?? item.icon ?? ICON_FALLBACK[item.key] ?? "🛒",
        }));
        if (!normalized.some((item) => item.key === "WANTED")) normalized.push(wanted);
        setTypes(normalized.sort((a, b) => a.sortOrder - b.sortOrder));
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [retryKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/45">
        <Loader2 className="h-4 w-4 animate-spin text-[#F58220]" />
        در حال بارگذاری انواع معامله…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs leading-6 text-amber-200"
      >
        دریافت فهرست نوع معامله در حال حاضر ممکن نیست. این یک خطای اتصال سرویس است؛
        لطفاً دوباره تلاش کنید. عبارت فنی خطا برای کاربر نمایش داده نمی‌شود.
        <button
          type="button"
          onClick={() => setRetryKey((current) => current + 1)}
          className="mr-2 rounded-lg border border-amber-300/30 px-3 py-1 font-bold text-amber-100 hover:bg-amber-300/10"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-6 text-center text-xs text-white/45">
        هنوز نوع معامله‌ای برای انتخاب تعریف نشده است.
        <button
          type="button"
          onClick={() => setRetryKey((current) => current + 1)}
          className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 font-bold text-white/70 hover:text-white"
        >
          بارگذاری مجدد
        </button>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3 ${
        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      }`}
    >
      {types.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.key)}
            className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${
              active
                ? "border-[#F58220] bg-[#F58220]/10 shadow-[0_8px_30px_-12px_rgba(245,130,32,0.45)]"
                : "border-white/10 bg-black/30 hover:border-white/25 hover:bg-black/50"
            }`}
          >
            {active && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#F58220] text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
            <span className="text-2xl">{canonicalIcons[t.key] ?? t.icon ?? ICON_FALLBACK[t.key] ?? "🛒"}</span>
            <span
              className={`text-xs font-bold transition-colors ${
                active ? "text-[#F58220]" : "text-white/80 group-hover:text-white"
              }`}
            >
              {t.nameFa}
            </span>
            {!compact && t.description && (
              <span className="mt-0.5 text-[10px] leading-4 text-white/40">
                {t.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
