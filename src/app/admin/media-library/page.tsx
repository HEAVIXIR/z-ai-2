"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Upload,
  Trash2,
  Copy,
  Search,
  Image as ImageIcon,
  Check,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Trash,
} from "lucide-react";
import { toFa } from "@/lib/format";

/* ============================================================
   /admin/media-library — Wave 3A Media Library Browser

   Backed by the new media-service.ts (filesystem + sidecar
   JSON metadata). Differs from /admin/media in that it:
     • uses /api/admin/media (with id-bearing sidecar metadata)
     • supports per-asset delete (via /api/admin/media/[id])
     • shows altText, entityType/entityId, uploader

   Permission gate is enforced server-side at the route level.
   ============================================================ */

type MediaAsset = {
  id: string;
  filename: string;
  url: string;
  relativePath: string;
  mimeType: string;
  ext: string;
  size: number;
  uploadedBy: string | null;
  uploadedAt: string;
  entityType: string | null;
  entityId: string | null;
  altText: string | null;
};

const ENTITY_TYPES = [
  "", "Generic", "Listing", "Product", "Part", "Brand",
  "Category", "Article", "Page", "Store",
] as const;

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      params.set("limit", "500");
      const res = await fetch(`/api/admin/media?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "بارگذاری رسانه‌ها ناموفق بود.");
      }
      const data = await res.json();
      setItems(Array.isArray(data.assets) ? data.assets : []);
    } catch (err: any) {
      setError(err?.message ?? "خطا در بارگذاری.");
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setToast(null);
    try {
      let okCount = 0;
      let lastErr: string | null = null;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("altText", file.name.replace(/\.[^.]+$/, ""));
        if (entityType) fd.append("entityType", entityType);
        const res = await fetch("/api/admin/media", { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          lastErr = d?.error ?? "آپلود ناموفق بود.";
        } else {
          okCount++;
        }
      }
      if (lastErr && okCount === 0) {
        setError(lastErr);
      } else {
        setToast(
          `${toFa(okCount)} فایل آپلود شد.${
            lastErr ? ` (${lastErr})` : ""
          }`,
        );
      }
      await load();
    } catch (err: any) {
      setError(err?.message ?? "خطا در آپلود.");
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!confirm(`حذف «${asset.filename}»؟ این عملیات قابل بازگشت نیست.`)) return;
    setDeletingId(asset.id);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/media/${asset.id}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(d?.error ?? "حذف ناموفق بود.");
      }
      setToast(`«${asset.filename}» حذف شد.`);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "خطا در حذف.");
    } finally {
      setDeletingId(null);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.filename.toLowerCase().includes(q) ||
      i.url.toLowerCase().includes(q) ||
      i.relativePath.toLowerCase().includes(q) ||
      (i.altText ?? "").toLowerCase().includes(q)
    );
  });

  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  const fmtSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
            <ImageIcon className="h-6 w-6 text-[#F58220]" />
            کتابخانه رسانه
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {toFa(items.length)} فایل · {fmtSize(totalBytes)} · همهٔ تصاویر
            آپلودشده در `/public/uploads/`
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#F58220] px-6 text-sm font-bold text-white transition hover:bg-[#ff8c38]">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            آپلود فایل
            <input
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
              accept="image/*"
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
        هر فایل همراه با یک sidecar JSON در همان مسیر ذخیره می‌شود که
        شامل متادیتای کامل (آپلودکننده، نوع/شناسهٔ موجودیت پیوست‌شده،
        متن جایگزین، نوع MIME واقعی) است. حذف فایل، sidecar را هم پاک
        می‌کند و در لاگ ممیزی ثبت می‌شود.
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <Check className="h-4 w-4" />
          {toast}
          <button
            onClick={() => setToast(null)}
            className="mr-auto rounded px-2 text-xs underline"
          >
            بستن
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex h-11 flex-1 items-center overflow-hidden rounded-xl border border-zinc-200 bg-white px-4">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در نام فایل، مسیر یا متن جایگزین..."
            className="mr-2 h-full flex-1 bg-transparent text-sm text-zinc-900 outline-none"
          />
        </div>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 outline-none focus:border-[#F58220]"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t || "all"} value={t}>
              {t ? t : "همهٔ نوع‌ها"}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#F58220]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <ImageIcon className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            {search || entityType
              ? "رسانه‌ای با این فیلتر یافت نشد."
              : "هنوز فایلی آپلود نشده است."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white"
            >
              <div className="aspect-square overflow-hidden bg-zinc-100">
                <img
                  src={m.url}
                  alt={m.altText ?? m.filename}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5">
                <p
                  className="truncate text-[11px] font-bold text-zinc-700"
                  title={m.filename}
                >
                  {m.filename}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] text-zinc-400"
                  dir="ltr"
                >
                  {m.relativePath} · {fmtSize(m.size)}
                </p>
                <p
                  className="truncate text-[9px] text-zinc-400"
                  dir="ltr"
                  title={m.url}
                >
                  {m.url}
                </p>
                {m.entityType && (
                  <p className="mt-1 truncate text-[10px] text-[#F58220]">
                    {m.entityType}
                    {m.entityId ? ` · ${m.entityId.slice(0, 8)}…` : ""}
                  </p>
                )}
                {m.altText && (
                  <p
                    className="mt-1 line-clamp-1 text-[10px] italic text-zinc-500"
                    title={m.altText}
                  >
                    «{m.altText}»
                  </p>
                )}
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => copyUrl(m.url)}
                    className="flex-1 rounded-lg bg-zinc-100 py-1.5 text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-200"
                    title="کپی URL"
                  >
                    {copied === m.url ? (
                      <Check className="mx-auto h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="mx-auto h-3 w-3" />
                    )}
                  </button>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-lg bg-zinc-100 py-1.5 text-center text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-200"
                    title="باز کردن"
                  >
                    <ExternalLink className="mx-auto h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(m)}
                    disabled={deletingId === m.id}
                    className="flex-1 rounded-lg bg-red-50 py-1.5 text-center text-[10px] font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                    title="حذف"
                  >
                    {deletingId === m.id ? (
                      <Loader2 className="mx-auto h-3 w-3 animate-spin" />
                    ) : (
                      <Trash className="mx-auto h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[11px] text-zinc-500">
        <span>
          نمایش {toFa(filtered.length)} از {toFa(items.length)} رسانه
        </span>
        <span className="flex items-center gap-1">
          <Trash2 className="h-3 w-3" />
          حذف‌ها در لاگ ممیزی ثبت می‌شوند.
        </span>
      </div>
    </div>
  );
}
