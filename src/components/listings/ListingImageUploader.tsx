"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { describeCompression, prepareImageForUpload } from "@/lib/browser-image-optimization";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  maxImages?: number;
};

export default function ListingImageUploader({
  images,
  onChange,
  onUploadingChange,
  maxImages = 10,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const uploadFiles = async (selected: FileList | File[]) => {
    const files = Array.from(selected);
    if (!files.length) return;
    setError(null);
    setNotice(null);

    const remaining = Math.max(0, maxImages - images.length);
    if (remaining === 0) {
      setError(`حداکثر ${maxImages} تصویر قابل ثبت است.`);
      return;
    }
    if (files.length > remaining) {
      setError(`فقط ${remaining} تصویر دیگر قابل افزودن است. تعداد فایل‌های انتخاب‌شده را کاهش دهید.`);
      return;
    }

    const accepted = files;
    setUploading(true);
    onUploadingChange?.(true);
    setProgress({ completed: 0, total: accepted.length });
    const uploaded: string[] = [];
    const compressionNotes: string[] = [];

    try {
      for (let index = 0; index < accepted.length; index++) {
        const source = accepted[index];
        if (!source.type.startsWith("image/")) {
          throw new Error(`فایل «${source.name}» تصویر معتبر نیست.`);
        }

        const prepared = await prepareImageForUpload(source);
        const body = new FormData();
        body.append("file", prepared.file);

        const response = await fetch("/api/media/staging", {
          method: "POST",
          body,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.url) {
          throw new Error(result?.error ?? `آپلود تصویر «${source.name}» ناموفق بود.`);
        }

        uploaded.push(result.url as string);
        const compression = describeCompression(prepared);
        if (compression) compressionNotes.push(compression);
        setProgress({ completed: index + 1, total: accepted.length });
      }

      if (uploaded.length) onChange([...images, ...uploaded]);
      if (compressionNotes.length) {
        setNotice(`${uploaded.length} تصویر با موفقیت آپلود شد. ${compressionNotes[0]}`);
      } else if (uploaded.length) {
        setNotice(`${uploaded.length} تصویر با موفقیت آپلود شد.`);
      }
    } catch (uploadError) {
      if (uploaded.length) onChange([...images, ...uploaded]);
      setError(
        uploadError instanceof Error
          ? `${uploadError.message}${uploaded.length ? ` ${uploaded.length} تصویر قبلی با موفقیت آپلود شدند.` : ""}`
          : "آپلود تصویر با خطای غیرمنتظره مواجه شد.",
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-white/60">
        تصاویر دستگاه *
      </label>
      <button
        type="button"
        disabled={uploading || images.length >= maxImages}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!uploading && event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
        }}
        className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-black/30 p-5 text-center transition hover:border-[#F58220]/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="mb-3 h-10 w-10 animate-spin text-[#F58220]" />
        ) : (
          <ImagePlus className="mb-3 h-10 w-10 text-white/30" />
        )}
        <span className="text-sm font-bold text-white/60">
          {uploading ? "در حال آپلود تصاویر واقعی..." : "تصاویر دستگاه را انتخاب کنید"}
        </span>
        <span className="mt-1 text-[11px] text-white/30">
          JPG، PNG و WebP · حداکثر ۲۰ مگابایت ورودی برای هر تصویر
        </span>
        {uploading && (
          <span className="mt-2 text-xs text-[#F58220]">
            {progress.completed} از {progress.total} تصویر آپلود شد
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploading || images.length >= maxImages}
        onChange={(event) => {
          if (event.target.files) void uploadFiles(event.target.files);
        }}
      />

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-3 py-2 text-xs leading-6 text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300">
          {notice}
        </p>
      )}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((imageUrl, index) => (
            <div
              key={imageUrl}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40"
            >
              <img
                src={imageUrl}
                alt={`تصویر دستگاه ${index + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {index === 0 && (
                <span className="absolute right-1 top-1 rounded bg-[#F58220] px-1.5 py-0.5 text-[8px] font-black text-white">
                  تصویر اصلی
                </span>
              )}
              <button
                type="button"
                aria-label={`حذف تصویر ${index + 1}`}
                disabled={uploading}
                onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}
                className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white/80 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
        <span>{images.length} از {maxImages} تصویر آپلود شده</span>
        <span>حداقل یک تصویر الزامی است</span>
      </div>
    </div>
  );
}
