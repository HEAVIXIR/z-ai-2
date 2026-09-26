import Link from "next/link";
import { db } from "@/lib/db";
import { toFa, faDate, timeAgo } from "@/lib/format";
import {
  Store,
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  LayoutGrid,
  Handshake,
  AlertTriangle,
  User,
  ChevronLeft,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* =========================================================
   /admin/sellers — Founding sellers + Seller-role users.

   Reuses the existing User + FoundingSeller models in the main
   schema. No new API route — the page queries db directly.

   Permission: gated by the admin layout (admin RBAC). The nav
   item declares `user.read` so non-permissioned admins won't
   see the link, and the layout already redirects non-admins.
   ========================================================= */

type SellerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  companyName: string | null;
  status: string;
  emailVerified: boolean;
  mobileVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  founding: { badgeType: string; active: boolean; benefits: string | null } | null;
  listingsCount: number;
};

export default async function AdminSellersPage() {
  // Query: every user whose role is SELLER, plus include their
  // FoundingSeller record (if any) and listing counts.
  const users = await db.user.findMany({
    where: { role: "SELLER" },
    orderBy: { createdAt: "desc" },
    include: {
      foundingStatus: true,
      _count: { select: { listings: true } },
    },
    take: 500,
  });

  // Best-effort audit log entry — record that this admin viewed
  // the sellers list. Never throws (see logAudit).
  const actor = await getCurrentUser();
  await logAudit({
    actorId: actor?.id ?? null,
    actorType: "ADMIN",
    action: "marketplace.seller.list_view",
    entityType: "Seller",
    reason: "viewed sellers list",
  });

  const rows: SellerRow[] = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    mobile: u.mobile,
    companyName: u.companyName,
    status: u.status,
    emailVerified: u.emailVerified,
    mobileVerified: u.mobileVerified,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    founding: u.foundingStatus
      ? {
          badgeType: u.foundingStatus.badgeType,
          active: u.foundingStatus.active,
          benefits: u.foundingStatus.benefits,
        }
      : null,
    listingsCount: u._count.listings,
  }));

  const foundingCount = rows.filter((r) => r.founding?.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
            <Store className="h-6 w-6 text-[#F58220]" />
            فروشندگان
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            کاربران با نقش SELLER و وضعیت بنیان‌گذار (FoundingSeller)
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="کل فروشندگان"
          value={rows.length}
          color="bg-zinc-100 text-zinc-800"
        />
        <StatCard
          label="فروشندگان بنیان‌گذار"
          value={foundingCount}
          color="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="ایمیل تأییدشده"
          value={rows.filter((r) => r.emailVerified).length}
          color="bg-sky-100 text-sky-700"
        />
        <StatCard
          label="موبایل تأییدشده"
          value={rows.filter((r) => r.mobileVerified).length}
          color="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Store className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">هنوز هیچ فروشنده‌ای ثبت نشده است.</p>
          <p className="mt-1 text-xs text-zinc-400">
            کاربرانی که نقش آن‌ها در سیستم به SELLER تغییر کند، اینجا نمایش داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">نام</th>
                  <th className="px-3 py-3 text-right font-bold">شرکت</th>
                  <th className="px-3 py-3 text-right font-bold">موبایل</th>
                  <th className="px-3 py-3 text-right font-bold">ایمیل</th>
                  <th className="px-3 py-3 text-right font-bold">آگهی‌ها</th>
                  <th className="px-3 py-3 text-right font-bold">وضعیت</th>
                  <th className="px-3 py-3 text-right font-bold">بنیان‌گذار</th>
                  <th className="px-3 py-3 text-right font-bold">آخرین ورود</th>
                  <th className="px-3 py-3 text-right font-bold">عضویت</th>
                  <th className="px-3 py-3 text-right font-bold">اقدامات فروشنده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-bold text-zinc-800">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">
                      {r.companyName ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                          {r.companyName}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-zinc-600">
                        <Phone className="h-3.5 w-3.5 text-zinc-400" />
                        <span dir="ltr">{r.mobile}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-zinc-600">
                        <Mail className="h-3.5 w-3.5 text-zinc-400" />
                        <span dir="ltr" className="truncate max-w-[200px]">
                          {r.email}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-zinc-800">
                      {toFa(r.listingsCount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3">
                      {r.founding?.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <ShieldCheck className="h-3 w-3" />
                          بنیان‌گذار
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {r.lastLoginAt ? timeAgo(r.lastLoginAt) : "هرگز"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-zinc-500">
                      {faDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      {/* T-B-DEEP-MARKETPLACE — seller-specific actions.
                          Each link points to a domain page that already
                          exists in the admin app. The query params
                          (?sellerId=…) are forward-compatible — the
                          target pages currently render the full list,
                          but will be able to filter by sellerId when
                          that filter is added later. */}
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/sellers/${r.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-amber-50 text-[#F58220] transition hover:border-[#F58220] hover:bg-[#F58220]/10"
                          title="جزئیات فروشنده (verify/suspend)"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/admin/users/${r.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
                          title="جزئیات کاربر"
                        >
                          <User className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/admin/listings?sellerId=${r.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
                          title={`آگهی‌های این فروشنده (${toFa(r.listingsCount)})`}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/admin/deal-rooms?sellerId=${r.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
                          title="اتاق‌های معاملهٔ این فروشنده"
                        >
                          <Handshake className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/admin/disputes?openedBy=${r.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
                          title="اختلافات مرتبط"
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Help note */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-xs leading-6 text-blue-700">
        💡 برای تبدیل یک کاربر به فروشنده، از صفحهٔ{" "}
        <Link href="/admin/users" className="font-bold underline">
          کاربران
        </Link>{" "}
        استفاده کنید. پس از تغییر نقش به SELLER، کاربر به‌طور خودکار در این فهرست ظاهر می‌شود.
      </div>

      {/* T-B-DEEP-MARKETPLACE — seller-specific actions legend */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-bold text-zinc-700">راهنمای اقدامات فروشنده</h3>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 sm:grid-cols-5">
          <div className="flex items-center gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5 text-[#F58220]" />
            <span>جزئیات فروشنده (verify/suspend)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-zinc-500" />
            <span>جزئیات کاربر</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5 text-zinc-500" />
            <span>آگهی‌های فروشنده</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Handshake className="h-3.5 w-3.5 text-zinc-500" />
            <span>اتاق‌های معامله</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-zinc-500" />
            <span>اختلافات مرتبط</span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-zinc-400">
          لینک «جزئیات فروشنده» به صفحهٔ /admin/sellers/[id] می‌رود که امکان
          verify/suspend/register را در جریان چرخهٔ عمر فروشنده فراهم می‌کند.
          فیلتر ?sellerId=... یک الگوی forward-compatible است: صفحات هدف
          در نسخه‌های بعدی می‌توانند آن را برای فیلتر کردن بر اساس فروشنده
          پیاده‌سازی کنند.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 p-3 ${color}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="mt-1 text-xl font-black">{toFa(value)}</div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "فعال",
  PENDING: "در انتظار",
  BLOCKED: "مسدود",
  REJECTED: "ردشده",
};

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  BLOCKED: "bg-red-100 text-red-700",
  REJECTED: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls = STATUS_CLS[status] ?? "bg-zinc-100 text-zinc-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}
