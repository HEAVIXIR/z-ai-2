'use client';

/**
 * HEAVIX — Run Matching Engine Button (client).
 * POSTs to /api/admin/matching/run and shows the result inline.
 * Used on /admin/matching.
 */

import { useState } from "react";
import { Play, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type RunResult =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; totalRequests: number; totalMatches: number }
  | { kind: "err"; message: string };

export function RunMatchingButton() {
  const [state, setState] = useState<RunResult>({ kind: "idle" });

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/admin/matching/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setState({
          kind: "err",
          message: data?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setState({
        kind: "ok",
        totalRequests: Number(data?.totalRequests ?? 0),
        totalMatches: Number(data?.totalMatches ?? 0),
      });
    } catch (e) {
      setState({
        kind: "err",
        message: (e as Error)?.message ?? "Network error",
      });
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={run}
        disabled={state.kind === "running"}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.kind === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        اجرای موتور تطابق
      </button>

      {state.kind === "ok" && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.totalRequests} درخواست بررسی شد — {state.totalMatches} تطابق یافت شد
        </span>
      )}
      {state.kind === "err" && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          خطا: {state.message}
        </span>
      )}
    </div>
  );
}
