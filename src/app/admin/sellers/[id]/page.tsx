import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { toFa, faDate, timeAgo } from "@/lib/format";
import {
  ArrowRight,
  Store,
  ShieldCheck,
  ShieldX,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  LogIn,
  Megaphone,
} from "lucide-react";
import SellerDetailActions from "./SellerDetailActions";

export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "مدیر",
  SELLER: "فروشنده",
  BUYER: "خریدار",
  INDIVIDUAL: "فرد",
};

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

/* /admin/sellers/[id] — seller detail / moderation page.
 *
 * Server component: fetches the User row (with foundingStatus +
 * company + _count.listings + recent listings) and renders the
 * detail view. The verify/suspend action buttons are a small
 * client component that PATCHes the /api/admin/sellers/[id]
 * route.
 *
 * Permission: user.read (read gate; the action buttons also
 * require user.update — enforced in the PATCH route).
 *
 * Audit: best-effort marketplace.seller.detail_view.
 */
export default async function AdminSellerDetailPage({ params }: Args) {
  const { id } = await params;

  // ── 1. Auth + RBAC ──
  const actor = await getCurrentUser();
  if (!actor) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(actor.id, "user.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires user.read
      </div>
    );
  }

  // ── 2. Load seller profile (with company + founding + listings) ──
  const user = await db.user.findUnique({
    where: { id },
    include: {
      foundingStatus: true,
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          verified: true,
          status: true,
          city: true,
          province: true,
        },
      },
      listings: {
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          slug: true,
          title: true,
          price: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          province: true,
          city: true,
        },
      },
      _count: {
        select: {
          listings: true,
          offers: true,
          requests: true,
          favorites: true,
        },
      },
    },
  });

  if (!user) notFound();

  // Best-effort audit (view only — never throws).
  await logAudit({
    actorId: actor.id,
    actorType: "ADMIN",
    action: "marketplace.seller.detail_view",
    entityType: "FoundingSeller",
    entityId: user.foundingStatus?.id ?? user.id,
    reason: `viewed seller profile ${id}`,
  }).catch(() => {});

  const isVerified = user.foundingStatus?.active === true;
  const isPending =
    user.foundingStatus !== null && user.foundingStatus.active === false;
  const isSuspended = user.status === "BLOCKED";

  const sectionCard = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/sellers"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
            title="بازگشت"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
              <Store className="h-6 w-6 text-[#F58220]" />
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-xs text-zinc-500" dir="ltr">
              {user.email} · {user.mobile}
            </p>
          </div>
        </div>
        <Link
          href={`/admin/users/${user.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-600 transition hover:border-[#F58220] hover:text-[#F58220]"
        >
          <Megaphone className="h-3.5 w-3.5" />
          پروفایل کامل کاربر
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="آگهی‌ها"
          value={user._count.listings}
          icon={<Megaphone className="h-4 w-4" />}
          color="text-amber-700 bg-amber-100"
        />
        <StatCard
          label="پیشنهادها"
          value={user._count.offers}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-blue-700 bg-blue-100"
        />
        <StatCard
          label="درخواست‌ها"
          value={user._count.requests}
          icon={<Megaphone className="h-4 w-4" />}
          color="text-purple-700 bg-purple-100"
        />
        <StatCard
          label="علاقه‌مندی"
          value={user._count.favorites}
          icon={<Megaphone className="h-4 w-4" />}
          color="text-amber-700 bg-amber-100"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile + actions */}
        <div className="space-y-6 lg:col-span-1">
          <section className={sectionCard}>
            <h2 className="mb-4 text-sm font-black text-zinc-900">
              پروفایل فروشنده
            </h2>
            <div className="space-y-3 text-sm">
              <ProfileRow
                icon={<Mail className="h-4 w-4" />}
                label="ایمیل"
                value={user.email}
                ltr
              />
              <ProfileRow
                icon={<Phone className="h-4 w-4" />}
                label="موبایل"
                value={user.mobile}
                ltr
              />
              {user.companyName && (
                <ProfileRow
                  icon={<Building2 className="h-4 w-4" />}
                  label="نام شرکت"
                  value={user.companyName}
                />
              )}
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs text-zinc-500">نقش</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    ROLE_LABEL[user.role]
                      ? "bg-amber-100 text-amber-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">وضعیت کاربر</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    STATUS_CLS[user.status] ?? "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {STATUS_LABEL[user.status] ?? user.status}
                </span>
              </div>
            </div>
          </section>

          {/* Founding seller status */}
          <section className={sectionCard}>
            <h2 className="mb-4 text-sm font-black text-zinc-900">
              وضعیت بنیان‌گذار
            </h2>
            {user.foundingStatus ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">نشان</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                    {user.foundingStatus.badgeType}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">وضعیت</span>
                  {isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> تأییدشده
                    </span>
                  ) : isSuspended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      <ShieldX className="h-3.5 w-3.5" /> تعلیق‌شده
                    </span>
                  ) : isPending ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      <Clock className="h-3.5 w-3.5" /> در انتظار تأیید
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">—</span>
                  )}
                </div>
                {user.foundingStatus.benefits && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    <p className="mb-1 font-bold text-zinc-700">مزایا</p>
                    <p className="whitespace-pre-wrap">
                      {user.foundingStatus.benefits}
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-500">
                  ثبت: {faDate(user.foundingStatus.createdAt)}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
                این فروشنده هنوز رکورد بنیان‌گذار ندارد.
                <br />
                برای ثبت، از دکمهٔ «ثبت‌نام به‌عنوان فروشنده» استفاده کنید.
              </div>
            )}

            {/* Verification status badges */}
            <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">تأیید ایمیل</span>
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> بله
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                    <ShieldX className="h-3.5 w-3.5" /> خیر
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">تأیید موبایل</span>
                {user.mobileVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> بله
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                    <XCircle className="h-3.5 w-3.5" /> خیر
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className={sectionCard}>
            <h2 className="mb-4 text-sm font-black text-zinc-900">
              خط زمانی
            </h2>
            <div className="space-y-3 text-sm">
              <TimelineRow
                icon={<Calendar className="h-4 w-4 text-zinc-400" />}
                label="ثبت‌نام"
                value={faDate(user.createdAt)}
              />
              <TimelineRow
                icon={<LogIn className="h-4 w-4 text-zinc-400" />}
                label="آخرین ورود"
                value={user.lastLoginAt ? faDate(user.lastLoginAt) : "هرگز"}
              />
              <TimelineRow
                icon={<Calendar className="h-4 w-4 text-zinc-400" />}
                label="به‌روزرسانی"
                value={faDate(user.updatedAt)}
              />
            </div>
          </section>

          {/* Actions */}
          <SellerDetailActions
            sellerId={user.id}
            foundingStatusId={user.foundingStatus?.id ?? null}
            isVerified={isVerified}
            isPending={isPending}
            isSuspended={isSuspended}
          />
        </div>

        {/* Listings + company */}
        <div className="space-y-6 lg:col-span-2">
          {/* Company */}
          <section className={sectionCard}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900">
              <Building2 className="h-4 w-4 text-[#F58220]" />
              شرکت مرتبط
            </h2>
            {user.company ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">نام</span>
                  <Link
                    href={`/admin/companies/${user.company.id}`}
                    className="font-bold text-zinc-800 hover:text-[#F58220]"
                  >
                    {user.company.name}
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">وضعیت</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      STATUS_CLS[user.company.status] ??
                      "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {STATUS_LABEL[user.company.status] ?? user.company.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">تأیید</span>
                  {user.company.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> بله
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500">
                      <XCircle className="h-3.5 w-3.5" /> خیر
                    </span>
                  )}
                </div>
                {(user.company.city || user.company.province) && (
                  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>موقعیت</span>
                    <span dir="rtl">
                      {user.company.province ?? "—"} — {user.company.city ?? "—"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-zinc-400">
                این فروشنده به شرکی متصل نیست.
              </p>
            )}
          </section>

          {/* Listings */}
          <section className={sectionCard}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900">
              <Megaphone className="h-4 w-4 text-[#F58220]" />
              آگهی‌های اخیر ({toFa(user.listings.length)} از {toFa(user._count.listings)})
            </h2>
            {user.listings.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-400">
                این فروشنده هنوز آگهی ثبت نکرده است.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-zinc-500">
                    <tr>
                      <th className="px-2 py-2 text-right font-bold">عنوان</th>
                      <th className="px-2 py-2 text-right font-bold">شهر</th>
                      <th className="px-2 py-2 text-center font-bold">وضعیت</th>
                      <th className="px-2 py-2 text-center font-bold">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {user.listings.map((l) => (
                      <tr key={l.id} className="hover:bg-zinc-50">
                        <td className="px-2 py-2">
                          <Link
                            href={`/listings/${l.slug}`}
                            className="truncate font-bold text-zinc-800 hover:text-[#F58220]"
                            target="_blank"
                          >
                            {l.title}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-zinc-600">
                          {l.city ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                            {l.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-[10px] text-zinc-400">
                          {faDate(l.createdAt)}
                          <div>{timeAgo(l.createdAt)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div
        className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${color}`}
      >
        {icon}
      </div>
      <p className="text-xl font-black text-zinc-900">
        {value.toLocaleString("fa-IR")}
      </p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  ltr,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        {label}
      </span>
      <span
        className="truncate font-bold text-zinc-800"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function TimelineRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        {label}
      </span>
      <span className="text-xs font-bold text-zinc-800">{value}</span>
    </div>
  );
}
