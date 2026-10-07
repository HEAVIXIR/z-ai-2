"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

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
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "ورود ناموفق بود.");
        setLoading(false); return;
      }
      router.push(data.role === "admin" ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      setError("خطای شبکه. دوباره تلاش کنید.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#0c0c0c] p-8">
      <h1 className="text-center text-2xl font-black text-white">ورود</h1>
      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-400">{error}</div>}
      <div className="mt-6 space-y-4">
        <input name="identifier" type="text" autoComplete="username" placeholder="موبایل / ایمیل"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
        <input name="password" type="password" autoComplete="current-password" placeholder="••••••••"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
      </div>
      <button type="submit" disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#F58220] text-sm font-bold text-white">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "ورود"}
      </button>
      <p className="mt-5 text-center text-[11px] text-white/35">
        مدیران نیز با حساب کاربری دارای نقش ADMIN در RBAC وارد می‌شوند.
      </p>
    </form>
  );
}
