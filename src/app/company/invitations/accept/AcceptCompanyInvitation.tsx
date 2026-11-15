"use client";

import { useEffect, useState } from "react";

type State = "loading" | "ready" | "submitting" | "success" | "error";

export default function AcceptCompanyInvitation() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("در حال آماده‌سازی دعوت…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const value = params.get("token") ?? "";
    // Keep the bearer token out of subsequent navigation and referrer headers.
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      setState("error");
      setMessage("پیوند دعوت نامعتبر یا ناقص است.");
      return;
    }
    setToken(value);
    setState("ready");
    setMessage("برای عضویت در سازمان دعوت شده‌اید. برای ادامه، دعوت را بپذیرید.");
  }, []);

  async function acceptInvitation() {
    if (!token || state === "submitting") return;
    setState("submitting");
    setMessage("در حال ثبت عضویت…");
    try {
      const response = await fetch("/api/company-invitations/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        setState("success");
        setMessage("عضویت سازمانی شما با موفقیت فعال شد.");
        setToken("");
        return;
      }
      setState("error");
      if (response.status === 403 && payload.error === "invitation_email_mismatch") {
        setMessage("این دعوت برای ایمیل دیگری صادر شده است. با همان حساب کاربریِ دارای ایمیل دعوت‌شده وارد شوید و پیوند را دوباره باز کنید.");
      } else if (response.status === 403) {
        setMessage("برای پذیرش دعوت، ابتدا وارد حساب کاربری فعال و تأییدشده شوید؛ سپس پیوند ایمیل را دوباره باز کنید.");
      } else if (response.status === 410 || response.status === 404) {
        setMessage("این دعوت معتبر نیست، منقضی شده یا قبلاً استفاده شده است.");
      } else if (response.status === 409) {
        setMessage("این دعوت در وضعیت فعلی قابل پذیرش نیست. ممکن است عضویت قبلاً ایجاد شده باشد.");
      } else {
        setMessage("پذیرش دعوت انجام نشد. کمی بعد دوباره تلاش کنید.");
      }
    } catch {
      setState("error");
      setMessage("ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.");
    }
  }

  return (
    <main className="min-h-[70vh] px-4 py-16 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-8 text-right text-white shadow-2xl">
        <p className="mb-3 text-sm font-semibold tracking-widest text-orange-400">HEAVIX · ORGANIZATION</p>
        <h1 className="mb-4 text-2xl font-bold">پذیرش دعوت سازمانی</h1>
        <p className="mb-8 leading-8 text-zinc-300" aria-live="polite">{message}</p>
        {state === "ready" || state === "submitting" ? (
          <button
            type="button"
            onClick={acceptInvitation}
            disabled={state === "submitting"}
            className="w-full rounded-xl bg-orange-500 px-5 py-3 font-bold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "submitting" ? "در حال ثبت…" : "پذیرش دعوت"}
          </button>
        ) : null}
        {state === "success" ? (
          <a href="/account" className="block w-full rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-black hover:bg-orange-400">
            ورود به حساب کاربری
          </a>
        ) : null}
        {state === "error" ? (
          <a href="/login" className="inline-block text-sm text-orange-300 underline underline-offset-4">
            ورود به HEAVIX
          </a>
        ) : null}
      </section>
    </main>
  );
}
