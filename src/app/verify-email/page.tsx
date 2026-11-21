"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, Loader2, ArrowLeft } from "lucide-react";

export default function VerifyEmailRecoveryPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const inputClass =
    "h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none focus:border-[#F58220] placeholder:text-white/30";

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.alreadyVerified) {
        setVerified(true);
        setMessage("ایمیل این حساب قبلاً تأیید شده است؛ اکنون وارد شوید.");
      } else if (res.ok && data.ok) {
        setSent(true);
        setMessage(data.message || "اگر حساب تأییدنشده‌ای با این ایمیل وجود داشته باشد، کد تازه ارسال می‌شود.");
      } else {
        setError(data.error || "ارسال کد انجام نشد. کمی بعد دوباره تلاش کنید.");
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setVerified(true);
        setMessage(data.message || "ایمیل تأیید شد. اکنون وارد شوید.");
      } else {
        setError(data.error || "تأیید کد انجام نشد.");
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0b0b] px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(245,130,32,0.12),transparent_70%)]" />
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#0c0c0c] p-7 shadow-2xl">
        <div className="mb-5 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F58220]/15">
            {verified ? <ShieldCheck className="h-7 w-7 text-[#F58220]" /> : <Mail className="h-7 w-7 text-[#F58220]" />}
          </div>
        </div>
        <h1 className="text-center text-xl font-black text-white">بازیابی تأیید ایمیل</h1>
        <p className="mt-2 text-center text-xs leading-6 text-white/50">
          همان ایمیلی را وارد کنید که هنگام ثبت‌نام استفاده کردید. نیازی به ثبت‌نام دوباره نیست.
        </p>

        {message && <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">{message}</div>}
        {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">{error}</div>}

        {!verified && (
          <form onSubmit={requestCode} className="mt-6 space-y-3">
            <label className="block text-xs font-bold text-white/60">ایمیل ثبت‌نام</label>
            <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass + " text-left"} placeholder="you@example.com" />
            <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F58220] text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-4 w-4" />}
              {busy ? "در حال ارسال..." : sent ? "ارسال دوباره کد" : "ارسال کد تأیید"}
            </button>
          </form>
        )}

        {sent && !verified && (
          <form onSubmit={verifyCode} className="mt-5 space-y-3 border-t border-white/10 pt-5">
            <label className="block text-xs font-bold text-white/60">کد ۶ رقمی ایمیل</label>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" dir="ltr" maxLength={6} className={inputClass + " text-center text-2xl font-black tracking-[0.5em]"} placeholder="------" />
            <button type="submit" disabled={busy || code.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#F58220]/50 bg-[#F58220]/10 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              تأیید و فعال‌سازی حساب
            </button>
          </form>
        )}

        {verified && <Link href="/login" className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-[#F58220] text-sm font-bold text-white">رفتن به صفحه ورود</Link>}

        <div className="mt-6 flex items-center justify-center gap-4 text-xs">
          <Link href="/login" className="text-white/50 hover:text-[#F58220]">ورود</Link>
          <span className="text-white/20">|</span>
          <Link href="/" className="inline-flex items-center gap-1 text-white/50 hover:text-[#F58220]"><ArrowLeft className="h-3 w-3" /> بازگشت به سایت</Link>
        </div>
      </section>
    </main>
  );
}
