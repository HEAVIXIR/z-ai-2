import Link from "next/link";

const items = [
  { href: "/admin/brands", label: "فهرست و شناسنامه برندها", key: "brands" },
  { href: "/admin/brand-families", label: "خانواده‌ها و روابط", key: "families" },
  { href: "/admin/home/trusted-brands", label: "نمایش در صفحه اول", key: "homepage" },
] as const;

export default function BrandManagementNav({ active }: { active: (typeof items)[number]["key"] }) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-zinc-900">مرکز مدیریت جامع برندها</p>
          <p className="mt-1 text-xs text-zinc-600">هویت برند، خانواده‌ها و تنظیمات نمایش؛ همگی متصل به بانک مرکزی برندها</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-orange-700">یک بانک اطلاعاتی مشترک</span>
      </div>
      <nav aria-label="بخش‌های مدیریت برند" className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link key={item.key} href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${active === item.key ? "bg-[#F58220] text-white shadow-sm" : "border border-zinc-200 bg-white text-zinc-700 hover:border-orange-300 hover:text-orange-700"}`}>
            {item.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
