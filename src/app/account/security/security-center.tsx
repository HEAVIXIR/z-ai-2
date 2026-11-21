"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Mail, Smartphone, KeyRound, Loader2 } from "lucide-react";

type Identity = {
  email: string;
  mobile: string;
  emailVerified: boolean;
  mobileVerified: boolean;
};

const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#F58220]";

async function postJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "درخواست انجام نشد.");
  return data;
}

export default function AccountSecurityCenter() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailStep, setEmailStep] = useState<"request" | "verify">("request");


  useEffect(() => {
    fetch("/api/account/identity", { credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "اطلاعات حساب بارگذاری نشد.");
        setIdentity({
          email: data.identity.email,
          mobile: data.identity.mobile,
          emailVerified: data.identity.contact.emailVerified,
          mobileVerified: data.identity.contact.mobileVerified,
        });
        setNewEmail(data.identity.email);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "خطا در دریافت اطلاعات حساب"))
      .finally(() => setLoading(false));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "خطای غیرمنتظره"); }
    finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError("تکرار رمز جدید یکسان نیست."); return; }
    await run(async () => {
      const data = await postJson("/api/account/password", { currentPassword, newPassword });
      setNotice(data.message);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    });
  }

  async function requestEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(async () => {
      const data = await postJson("/api/account/email-change/request", { email: newEmail, currentPassword: emailPassword });
      setNotice(data.message);
      setEmailPassword(""); setEmailCode(""); setEmailStep("verify");
    });
  }

  async function verifyEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(async () => {
      const data = await postJson("/api/account/email-change/verify", { code: emailCode });
      setNotice(data.message);
      setEmailStep("request"); setEmailCode(""); setEmailPassword("");
      const response = await fetch("/api/account/identity", { credentials: "same-origin" });
      const identityData = await response.json();
      if (response.ok && identityData.ok) {
        setIdentity({
          email: identityData.identity.email,
          mobile: identityData.identity.mobile,
          emailVerified: identityData.identity.contact.emailVerified,
          mobileVerified: identityData.identity.contact.mobileVerified,
        });
        setNewEmail(identityData.identity.email);
      }
    });
  }

  if (loading) return <div className="flex items-center justify-center rounded-2xl border border-white/10 p-10 text-white/50"><Loader2 className="ml-2 h-5 w-5 animate-spin" />در حال دریافت اطلاعات حساب…</div>;

  return (
    <div className="space-y-5">
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-3"><Mail className="h-5 w-5 text-[#F58220]" /><div><h2 className="font-bold">ایمیل حساب</h2><p className="text-xs text-white/45">تغییر ایمیل فقط پس از تأیید آدرس جدید نهایی می‌شود.</p></div></div>
        {identity && <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span dir="ltr" className="text-white/80">{identity.email}</span><span className={identity.emailVerified ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300" : "rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300"}>{identity.emailVerified ? "تأییدشده" : "تأییدنشده"}</span></div>}
        {emailStep === "request" ? (
          <form onSubmit={requestEmailChange} className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/60 sm:col-span-2">ایمیل جدید<input required type="email" maxLength={254} autoComplete="email" dir="ltr" className={inputClass + " mt-1"} value={newEmail} onChange={e=>setNewEmail(e.target.value)} /></label>
            <label className="text-xs text-white/60 sm:col-span-2">رمز عبور فعلی<input required type="password" autoComplete="current-password" className={inputClass + " mt-1"} value={emailPassword} onChange={e=>setEmailPassword(e.target.value)} /></label>
            <button disabled={busy} className="h-11 rounded-xl bg-[#F58220] px-4 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? "در حال ارسال…" : "ارسال کد به ایمیل جدید"}</button>
          </form>
        ) : (
          <form onSubmit={verifyEmailChange} className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs leading-6 text-white/55 sm:col-span-2">کد شش‌رقمی ارسال‌شده به ایمیل جدید را وارد کنید. تا پیش از تأیید، ایمیل فعلی تغییر نمی‌کند.</p>
            <label className="text-xs text-white/60 sm:col-span-2">کد تأیید<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" dir="ltr" className={inputClass + " mt-1 text-center tracking-[0.5em]"} value={emailCode} onChange={e=>setEmailCode(e.target.value.replace(/\D/g,"").slice(0,6))} /></label>
            <button disabled={busy || emailCode.length!==6} className="h-11 rounded-xl bg-[#F58220] px-4 text-sm font-bold text-white disabled:opacity-50">تأیید و تغییر ایمیل</button>
            <button type="button" disabled={busy} onClick={()=>{setEmailStep("request");setEmailCode("");}} className="h-11 rounded-xl border border-white/15 px-4 text-sm text-white/70">لغو درخواست</button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-3"><Smartphone className="h-5 w-5 text-[#F58220]" /><div><h2 className="font-bold">شماره موبایل</h2><p className="text-xs text-white/45">تغییر و تأیید شماره پس از اتصال سرویس پیامکی فعال می‌شود.</p></div></div>
        {identity && <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span dir="ltr" className="text-white/80">{identity.mobile}</span><span className={identity.mobileVerified ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300" : "rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300"}>{identity.mobileVerified ? "تأییدشده" : "تأییدنشده"}</span></div>}
        <div role="note" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm leading-7 text-amber-100/80">
          در حال حاضر فقط تأیید ایمیلی فعال است. تغییر شماره موبایل تا زمان آماده‌سازی زیرساخت پیامکی برای انتشار روی دامنه اصلی غیرفعال است؛ شماره فعلی شما بدون تغییر باقی می‌ماند.
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-3"><KeyRound className="h-5 w-5 text-[#F58220]" /><div><h2 className="font-bold">تغییر رمز عبور</h2><p className="text-xs text-white/45">پس از تغییر رمز، نشست‌های قبلی بسته و نشست فعلی نوسازی می‌شود.</p></div></div>
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/60 sm:col-span-2">رمز عبور فعلی<input required type="password" autoComplete="current-password" className={inputClass + " mt-1"} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} /></label>
          <label className="text-xs text-white/60">رمز جدید<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" className={inputClass + " mt-1"} value={newPassword} onChange={e=>setNewPassword(e.target.value)} /></label>
          <label className="text-xs text-white/60">تکرار رمز جدید<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" className={inputClass + " mt-1"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} /></label>
          <button disabled={busy} className="h-11 rounded-xl bg-[#F58220] px-4 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? "در حال ذخیره…" : "تغییر رمز عبور"}</button>
        </form>
      </section>

      <div className="flex items-center gap-2 text-xs text-white/35"><ShieldCheck className="h-4 w-4" />اطلاعات امنیتی فقط برای صاحب همین حساب قابل مشاهده و تغییر است.</div>
    </div>
  );
}
