"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Loader2, RefreshCw, Search } from "lucide-react";
import { toFa } from "@/lib/format";

/* ============================================================
   /admin/store/suppliers — minimal list view (T2-W1-A)
   List-only per task spec. Mutations happen via the API.
   ============================================================ */

type Supplier = {
  id: string;
  name: string;
  nameFa: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: string | null;
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
};

export default function StoreSuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/store/suppliers?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("خطا");
      const json = await res.json();
      if (json.success) setItems(json.data);
      else throw new Error(json.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">تأمین‌کنندگان</h1>
          <p className="text-sm text-zinc-500">
            دایرکتوری تأمین‌کنندگان قطعات (T2-W1-A — Store Gap Domain #3)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          به‌روزرسانی
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-zinc-400" />
          <input
            type="text"
            placeholder="جستجوی نام، تلفن یا ایمیل…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 w-full bg-transparent text-sm text-zinc-800 outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-bold">نام</th>
                <th className="px-4 py-3 font-bold">نام فارسی</th>
                <th className="px-4 py-3 font-bold">تلفن</th>
                <th className="px-4 py-3 font-bold">ایمیل</th>
                <th className="px-4 py-3 font-bold">وضعیت</th>
                <th className="px-4 py-3 font-bold">ایجاد شده</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                    <Loader2 size={20} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                    <Truck size={28} className="mx-auto mb-2 opacity-50" />
                    تأمین‌کننده‌ای یافت نشد
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-bold text-zinc-900">{s.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{s.nameFa ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600" dir="ltr">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600" dir="ltr">{s.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {s.active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          فعال
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
                          غیرفعال
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{toFa(fmtDate(s.createdAt))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(items.length)} تأمین‌کننده
      </p>
    </div>
  );
}
