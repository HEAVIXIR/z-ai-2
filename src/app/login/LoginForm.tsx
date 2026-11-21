"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/auth-redirect";

function kind(v: string): "email" | "mobile" {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "email";
  return "mobile";
}

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    sp.get("error") === "1" ? "ایمیل/موبایل یا رمز عبور اشتباه است." : null,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const formData = new FormData(e.currentTarget);
    const identifier = String(formData.get("identifier") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!identifier || !password) {
      setError("ایمیل/موبایل و رمز عبور الزامی است.");
      setLoading(false); return;
    }

    const k = kind(identifier);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [k]: k === "email" ? identifier.toLowerCase() : identifier, password }),
      });
      const responseText = await res.text();
      let data: { ok?: boolean; error?: string; role?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        setError(`پاسخ سرور قابل‌خواندن نیست (HTTP ${res.status}). لطفاً بعداً تلاش کنید.`);
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || `ورود ناموفق بود (HTTP ${res.status}).`);
        return;
      }
      const requestedRedirect = safeInternalRedirect(sp.get("redirect"), "");
      router.push(requestedRedirect || (data.role === "admin" ? "/admin/dashboard" : "/dashboard"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? "ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید." : "خطای غیرمنتظره در ارتباط با سرور.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#0c0c0c] p-8">
      <h1 className="text-center text-2xl font-black text-white">ورود</h1>
      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-400">{error}</div>}
      <div className="mt-6 space-y-4">
        <input name="identifier" type="text" required autoComplete="username" aria-label="موبایل / ایمیل" placeholder="موبایل / ایمیل"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
        <input name="password" type="password" required autoComplete="current-password" aria-label="رمز عبور" placeholder="••••••••"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
      </div>
      <button type="submit" disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#F58220] text-sm font-bold text-white">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "ورود"}
      </button>
      <div className="mt-4 flex items-center justify-center gap-3 text-center">
        <Link href="/forgot-password" className="text-xs font-bold text-[#F58220] hover:underline">فراموشی رمز عبور</Link>
        <span className="text-white/20">|</span>
        <Link href="/verify-email" className="text-xs font-bold text-white/55 hover:text-[#F58220]">دریافت کد تأیید ایمیل</Link>
      </div>
      <div className="mt-3 text-center">
        <Link href={sp.get("redirect") ? `/register?redirect=${encodeURIComponent(safeInternalRedirect(sp.get("redirect"), ""))}` : "/register"} className="text-xs font-bold text-white/55 hover:text-[#F58220]">حساب ندارید؟ ثبت‌نام کنید</Link>
      </div>
      <p className="mt-5 text-center text-[11px] text-white/35">
        مدیران نیز با حساب کاربری دارای نقش ADMIN در RBAC وارد می‌شوند.
      </p>
    </form>
  );
}
