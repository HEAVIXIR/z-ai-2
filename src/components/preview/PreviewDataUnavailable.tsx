import Link from "next/link";

type PreviewDataUnavailableProps = {
  title: string;
  description: string;
  retryHref: string;
};

export default function PreviewDataUnavailable({
  title,
  description,
  retryHref,
}: PreviewDataUnavailableProps) {
  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 py-16 text-white"
    >
      <section
        role="status"
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111] p-8 text-center shadow-2xl sm:p-12"
      >
        <Link href="/" className="text-sm font-black tracking-wide text-[#F58220]">
          هویکس
        </Link>
        <p className="mt-8 text-xs font-bold text-[#F58220]">محیط پیش‌نمایش</p>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-white/65">
          {description}
        </p>
        <p className="mt-3 text-xs leading-7 text-white/40">
          اطلاعات این بخش پس از اتصال دیتابیس اختصاصی Preview نمایش داده می‌شود.
          این پیام به معنی حذف یا تغییر اطلاعات اصلی نیست.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={retryHref}
            className="rounded-xl bg-[#F58220] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#ff963f]"
          >
            تلاش دوباره
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white/75 transition hover:border-white/30"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </section>
    </main>
  );
}
