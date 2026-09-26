/**
 * HEAVIX — Verification Detail Page (Phase 5)
 * /admin/verifications/[id] — single verification record view +
 * review form + evidence viewer + verification history + revoke
 * action.
 *
 * Pattern: server component (same as /admin/conversations/[id]
 * and /admin/disputes/[id]). Reads the verification by id with
 * the parent Company include and renders the trust workflow UI.
 *
 * Permission: company.verify (canonical admin verify gate).
 *
 * Audit: logAudit('trust.verification.detail_view',
 *   entityType: 'CompanyVerification') — best-effort, never throws.
 *
 * Trust service hooks (src/lib/trust-service.ts):
 *   - reviewVerification() — invoked by the Review form (POST
 *       /api/admin/verifications/[id]/review).
 *   - revokeVerification() — invoked by the Revoke button (POST
 *       /api/admin/verifications/[id]/revoke).
 *   - getVerificationHistory() — used to render the history section.
 *
 * Schema (prisma/schema.prisma → CompanyVerification):
 *   status:           PENDING | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED | REVOKED
 *   verificationType: PHONE | EMAIL | BUSINESS | DOCUMENT | INSPECTION
 *   submittedAt, reviewedAt, reviewedBy, evidence (JSON), notes,
 *   expiresAt, revokedAt, revokedBy, revokeReason
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { faDate, timeAgo, toFa } from "@/lib/format";
import {
  ArrowRight,
  BadgeCheck,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldX,
  RotateCcw,
  FileText,
  History,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار",
  UNDER_REVIEW: "در حال بررسی",
  VERIFIED: "تأییدشده",
  REJECTED: "ردشده",
  EXPIRED: "منقضی",
  REVOKED: "ابطال‌شده",
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-zinc-100 text-zinc-500",
  REVOKED: "bg-rose-100 text-rose-700",
};

const TYPE_LABEL: Record<string, string> = {
  PHONE: "تلفن",
  EMAIL: "ایمیل",
  BUSINESS: "کسب‌وکار",
  DOCUMENT: "سند",
  INSPECTION: "کارشناسی",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const sectionCard = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";

/* /admin/verifications/[id] — verification detail page.
 *
 * Server component: fetches the verification row by id (with the
 * parent Company include), the full verification history for the
 * same Company, and renders:
 *   - Header (back link + status badge)
 *   - Verification details grid
 *   - Evidence viewer (parses JSON evidence column)
 *   - Review form (approve with notes / reject with reason)
 *   - Revoke button (only when status = VERIFIED)
 *   - Verification history (all rows for this Company)
 */
export default async function AdminVerificationDetailPage({
  params,
}: Args) {
  const { id } = await params;

  // ── 1. Auth + RBAC ──
  const actor = await getCurrentUser();
  if (!actor) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(actor.id, "company.verify");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires company.verify
      </div>
    );
  }

  // ── 2. Load verification + parent company ──
  const verification = await db.companyVerification.findUnique({
    where: { id },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          verified: true,
        },
      },
    },
  });

  if (!verification) {
    notFound();
  }

  // ── 3. Load verification history for the same Company ──
  const history = await db.companyVerification.findMany({
    where: { companyId: verification.companyId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      verificationType: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      expiresAt: true,
      revokedAt: true,
      notes: true,
    },
    take: 50,
  });

  // ── 4. Best-effort detail_view audit ──
  await logAudit({
    actorId: actor.id,
    actorType: "ADMIN",
    action: "trust.verification.detail_view",
    entityType: "CompanyVerification",
    entityId: verification.id,
    reason: `viewed verification ${verification.id}`,
  }).catch(() => {});

  // ── 5. Helpers ──
  const expSoon =
    verification.expiresAt &&
    verification.expiresAt.getTime() - Date.now() <= SEVEN_DAYS_MS &&
    verification.expiresAt.getTime() >= Date.now();
  const expired =
    verification.expiresAt && verification.expiresAt.getTime() < Date.now();
  const canReview =
    verification.status === "PENDING" ||
    verification.status === "UNDER_REVIEW";
  const canRevoke = verification.status === "VERIFIED";

  // Parse evidence JSON for the evidence viewer section.
  let evidenceItems: Array<{
    type?: string;
    url?: string;
    description?: string;
  }> = [];
  if (verification.evidence) {
    try {
      const parsed = JSON.parse(verification.evidence);
      if (Array.isArray(parsed)) {
        evidenceItems = parsed.filter(
          (item) => item && typeof item === "object",
        );
      } else if (parsed && typeof parsed === "object") {
        evidenceItems = [parsed];
      }
    } catch {
      /* leave empty — show raw string below */
    }
  }

  // ── 6. Render ──
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/verifications"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
            title="بازگشت"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
              <BadgeCheck className="h-6 w-6 text-[#F58220]" />
              جزئیات تأیید
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              شناسه:{" "}
              <code className="font-mono text-zinc-700">{verification.id}</code>
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            STATUS_CLS[verification.status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {STATUS_LABEL[verification.status] ?? verification.status}
        </span>
      </div>

      {/* ── Verification details grid ── */}
      <section className={sectionCard}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <FileText className="h-4 w-4 text-[#F58220]" />
          اطلاعات تأیید
        </h2>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail
            label="شرکت"
            value={
              verification.company ? (
                <Link
                  href={`/admin/companies/${verification.company.id}`}
                  className="font-medium text-zinc-900 hover:text-[#F58220]"
                >
                  {verification.company.name}
                </Link>
              ) : (
                <span className="text-zinc-400">شرکت حذف‌شده</span>
              )
            }
            sub={
              verification.company?.slug
                ? `/${verification.company.slug}`
                : "—"
            }
          />
          <Detail
            label="نوع تأیید"
            value={
              TYPE_LABEL[verification.verificationType] ??
              verification.verificationType
            }
          />
          <Detail
            label="وضعیت شرکت"
            value={
              verification.company?.verified ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> تأییدشده
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <ShieldX className="h-3.5 w-3.5" /> تأییدنشده
                </span>
              )
            }
          />
          <Detail
            label="ارسال‌شده در"
            value={`${faDate(verification.submittedAt)} · ${timeAgo(
              verification.submittedAt,
            )}`}
          />
          <Detail
            label="بررسی‌شده در"
            value={
              verification.reviewedAt
                ? `${faDate(verification.reviewedAt)} · ${timeAgo(
                    verification.reviewedAt,
                  )}`
                : "—"
            }
          />
          <Detail
            label="بررسی‌کننده"
            value={verification.reviewedBy ?? "—"}
          />
          <Detail
            label="انقضا"
            value={
              verification.expiresAt
                ? `${faDate(verification.expiresAt)} · ${timeAgo(
                    verification.expiresAt,
                  )}`
                : "—"
            }
            badge={
              expired ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                  <AlertTriangle className="h-3 w-3" />
                  منقضی
                </span>
              ) : expSoon ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                  <Clock className="h-3 w-3" />
                  کمتر از ۷ روز
                </span>
              ) : null
            }
          />
          <Detail
            label="ابطال در"
            value={
              verification.revokedAt
                ? `${faDate(verification.revokedAt)} · ${timeAgo(
                    verification.revokedAt,
                  )}`
                : "—"
            }
          />
          <Detail
            label="ابطال‌کننده"
            value={verification.revokedBy ?? "—"}
          />
        </div>

        {/* Notes / Revoke reason */}
        {(verification.notes || verification.revokeReason) && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {verification.notes && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-bold uppercase text-zinc-500">
                  یادداشت بررسی
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">
                  {verification.notes}
                </p>
              </div>
            )}
            {verification.revokeReason && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[10px] font-bold uppercase text-rose-600">
                  دلیل ابطال
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-rose-700">
                  {verification.revokeReason}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Evidence viewer ── */}
      <section className={sectionCard}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <FileText className="h-4 w-4 text-[#F58220]" />
          مدارک
        </h2>
        {evidenceItems.length > 0 ? (
          <ul className="space-y-2">
            {evidenceItems.map((item, idx) => (
              <li
                key={idx}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.type && (
                    <span className="rounded bg-[#F58220]/10 px-2 py-0.5 text-[10px] font-bold text-[#F58220]">
                      {item.type}
                    </span>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline-offset-2 hover:underline"
                    >
                      {item.url}
                    </a>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-zinc-700">{item.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : verification.evidence ? (
          <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-[11px] text-zinc-100">
            {verification.evidence}
          </pre>
        ) : (
          <p className="text-xs text-zinc-400">هیچ مدرکی ثبت نشده است.</p>
        )}
      </section>

      {/* ── Review form ── */}
      {canReview ? (
        <section className={sectionCard}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
            <ShieldCheck className="h-4 w-4 text-[#F58220]" />
            فرم بررسی
          </h2>
          <form
            action={`/api/admin/verifications/${verification.id}/review`}
            method="post"
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-bold text-zinc-700">
                وضعیت نهایی
              </label>
              <select
                name="status"
                defaultValue="UNDER_REVIEW"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]"
              >
                <option value="UNDER_REVIEW">در حال بررسی (کم)</option>
                <option value="VERIFIED">تأیید ✅</option>
                <option value="REJECTED">رد ❌</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-zinc-700">
                یادداشت بررسی (اختیاری)
              </label>
              <textarea
                name="reviewNotes"
                rows={3}
                placeholder="توضیحات، دلایل، یا یادداشت داخلی…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-zinc-700">
                تاریخ انقضا (فقط هنگام تأیید — ISO YYYY-MM-DD)
              </label>
              <input
                type="date"
                name="expiresAt"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]"
              />
            </div>
            <button
              type="submit"
              className="h-10 w-full rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a] sm:w-auto"
            >
              ثبت بررسی
            </button>
          </form>
        </section>
      ) : (
        <section className={sectionCard}>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>
              این تأیید در وضعیت{" "}
              <strong className="text-zinc-700">
                {STATUS_LABEL[verification.status] ?? verification.status}
              </strong>{" "}
              است — امکان بررسی جدید وجود ندارد. برای بازگشت به صف بررسی، ابتدا آن
              را ابطال یا یک تأیید جدید ارسال کنید.
            </span>
          </div>
        </section>
      )}

      {/* ── Revoke button (only when VERIFIED) ── */}
      {canRevoke && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-800">
            <RotateCcw className="h-4 w-4" />
            ابطال تأیید
          </h2>
          <p className="mb-3 text-xs text-rose-700">
            ابطال این تأیید، آن را به وضعیت REVOKED منتقل می‌کند و در صورت
            عدم وجود تأیید فعال دیگر، پرچم `verified` شرکت را به false تغییر
            می‌دهد. این عملیات قابل بازگشت نیست.
          </p>
          <form
            action={`/api/admin/verifications/${verification.id}/revoke`}
            method="post"
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-bold text-rose-800">
                دلیل ابطال (الزامی — حداقل ۳ حرف)
              </label>
              <textarea
                name="reason"
                required
                minLength={3}
                rows={3}
                placeholder="چرا این تأیید ابطال می‌شود؟"
                className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-rose-900 outline-none transition focus:border-rose-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white transition hover:bg-rose-700"
            >
              <RotateCcw className="h-4 w-4" />
              ابطال تأیید
            </button>
          </form>
        </section>
      )}

      {/* ── Verification history ── */}
      <section className={sectionCard}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <History className="h-4 w-4 text-[#F58220]" />
          تاریخچه تأیید این شرکت
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-400">هیچ سابقه‌ای یافت نشد.</p>
        ) : (
          <ol className="relative space-y-3 border-r border-zinc-200 pr-4">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span
                  className={`absolute -right-[21px] top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${
                    h.status === "VERIFIED"
                      ? "bg-emerald-500"
                      : h.status === "REJECTED" || h.status === "REVOKED"
                        ? "bg-rose-500"
                        : h.status === "EXPIRED"
                          ? "bg-zinc-400"
                          : "bg-amber-500"
                  }`}
                />
                <Link
                  href={`/admin/verifications/${h.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-[#F58220]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_CLS[h.status] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {STATUS_LABEL[h.status] ?? h.status}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-zinc-500">
                        {TYPE_LABEL[h.verificationType] ?? h.verificationType}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      {faDate(h.submittedAt)} · {timeAgo(h.submittedAt)}
                    </span>
                  </div>
                  {h.reviewedAt && (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      بررسی‌شده در {faDate(h.reviewedAt)} توسط{" "}
                      <code className="font-mono">{h.reviewedBy ?? "—"}</code>
                    </p>
                  )}
                  {h.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-600">
                      {h.notes}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(history.length)} سابقه تأیید
      </p>
    </div>
  );
}

/** Small detail-row subcomponent. */
function Detail({
  label,
  value,
  sub,
  badge,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
        {badge}
      </div>
      <p className="mt-1 text-sm text-zinc-800">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}
