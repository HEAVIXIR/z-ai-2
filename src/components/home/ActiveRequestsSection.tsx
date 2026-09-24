import Link from "next/link";
import { Flame, ArrowLeft, MapPin, Clock, DollarSign, Tag } from "lucide-react";
import SectionTitle from "@/components/ui/SectionTitle";
import { toFa, formatCompactPrice } from "@/lib/format";

export type ActiveRequest = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  brandPref: string | null;
  transaction: string;
  budgetMin: string | null;
  budgetMax: string | null;
  city: string | null;
  deadline: string | null;
  verified: boolean;
  publishedAt: string | null;
};

export default function ActiveRequestsSection({
  requests,
  cmsConfig,
}: {
  requests: ActiveRequest[];
  cmsConfig?: { title?: string; subtitle?: string; description?: string };
}) {
  if (requests.length === 0) return null;

  return (
    <section className="relative overflow-hidden py-12">
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10">
        <SectionTitle
          align="center"
          subtitle={cmsConfig?.subtitle || "HEAVIX WANTED"}
          title={cmsConfig?.title || "درخواست‌های فعال خرید"}
          description={cmsConfig?.description || "فروشندگان می‌توانند مستقیم به تقاضای واقعی خریداران پاسخ دهند"}
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#0a0a0a] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#F58220]/40 hover:shadow-[0_15px_50px_-12px_rgba(245,130,32,0.3)]"
            >
              {/* Top gradient accent bar — animates width on hover */}
              <div className="absolute inset-x-0 top-0 h-0.5 origin-right scale-x-0 bg-gradient-to-r from-[#F58220] via-amber-400 to-[#F58220] transition-transform duration-500 group-hover:scale-x-100" />

              {/* Background glow on hover */}
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(245,130,32,0.06),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="mb-3 flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.transaction === "RENT" ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30" : "bg-[#F58220]/20 text-[#F58220] ring-1 ring-[#F58220]/30"}`}>
                  {r.transaction === "RENT" ? "اجاره" : "خرید"}
                </span>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-400 ring-1 ring-teal-500/30">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    تأییدشده
                  </span>
                )}
              </div>

              <h3 className="line-clamp-2 min-h-[48px] text-base font-bold leading-6 text-white transition-colors group-hover:text-[#F58220]">{r.title}</h3>
              {r.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/40">{r.description}</p>}

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/55">
                {r.category && <span className="inline-flex items-center gap-1 transition-colors group-hover:text-white/75"><Tag className="h-3 w-3 text-[#F58220]" />{r.category}</span>}
                {r.city && <span className="inline-flex items-center gap-1 transition-colors group-hover:text-white/75"><MapPin className="h-3 w-3 text-[#F58220]" />{r.city}</span>}
                {r.deadline && <span className="inline-flex items-center gap-1 transition-colors group-hover:text-white/75"><Clock className="h-3 w-3 text-[#F58220]" />{r.deadline}</span>}
              </div>

              {(r.budgetMin || r.budgetMax) && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 text-sm">
                  <DollarSign className="h-4 w-4 text-[#F58220]" />
                  <span className="text-white/60">بودجه: </span>
                  <span className="bg-gradient-to-r from-[#F58220] to-amber-400 bg-clip-text font-bold text-transparent">
                    {r.budgetMin && formatCompactPrice(BigInt(r.budgetMin))}
                    {r.budgetMin && r.budgetMax && " — "}
                    {r.budgetMax && formatCompactPrice(BigInt(r.budgetMax))}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/requests/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F58220] px-8 text-sm font-bold text-white transition hover:bg-[#ff8c38]">
            <Flame className="h-4 w-4" />ثبت درخواست خرید
          </Link>
          <Link href="/listings" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 text-sm font-bold text-white transition hover:border-[#F58220]/30 hover:bg-white/10">
            مشاهده ماشین‌آلات<ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
