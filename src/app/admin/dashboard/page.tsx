import Link from "next/link";
import {
  Megaphone,
  Building2,
  FolderTree,
  PackageSearch,
  Users,
  Gavel,
  Flag,
  BookMarked,
  Brain,
  HeartPulse,
  TrendingUp,
  Settings,
  Activity,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Lightweight Admin landing page.
 *
 * Keep the first authenticated navigation independent from the expensive
 * dashboard snapshot query. Cloudflare telemetry recorded repeated 503 /
 * exceededCpu failures on GET /admin/dashboard.
 *
 * Admin authorization remains enforced by src/app/admin/layout.tsx.
 * Detailed data remains available in the individual admin sections.
 */
const quickLinks = [
  { title: "آگهی‌ها", href: "/admin/listings", icon: Megaphone, color: "text-orange-600" },
  { title: "برندها", href: "/admin/taxonomy/brands", icon: Building2, color: "text-violet-600" },
  { title: "دسته‌بندی‌ها", href: "/admin/categories", icon: FolderTree, color: "text-blue-600" },
  { title: "درخواست‌های خرید", href: "/admin/requests", icon: PackageSearch, color: "text-emerald-600" },
  { title: "پیشنهادها", href: "/admin/offers", icon: Users, color: "text-pink-600" },
  { title: "RFQ", href: "/admin/rfq", icon: PackageSearch, color: "text-teal-600" },
  { title: "مزایده", href: "/admin/auctions", icon: Gavel, color: "text-amber-600" },
  { title: "پرچم‌های ویژگی", href: "/admin/feature-flags", icon: Flag, color: "text-orange-600" },
  { title: "دیکشنری صنعتی", href: "/admin/dictionary", icon: BookMarked, color: "text-indigo-600" },
  { title: "دروازه هوش مصنوعی", href: "/admin/ai-gateway", icon: Brain, color: "text-rose-600" },
  { title: "تحلیل‌گر بازار", href: "/admin/ai-analyst", icon: Sparkles, color: "text-fuchsia-600" },
  { title: "سلامت کاتالوگ", href: "/admin/catalog-health", icon: HeartPulse, color: "text-red-600" },
  { title: "موتور رشد", href: "/admin/growth-engine", icon: TrendingUp, color: "text-emerald-600" },
  { title: "فازهای راه‌اندازی", href: "/admin/launch-phases", icon: Activity, color: "text-blue-600" },
  { title: "کاربران", href: "/admin/users", icon: Users, color: "text-zinc-600" },
  { title: "مقالات", href: "/admin/articles", icon: BookMarked, color: "text-purple-600" },
  { title: "تنظیمات", href: "/admin/settings", icon: Settings, color: "text-zinc-600" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black text-zinc-900">مرکز فرماندهی</h1>
        <p className="mt-2 text-sm text-zinc-500">
          دسترسی مستقیم به بخش‌های مدیریتی هویکس
        </p>
      </header>

      <section
        aria-label="وضعیت داشبورد"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"
      >
        برای پایدار ماندن ورود و نمایش کنترل‌پنل روی Cloudflare، بارگذاری سنگین
        آمار از صفحه‌ی اولیه جدا شده است. آمار تفصیلی همچنان در بخش‌های مربوط
        در دسترس است؛ این تغییر هیچ داده یا سطح دسترسی‌ای را تغییر نمی‌دهد.
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-black text-zinc-900">دسترسی سریع</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-24 flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center transition hover:border-orange-400 hover:bg-orange-50"
            >
              <item.icon className={`h-6 w-6 ${item.color}`} />
              <span className="text-xs font-bold text-zinc-700 group-hover:text-orange-700">
                {item.title}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
