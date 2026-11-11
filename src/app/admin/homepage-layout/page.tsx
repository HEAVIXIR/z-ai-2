"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Pencil,
  X,
} from "lucide-react";
import { toFa } from "@/lib/format";

type Section = {
  id: string;
  key: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  order: number;
  active: boolean;
  config?: string | null;
};

const SECTION_LABELS: Record<string, string> = {
  hero: "هیرو",
  categories: "دسته‌بندی‌ها",
  "hot-searches": "داغ‌ترین بازار",
  stats: "آمار",
  recommendations: "پیشنهادها برای شما",
  "verified-machines": "ماشین‌آلات تأییدشده",
  "featured-machines": "آگهی‌های ویژه",
  "active-requests": "درخواست‌های فعال خرید",
  "exclusive-sale": "فروش ویژه",
  services: "خدمات",
  "latest-ads": "آخرین آگهی‌ها",
  sell7: "فروش در ۷ روز",
  "why-us": "چرا هویکس",
  brands: "برندها",
  "trusted-brands": "برندهای مورد اعتماد",
  knowledge: "هویکس دانش",
  cta: "دعوت به اقدام",
};

export default function HomepageLayoutClient() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // FIX-ADMIN-EDITABILITY — editing target section (inline edit modal).
  const [editing, setEditing] = useState<Section | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/homepage-sections", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.sections)) {
        setSections(
          data.sections.sort((a: Section, b: Section) => a.order - b.order),
        );
      }
    } catch {
      setError("بارگذاری بخش‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = (id: string) => {
    setSections((arr) =>
      arr.map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    );
  };

  const move = (id: string, dir: -1 | 1) => {
    setSections((arr) => {
      const idx = arr.findIndex((s) => s.id === id);
      if (idx < 0) return arr;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      const next = [...arr];
      const [item] = next.splice(idx, 1);
      next.splice(newIdx, 0, item);
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  // FIX-ADMIN-EDITABILITY — apply edits from the inline edit modal back
  // into local state. The save() call later PUTs everything to the API.
  const applyEdit = (updated: Section) => {
    setSections((arr) => arr.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/homepage-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s, i) => ({
            id: s.id,
            key: s.key,
            title: s.title,
            subtitle: s.subtitle,
            description: s.description,
            order: i,
            active: s.active,
            config: s.config ?? "{}",
          })),
        }),
      });
      if (!res.ok) throw new Error("ذخیره ناموفق بود.");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e: any) {
      setError(e?.message ?? "خطا در ذخیره.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#F58220]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">
            چیدمان صفحهٔ اصلی
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            بخش‌های صفحهٔ اصلی را مرتب کنید، فعال/غیرفعال کنید و عنوان و توضیحات
            هر بخش را ویرایش کنید.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F58220] px-6 text-sm font-bold text-white transition hover:bg-[#ff8c38] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          ذخیره
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          تغییرات با موفقیت ذخیره شد.
        </div>
      )}

      <div className="space-y-3">
        {sections.map((s, idx) => (
          <div
            key={s.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 transition ${
              s.active
                ? "border-zinc-200"
                : "border-zinc-200 opacity-60"
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-black text-zinc-500">
              {toFa(idx + 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-zinc-900">
                  {s.title || SECTION_LABELS[s.key] || s.key}
                </h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">
                  {s.key}
                </span>
              </div>
              {s.subtitle && (
                <p className="truncate text-[11px] text-zinc-500">
                  {s.subtitle}
                </p>
              )}
              {s.description && (
                <p className="truncate text-[11px] text-zinc-400">
                  {s.description}
                </p>
              )}
            </div>

            {/* Edit (FIX-ADMIN-EDITABILITY) */}
            <button
              type="button"
              onClick={() => setEditing(s)}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-zinc-100 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-200"
              title="ویرایش عنوان و توضیحات"
            >
              <Pencil className="h-3.5 w-3.5" />
              ویرایش متن
            </button>

            {/* Toggle */}
            <button
              type="button"
              onClick={() => toggleActive(s.id)}
              className={`inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold transition ${
                s.active
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {s.active ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  فعال
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  غیرفعال
                </>
              )}
            </button>

            {/* Move */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => move(s.id, -1)}
                disabled={idx === 0}
                className="flex h-5 w-6 items-center justify-center rounded bg-zinc-100 text-zinc-500 transition hover:bg-[#F58220]/10 hover:text-[#F58220] disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => move(s.id, 1)}
                disabled={idx === sections.length - 1}
                className="flex h-5 w-6 items-center justify-center rounded bg-zinc-100 text-zinc-500 transition hover:bg-[#F58220]/10 hover:text-[#F58220] disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditSectionModal
          section={editing}
          onClose={() => setEditing(null)}
          onSave={applyEdit}
        />
      )}
    </div>
  );
}

/* ── Inline edit modal — title / subtitle / description for one section ── */
function EditSectionModal({
  section,
  onClose,
  onSave,
}: {
  section: Section;
  onClose: () => void;
  onSave: (s: Section) => void;
}) {
  const [title, setTitle] = useState(section.title ?? "");
  const [subtitle, setSubtitle] = useState(section.subtitle ?? "");
  const [description, setDescription] = useState(section.description ?? "");
  const [design, setDesign] = useState<Record<string, string>>(() => {
    try {
      const parsed = JSON.parse(section.config || "{}");
      return parsed?.design && typeof parsed.design === "object" ? Object.fromEntries(Object.entries(parsed.design).map(([k, v]) => [k, String(v ?? "")])) : {};
    } catch { return {}; }
  });
  const setDesignValue = (key: string, value: string) => setDesign((current) => ({ ...current, [key]: value }));

  const inputCls =
    "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#F58220]";
  const labelCls = "mb-1.5 block text-xs font-bold text-zinc-500";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-zinc-900">ویرایش متن بخش</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              بخش: <span className="font-mono text-[#F58220]">{section.key}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100"
            aria-label="بستن"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
          <div>
            <label className={labelCls}>عنوان بخش</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوانی که در صفحه اصلی نمایش داده می‌شود"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>زیرعنوان (اختیاری)</label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="زیرعنوان کوتاه زیر عنوان"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>توضیحات (اختیاری)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="پاراگراف توضیحی بخش"
              className={`${inputCls} h-28 resize-none py-2`}
            />
          </div>
          <div className="rounded-2xl border border-zinc-200 p-4">
            <h3 className="mb-1 text-sm font-black text-zinc-900">طراحی و ظاهر بخش</h3>
            <p className="mb-4 text-xs leading-5 text-zinc-500">تنظیمات ظاهری به‌صورت مستقل برای همین سکشن ذخیره می‌شوند؛ مقادیر خالی، ظاهر مرجع قدیمی را حفظ می‌کنند.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ["backgroundColor","رنگ پس‌زمینه","#0b0b0b"],
                ["textColor","رنگ متن","#ffffff"],
                ["headingColor","رنگ عنوان","#ffffff"],
                ["accentColor","رنگ تأکیدی","#f58220"],
                ["paddingTop","فاصله بالا","96px"],
                ["paddingBottom","فاصله پایین","96px"],
                ["contentMaxWidth","حداکثر عرض محتوا","1440px"],
                ["baseFontSize","اندازه پایه فونت","16px"],
                ["headingFontSize","اندازه عنوان","36px"],
                ["cardGap","فاصله کارت‌ها","24px"],
                ["imageRadius","گردی گوشه تصاویر","16px"],
              ].map(([key,label,placeholder]) => (
                <label key={key} className="block">
                  <span className={labelCls}>{label}</span>
                  <input value={design[key] || ""} onChange={(e) => setDesignValue(key,e.target.value)} placeholder={placeholder} className={inputCls} />
                </label>
              ))}
              <label className="block">
                <span className={labelCls}>تعداد ستون کارت‌ها</span>
                <input type="number" min="1" max="6" value={design.columns || ""} onChange={(e) => setDesignValue("columns",e.target.value)} placeholder="بدون تغییر" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>فونت</span>
                <select value={design.fontFamily || ""} onChange={(e) => setDesignValue("fontFamily",e.target.value)} className={inputCls}>
                  <option value="">حفظ فونت مرجع</option>
                  <option value="inherit">فونت قالب سایت</option>
                  <option value="Vazirmatn, sans-serif">Vazirmatn</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Inter, sans-serif">Inter</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>تراز متن</span>
                <select value={design.textAlign || ""} onChange={(e) => setDesignValue("textAlign",e.target.value)} className={inputCls}>
                  <option value="">حفظ چیدمان مرجع</option>
                  <option value="right">راست</option>
                  <option value="center">وسط</option>
                  <option value="left">چپ</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>نوع انیمیشن</span>
                <select value={design.animation || "legacy"} onChange={(e) => setDesignValue("animation",e.target.value)} className={inputCls}>
                  <option value="legacy">انیمیشن اصلی نسخه قدیمی</option>
                  <option value="none">بدون انیمیشن</option>
                  <option value="fade">محو شدن</option>
                  <option value="slide-up">ورود از پایین</option>
                  <option value="zoom">بزرگ‌نمایی</option>
                  <option value="float">حرکت شناور</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>مدت انیمیشن (میلی‌ثانیه)</span>
                <input type="number" min="100" max="10000" value={design.animationDurationMs || ""} onChange={(e) => setDesignValue("animationDurationMs",e.target.value)} placeholder="700" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>تأخیر انیمیشن (میلی‌ثانیه)</span>
                <input type="number" min="0" max="5000" value={design.animationDelayMs || ""} onChange={(e) => setDesignValue("animationDelayMs",e.target.value)} placeholder="0" className={inputCls} />
              </label>
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">ابعاد باید با واحد معتبر مثل px، rem، vw یا درصد وارد شوند. انیمیشن مرجع در حالت پیش‌فرض دست‌نخورده باقی می‌ماند؛ انیمیشن سفارشی فقط با انتخاب شما اعمال می‌شود.</p>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
            توجه: این فیلدها برای بخش‌هایی که از <code>cmsConfig</code> استفاده
            می‌کنند (مثل فروش در ۷ روز، چرا هویکس، آمار، آخرین آگهی‌ها، دعوت به
            اقدام) در صفحهٔ اصلی به‌کار گرفته می‌شوند. برای سایر بخش‌ها فقط در
            پنل مدیریت نمایش داده می‌شوند.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            انصراف
          </button>
          <button
            onClick={() =>
              onSave({
                ...section,
                title,
                subtitle: subtitle || null,
                description: description || null,
                config: JSON.stringify({
                  ...(() => { try { return JSON.parse(section.config || "{}"); } catch { return {}; } })(),
                  design: {
                    ...Object.fromEntries(Object.entries(design).filter(([_, value]) => value !== "")),
                    ...(design.columns ? { columns: Number(design.columns) } : {}),
                    ...(design.animationDurationMs ? { animationDurationMs: Number(design.animationDurationMs) } : {}),
                    ...(design.animationDelayMs ? { animationDelayMs: Number(design.animationDelayMs) } : {}),
                  },
                }),
              })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#F58220] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#ff8c38]"
          >
            <Save className="h-4 w-4" />
            اعمال
          </button>
        </div>
      </div>
    </div>
  );
}
