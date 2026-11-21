import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  ShieldCheck,
  BadgeDollarSign,
  FileSignature,
  Crown,
  CheckCircle2,
  Search,
  Clock,
  PhoneCall,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { db } from "@/lib/db";
import { toFa } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ============================================================
   /sell-in-7-days — landing page for the "Sell in 7 Days"
   campaign. Explains the 4-step process, shows the 4
   AI-generated step images, links to the registration form
   and the tracking page.
   ============================================================ */

const STEPS = [
  {
    num: "۰۱",
    fa: "ثبت درخواست اولیه",
    en: "Initial Request",
    desc:
      "اطلاعات دستگاه و راه ارتباطی را ثبت کنید و کد رهگیری بگیرید. در نسخه فعلی هیچ پرداختی انجام نمی‌شود و ثبت فرم به معنی رزرو قطعی نیست.",
    icon: ClipboardList,
    image: "/images/sell-in-7-days/step-1.jpg",
    points: ["ثبت مشخصات دستگاه", "دریافت کد رهگیری", "پیگیری وضعیت درخواست"],
  },
  {
    num: "۰۲",
    fa: "بررسی اولیه اطلاعات",
    en: "Initial Review",
    desc:
      "در صورت فعال بودن خدمت و پس از هماهنگی با شما، اطلاعات دستگاه برای امکان کارشناسی بررسی می‌شود. هیچ کارشناسی پیش از توافق جداگانه انجام‌شده تلقی نمی‌شود.",
    icon: ShieldCheck,
    image: "/images/sell-in-7-days/step-2.jpg",
    points: ["بررسی اطلاعات ثبت‌شده", "هماهنگی با مالک", "تعیین امکان ادامه فرآیند"],
  },
  {
    num: "۰۳",
    fa: "اعلام شرایط و ارزش‌گذاری",
    en: "Terms & Valuation",
    desc:
      "در صورت امکان ارائه خدمت، شرایط، زمان‌بندی و هرگونه هزینه یا روش ارزش‌گذاری پیش از شروع به‌صورت کتبی اعلام می‌شود.",
    icon: BadgeDollarSign,
    image: "/images/sell-in-7-days/step-3.jpg",
    points: ["اعلام شرایط مکتوب", "توضیح روش ارزش‌گذاری", "تأیید شما پیش از ادامه"],
  },
  {
    num: "۰۴",
    fa: "قرارداد و مراحل بعدی",
    en: "Agreement & Next Steps",
    desc:
      "هرگونه کارشناسی، عرضه، معامله یا تسویه فقط پس از توافق طرفین و امضای قرارداد مربوط انجام می‌شود.",
    icon: FileSignature,
    image: "/images/sell-in-7-days/step-4.jpg",
    points: ["توافق روشن طرفین", "قرارداد کتبی", "پیگیری مراحل با کد رهگیری"],
  },
];

const FAQS = [
  {
    q: "آیا فروش دستگاه در ۷ روز تضمین می‌شود؟",
    a: "خیر. عنوان کمپین به معنی تضمین قطعی فروش نیست. نتیجه به وضعیت دستگاه، قیمت، تقاضای بازار و توافق طرفین بستگی دارد.",
  },
  {
    q: "آیا هنگام ثبت درخواست پیش‌پرداخت می‌دهم؟",
    a: "خیر. در نسخه فعلی درگاه پرداخت فعال نیست و هیچ وجهی از طریق این فرم دریافت نمی‌شود. هر هزینه احتمالی فقط پس از اعلام کتبی شرایط و تأیید شما قابل پرداخت است.",
  },
  {
    q: "کارمزد فروش چگونه محاسبه می‌شود؟",
    a: "نرخ و شرایط کارمزد در نسخه فعلی قطعی نشده است و فقط در صورت توافق و قرارداد کتبی مشخص می‌شود.",
  },
  {
    q: "آیا لازم است دستگاه را منتقل کنم؟",
    a: "هرگونه کارشناسی و انتقال فقط پس از هماهنگی و توافق جداگانه انجام می‌شود.",
  },
];

const TRUST_CHIPS = [
  "ثبت درخواست اولیه",
  "کد رهگیری اختصاصی",
  "بدون پرداخت در نسخه فعلی",
  "شرایط کتبی پیش از هر هزینه",
];

export default async function SellIn7DaysLandingPage() {
  const [categories, settings] = await Promise.all([
    db.category.findMany({
      where: { active: true, layer: "CATALOG", parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, icon: true },
    }),
    db.siteSettings.findUnique({ where: { id: "main" } }),
  ]);

  const heroStats = [
    { value: toFa(4), labelFa: "گام‌های فرآیند" },
    { value: toFa(0), labelFa: "پرداخت در ثبت اولیه" },
    { value: toFa(16), labelFa: "کاراکتر کد رهگیری" },
    { value: toFa(1), labelFa: "کد برای هر درخواست" },
  ];

  const heroStatsNormalized = heroStats.map((s: any) => ({
    value: s.value,
    label: s.labelFa,
  }));

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentId: null,
        }))}
      />

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden pb-20 pt-32">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_60%_at_50%_20%,rgba(245,130,32,0.15),transparent_70%)]" />
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#F58220]/30 bg-[#F58220]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-[#F58220]">
                <Crown className="h-4 w-4" />
                HEAVIX REQUEST
              </span>
              <h1 className="mt-6 text-4xl font-black leading-tight text-white lg:text-6xl">
                ثبت درخواست فروش دستگاه{" "}
                <span className="bg-gradient-to-l from-amber-400 to-[#F58220] bg-clip-text text-transparent">
                  در بازار هویکس
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-8 text-white/60 lg:text-base">
                اطلاعات دستگاه را ثبت کنید و کد رهگیری بگیرید. در نسخه فعلی این صفحه
                برای ثبت درخواست اولیه است؛ پرداخت آنلاین، رزرو قطعی یا تضمین فروش فعال نیست.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/sell-in-7-days/register"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-l from-amber-500 to-[#F58220] px-8 text-sm font-bold text-white shadow-lg shadow-orange-950/40 transition hover:brightness-110"
                >
                  ثبت دستگاه
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link
                  href="/sell-in-7-days/track"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 text-sm font-bold text-white transition hover:border-[#F58220]/40 hover:bg-[#F58220]/10"
                >
                  <Search className="h-4 w-4" />
                  پیگیری درخواست
                </Link>
              </div>
              {/* Hero stats */}
              <div className="mt-12 grid w-full max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                {heroStatsNormalized.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center"
                  >
                    <div className="text-2xl font-black text-[#F58220]">{s.value}</div>
                    <div className="mt-1 text-[11px] text-white/55">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4-STEP PROCESS WITH AI IMAGES */}
        <section className="relative overflow-hidden py-20">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
            <div className="mx-auto mb-16 flex max-w-3xl flex-col items-center text-center">
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#F58220]">
                HOW IT WORKS
              </span>
              <h2 className="mt-3 text-3xl font-black text-white lg:text-5xl">
                مسیر بررسی درخواست در ۴ گام
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/55">
                از ثبت اولیه تا توافق احتمالی؛ هر مرحله با اطلاع و تأیید شما انجام می‌شود.
              </p>
            </div>

            <div className="space-y-8">
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const reverse = idx % 2 === 1;
                return (
                  <div
                    key={step.num}
                    className={`grid items-stretch gap-6 lg:grid-cols-2 lg:gap-12 ${
                      reverse ? "lg:[direction:ltr]" : ""
                    }`}
                  >
                    {/* Image */}
                    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111]">
                      <div className="aspect-[16/10] w-full">
                        <img
                          src={step.image}
                          alt={step.fa}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-transparent to-transparent" />
                      <div className="absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F58220] text-sm font-black text-white shadow-lg">
                        {step.num}
                      </div>
                    </div>

                    {/* Text */}
                    <div
                      className={`flex flex-col justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-8 lg:p-10 ${
                        reverse ? "lg:[direction:rtl]" : ""
                      }`}
                    >
                      <div className="inline-flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F58220]/15 text-[#F58220]">
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#F58220]">
                          {step.en}
                        </span>
                      </div>
                      <h3 className="mt-5 text-2xl font-black leading-tight text-white">
                        {step.fa}
                      </h3>
                      <p className="mt-4 text-sm leading-7 text-white/55">
                        {step.desc}
                      </p>
                      <div className="mt-6 space-y-2">
                        {step.points.map((p) => (
                          <div
                            key={p}
                            className="flex items-center gap-2 text-sm text-white/75"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F58220]" />
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CURRENT SERVICE STATUS */}
        <section className="py-12">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-transparent p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F58220]/15 text-[#F58220]">
                  <BadgeDollarSign className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-black text-white">پرداخت آنلاین</h3>
                <p className="mt-3 text-sm font-bold text-amber-200">در این نسخه فعال نیست</p>
                <p className="mt-2 text-xs leading-6 text-white/55">
                  ثبت درخواست اولیه هیچ پرداختی ایجاد نمی‌کند. هر هزینه احتمالی پیش از دریافت، کتبی اعلام می‌شود.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <FileSignature className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-black text-white">کارمزد و قرارداد</h3>
                <p className="mt-3 text-sm font-bold text-white">فقط با توافق کتبی</p>
                <p className="mt-2 text-xs leading-6 text-white/55">
                  هیچ نرخ یا تعهد مالی از طریق این فرم قطعی نمی‌شود؛ شرایط در قرارداد جداگانه مشخص خواهد شد.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Clock className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-black text-white">زمان فروش</h3>
                <p className="mt-3 text-sm font-bold text-white">بدون تضمین قطعی</p>
                <p className="mt-2 text-xs leading-6 text-white/55">
                  زمان فروش به وضعیت دستگاه، قیمت، تقاضای بازار و توافق طرفین وابسته است.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST CHIPS */}
        <section className="py-8">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {TRUST_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-bold text-white/60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#F58220]" />
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-12 text-center">
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#F58220]">
                FAQ
              </span>
              <h2 className="mt-3 text-3xl font-black text-white">سوالات متداول</h2>
            </div>
            <div className="space-y-3">
              {FAQS.map((f, i) => (
                <details
                  key={i}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#F58220]/30"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white">
                    <span>{f.q}</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#F58220] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-xs leading-7 text-white/55">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
            <div className="relative overflow-hidden rounded-3xl border border-[#F58220]/20 bg-gradient-to-l from-amber-950/40 via-[#141414] to-[#141414] p-8 lg:p-12">
              <div className="relative z-10 flex flex-col items-center text-center">
                <PhoneCall className="h-10 w-10 text-[#F58220]" />
                <h2 className="mt-4 text-2xl font-black text-white lg:text-3xl">
                  آمادهٔ ثبت درخواست اولیه هستید؟
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-white/60">
                  اطلاعات دستگاه را ثبت کنید و کد رهگیری بگیرید. ثبت درخواست به معنی
                  پرداخت، رزرو قطعی یا تضمین فروش نیست.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/sell-in-7-days/register"
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-l from-amber-500 to-[#F58220] px-8 text-sm font-bold text-white shadow-lg shadow-orange-950/40 transition hover:brightness-110"
                  >
                    ثبت دستگاه
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/sell-in-7-days/track"
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 text-sm font-bold text-white transition hover:border-[#F58220]/40 hover:bg-[#F58220]/10"
                  >
                    <Search className="h-4 w-4" />
                    پیگیری درخواست
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer
        settings={
          settings
            ? {
                about: settings.about,
                phone: settings.phone,
                email: settings.email,
                address: settings.address,
                workingHours: settings.workingHours,
                copyright: settings.copyright,
                newsletterEnabled: settings.newsletterEnabled,
              }
            : null
        }
      />
    </div>
  );
}
