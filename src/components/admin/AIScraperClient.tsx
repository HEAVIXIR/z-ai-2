"use client";

import { useEffect, useState } from "react";
import {
  Search, Loader2, Plus, CheckCircle2, Phone, Image as ImageIcon,
  Sparkles, ExternalLink, MapPin, Calendar, Gauge, DollarSign, ShieldCheck,
} from "lucide-react";

type ScrapedListing = {
  url: string;
  title?: string;
  publishedAt?: string | null;
  description?: string;
  price?: string | null;
  images: string[];
  phone?: string | null;
  location?: string | null;
  brand?: string | null;
  category?: string | null;
  year?: number | null;
  hours?: number | null;
  condition?: string | null;
};

export default function AIScraperClient() {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string; nameEn?: string | null; layer?: string; level?: number }>>([]);
  const [serviceTypes, setServiceTypes] = useState<Array<{ id: string; nameFa: string; nameEn?: string | null }>>([]);
  const [transactionTypes, setTransactionTypes] = useState<Array<{ id: string; nameFa: string; nameEn?: string | null }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [transactionTypeId, setTransactionTypeId] = useState("");
  const [dateDays, setDateDays] = useState("30");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScrapedListing[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState<number | null>(null);
  const [imported, setImported] = useState<Set<number>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/taxonomy/categories").then((r) => r.ok ? r.json() : Promise.reject(new Error("دریافت دسته‌بندی‌ها ناموفق بود."))),
      fetch("/api/taxonomy").then((r) => r.ok ? r.json() : Promise.reject(new Error("دریافت خدمات ناموفق بود."))),
    ]).then(([categoryData, taxonomyData]) => {
      if (cancelled) return;
      setCategories(Array.isArray(categoryData.flat) ? categoryData.flat : []);
      setServiceTypes(Array.isArray(taxonomyData.serviceTypes) ? taxonomyData.serviceTypes : []);
      setTransactionTypes(Array.isArray(taxonomyData.transactionTypes) ? taxonomyData.transactionTypes : []);
    }).catch((e) => {
      if (!cancelled) setError(e?.message ?? "دریافت ساختار دسته‌بندی‌ها ناموفق بود.");
    });
    return () => { cancelled = true; };
  }, []);

  const sourceName = (url: string) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host.endsWith("divar.ir") || host.endsWith("divar.com")) return "دیوار";
      if (host.endsWith("sheypoor.com")) return "شیپور";
      return host;
    } catch { return "منبع خارجی"; }
  };
  const fmt = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(String(value).replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n.toLocaleString("fa-IR") : String(value);
  };

  const handleSearch = async () => {
    if (!query.trim() && !categoryId && !serviceTypeId && !transactionTypeId) return;
    setSearching(true); setError(null); setMessage(null);
    setResults([]); setSelected(new Set()); setImported(new Set());
    try {
      const res = await fetch("/api/admin/ai-scraper", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "search", query: query.trim(), num: 30, categoryId: categoryId || null, serviceTypeId: serviceTypeId || null, transactionTypeId: transactionTypeId || null, dateDays: dateDays === "all" ? null : Number(dateDays) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "جستجو ناموفق بود.");
      const rows = Array.isArray(data.results) ? data.results : [];
      setResults(rows);
      setMessage(rows.length ? `${rows.length.toLocaleString("fa-IR")} آگهی برای بررسی استخراج شد.` : "نتیجه‌ای از منابع مجاز پیدا نشد.");
    } catch (e: any) {
      setError(e?.message ?? "خطا در جستجو.");
    } finally { setSearching(false); }
  };

  const importOne = async (item: ScrapedListing, index: number) => {
    setImporting(index); setError(null);
    try {
      const res = await fetch("/api/admin/ai-scraper", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import", scraped: item }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "واردسازی ناموفق بود.");
      setImported(prev => new Set(prev).add(index));
      setMessage(data.alreadyExists
        ? "این منبع قبلاً وارد شده است؛ آگهی تکراری ساخته نشد."
        : "پیش‌نویس آگهی ساخته شد و در صف بررسی مدیر قرار گرفت؛ هنوز منتشر نشده است.");
    } catch (e: any) { setError(e?.message ?? "خطا در واردسازی."); }
    finally { setImporting(null); }
  };

  const importSelected = async () => {
    const indexes = [...selected].filter(i => !imported.has(i));
    if (!indexes.length) return;
    setBulkImporting(true); setError(null);
    let done = 0;
    for (const index of indexes) {
      try {
        const res = await fetch("/api/admin/ai-scraper", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "import", scraped: results[index] }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "خطا");
        setImported(prev => new Set(prev).add(index)); done++;
      } catch (e: any) {
        setError(`واردسازی مورد ${(index + 1).toLocaleString("fa-IR")} ناموفق بود: ${e?.message ?? "خطا"}`);
      }
    }
    setMessage(`${done.toLocaleString("fa-IR")} آگهی به صف بررسی مدیر ارسال شد؛ هیچ‌کدام خودکار منتشر نشدند.`);
    setSelected(new Set()); setBulkImporting(false);
  };

  const toggle = (index: number) => {
    if (selected.has(index)) {
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      return;
    }
    setSelected(prev => new Set(prev).add(index));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900"><Sparkles className="h-6 w-6 text-[#F58220]" />استخراج هوشمند آگهی از وب</h1>
          <p className="mt-1 text-sm text-zinc-500">جستجو و استخراج اطلاعات آگهی‌های واقعی از دیوار و شیپور، سپس تطبیق و ورود به صف بررسی مدیر</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />انتشار فقط با تأیید مدیر</div>
        <p className="mt-1">اطلاعات استخراج‌شده صرفاً پیش‌نویس با وضعیت «در انتظار بررسی» می‌شود. هیچ آگهی‌ای از این ابزار مستقیماً منتشر نخواهد شد. مشخصات نامطمئن باید پیش از تأیید اصلاح شوند.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <label className="mb-2 block text-xs font-bold text-zinc-700">عبارت جستجو</label>
        <div className="flex flex-wrap gap-2">
          <div className="flex h-12 min-w-[220px] flex-1 items-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-4">
            <Search className="h-4 w-4 text-zinc-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="مثلاً بیل مکانیکی کوماتسو PC220 یا خدمات تعمیر موتور" className="mr-2 h-full flex-1 bg-transparent text-sm text-zinc-900 outline-none" />
          </div>
          <button type="button" onClick={handleSearch} disabled={searching || (!query.trim() && !categoryId && !serviceTypeId && !transactionTypeId)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F58220] px-6 text-sm font-bold text-white disabled:opacity-50">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searching ? "در حال جستجو و استخراج..." : "جستجوی آگهی‌های واقعی"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-xs font-bold text-zinc-700">
            دسته‌بندی آگهی
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal">
              <option value="">همه دسته‌بندی‌ها</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{`${" ".repeat(Math.min(item.level || 0, 4) * 2)}${item.name}${item.layer ? ` · ${item.layer}` : ""}`}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-700">
            نوع خدمت
            <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal">
              <option value="">همه خدمات</option>
              {serviceTypes.map((item) => <option key={item.id} value={item.id}>{item.nameFa}{item.nameEn ? ` · ${item.nameEn}` : ""}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-700">
            نوع آگهی / معامله
            <select value={transactionTypeId} onChange={(e) => setTransactionTypeId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal">
              <option value="">همه انواع</option>
              {transactionTypes.map((item) => <option key={item.id} value={item.id}>{item.nameFa}{item.nameEn ? ` · ${item.nameEn}` : ""}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-700">
            بازه انتشار آگهی
            <select value={dateDays} onChange={(e) => setDateDays(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal">
              <option value="7">۷ روز اخیر</option>
              <option value="20">۲۰ روز اخیر</option>
              <option value="30">یک ماه اخیر</option>
              <option value="90">۹۰ روز اخیر</option>
              <option value="all">بدون محدودیت زمانی</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">دسته‌بندی‌ها و خدمات مستقیماً از طبقه‌بندی فعال HEAVIX خوانده می‌شوند؛ دسته‌های جدید نیز پس از ثبت در طبقه‌بندی در این فهرست ظاهر خواهند شد.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      {results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3">
          <span className="text-xs font-bold text-zinc-600">{selected.size.toLocaleString("fa-IR")} انتخاب‌شده از {results.length.toLocaleString("fa-IR")}</span>
          <button type="button" onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)))} className="text-xs font-bold text-[#F58220]">انتخاب همه نتایج / لغو انتخاب</button>
          <button type="button" onClick={importSelected} disabled={!selected.size || bulkImporting} className="mr-auto inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            {bulkImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ورود انتخاب‌شده‌ها به صف بررسی
          </button>
        </div>
      )}

      {searching && <div className="flex flex-col items-center py-16 text-zinc-500"><Loader2 className="h-9 w-9 animate-spin text-[#F58220]" /><p className="mt-3 text-sm">در حال دریافت و تحلیل آگهی‌ها...</p></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {results.map((s, index) => (
          <article key={s.url || index} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="relative flex h-44 items-center justify-center bg-zinc-100">
              <div className="flex flex-col items-center gap-2 text-zinc-400"><ImageIcon className="h-10 w-10 text-zinc-300" /><span className="text-[11px]">تصویر پس از بررسی حقوق و انتقال امن نمایش داده می‌شود</span></div>
              <span className="absolute right-3 top-3 rounded-full bg-zinc-900/80 px-3 py-1 text-xs font-bold text-white">{sourceName(s.url)}</span>
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="absolute left-3 top-3 rounded-lg bg-white p-2 text-zinc-700" aria-label="مشاهده آگهی منبع"><ExternalLink className="h-4 w-4" /></a>}
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} disabled={imported.has(index)} className="mt-1 h-4 w-4 accent-[#F58220]" />
                <h3 className="font-bold leading-6 text-zinc-900">{s.title || "آگهی بدون عنوان"}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                {s.price && <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{fmt(s.price)} تومان</div>}
                {s.year && <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />سال {fmt(s.year)}</div>}
                {s.hours !== null && s.hours !== undefined && <div className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{fmt(s.hours)} ساعت</div>}
                {s.location && <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</div>}
                <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{s.publishedAt ? new Date(s.publishedAt).toLocaleDateString("fa-IR") : "تاریخ انتشار نامشخص"}</div>
                {s.phone && <div className="flex items-center gap-1" dir="ltr"><Phone className="h-3.5 w-3.5" />{s.phone}</div>}
                {s.brand && <div>برند: {s.brand}</div>}
                {s.category && <div>دسته پیشنهادی: {s.category}</div>}
                {s.condition && <div>وضعیت: {s.condition}</div>}
              </div>
              {s.description && <p className="line-clamp-4 text-xs leading-6 text-zinc-500">{s.description}</p>}
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                {imported.has(index) ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />ارسال‌شده برای بررسی</span> :
                  <button type="button" onClick={() => importOne(s, index)} disabled={importing === index} className="inline-flex items-center gap-2 rounded-lg bg-[#F58220] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {importing === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}ساخت پیش‌نویس برای بررسی
                  </button>}
                <span className="text-[10px] text-zinc-400">بدون انتشار خودکار</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
