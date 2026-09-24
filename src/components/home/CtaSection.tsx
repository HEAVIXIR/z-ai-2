import Link from "next/link";

/* ============================================================
   CtaSection — STEP 16-C pass 4 styling upgrade.
   final call-to-action.

   Styling improvements (pass 4):
   - Animated background gradient orbs (3 floating orbs at different positions)
   - Subtitle badge with pulse animation
   - Larger hero typography (3xl → 4xl/5xl) with gradient text
   - Two CTA buttons with distinct visual hierarchy:
     * Primary: orange gradient with glow shadow + icon
     * Secondary: glass border with hover lift effect
   - Trust indicators row (3 mini-stats under buttons)
   - Refined spacing + max-width for better readability

   FIX-ADMIN-EDITABILITY — header text now driven by `cmsConfig`
   (managed from /admin/homepage-layout). Buttons stay hardcoded
   (they map to fixed routes).
   ============================================================ */

type CmsConfig = {
  title?: string;
  subtitle?: string;
  description?: string;
};

const DEFAULT_TITLE = "آماده شروع هستید؟";
const DEFAULT_DESC =
  "همین حالا آگهی خود را رایگان ثبت کنید یا دستگاه مورد نظرتان را در بزرگ‌ترین بازار ماشین‌آلات سنگین ایران پیدا کنید.";

const DEFAULT_SUBTITLE = "همین حالا شروع کنید";

// Trust indicators shown under the CTA buttons
const TRUST_INDICATORS = [
  { value: "رایگان", label: "ثبت آگهی" },
  { value: "۶۲۹+", label: "برند فعال" },
  { value: "۲۹+", label: "آگهی آنلاین" },
];

export default function CtaSection({ cmsConfig }: { cmsConfig?: CmsConfig } = {}) {
  const title = cmsConfig?.title || DEFAULT_TITLE;
  const description = cmsConfig?.description || DEFAULT_DESC;
  const subtitle = cmsConfig?.subtitle || DEFAULT_SUBTITLE;

  return (
    <section className="relative overflow-hidden border-t border-white/5 py-24">
      {/* Animated background orbs (3 layers for depth) */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(245,130,32,0.10),transparent_70%)]" />
        <div className="absolute -top-20 left-1/4 h-72 w-72 animate-pulse rounded-full bg-[#F58220]/5 blur-3xl" />
        <div
          className="absolute -bottom-20 right-1/4 h-80 w-80 animate-pulse rounded-full bg-amber-500/5 blur-3xl"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="mx-auto max-w-4xl px-6 text-center">
        {/* Subtitle badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#F58220]/30 bg-[#F58220]/10 px-4 py-1.5 text-xs font-bold tracking-wider text-[#F58220]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F58220] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F58220]" />
          </span>
          {subtitle}
        </div>

        {/* Hero title with gradient */}
        <h2 className="mb-4 bg-gradient-to-br from-white via-white to-[#FFB55A] bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
          {title}
        </h2>

        <p className="mb-10 text-sm leading-7 text-white/60 sm:text-base">
          {description}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/listings/new"
            className="group relative w-full overflow-hidden rounded-full bg-gradient-to-r from-[#F58220] to-[#FF9F4D] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-orange-600/30 transition-all hover:shadow-xl hover:shadow-orange-600/40 sm:w-auto"
          >
            {/* Shine effect on hover */}
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative flex items-center justify-center gap-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              ثبت آگهی رایگان
            </span>
          </Link>

          <Link
            href="/listings"
            className="group w-full rounded-full border border-white/15 bg-white/[0.04] px-8 py-4 text-sm font-bold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#F58220]/50 hover:bg-white/[0.08] hover:text-[#F58220] sm:w-auto"
          >
            <span className="flex items-center justify-center gap-2">
              مشاهده آگهی‌ها
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="mx-auto mt-12 flex max-w-md items-center justify-center divide-x divide-white/10 divide-x-reverse">
          {TRUST_INDICATORS.map((item) => (
            <div
              key={item.label}
              className="flex flex-1 flex-col items-center px-4"
            >
              <div className="bg-gradient-to-br from-[#F58220] to-amber-400 bg-clip-text text-xl font-black text-transparent">
                {item.value}
              </div>
              <div className="mt-1 text-[11px] text-white/40">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
