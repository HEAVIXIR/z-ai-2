import Link from "next/link";
import { toFa } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

/* ============================================================
   BrandsSection v2 — clean professional logo grid.
   Original exclusive design. Each brand: white logo chip +
   Persian name + listing count. Hover lift + orange border.
   No more 3D cylinder (was messy); pure elegant grid.
   ============================================================ */

export type TickerBrand = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  nameEn?: string | null;
  listingCount?: number;
};

export default function BrandsSection({
  brands,
  totalBrands,
}: {
  brands: TickerBrand[];
  totalBrands: number;
}) {
  if (brands.length === 0) return null;

  // Sort: featured first, then by name
  const sorted = [...brands].sort((a, b) => {
    const aFeatured = (a.listingCount ?? 0) > 0 ? 1 : 0;
    const bFeatured = (b.listingCount ?? 0) > 0 ? 1 : 0;
    if (bFeatured !== aFeatured) return bFeatured - aFeatured;
    return a.name.localeCompare(b.name, "fa");
  });

  return (
    <section id="brands" className="relative overflow-hidden bg-[#0b0b0b] py-24" aria-label="برندهای معتبر">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center text-center">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#F58220]">
            TOP BRANDS
          </span>
          <h2 className="mt-3 text-3xl font-black text-white lg:text-5xl">
            برندهای معتبر
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45">
            بزرگ‌ترین برندهای سازندهٔ ماشین‌آلات سنگین جهان —{" "}
            {toFa(totalBrands)} برند در پلتفرم هویکس
          </p>
        </div>

        {/* Logo grid */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {sorted.slice(0, 24).map((b) => (
            <Link
              key={b.id}
              href={`/listings?brand=${b.slug}`}
              className="group relative flex flex-col items-center gap-2.5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#F58220]/40 hover:bg-[#F58220]/[0.04] hover:shadow-[0_12px_40px_-10px_rgba(245,130,32,0.3)]"
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(245,130,32,0.08),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {/* Top accent line */}
              <div className="absolute inset-x-0 top-0 h-0.5 origin-right scale-x-0 bg-gradient-to-r from-[#F58220] to-amber-400 transition-transform duration-500 group-hover:scale-x-100" />

              <span className="flex h-12 w-20 items-center justify-center overflow-hidden rounded-lg bg-white p-2 shadow-inner ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110 group-hover:ring-[#F58220]/30">
                {b.logoUrl ? (
                   
                  <img
                    src={b.logoUrl}
                    alt={b.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xl font-black text-[#F58220]">
                    {(b.nameEn ?? b.name).charAt(0)}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-bold text-white/55 transition group-hover:text-[#F58220]">
                {b.name}
              </span>
              {b.listingCount ? (
                <span className="rounded-full bg-[#F58220]/10 px-2 py-0.5 text-[9px] font-bold text-[#F58220] opacity-80 transition group-hover:bg-[#F58220]/20 group-hover:opacity-100">
                  {toFa(b.listingCount)} آگهی
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 flex justify-center">
          <Link
            href="/listings"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 text-sm font-bold text-white transition-all duration-300 hover:border-[#F58220]/40 hover:bg-[#F58220]/10 hover:text-[#F58220]"
          >
            همهٔ برندها ({toFa(totalBrands)})
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
