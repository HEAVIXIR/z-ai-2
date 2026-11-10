import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ArrowLeft, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "خدمات تخصصی ماشین‌آلات و تجهیزات صنعتی | هویکس",
  description:
    "خدمات کارشناسی، بازرسی، تعمیر و نگهداری، حمل‌ونقل و پشتیبانی ماشین‌آلات صنعتی در بازار هویکس.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "خدمات تخصصی هویکس",
    description: "خدمات تخصصی ماشین‌آلات و تجهیزات صنعتی در هویکس.",
    type: "website",
    locale: "fa_IR",
  },
};

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, headerCats] = await Promise.all([
    db.service.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { nameFa: "asc" }],
    }).catch(() => []),
    db.category.findMany({
      where: { active: true, layer: "CATALOG", parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, parentId: true, icon: true },
    }).catch(() => []),
  ]);

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={headerCats} />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-20 pt-32 lg:px-10">
        <header className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-[#F58220]/20 bg-[#F58220]/10">
            <Wrench className="size-8 text-[#F58220]" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#F58220]">
            HEAVIX INDUSTRIAL SERVICES
          </p>
          <h1 className="mt-3 text-3xl font-black text-white lg:text-5xl">
            خدمات تخصصی هویکس
          </h1>
          <p className="mt-4 text-sm leading-8 text-white/55 lg:text-base">
            از کارشناسی و بازرسی تا تعمیر، نگهداری و حمل‌ونقل؛ نیاز خدماتی خود را ثبت کنید تا مسیر ارتباط با ارائه‌دهندگان خدمات صنعتی را آغاز کنید.
          </p>
        </header>

        {services.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article
                key={service.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#171717] to-[#0d0d0d] transition hover:-translate-y-1 hover:border-[#F58220]/40"
              >
                {service.imageUrl ? (
                  <div className="h-44 overflow-hidden bg-black/30">
                    <img
                      src={service.imageUrl}
                      alt={service.nameFa}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F58220]/10 text-2xl text-[#F58220]">
                      {service.icon || "⚙️"}
                    </span>
                    <div>
                      <h2 className="font-black text-white">{service.nameFa}</h2>
                      {service.nameEn ? (
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-white/35">
                          {service.nameEn}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {service.description ? (
                    <p className="mt-4 min-h-14 text-sm leading-7 text-white/55">
                      {service.description}
                    </p>
                  ) : null}
                  <Link
                    href={`/listings?transaction=SERVICE_REQUEST&q=${encodeURIComponent(service.nameFa)}`}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#F58220] transition group-hover:gap-3"
                  >
                    ثبت درخواست این خدمت
                    <ArrowLeft className="size-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
            <Wrench className="mx-auto size-10 text-white/25" />
            <h2 className="mt-4 font-bold text-white">خدمت فعالی برای نمایش ثبت نشده است</h2>
            <p className="mt-2 text-sm text-white/45">
              در حال حاضر فهرست خدمات خالی است. می‌توانید نیاز خود را از طریق بازار هویکس ثبت کنید.
            </p>
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <Link
            href="/listings?transaction=SERVICE_REQUEST"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F58220] px-7 text-sm font-black text-white transition hover:bg-[#ff8c38]"
          >
            ثبت درخواست خدمت
            <ArrowLeft className="size-4" />
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
