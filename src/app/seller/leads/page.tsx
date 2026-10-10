"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  TrendingUp, Users, Megaphone, Flame, Loader2, ArrowLeft,
  Gavel, Eye, CheckCircle2, Sparkles, Phone, MessageSquare,
  Star, Filter, ChevronRight,
} from "lucide-react";
import { toFa } from "@/lib/format";

/* ============================================================
   /seller/leads — CRM for sellers
   STEP 11.40 PR-SC-06b: Rewritten to use /api/seller/leads
   (the real CRM API with ownership + status workflow) instead
   of /api/ai-sales-agent (which bypasses the Gateway).

   Features:
   - Real lead data from /api/seller/leads (seller-scoped)
   - Status filter (NEW / CONTACTED / QUALIFIED / CLOSED / LOST)
   - Status update via PATCH (with transition validation)
   - byStatus pipeline stats
   - Error handling for 401/403/404/409
   ============================================================ */

type Lead = {
  id: string;
  listingId: string;
  leadType: string;
  status: string;
  viewerName: string | null;
  viewerPhone: string | null;
  note: string | null;
  createdAt: string;
  listing: { id: string; title: string; slug: string } | null;
};

type CRMResponse = {
  success: boolean;
  stats: {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    listingCount: number;
  };
  data: Lead[];
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته شده",
  QUALIFIED: "واجد شرایط",
  CLOSED: "بسته شده",
  LOST: "_from دست رفته",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  CONTACTED: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  QUALIFIED: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  CLOSED: "text-green-400 border-green-500/30 bg-green-500/5",
  LOST: "text-red-400 border-red-500/30 bg-red-500/5",
};

const LEAD_TYPE_ICONS: Record<string, typeof Eye> = {
  CALL: Phone,
  MESSAGE: MessageSquare,
  FAVORITE: Star,
  CONTACT: Users,
  VIEW: Eye,
  OFFER: Gavel,
};

export default function SellerLeadsPage() {
  const [data, setData] = useState<CRMResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadLeads = useCallback((status: string) => {
    setLoading(true);
    setError(null);
    const url = status
      ? `/api/seller/leads?status=${status}`
      : "/api/seller/leads";
    fetch(url)
      .then((r) => {
        if (r.status === 401) throw new Error("برای مشاهده سرنخ‌ها باید وارد شوید");
        if (r.status === 403) throw new Error("دسترسی غیرمجاز: نیاز به مجوز CRM");
        return r.json();
      })
      .then((d) => {
        if (d.success) setData(d);
        else setError(d.error ?? "خطا در بارگذاری داده");
      })
      .catch((e) => setError(e.message ?? "خطای شبکه"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLeads(statusFilter);
  }, [statusFilter, loadLeads]);

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    setUpdatingLeadId(leadId);
    setUpdateError(null);
    try {
      const res = await fetch("/api/seller/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, status: newStatus }),
      });
      if (res.status === 401) {
        setUpdateError("برای تغییر وضعیت باید وارد شوید");
        return;
      }
      if (res.status === 403) {
        setUpdateError("دسترسی غیرمجاز: نیاز به مجوز مدیریت CRM");
        return;
      }
      if (res.status === 404) {
        setUpdateError("سرنخ یافت نشد یا متعلق به شما نیست");
        return;
      }
      if (res.status === 409) {
        const body = await res.json();
        setUpdateError(`انتقال غیرمجاز: ${body.error ?? "وضعیت نامعتبر"}`);
        return;
      }
      if (!res.ok) {
        setUpdateError("خطا در به‌روزرسانی وضعیت");
        return;
      }
      // Success — reload leads to reflect the change
      loadLeads(statusFilter);
    } catch {
      setUpdateError("خطای شبکه");
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const totalLeads = data?.stats?.total ?? 0;
  const totalOffers = data?.stats?.byType?.OFFER ?? 0;
  const totalViews = data?.stats?.byType?.VIEW ?? 0;
  const newListings = data?.stats?.byStatus?.NEW ?? 0;

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={[]} />
      <main className="flex-1 pt-28">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-12">
          {/* Header */}
          <div className="mb-8">
            <Link href="/seller/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs text-white/40 transition hover:text-[#F58220]">
              <ArrowLeft className="h-3 w-3 rotate-180" />داشبورد فروشنده
            </Link>
            <h1 className="flex items-center gap-2 text-3xl font-black text-white">
              <TrendingUp className="h-7 w-7 text-[#F58220]" />
              سرنخ‌ها و مشتریان
            </h1>
            <p className="mt-1 text-sm text-white/50">مدیریت تماس‌ها، پیشنهادها و وضعیت پیگیری</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-sm font-bold text-red-400">{error}</p>
              {error.includes("وارد شوید") && (
                <Link href="/login" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#F58220] px-6 py-2.5 text-sm font-bold text-white">ورود</Link>
              )}
            </div>
          )}

          {/* Update Error */}
          {updateError && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-xs font-bold text-amber-400">{updateError}</p>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#F58220]" /></div>
          ) : data ? (
            <>
              {/* Stats */}
              <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <Eye className="mb-2 h-6 w-6 text-blue-400" />
                  <p className="text-2xl font-black text-white">{toFa(totalViews)}</p>
                  <p className="text-[11px] text-white/40">بازدید</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <TrendingUp className="mb-2 h-6 w-6 text-emerald-400" />
                  <p className="text-2xl font-black text-white">{toFa(totalLeads)}</p>
                  <p className="text-[11px] text-white/40">سرنخ کل</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <Gavel className="mb-2 h-6 w-6 text-[#F58220]" />
                  <p className="text-2xl font-black text-white">{toFa(totalOffers)}</p>
                  <p className="text-[11px] text-white/40">پیشنهاد قیمت</p>
                </div>
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                  <Flame className="mb-2 h-6 w-6 text-amber-400" />
                  <p className="text-2xl font-black text-amber-400">{toFa(newListings)}</p>
                  <p className="text-[11px] text-white/40">سرنخ جدید</p>
                </div>
              </div>

              {/* Status Filter */}
              <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
                <Filter className="h-4 w-4 shrink-0 text-white/40" />
                <button
                  onClick={() => setStatusFilter("")}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    !statusFilter ? "border-[#F58220] bg-[#F58220]/10 text-[#F58220]" : "border-white/10 text-white/40 hover:text-white/70"
                  }`}
                >
                  همه ({toFa(totalLeads)})
                </button>
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = data.stats.byStatus[key] ?? 0;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key)}
                      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        statusFilter === key ? STATUS_COLORS[key] : "border-white/10 text-white/40 hover:text-white/70"
                      }`}
                    >
                      {label} ({toFa(count)})
                    </button>
                  );
                })}
              </div>

              {/* Leads List */}
              <div className="space-y-3">
                {data.data.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-[#111] p-12 text-center">
                    <p className="text-sm text-white/40">سرنخی در این دسته وجود ندارد</p>
                  </div>
                ) : (
                  data.data.map((lead) => {
                    const Icon = LEAD_TYPE_ICONS[lead.leadType] ?? Eye;
                    return (
                      <div key={lead.id} className="rounded-2xl border border-white/10 bg-[#111] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                              <Icon className="h-4 w-4 text-white/60" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                {lead.viewerName ?? "ناشناس"}
                              </p>
                              {lead.viewerPhone && (
                                <p className="text-xs text-white/40">{toFa(lead.viewerPhone)}</p>
                              )}
                              <p className="mt-1 text-xs text-white/30">
                                {lead.listing?.title ?? "آگهی حذف شده"} • {lead.leadType}
                              </p>
                              {lead.note && (
                                <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/60">{lead.note}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${STATUS_COLORS[lead.status] ?? "border-white/10 text-white/40"}`}>
                              {STATUS_LABELS[lead.status] ?? lead.status}
                            </span>
                            {updatingLeadId === lead.id && (
                              <Loader2 className="h-4 w-4 animate-spin text-[#F58220]" />
                            )}
                          </div>
                        </div>
                        {/* Status Actions */}
                        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                          <span className="text-[10px] text-white/30">تغییر وضعیت:</span>
                          {Object.entries(STATUS_LABELS).map(([key, label]) => {
                            if (key === lead.status) return null;
                            return (
                              <button
                                key={key}
                                onClick={() => updateLeadStatus(lead.id, key)}
                                disabled={updatingLeadId === lead.id}
                                className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-white/50 transition hover:border-white/30 hover:text-white/80 disabled:opacity-30"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
      <Footer settings={null} />
    </div>
  );
}
