"use client";

import { useState } from "react";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
}

export default function StorePartImageUploader({ images, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | null, input: HTMLInputElement) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const next = [...images];

    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_IMAGES) {
          setError("حداکثر ۲۰ تصویر برای هر قطعه مجاز است.");
          break;
        }
        if (!ALLOWED_TYPES.has(file.type)) {
          setError("فقط تصاویر JPG، PNG و WebP مجاز هستند.");
          continue;
        }
        if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
          setError("حجم هر تصویر باید حداکثر ۴ مگابایت باشد.");
          continue;
        }

        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/admin/store/parts/media", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.success || typeof result.url !== "string") {
          throw new Error(result.error || "بارگذاری تصویر ناموفق بود.");
        }
        if (!next.includes(result.url)) next.push(result.url);
      }
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بارگذاری تصویر ناموفق بود.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-zinc-800">تصاویر قطعه</p>
          <p className="text-[11px] text-zinc-500">تصاویر ابتدا خصوصی در Backblaze B2 ذخیره می‌شوند و فقط پس از اتصال به قطعه فعال، عمومی خواهند شد.</p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#F58220] px-3 text-xs font-bold text-white hover:bg-[#e0701a]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          افزودن تصویر
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || images.length >= MAX_IMAGES}
            onChange={(event) => void uploadFiles(event.target.files, event.currentTarget)}
            className="sr-only"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((url) => (
            <div key={url} className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <img src={url} alt="تصویر قطعه" className="h-24 w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((item) => item !== url))}
                disabled={uploading}
                aria-label="حذف تصویر"
                className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
          هنوز تصویری اضافه نشده است. افزودن تصویر اختیاری است.
        </p>
      )}

      <p className="text-[11px] text-zinc-400">{images.length} از {MAX_IMAGES} تصویر · حداکثر ۴ مگابایت برای هر فایل</p>
    </section>
  );
}
