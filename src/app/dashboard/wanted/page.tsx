import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toFa, faDate } from "@/lib/format";
import DashboardNav from "@/components/dashboard/DashboardNav";
import Image from "next/image";

export const dynamic = "force-dynamic";

/* =========================================================
   /dashboard/wanted — buyer's own wanted requests (H.1)
   Shows the authenticated user's BuyRequests across all lifecycle
   states (PENDING, ACTIVE, CLOSED, FULFILLED). The owner can see
   their own PENDING requests here — the public /api/wanted route
   only returns ACTIVE+published requests. This page does NOT
   expose PENDING requests to anyone but the owner (ownership is
   enforced by `where: { userId }`).
   ========================================================= */

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  ACTIVE: "فعال",
  CLOSED: "بسته‌شده",
  FULFILLED: "تأمین‌شده",
  REJECTED: "ردشده",
  EXPIRED: "منقضی",
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-zinc-100 text-zinc-600",
  FULFILLED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-zinc-100 text-zinc-500",
};

const INTENT_LABEL: Record<string, string> = {
  SALE: "خرید",
  RENT: "اجاره",
  SALE_AND_RENT: "خرید/اجاره",
  SERVICE_REQUEST: "خدمات",
};

export default async function DashboardWantedPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/dashboard/wanted`);

  const requests = await db.buyRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      brandPref: true,
      transaction: true,
      budgetMin: true,
      budgetMax: true,
      city: true,
      province: true,
      deadline: true,
      status: true,
      verified: true,
      createdAt: true,
      publishedAt: true,
      expiresAt: true,
      // H.3 structured-spec fields (canonical, for dashboard display).
      quantity: true,
      categoryId: true,
      brandId: true,
      modelId: true,
      modelName: true,
      serviceTypeId: true,
      intent: true,
      // H.3 resolved taxonomy names (single round-trip via the FK relations).
      categoryRef: { select: { name: true } },
      brandRef: { select: { name: true } },
      modelRef: { select: { name: true } },
      serviceTypeRef: { select: { nameFa: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
      },
    },
  });

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === "PENDING").length,
    active: requests.filter((r) => r.status === "ACTIVE").length,
    // H.2.6: the "closed" bucket previously counted only CLOSED/FULFILLED,
    // so REJECTED and EXPIRED requests contributed to `total` but to no
    // lifecycle counter — they appeared in the list with a badge but were
    // invisible in the summary. They are now first-class counters so the
    // owner can see the full lifecycle distribution at a glance.
    closed: requests.filter((r) => r.status === "CLOSED" || r.status === "FULFILLED").length,
    rejected: requests.filter((r) => r.status === "REJECTED").length,
    expired: requests.filter((r) => r.status === "EXPIRED").length,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <DashboardNav />
        <div className="mt-6">
          <h1 className="text-2xl font-black text-white">درخواست‌های خرید من</h1>
          <p className="mt-1 text-sm text-white/50">
            {toFa(stats.total)} درخواست کل · {toFa(stats.pending)} در انتظار بررسی · {toFa(stats.active)} فعال · {toFa(stats.closed)} بسته‌شده{stats.rejected > 0 ? ` · ${toFa(stats.rejected)} ردشده` : ""}{stats.expired > 0 ? ` · ${toFa(stats.expired)} منقضی` : ""}
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#111] p-10 text-center">
            <p className="text-white/50">شما هنوز درخواست خریدی ثبت نکرده‌اید.</p>
            <Link
              href="/listings/new"
              className="mt-4 inline-block rounded-xl bg-[#F58220] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff8c38]"
            >
              ثبت درخواست خرید
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {requests.map((r) => {
              const statusLabel = STATUS_LABEL[r.status] ?? r.status;
              const statusCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600";
              const intentLabel = INTENT_LABEL[r.transaction] ?? r.transaction;
              const budgetStr = r.budgetMin || r.budgetMax
                ? `${r.budgetMin ? Number(r.budgetMin).toLocaleString("fa-IR") : "—"} تا ${r.budgetMax ? Number(r.budgetMax).toLocaleString("fa-IR") : "—"} ت`
                : "—";
              return (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-bold text-white">{r.title}</h3>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>
                          {statusLabel}
                        </span>
                        {r.verified && (
                          <span className="shrink-0 rounded-full bg-[#F58220]/10 px-2 py-0.5 text-[10px] font-bold text-[#F58220]">
                            تأییدشده
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                        <span>{intentLabel}</span>
                        <span>·</span>
                        <span>{r.categoryRef?.name ?? r.category ?? "—"}</span>
                        {(r.brandRef?.name ?? r.brandPref) && <><span>·</span><span>{r.brandRef?.name ?? r.brandPref}</span></>}
                        {(r.modelName || r.modelRef?.name) && <><span>·</span><span>{r.modelName || r.modelRef?.name}</span></>}
                        {r.serviceTypeRef?.nameFa && <><span>·</span><span>{r.serviceTypeRef.nameFa}</span></>}
                        {r.quantity != null && <><span>·</span><span>تعداد: {toFa(r.quantity)}</span></>}
                        <span>·</span>
                        <span>{budgetStr}</span>
                        {(r.city || r.province) && <><span>·</span><span>{[r.province, r.city].filter(Boolean).join("، ")}</span></>}
                        {r.deadline && <><span>·</span><span>مهلت: {r.deadline}</span></>}
                      </div>
                      {r.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="تصاویر درخواست">
                          {r.images.map((image) => (
                            <a
                              key={image.id}
                              href={image.url}
                              target="_blank"
                              rel="noreferrer"
                              title={image.alt ?? "تصویر درخواست"}
                              className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-white/5"
                            >
                              <Image
                                src={image.url}
                                alt={image.alt ?? "تصویر درخواست"}
                                fill
                                sizes="64px"
                                className="object-cover"
                                unoptimized
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {r.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-white/40">{r.description}</p>
                      )}
                      {r.status === "PENDING" && (
                        <p className="mt-2 text-xs text-amber-300">
                          درخواست شما در انتظار بررسی مدیر است. پس از تأیید، در فهرست عمومی نمایش داده می‌شود.
                        </p>
                      )}
                      {r.status === "ACTIVE" && r.publishedAt && (
                        <p className="mt-2 text-xs text-emerald-300">
                          منتشر شده در {faDate(r.publishedAt)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-left text-[11px] text-white/30">
                      {faDate(r.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="text-sm font-bold text-white/60 transition hover:text-white"
          >
            ← بازگشت به داشبورد
          </Link>
        </div>
      </div>
    </div>
  );
}
