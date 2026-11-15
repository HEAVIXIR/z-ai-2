"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";

type Step = "request" | "reset" | "success";

const inputClass =
  "h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-[#F58220] placeholder:text-white/30";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "درخواست ارسال نشد.");
      setMessage(data.message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای شبکه. دوباره تلاش کنید.");
    } finally { setLoading(false); }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");
    if (password !== confirmPassword) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "بازیابی رمز عبور انجام نشد.");
      setMessage(data.message);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای شبکه. دوباره تلاش کنید.");
    } finally { setLoading(false); }
  }

  return (
    <main dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0b0b] px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(245,130,32,0.12),transparent_70%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center">
          <img src="/logos/heavix-logo.svg" alt="HEAVIX" className="h-14 w-auto" />
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.3em] text-white/40">HEAVIX Portal</p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#0c0c0c] p-7 shadow-2xl">
          <div className="mb-5 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F58220]/15">
              {step === "success" ? <ShieldCheck className="h-7 w-7 text-[#F58220]" /> : step === "request" ? <Mail className="h-7 w-7 text-[#F58220]" /> : <KeyRound className="h-7 w-7 text-[#F58220]" />}
            </div>
          </div>

          <h1 className="text-center text-xl font-black text-white">
            {step === "request" ? "فراموشی رمز عبور" : step === "reset" ? "تعیین رمز عبور جدید" : "رمز عبور تغییر کرد"}
          </h1>
          <p className="mt-2 text-center text-xs leading-6 text-white/50">
            {step === "request" ? "ایمیل حساب کاربری‌تان را وارد کنید تا کد بازیابی برایتان ارسال شود." : step === "reset" ? "کد ۶ رقمی ارسال‌شده به ایمیل و رمز عبور جدیدتان را وارد کنید." : "اکنون می‌توانید با رمز جدید وارد حساب HEAVIX شوید."}
          </p>

          {message && <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-300">{message}</div>}
          {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300">{error}</div>}

          {step === "request" && (
            <form onSubmit={requestCode} className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-white/65">ایمیل حساب کاربری</label>
              <input type="email" required dir="ltr" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
              <button disabled={loading} className="h-12 w-full rounded-xl bg-[#F58220] text-sm font-bold text-white disabled:opacity-50">{loading ? "در حال ارسال..." : "ارسال کد بازیابی"}</button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={resetPassword} className="mt-5 space-y-3">
              <label className="block text-xs font-bold text-white/65">کد ۶ رقمی ایمیل</label>
              <input required inputMode="numeric" maxLength={6} dir="ltr" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={inputClass + " text-center tracking-[0.5em]"} placeholder="------" />
              <label className="block pt-1 text-xs font-bold text-white/65">رمز عبور جدید</label>
              <input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="حداقل ۸ کاراکتر" />
              <label className="block pt-1 text-xs font-bold text-white/65">تکرار رمز عبور جدید</label>
              <input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} placeholder="رمز عبور را تکرار کنید" />
              <button disabled={loading || code.length !== 6} className="h-12 w-full rounded-xl bg-[#F58220] text-sm font-bold text-white disabled:opacity-50">{loading ? "در حال تغییر رمز..." : "تغییر رمز عبور"}</button>
              <button type="button" onClick={() => { setStep("request"); setCode(""); setMessage(""); setError(""); }} className="w-full text-xs text-white/45 hover:text-[#F58220]">ارسال مجدد کد</button>
            </form>
          )}

          {step === "success" && (
            <Link href="/login" className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-[#F58220] text-sm font-bold text-white">ورود به حساب</Link>
          )}
        </section>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs">
          <Link href="/login" className="font-semibold text-white/55 hover:text-[#F58220]">بازگشت به ورود</Link>
          <span className="text-white/20">|</span>
          <Link href="/register" className="font-semibold text-white/55 hover:text-[#F58220]">ثبت‌نام</Link>
          <span className="text-white/20">|</span>
          <Link href="/" className="inline-flex items-center gap-1 text-white/40 hover:text-[#F58220]"><ArrowRight className="h-3 w-3" /> سایت</Link>
        </div>
      </div>
    </main>
  );
}
