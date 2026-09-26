/**
 * HEAVIX — Admin Wanted Page (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * /admin/wanted — admin overview of all wanted requests
 * (BuyRequest). Lists every request with: status, category,
 * budget range, and a best-effort match count (from the
 * matching engine).
 *
 * Permission: request.read (RBAC-gated).
 * Audit: list_view audit `marketplace.wanted.admin.list_view`
 *   (entityType: BuyRequest).
 *
 * Server component — the data is fetched directly from the
 * main DB via @/lib/db. Pattern mirrors /admin/matching/page.tsx
 * + /admin/requests/page.tsx.
 */
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { toFa, timeAgo, formatCompactPrice, faDate } from "@/lib/format";
import {
  Flame,
  ListChecks,
  CheckCircle2,
  Archive,
  Star,
  MapPin,
  Wallet,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Status display config — mirrors the public admin/requests page.
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "فعال", cls: "bg-emerald-100 text-emerald-700" },
  FULFILLED: { label: "برآورده‌شده", cls: "bg-blue-100 text-blue-700" },
  CLOSED: { label: "بسته‌شده", cls: "bg-zinc-100 text-zinc-500" },
  CANCELLED: { label: "لغوشده", cls: "bg-red-100 text-red-700" },
};

type WantedRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  brandPref: string | null;
  transaction: string;
  budgetMin: bigint | null;
  budgetMax: bigint | null;
  city: string | null;
  province: string | null;
  status: string;
  verified: boolean;
  userId: string | null;
  createdAt: Date;
};

export default async function AdminWantedPage() {
  // ── Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="p-8 text-center text-zinc-500">Unauthorized</div>
    );
  }
  try {
    await requirePermission(user.id, "request.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires <code className="rounded bg-zinc-100 px-1">request.read</code>
      </div>
    );
  }

  // ── Stats (best-effort — never blocks the page) ──
  let stats = { total: 0, active: 0, fulfilled: 0, closed: 0, verified: 0 };
  try {
    const [total, active, fulfilled, closed, verified] = await Promise.all([
      db.buyRequest.count(),
      db.buyRequest.count({ where: { status: "ACTIVE" } }),
      db.buyRequest.count({ where: { status: "FULFILLED" } }),
      db.buyRequest.count({ where: { status: "CLOSED" } }),
      db.buyRequest.count({ where: { verified: true } }),
    ]);
    stats = { total, active, fulfilled, closed, verified };
  } catch (e) {
    console.error("[admin/wanted] stats query failed:", e);
  }

  // ── List the 50 most recent wanted requests ──
  let rows: WantedRow[] = [];
  let rowsError: string | null = null;
  try {
    const found = await db.buyRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
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
        status: true,
        verified: true,
        userId: true,
        createdAt: true,
      },
    });
    rows = found;
  } catch (e) {
    console.error("[admin/wanted] rows query failed:", e);
    rowsError = (e as Error)?.message ?? "unknown error";
  }

  // ── Best-effort match counts ──
  // We resolve match counts in a single Promise.all so the page
  // doesn't serialize 50 sequential DB round-trips. Each call
  // is best-effort (returns 0 on failure) so a broken engine
  // never breaks the admin view.
  let matchCounts: Record<string, number> = {};
  try {
    const entries = await Promise.all(
      rows.map(async (r) => {
        try {
          // Import lazily so a broken matching-service doesn't
          // break the admin page at module-load time.
          const { matchBuyRequest } = await import("@/lib/matching-service");
          const result = await matchBuyRequest(r.id, user.id).catch(() => null);
          return [r.id, result?.candidates?.length ?? 0] as const;
        } catch {
          return [r.id, 0] as const;
        }
      }),
    );
    matchCounts = Object.fromEntries(entries);
  } catch (e) {
    console.error("[admin/wanted] match-count lookup failed:", e);
  }

  // ── Best-effort audit (list_view) — never throws ──
  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "marketplace.wanted.admin.list_view",
    entityType: "BuyRequest",
    reason: "viewed admin wanted list",
  }).catch(() => {
    /* non-fatal */
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
          <Flame className="h-6 w-6 text-[#F58220]" />
          درخواست‌های خرید (Wanted Marketplace)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          مشاهدهٔ تمام درخواست‌های خرید ثبت‌شده توسط خریداران، با تعداد
          تطابق‌های پیشنهادی توسط موتور تطابق.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="کل درخواست‌ها"
          value={stats.total}
          icon={ListChecks}
          color="text-zinc-900"
          bg="bg-zinc-100"
        />
        <StatTile
          label="فعال"
          value={stats.active}
          icon={Flame}
          color="text-emerald-600"
          bg="bg-emerald-100"
        />
        <StatTile
          label="برآورده‌شده"
          value={stats.fulfilled}
          icon={CheckCircle2}
          color="text-blue-600"
          bg="bg-blue-100"
        />
        <StatTile
          label="بسته‌شده"
          value={stats.closed}
          icon={Archive}
          color="text-zinc-500"
          bg="bg-zinc-100"
        />
        <StatTile
          label="تأییدشده"
          value={stats.verified}
          icon={Star}
          color="text-teal-600"
          bg="bg-teal-100"
        />
      </div>

      {/* Rows */}
      {rowsError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mb-1 inline h-4 w-4" /> خطا در بارگذاری
          درخواست‌ها: <span dir="ltr">{rowsError}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Flame className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
          <p className="text-sm text-zinc-400">
            هنوز درخواست خریدی ثبت نشده است. کاربران از صفحهٔ{" "}
            <Link
              href="/requests/new"
              className="text-[#F58220] hover:underline"
            >
              /requests/new
            </Link>{" "}
            می‌توانند درخواست ثبت کنند.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">عنوان</th>
                  <th className="px-4 py-3 text-center font-bold">دسته</th>
                  <th className="px-4 py-3 text-center font-bold">برند</th>
                  <th className="px-4 py-3 text-center font-bold">بودجه</th>
                  <th className="px-4 py-3 text-center font-bold">موقعیت</th>
                  <th className="px-4 py-3 text-center font-bold">تطابق‌ها</th>
                  <th className="px-4 py-3 text-center font-bold">وضعیت</th>
                  <th className="px-4 py-3 text-center font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const sCfg = STATUS_CFG[r.status] ?? {
                    label: r.status,
                    cls: "bg-zinc-100 text-zinc-500",
                  };
                  const matchCount = matchCounts[r.id] ?? 0;
                  return (
                    <tr
                      key={r.id}
                      className="transition hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/api/wanted/${r.id}`}
                          className="font-bold text-zinc-800 hover:text-[#F58220]"
                          title={r.description ?? undefined}
                        >
                          {r.verified && (
                            <Star className="ml-1 inline h-3 w-3 fill-teal-500 text-teal-500" />
                          )}
                          {r.title}
                        </Link>
                        {r.description && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-300">
                            {r.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-zinc-600">
                        {r.category ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-zinc-600">
                        {r.brandPref ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-zinc-700">
                        {r.budgetMin || r.budgetMax ? (
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="h-3 w-3 text-zinc-400" />
                            {r.budgetMin
                              ? formatCompactPrice(r.budgetMin)
                              : ""}
                            {r.budgetMin && r.budgetMax ? " - " : ""}
                            {r.budgetMax
                              ? formatCompactPrice(r.budgetMax)
                              : ""}
                          </span>
                        ) : (
                          <span className="text-zinc-300">توافقی</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-zinc-600">
                        {r.city || r.province ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-400" />
                            {r.city ?? r.province}
                          </span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/api/wanted/${r.id}/matches`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#F58220]/10 px-2 py-0.5 text-[11px] font-bold text-[#F58220] hover:bg-[#F58220]/20"
                          title="مشاهدهٔ تطابق‌ها"
                        >
                          {toFa(matchCount)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${sCfg.cls}`}
                        >
                          {sCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-[11px] text-zinc-400">
                        {timeAgo(r.createdAt)}
                        <div className="text-[10px] text-zinc-300">
                          {faDate(r.createdAt)}
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

      {/* Footer hint */}
      <div className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
        ℹ️ نقطهٔ اتصال API:{" "}
        <code className="rounded bg-blue-100 px-1">GET /api/wanted</code>،{" "}
        <code className="rounded bg-blue-100 px-1">GET /api/wanted/[id]/matches</code>،{" "}
        <code className="rounded bg-blue-100 px-1">POST /api/admin/matching/run</code>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          <p className={`mt-1 text-2xl font-black ${color}`}>{toFa(value)}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}
