import type { HeroStat } from "./Hero";

export type CinematicHeroConfig = {
  backgroundImage?: string;
  backgroundPosition?: string;
  overlay?: number;
  title?: string;
  subtitle?: string;
  cards?: Array<{ id: string; eyebrow: string; title: string; image: string; href: string; visible?: boolean }>;
  metricsTitle?: string;
  showMetrics?: boolean;
  showSearch?: boolean;
};

const DEFAULT_CARDS = [
  { id: "exclusive", eyebrow: "HEAVIX EXCLUSIVE", title: "فروش ویژه", image: "/images/hero/card-exclusive.png", href: "/listings?featured=true", visible: true },
  { id: "featured", eyebrow: "FEATURED LISTINGS", title: "آگهی‌های منتخب", image: "/images/hero/card-featured.png", href: "/listings?featured=true", visible: true },
  { id: "services", eyebrow: "PROFESSIONAL SERVICES", title: "خدمات تخصصی", image: "/images/hero/card-services.png", href: "/services", visible: true },
];

export function parseCinematicHeroConfig(raw?: string | null): CinematicHeroConfig {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as CinematicHeroConfig;
  } catch {
    return {};
  }
}

export default function CinematicIndustrialHero({
  stats,
  config,
}: {
  stats: HeroStat[];
  config: CinematicHeroConfig;
}) {
  const cards = (Array.isArray(config.cards) && config.cards.length
    ? config.cards
    : DEFAULT_CARDS).filter((card) => card.visible !== false).slice(0, 3);
  const background = config.backgroundImage || "/images/hero/hero-construction.png";
  const overlay = Math.max(0.35, Math.min(0.9, Number(config.overlay ?? 0.62)));
  return (
    <section dir="ltr" className="relative isolate min-h-[570px] overflow-hidden bg-[#080a0d] text-white md:min-h-[620px]">
      <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url("${background}")`, backgroundPosition: config.backgroundPosition || "center 48%" }} />
      <div className="absolute inset-0 -z-10" style={{ background: `linear-gradient(90deg,rgba(5,7,10,.12),rgba(5,7,10,${overlay}) 76%),linear-gradient(0deg,rgba(4,5,7,.94),rgba(4,5,7,.08) 65%)` }} />
      <div className="pointer-events-none absolute inset-y-0 left-0 -z-0 hidden w-[43%] bg-gradient-to-r from-transparent via-black/10 to-black/40 lg:block" />
      <div className="relative mx-auto grid min-h-[570px] max-w-[1600px] grid-cols-1 gap-5 px-4 pb-24 pt-10 sm:px-7 md:min-h-[620px] md:px-10 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-center lg:gap-7 lg:px-12 lg:pb-28">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.05fr_1fr_1fr]">
          {cards.map((card, index) => (
            <a key={card.id} href={card.href || "/listings"} className={`group relative isolate flex min-h-[250px] overflow-hidden rounded-[22px] border border-[#d7c39a]/30 bg-[#101317]/65 shadow-[0_22px_65px_rgba(0,0,0,.48)] backdrop-blur-md transition duration-500 hover:-translate-y-1 hover:border-[#d7b875]/70 ${index === 0 ? "sm:col-span-2 lg:col-span-1 lg:min-h-[345px]" : "lg:min-h-[315px]"}`}>
              <div className="absolute inset-0 -z-10 bg-cover bg-center transition duration-700 group-hover:scale-105" style={{ backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.08) 65%),url("${card.image || background}")` }} />
              {index === 0 && <div className="pointer-events-none absolute -left-8 top-0 -z-0 h-full w-1/3 bg-cover bg-left opacity-35 mix-blend-screen" style={{ backgroundImage: `url("${background}")` }} />}
              <div className="relative mt-auto w-full p-5 sm:p-6">
                <div className="mb-2 text-[10px] font-semibold tracking-[.22em] text-[#dfc58f] sm:text-xs">{card.eyebrow}</div>
                <h2 dir="rtl" className="text-xl font-black tracking-wide text-white drop-shadow-lg sm:text-2xl">{card.title}</h2>
                <div className="mt-4 h-px w-12 bg-gradient-to-r from-[#f2d59a] to-transparent transition-all group-hover:w-24" />
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/10" />
            </a>
          ))}
        </div>
        {config.showMetrics !== false && (
          <aside dir="rtl" className="rounded-[22px] border border-white/10 bg-[#0a0d12]/85 p-4 shadow-[0_20px_70px_rgba(0,0,0,.5)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-xs font-bold tracking-wider text-[#e3ca98]">{config.metricsTitle || "آمار زنده HEAVIX"}</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE</span>
            </div>
            <div className="space-y-3">
              {stats.slice(0, 4).map((stat, index) => (
                <div key={stat.label} className="flex items-center justify-between gap-3 border-b border-white/[.06] pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0"><div className="truncate text-[10px] text-white/50">{stat.label}</div><div className="mt-1 text-xl font-semibold tabular-nums text-white">{stat.value}</div></div>
                  <svg viewBox="0 0 72 24" className="h-6 w-[72px] shrink-0 text-[#bda16b]" aria-hidden="true"><path d={[`M1 18 L12 14 L22 17 L33 7 L43 12 L54 5 L71 8`,`M1 14 L12 17 L22 8 L33 13 L43 5 L54 9 L71 3`,`M1 19 L12 11 L22 14 L33 8 L43 11 L54 4 L71 6`,`M1 16 L12 10 L22 15 L33 9 L43 12 L54 7 L71 4`][index]} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />
    </section>
  );
}
