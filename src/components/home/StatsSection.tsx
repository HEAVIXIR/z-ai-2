import { toFa } from "@/lib/format";

/* ============================================================
   StatsSection — STEP 16-C pass 3 styling upgrade.
   gradient panel, live counts from DB.

   Styling improvements (pass 3):
   - Live indicator badge with pulsing dot animation
   - Gradient shimmer on stat values (orange→amber)
   - Subtle hover glow on stat cards (border + shadow)
   - Number-prefix icon row for visual interest
   - Refined typography hierarchy with sublabel support
   - Glassmorphism touch (backdrop-blur on panel)

   FIX-STATS: values are now admin-configured via SiteStat rows
   and arrive pre-formatted (Persian digits). The `value` field
   may already contain a formatted string (preferred) or a raw
   number (legacy fallback).

   FIX-ADMIN-EDITABILITY — accepts an optional `cmsConfig`
   (title/subtitle/description) and renders a section header
   above the stats panel when any of them are set. Managed from
   /admin/homepage-layout.
   ============================================================ */

export type StatItem = {
  value: string | number;
  label: string;
  suffix?: string;
  /** Optional sublabel rendered below the main label (smaller, muted). */
  sublabel?: string;
  /** Optional icon name from lucide-react (rendered as inline SVG via dynamic icon map). */
  icon?: "activity" | "users" | "tags" | "map" | "truck" | "building" | "gauge" | "trending";
};

type CmsConfig = {
  title?: string;
  subtitle?: string;
  description?: string;
};

// Minimal inline icon set — keeps the component dependency-free while
// giving each stat a unique visual anchor.
const ICON_PATHS: Record<string, string> = {
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  tags:
    "M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  map:
    "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  truck:
    "M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2 M14 9h4l4 4v4a1 1 0 0 1-1 1h-1 M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  building:
    "M3 21h18 M5 21V7l8-4 8 4v14 M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01",
  gauge:
    "M12 14l4-4 M3.34 19a10 10 0 1 1 17.32 0",
  trending:
    "M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6",
};

function StatIcon({ name }: { name?: StatItem["icon"] }) {
  if (!name || !ICON_PATHS[name]) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-[#F58220]/80"
      aria-hidden
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export default function StatsSection({
  items,
  cmsConfig,
}: {
  items: StatItem[];
  cmsConfig?: CmsConfig;
}) {
  if (items.length === 0) return null;

  const showHeader =
    !!cmsConfig &&
    !!(cmsConfig.title || cmsConfig.subtitle || cmsConfig.description);

  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
        {showHeader && (
          <div className="mb-10 flex max-w-3xl flex-col items-center text-center mx-auto">
            {cmsConfig!.subtitle && (
              <div className="text-xs font-black tracking-[0.3em] text-[#F58220]">
                {cmsConfig!.subtitle}
              </div>
            )}
            {cmsConfig!.title && (
              <h2 className="mt-3 text-3xl font-black text-white lg:text-4xl">
                {cmsConfig!.title}
              </h2>
            )}
            {cmsConfig!.description && (
              <p className="mt-3 text-sm leading-7 text-white/55 lg:text-base">
                {cmsConfig!.description}
              </p>
            )}
          </div>
        )}

        {/* Live indicator row */}
        <div className="mb-4 flex items-center justify-center gap-2 text-xs font-medium text-white/50">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="tracking-wide">آپدیت لحظه‌ای</span>
        </div>

        <div className="grid gap-6 rounded-3xl border border-white/10 bg-gradient-to-l from-[#F58220]/10 via-[#141414] to-[#141414] p-8 sm:grid-cols-2 lg:grid-cols-4 lg:p-10 backdrop-blur-sm">
          {items.map((s) => {
            const display =
              typeof s.value === "number"
                ? `${toFa(s.value.toLocaleString("en-US"))}${s.suffix ?? ""}`
                : s.value;
            return (
              <div
                key={s.label}
                className="group relative rounded-2xl border border-transparent p-4 text-center transition-all duration-300 hover:border-[#F58220]/30 hover:bg-white/[0.02] hover:shadow-[0_0_30px_-8px_rgba(245,130,32,0.25)]"
              >
                {/* Icon row */}
                {s.icon && (
                  <div className="mb-3 flex justify-center transition-transform duration-300 group-hover:scale-110">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F58220]/10 ring-1 ring-[#F58220]/20">
                      <StatIcon name={s.icon} />
                    </div>
                  </div>
                )}

                {/* Value with gradient shimmer */}
                <div className="bg-gradient-to-br from-[#F58220] via-[#FFB55A] to-[#F58220] bg-clip-text text-3xl font-black text-transparent transition-all duration-300 lg:text-4xl group-hover:from-amber-300 group-hover:via-[#F58220] group-hover:to-amber-300">
                  {display}
                </div>

                {/* Main label */}
                <div className="mt-3 text-sm font-medium text-white/70">
                  {s.label}
                </div>

                {/* Sublabel (optional, smaller + muted) */}
                {s.sublabel && (
                  <div className="mt-1 text-[11px] text-white/40">
                    {s.sublabel}
                  </div>
                )}

                {/* Accent line on hover */}
                <div className="mx-auto mt-3 h-0.5 w-0 bg-gradient-to-r from-[#F58220] to-amber-400 transition-all duration-300 group-hover:w-12" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
