"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldX,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserPlus,
} from "lucide-react";

/**
 * SellerDetailActions — small client component for the
 * verify/suspend/register buttons on /admin/sellers/[id].
 *
 * The actual mutations live in the seller-service.ts; this
 * component just PATCHes the /api/admin/sellers/[id] route
 * with the right `action` payload and re-fetches the page
 * on success so the server-rendered badges update.
 *
 * Visibility rules:
 *   - If no FoundingSeller row exists → show "register" button only.
 *   - If pending (active=false, not blocked) → show verify + suspend.
 *   - If verified (active=true) → show suspend only.
 *   - If suspended (active=false, blocked) → show verify only.
 */
type Props = {
  sellerId: string;
  foundingStatusId: string | null;
  isVerified: boolean;
  isPending: boolean;
  isSuspended: boolean;
};

type Status = "idle" | "loading" | "error" | "ok";

export default function SellerDetailActions({
  sellerId,
  foundingStatusId,
  isVerified,
  isPending,
  isSuspended,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "verify" | "suspend" | "register">(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  async function callApi(action: "verify" | "suspend" | "register", reason?: string) {
    setBusy(action);
    setStatus("idle");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/sellers/${sellerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error ?? `خطای سرور (${res.status})`);
        return;
      }
      setStatus("ok");
      setMessage(
        action === "verify"
          ? "فروشنده با موفقیت تأیید شد."
          : action === "suspend"
            ? "فروشنده با موفقیت تعلیق شد."
            : "فروشنده با موفقیت ثبت شد.",
      );
      // Refresh server-rendered content.
      router.refresh();
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message ?? "خطای شبکه");
    } finally {
      setBusy(null);
    }
  }

  const noFounding = !foundingStatusId;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-black text-zinc-900">
        اقدامات چرخه‌عمر فروشنده
      </h2>

      <div className="space-y-3">
        {/* No founding row → show register button */}
        {noFounding && (
          <button
            type="button"
            onClick={() => callApi("register")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F58220] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#e0701a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "register" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            ثبت‌نام به‌عنوان فروشنده
          </button>
        )}

        {/* Pending → can verify or suspend */}
        {isPending && !noFounding && (
          <>
            <button
              type="button"
              onClick={() => callApi("verify")}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "verify" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              تأیید فروشنده
            </button>
            <SuspendForm
              busy={busy === "suspend"}
              value={suspendReason}
              onChange={setSuspendReason}
              onSubmit={() => {
                if (!suspendReason.trim()) return;
                callApi("suspend", suspendReason);
              }}
            />
          </>
        )}

        {/* Verified → can suspend */}
        {isVerified && !noFounding && (
          <SuspendForm
            busy={busy === "suspend"}
            value={suspendReason}
            onChange={setSuspendReason}
            onSubmit={() => {
              if (!suspendReason.trim()) return;
              callApi("suspend", suspendReason);
            }}
          />
        )}

        {/* Suspended → can verify (re-verify) */}
        {isSuspended && !noFounding && (
          <button
            type="button"
            onClick={() => callApi("verify")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "verify" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            رفع تعلیق (تأیید مجدد)
          </button>
        )}

        {/* Status banner */}
        {status === "ok" && message && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {status === "error" && message && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Help note */}
        <p className="text-[10px] leading-5 text-zinc-400">
          {noFounding
            ? "این کاربر هنوز FoundingSeller ندارد. با کلیک روی «ثبت‌نام به‌عنوان فروشنده»، نقش کاربر به SELLER تغییر می‌کند و یک رکورد بنیان‌گذار در وضعیت PENDING ساخته می‌شود."
            : "اقدامات verify/suspend با مجوز user.update در مسیر /api/admin/sellers/[id] اجرا می‌شوند و در لاود ممیزی (marketplace.seller.*) ثبت می‌شوند."}
        </p>
      </div>
    </section>
  );
}

function SuspendForm({
  busy,
  value,
  onChange,
  onSubmit,
}: {
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/30 p-3">
      <label className="mb-1.5 block text-[11px] font-bold text-red-700">
        دلیل تعلیق (الزامی)
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="مثلاً: تخلف از قوانین منصفانه، شکایت متعدد خریدار…"
        className="w-full resize-none rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-800 outline-none transition focus:border-red-500"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !value.trim()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldX className="h-3.5 w-3.5" />
        )}
        تعلیق فروشنده
      </button>
    </div>
  );
}
