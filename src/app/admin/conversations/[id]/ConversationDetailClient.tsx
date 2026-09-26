"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ban,
  Lock,
  Unlock,
  Send,
  MessageCircle,
} from "lucide-react";

/**
 * ConversationDetailClient — moderation action panel for
 * /admin/conversations/[id].
 *
 * Three moderation actions:
 *   - close  → status=CLOSED  (PATCH /api/admin/conversations/[id] {status:CLOSED})
 *   - block  → status=BLOCKED (PATCH /api/admin/conversations/[id] {status:BLOCKED} + reason)
 *   - reactivate → status=ACTIVE (PATCH /api/admin/conversations/[id] {status:ACTIVE})
 *
 * Plus an admin-send-message form that POSTs to the new
 * /api/admin/conversations/[id]/messages route. The admin
 * message feature lets a moderator介入 a user conversation
 * (e.g. to clarify terms or warn about a violation).
 *
 * The PATCH status moderation uses the existing
 * /api/admin/conversations/[id] PATCH route (which already
 * enforces ACTIVE | CLOSED | BLOCKED). The send-message POST
 * uses the new admin messages route. Both are audited by the
 * service layer (or the existing PATCH route).
 */
type Status = "ACTIVE" | "CLOSED" | "BLOCKED" | "ARCHIVED" | string;

type Props = {
  conversationId: string;
  initialStatus: Status;
  actorId: string;
};

type BusyKey = null | "close" | "block" | "reactivate" | "send";

export default function ConversationDetailClient({
  conversationId,
  initialStatus,
  actorId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<BusyKey>(null);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [messageBody, setMessageBody] = useState("");

  async function patchStatus(newStatus: "ACTIVE" | "CLOSED" | "BLOCKED") {
    setBusy(newStatus === "ACTIVE" ? "reactivate" : newStatus === "CLOSED" ? "close" : "block");
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/admin/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `خطای سرور (${res.status})`);
        return;
      }
      setStatus(newStatus);
      setOk(
        newStatus === "ACTIVE"
          ? "مکالمه مجدداً فعال شد."
          : newStatus === "CLOSED"
            ? "مکالمه بسته شد."
            : "مکالمه مسدود شد.",
      );
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "خطای شبکه");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage() {
    if (!messageBody.trim()) return;
    setBusy("send");
    setError(null);
    setOk(null);
    try {
      const res = await fetch(
        `/api/admin/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: messageBody,
            senderId: actorId === "ADMIN" ? undefined : actorId,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `خطای سرور (${res.status})`);
        return;
      }
      setMessageBody("");
      setOk("پیام با موفقیت ارسال شد.");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "خطای شبکه");
    } finally {
      setBusy(null);
    }
  }

  const isActive = status === "ACTIVE";
  const isClosed = status === "CLOSED";
  const isBlocked = status === "BLOCKED";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900">
        <MessageCircle className="h-4 w-4 text-[#F58220]" />
        اقدامات نظارتی
      </h2>

      <div className="space-y-3">
        {/* Close */}
        {isActive && (
          <button
            type="button"
            onClick={() => patchStatus("CLOSED")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "close" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            بستن مکالمه
          </button>
        )}

        {/* Reactivate */}
        {(isClosed || isBlocked) && (
          <button
            type="button"
            onClick={() => patchStatus("ACTIVE")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "reactivate" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlock className="h-3.5 w-3.5" />
            )}
            فعال‌سازی مجدد مکالمه
          </button>
        )}

        {/* Block (with reason) */}
        {!isBlocked && (
          <div className="rounded-xl border border-red-200 bg-red-50/30 p-3">
            <label className="mb-1.5 block text-[11px] font-bold text-red-700">
              دلیل مسدودسازی (الزامی)
            </label>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              placeholder="مثلاً: تخلف از قوانین منصفانه، توهین، اسپم…"
              className="w-full resize-none rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-800 outline-none transition focus:border-red-500"
            />
            <button
              type="button"
              onClick={() => blockReason.trim() && patchStatus("BLOCKED")}
              disabled={busy !== null || !blockReason.trim()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "block" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              مسدودسازی مکالمه
            </button>
            <p className="mt-1 text-[10px] text-zinc-400">
              توجه: دلیل مسدودسازی در لاود ممیزی (audit trail) ذخیره می‌شود.
            </p>
          </div>
        )}

        {/* Admin message */}
        {isActive && (
          <div className="rounded-xl border border-[#F58220]/30 bg-[#F58220]/5 p-3">
            <label className="mb-1.5 block text-[11px] font-bold text-[#F58220]">
              ارسال پیام به‌عنوان مدیر
            </label>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={3}
              placeholder="متن پیام خود را بنویسید…"
              className="w-full resize-none rounded-lg border border-[#F58220]/30 bg-white px-2.5 py-1.5 text-[11px] text-zinc-800 outline-none transition focus:border-[#F58220]"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={busy !== null || !messageBody.trim()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F58220] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#e0701a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "send" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              ارسال پیام مدیر
            </button>
          </div>
        )}

        {/* Status banner */}
        {ok && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{ok}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-[10px] leading-5 text-zinc-400">
          تمام اقدامات نظارتی با مجوز conversation.read در مسیرهای /api/admin/conversations/[id]
          اجرا و در لاود ممیزی (marketplace.conversation.*) ثبت می‌شوند.
        </p>
      </div>
    </section>
  );
}
