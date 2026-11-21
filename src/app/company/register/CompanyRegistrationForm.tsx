"use client";

import { useState, type FormEvent } from "react";

const BUSINESS_TYPES = [
  ["DEALER", "فروشنده / نمایندگی ماشین‌آلات و تجهیزات"],
  ["MANUFACTURER", "تولیدکننده / سازنده"],
  ["IMPORTER_DISTRIBUTOR", "واردکننده / توزیع‌کننده"],
  ["RENTAL_COMPANY", "شرکت اجاره ماشین‌آلات و تجهیزات"],
  ["AUCTION_HOUSE", "برگزارکننده مزایده"],
  ["BROKER", "کارگزار / واسطه تجاری"],
  ["SERVICE_PROVIDER", "ارائه‌دهنده خدمات فنی و صنعتی"],
  ["FLEET_OPERATOR", "مالک / بهره‌بردار ناوگان"],
  ["PUBLIC_ORGANIZATION", "سازمان عمومی / دولتی"],
] as const;

type FormState = {
  name: string;
  businessType: string;
  description: string;
  website: string;
  province: string;
  city: string;
  address: string;
};

export default function CompanyRegistrationForm() {
  const [form, setForm] = useState<FormState>({
    name: "",
    businessType: "DEALER",
    description: "",
    website: "",
    province: "",
    city: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; slug: string } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const messages: Record<string, string> = {
          verified_account_required: "برای ثبت سازمان، ابتدا وارد حساب فعال شوید و ایمیل و شماره موبایل خود را تأیید کنید.",
          invalid_company_profile: "نام سازمان و نوع فعالیت معتبر را وارد کنید.",
          invalid_website: "نشانی وب‌سایت باید یک URL معتبر با http یا https باشد.",
          rate_limited: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
          company_conflict_retry: "تداخل موقت در ثبت سازمان رخ داد. دوباره تلاش کنید.",
        };
        setError(messages[payload.error] ?? "ثبت سازمان انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.");
        return;
      }
      setCreated({ name: payload.company.name, slug: payload.company.slug });
    } catch {
      setError("ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main className="min-h-[75vh] px-4 py-16 flex items-center justify-center">
        <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-8 text-right text-white shadow-2xl">
          <p className="mb-3 text-sm font-semibold tracking-widest text-orange-400">HEAVIX · BUSINESS</p>
          <h1 className="mb-4 text-2xl font-bold">درخواست ثبت سازمان دریافت شد</h1>
          <p className="mb-3 leading-8 text-zinc-300">
            سازمان «{created.name}» ایجاد شد. عضویت شما با نقش مالک سازمان فعال است؛ اما پروفایل سازمان تا بررسی اولیه در وضعیت انتظار باقی می‌ماند.
          </p>
          <p className="mb-8 text-sm text-zinc-400">شناسه عمومی: {created.slug}</p>
          <a href="/" className="inline-flex rounded-xl bg-orange-500 px-5 py-3 font-bold text-black hover:bg-orange-400">
            بازگشت به HEAVIX
          </a>
        </section>
      </main>
    );
  }

  const fieldClass = "w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-orange-400";
  const labelClass = "mb-2 block text-sm font-medium text-zinc-300";

  return (
    <main className="min-h-[75vh] px-4 py-12 flex items-center justify-center">
      <section className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950 p-6 text-right text-white shadow-2xl sm:p-9">
        <p className="mb-3 text-sm font-semibold tracking-widest text-orange-400">HEAVIX · INDUSTRIAL MARKETPLACE</p>
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">ایجاد پروفایل سازمانی</h1>
        <p className="mb-8 leading-8 text-zinc-400">
          سازمان خود را ثبت کنید، مالکیت سازمانی را دریافت کنید و پس از بررسی اولیه، اعضای تیم را دعوت و دسترسی‌ها را مدیریت کنید.
        </p>

        <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="company-name">نام رسمی یا تجاری سازمان *</label>
            <input id="company-name" className={fieldClass} value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={120} required placeholder="مثلاً شرکت ماشین‌آلات راه‌سازی ..." />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="business-type">نوع فعالیت سازمان *</label>
            <select id="business-type" className={fieldClass} value={form.businessType} onChange={(e) => update("businessType", e.target.value)} required>
              {BUSINESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="company-description">معرفی سازمان</label>
            <textarea id="company-description" className={fieldClass} rows={4} maxLength={5000} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="حوزه فعالیت، برندها، تخصص و خدمات سازمان..." />
          </div>

          <div>
            <label className={labelClass} htmlFor="company-website">وب‌سایت</label>
            <input id="company-website" type="url" className={fieldClass} maxLength={255} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://example.com" />
          </div>
          <div>
            <label className={labelClass} htmlFor="company-province">استان</label>
            <input id="company-province" className={fieldClass} maxLength={100} value={form.province} onChange={(e) => update("province", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="company-city">شهر</label>
            <input id="company-city" className={fieldClass} maxLength={100} value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="company-address">نشانی</label>
            <input id="company-address" className={fieldClass} maxLength={500} value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>

          {error ? (
            <p role="alert" className="sm:col-span-2 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm leading-7 text-red-200">{error}</p>
          ) : null}

          <div className="sm:col-span-2">
            <p className="mb-4 text-xs leading-6 text-zinc-500">
              ایمیل و شماره تماس اولیه از اطلاعات تأییدشده حساب شما گرفته می‌شود. وضعیت تأیید سازمان پس از بررسی مدارک توسط HEAVIX تعیین خواهد شد.
            </p>
            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-orange-500 px-5 py-3.5 font-bold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "در حال ثبت سازمان…" : "ثبت سازمان و ایجاد فضای کاری"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
