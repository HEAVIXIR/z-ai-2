import Link from "next/link";

const labels = {
  brands: "بانک جهانی برندها",
  families: "خانواده‌ها و روابط برند",
  homepage: "نمایش برندها در صفحه اول",
} as const;

export default function BrandManagementNav({ active }: { active: keyof typeof labels }) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-zinc-900">مرکز یکپارچه مدیریت برندها</p>
          <p className="mt-1 text-xs text-zinc-600">بانک برند، خانواده‌ها، روابط و نمایش صفحه اول از یک مرکز مدیریت می‌شوند.</p>
          <p className="mt-1 text-[11px] font-bold text-orange-800">بخش فعلی: {labels[active]}</p>
        </div>
        <Link href="/admin/brands" className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-xs font-bold text-orange-800 ring-1 ring-orange-200 transition hover:bg-orange-100">
          بازگشت به مرکز مدیریت برندها
        </Link>
      </div>
    </section>
  );
}
