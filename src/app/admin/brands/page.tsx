import Link from "next/link";
import { Building2, FolderTree, Home, ArrowLeft, ShieldCheck, Database } from "lucide-react";
import { db } from "@/lib/db";
import { toFa } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "مرکز مدیریت برندها — هویکس" };

const destinations = [
  {
    href: "/admin/taxonomy/brands",
    title: "بانک جهانی برندها",
    description: "ایجاد و ویرایش برندها، نام‌های فارسی و انگلیسی، نام‌های جایگزین، وضعیت، تأیید و شناسنامه",
    icon: Building2,
  },
  {
    href: "/admin/brand-families",
    title: "خانواده‌ها و روابط",
    description: "مدیریت خانواده‌های شرکتی و رابطه برند مادر و زیر‌برند؛ دو رابطه مستقل از دسته‌بندی",
    icon: FolderTree,
  },
  {
    href: "/admin/home/trusted-brands",
    title: "نمایش در صفحه اول",
    description: "انتخاب برندهای قابل نمایش و تنظیم عنوان، توضیحات و ترتیب نمایش؛ بدون ساخت بانک جداگانه",
    icon: Home,
  },
];

export default async function AdminBrandsHubPage() {
  let counts: { total: number; active: number; verified: number; families: number } | null = null;
  try {
    const [total, active, verified, families] = await Promise.all([
      db.brand.count(),
      db.brand.count({ where: { active: true } }),
      db.brand.count({ where: { verification: "VERIFIED" } }),
      db.brandFamily.count(),
    ]);
    counts = { total, active, verified, families };
  } catch {
    counts = null;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-orange-700">HEAVIX GLOBAL BRAND REGISTRY</p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-zinc-900">
              <Building2 className="h-7 w-7 text-[#F58220]" />
              مرکز یکپارچه مدیریت برندها
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">
              فقط یک بانک جهانی برند وجود دارد. خانواده برند، رابطه برند مادر و زیر‌برند و انتخاب برندهای صفحه اول،
              سه قابلیت مدیریتی روی همین بانک هستند؛ نه سه بانک یا منبع داده مستقل.
            </p>
          </div>
          <Link href="/admin/taxonomy/brands/new" className="inline-flex items-center gap-2 rounded-xl bg-[#F58220] px-4 py-3 text-xs font-bold text-white transition hover:bg-orange-600">
            ایجاد برند جدید <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
        {counts ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "کل برندها", value: counts.total, Icon: Database },
              { label: "فعال", value: counts.active, Icon: Building2 },
              { label: "تأییدشده", value: counts.verified, Icon: ShieldCheck },
              { label: "خانواده‌ها", value: counts.families, Icon: FolderTree },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><Icon className="h-4 w-4" />{label}</div>
                <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">{toFa(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            آمار بانک برند در حال حاضر در دسترس نیست؛ مسیرهای مدیریتی همچنان قابل استفاده‌اند.
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {destinations.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Icon className="h-5 w-5" /></div>
              <h2 className="mt-4 text-base font-black text-zinc-900">{item.title}</h2>
              <p className="mt-2 min-h-16 text-xs leading-6 text-zinc-600">{item.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-orange-700">ورود به بخش <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" /></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
