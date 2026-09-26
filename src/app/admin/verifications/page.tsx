/**
 * HEAVIX — Verifications Admin Page (standalone)
 * /admin/verifications — admin trust-center queue for company verifications.
 *
 * T-B — Marketplace Partials Completion:
 *   This is a STANDALONE page (not embedded in /admin/companies/[id]).
 *   It lists every CompanyVerification row across all companies so the
 *   trust team can review/revoke without hopping company-by-company.
 *
 * Pattern: server component (same as /admin/conversations +
 * /admin/store/returns). Reads URL searchParams for the status filter.
 *
 * Permission: company.verify (canonical admin verify gate; the API
 *   routes GET/PATCH /api/admin/verifications also use company.verify).
 *
 * Audit: logAudit('company.verification.list_view',
 *   entityType: 'CompanyVerification') — best-effort, never throws.
 *
 * Phase 5 — Trust & Verification deep system additions:
 *   - "Review" action button per row (links to /admin/verifications/[id])
 *   - "Revoke" action for VERIFIED items (POST .../revoke)
 *   - Expiry indicator (amber badge if expiresAt < 7 days)
 *   - "Check Expiry" button at top (POST .../check-expiry)
 *
 * Schema (prisma/schema.prisma → CompanyVerification):
 *   status:           PENDING | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED | REVOKED
 *   verificationType: PHONE | EMAIL | BUSINESS | DOCUMENT | INSPECTION
 *   submittedAt, reviewedAt (verifiedAt), reviewedBy (verifier),
 *   evidence (JSON: source of verification), expiresAt, revokedAt/By/Reason
 */

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import { BadgeCheck, Search, Clock, AlertTriangle, RotateCcw, FileSearch } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Status filter options (mirrors /api/admin/verifications GET) ──
const VERIF_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
] as const;
type VerifStatus = (typeof VERIF_STATUSES)[number];

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

const INPUT_CLS =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#F58220]";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** True iff the verification expires within the next 7 days. */
function isExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const diff = expiresAt.getTime() - Date.now();
  return diff >= 0 && diff <= SEVEN_DAYS_MS;
}

/** True iff the verification has already expired (defensive — the
 *  expiry sweep should have caught these, but rows can linger). */
function isAlreadyExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; limit?: string }>;
}) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(user.id, "company.verify");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires company.verify
      </div>
    );
  }

  // ── 2. Parse filters (URL searchParams) ──
  const sp = await searchParams;
  const statusParam = sp?.status ?? "PENDING";
  const limitParam = Math.min(500, Number(sp?.limit) || 100);

  const statusFilter:
    | VerifStatus
    | "ALL"
    | undefined = [
    ...(VERIF_STATUSES as readonly string[]),
    "ALL",
  ].includes(statusParam)
    ? (statusParam as VerifStatus | "ALL")
    : undefined;

  // ── 3. Query CompanyVerification with company include ──
  const verifications = await db.companyVerification.findMany({
    where: !statusFilter || statusFilter === "ALL" ? {} : { status: statusFilter },
    include: {
      company: {
        select: { id: true, name: true, slug: true, verified: true },
      },
    },
    orderBy: { submittedAt: "desc" },
    take: limitParam,
  });

  // ── 4. Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "company.verification.list_view",
    entityType: "CompanyVerification",
    reason: `viewed verifications list (filter=${statusFilter ?? "ALL"})`,
  });

  // ── 5. Render ──
  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Top action bar — Check Expiry sweep trigger */}
      <form
        action="/api/admin/verifications/check-expiry"
        method="post"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              انقضای تأییدها
            </p>
            <p className="text-xs text-amber-700">
              بررسی تأیید‌های منقضی‌شده (VERIFIED با expiresAt &lt; الان) و
              انتقال خودکار آن‌ها به وضعیت EXPIRED.
            </p>
          </div>
        </div>
        <button
          type="submit"
          className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-700"
        >
          <Clock className="h-4 w-4" />
          بررسی انقضا
        </button>
      </form>

      {/* Status filter */}
      <form className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-zinc-400" />
            <select
              name="status"
              defaultValue={statusFilter ?? "PENDING"}
              className={INPUT_CLS}
            >
              <option value="PENDING">در انتظار</option>
              <option value="UNDER_REVIEW">در حال بررسی</option>
              <option value="VERIFIED">تأییدشده</option>
              <option value="REJECTED">ردشده</option>
              <option value="EXPIRED">منقضی</option>
              <option value="REVOKED">ابطال‌شده</option>
              <option value="ALL">همه وضعیت‌ها</option>
            </select>
          </div>
          <input
            type="number"
            name="limit"
            defaultValue={limitParam}
            min={1}
            max={500}
            placeholder="حد نتایج (۱۰۰)…"
            className={INPUT_CLS}
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#F58220] px-5 text-sm font-bold text-white transition hover:bg-[#e0701a]"
          >
            اعمال فیلتر
          </button>
        </div>
      </form>

      {/* Table */}
      {verifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <BadgeCheck className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هیچ تأییدی یافت نشد.</p>
          <p className="mt-1 text-xs text-zinc-400">
            درخواست‌های تأیید شرکت‌ها برای این فیلتر نمایش داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">شرکت (موضوع)</th>
                  <th className="px-3 py-3 text-right font-bold">نوع</th>
                  <th className="px-3 py-3 text-right font-bold">وضعیت</th>
                  <th className="px-3 py-3 text-right font-bold">منبع</th>
                  <th className="px-3 py-3 text-right font-bold">بررسی‌کننده</th>
                  <th className="px-3 py-3 text-right font-bold">تأیید در</th>
                  <th className="px-3 py-3 text-right font-bold">انقضا</th>
                  <th className="px-3 py-3 text-right font-bold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {verifications.map((v) => {
                  const expSoon = isExpiringSoon(v.expiresAt);
                  const expired = isAlreadyExpired(v.expiresAt);
                  return (
                    <tr key={v.id} className="hover:bg-zinc-50">
                      {/* Subject — company name */}
                      <td className="px-3 py-3">
                        {v.company ? (
                          <Link
                            href={`/admin/companies/${v.company.id}`}
                            className="font-medium text-zinc-900 hover:text-[#F58220]"
                          >
                            {v.company.name}
                          </Link>
                        ) : (
                          <span className="text-zinc-400">شرکت حذف‌شده</span>
                        )}
                        <div className="font-mono text-[10px] text-zinc-400">
                          {v.company?.slug ?? "—"}
                        </div>
                      </td>
                      {/* Type */}
                      <td className="px-3 py-3 text-xs text-zinc-600">
                        {TYPE_LABEL[v.verificationType] ?? v.verificationType}
                      </td>
                      {/* Status */}
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STATUS_CLS[v.status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {STATUS_LABEL[v.status] ?? v.status}
                        </span>
                      </td>
                      {/* Source — evidence JSON (best-effort extract) */}
                      <td className="px-3 py-3 text-xs text-zinc-500">
                        {extractSource(v.evidence)}
                      </td>
                      {/* Verifier — reviewedBy */}
                      <td className="px-3 py-3 text-xs text-zinc-600">
                        {v.reviewedBy ?? "—"}
                      </td>
                      {/* VerifiedAt — reviewedAt */}
                      <td className="px-3 py-3 text-[11px] text-zinc-500">
                        {v.reviewedAt
                          ? `${faDate(v.reviewedAt)} · ${timeAgo(v.reviewedAt)}`
                          : "—"}
                      </td>
                      {/* ExpiresAt — with expiry indicator */}
                      <td className="px-3 py-3 text-[11px] text-zinc-500">
                        {v.expiresAt ? (
                          <div className="flex flex-col gap-1">
                            <span>
                              {faDate(v.expiresAt)} · {timeAgo(v.expiresAt)}
                            </span>
                            {expired && (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                                <AlertTriangle className="h-3 w-3" />
                                منقضی
                              </span>
                            )}
                            {expSoon && !expired && (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                                <Clock className="h-3 w-3" />
                                کمتر از ۷ روز
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Review action — link to detail page */}
                          <Link
                            href={`/admin/verifications/${v.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#F58220]/40 bg-[#F58220]/5 px-2 text-[10px] font-bold text-[#F58220] transition hover:bg-[#F58220]/15"
                            title="بررسی"
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                            بررسی
                          </Link>
                          {/* Revoke action — only for VERIFIED.
                              A confirm + prompt is client-side behaviour
                              we can't ship from a server component, so we
                              deep-link to the detail page where the
                              reviewer enters a reason in the dedicated
                              revoke form. */}
                          {v.status === "VERIFIED" && (
                            <Link
                              href={`/admin/verifications/${v.id}`}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 text-[10px] font-bold text-rose-700 transition hover:bg-rose-100"
                              title="ابطال"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              ابطال
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        مجموع: {toFa(verifications.length)} تأیید
      </p>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
        <BadgeCheck className="h-6 w-6 text-[#F58220]" />
        تأییدها
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        مرکز اعتماد — صف بررسی تأیید شرکت‌ها (تلفن، ایمیل، کسب‌وکار، سند، کارشناسی)
      </p>
    </div>
  );
}

/**
 * Best-effort extract a human-readable "source" string from the
 * evidence JSON column. The PATCH API stores evidence as
 * `JSON.stringify([{ type, url, description }])` (or null).
 * Falls back to "—" when no evidence is recorded.
 */
function extractSource(evidenceJson: string | null): string {
  if (!evidenceJson) return "—";
  try {
    const parsed = JSON.parse(evidenceJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first && typeof first === "object") {
        const t = (first as { type?: string }).type;
        const d = (first as { description?: string }).description;
        if (t && d) return `${t} · ${d}`;
        if (t) return String(t);
        if (d) return String(d);
      }
    } else if (parsed && typeof parsed === "object") {
      const t = (parsed as { type?: string }).type;
      if (t) return String(t);
    }
    // Last resort: return a truncated raw string
    return evidenceJson.length > 40
      ? `${evidenceJson.slice(0, 40)}…`
      : evidenceJson;
  } catch {
    return evidenceJson.length > 40
      ? `${evidenceJson.slice(0, 40)}…`
      : evidenceJson;
  }
}
