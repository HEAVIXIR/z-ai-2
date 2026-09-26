"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  Save,
  Eye,
  Send,
  FileText,
  X,
} from "lucide-react";

/* ============================================================
   /admin/articles/new — create OR edit article.
   Edit mode is activated when `?id=<articleId>` is present
   (the list page's "edit" action deep-links here).
   ============================================================ */

type FormState = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string;
  coverImage: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  category: "GUIDE",
  tags: "",
  coverImage: "",
  status: "DRAFT",
};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "GUIDE", label: "راهنما" },
  { value: "COMPARISON", label: "مقایسه" },
  { value: "REVIEW", label: "نقد و بررسی" },
  { value: "NEWS", label: "اخبار" },
  { value: "TUTORIAL", label: "آموزش" },
];

const STATUS_OPTIONS: { value: FormState["status"]; label: string }[] = [
  { value: "DRAFT", label: "پیش‌نویس" },
  { value: "PUBLISHED", label: "منتشرشده" },
  { value: "ARCHIVED", label: "بایگانی" },
];

export default function AdminArticleEditorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!editId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/articles/${editId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.article) {
        throw new Error(json?.error ?? "مقاله یافت نشد");
      }
      const a = json.article;
      // The article model field is `content`; the form calls it `body`.
      setForm({
        id: a.id,
        title: a.title ?? "",
        slug: a.slug ?? "",
        excerpt: a.excerpt ?? "",
        body: a.content ?? "",
        category: a.category ?? "GUIDE",
        tags: a.tags ?? "",
        coverImage: a.coverImage ?? "",
        status: a.status ?? "DRAFT",
      });
    } catch (e: any) {
      setError(e?.message ?? "خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (overrideStatus?: FormState["status"]) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        body: form.body,
        excerpt: form.excerpt || undefined,
        categoryId: form.category,
        tags: form.tags || undefined,
        coverImage: form.coverImage || undefined,
        status: overrideStatus ?? form.status,
      };
      const isEdit = Boolean(form.id);
      const url = isEdit
        ? `/api/admin/articles/${form.id}`
        : "/api/admin/articles";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "ذخیره ناموفق بود");
      }
      // After a successful create, switch into edit mode so subsequent
      // saves are PATCHes against the same row.
      if (json.article?.id && !form.id) {
        setForm((f) => ({ ...f, id: json.article.id }));
      }
      return json.article as { id: string; slug: string; status: string } | undefined;
    } catch (e: any) {
      setError(e?.message ?? "خطای شبکه");
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("عنوان الزامی است");
      return;
    }
    if (!form.body.trim()) {
      setError("محتوای مقاله الزامی است");
      return;
    }
    await persist();
  };

  const handlePublish = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError("برای انتشار، عنوان و محتوا الزامی است");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      // Save first (ensures draft is persisted), then set PUBLISHED.
      const saved = await persist("PUBLISHED");
      if (saved?.id) {
        setForm((f) => ({ ...f, status: "PUBLISHED" }));
      }
    } finally {
      setPublishing(false);
    }
  };

  const inputCls =
    "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#F58220] focus:bg-white";
  const labelCls = "mb-1.5 block text-xs font-bold text-zinc-500";

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#F58220]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
            <FileText className="h-6 w-6 text-[#F58220]" />
            {form.id ? "ویرایش مقاله" : "مقاله جدید"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {form.id
              ? ` slug: ${form.slug || "—"}`
              : "ایجاد یک مقالهٔ جدید در هویکس دانش"}
          </p>
        </div>
        <Link
          href="/admin/articles"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به فهرست
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: title + body */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>عنوان مقاله *</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={inputCls}
              placeholder="عنوان مقاله را وارد کنید"
            />
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>
              محتوا (Markdown: # تیتر، ## زیرتیتر، - لیست) *
            </label>
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={16}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800 outline-none focus:border-[#F58220]"
              placeholder={"# تیتر اصلی\n\n## زیرتیتر\n\nمتن پاراگراف...\n\n- مورد لیست ۱\n- مورد لیست ۲"}
            />
            <p className="mt-2 text-[11px] text-zinc-400">
              {form.body.length.toLocaleString("fa-IR")} کاراکتر
            </p>
          </div>
        </div>

        {/* Right column: slug + excerpt + category + status + actions */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>نامک (slug) — اختیاری</label>
            <input
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              dir="ltr"
              className={inputCls}
              placeholder="auto-generated if empty"
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              اگر خالی باشد، از روی عنوان ساخته می‌شود.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>خلاصه</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[#F58220]"
              placeholder="خلاصهٔ کوتاه مقاله (نمایش در فهرست و سئو)"
            />
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>دسته</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputCls}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>وضعیت</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as FormState["status"])}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>برچسب‌ها (با کاما)</label>
            <input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              className={inputCls}
              placeholder="بیل مکانیکی, خرید, راهنما"
            />
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className={labelCls}>تصویر کاور (URL)</label>
            <input
              value={form.coverImage}
              onChange={(e) => set("coverImage", e.target.value)}
              dir="ltr"
              className={inputCls}
              placeholder="/images/..."
            />
            {form.coverImage && (
              <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200">
                <img
                  src={form.coverImage}
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F58220] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff8c38] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              ذخیره
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              ذخیره و انتشار
            </button>
            {form.id && form.status === "PUBLISHED" && (
              <a
                href={`/articles/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                <Eye className="h-4 w-4" />
                مشاهده در سایت
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
