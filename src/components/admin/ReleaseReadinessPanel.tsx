import Link from "next/link";
import {
  RELEASE_READINESS_SNAPSHOT,
  effectiveReadinessStatus,
} from "@/lib/admin/release-readiness-snapshot";

const STATUS_LABEL: Record<string, string> = {
  PASS: "تأیید",
  PENDING: "در انتظار شواهد",
  FAIL: "ناموفق",
};

const STATUS_CLASS: Record<string, string> = {
  PASS: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  FAIL: "border-red-200 bg-red-50 text-red-800",
};

export function ReleaseReadinessPanel() {
  const currentSha =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const now = new Date();
  const stale =
    !RELEASE_READINESS_SNAPSHOT.observedAt ||
    !Number.isFinite(Date.parse(RELEASE_READINESS_SNAPSHOT.observedAt)) ||
    now.getTime() - Date.parse(RELEASE_READINESS_SNAPSHOT.observedAt) < 0 ||
    now.getTime() - Date.parse(RELEASE_READINESS_SNAPSHOT.observedAt) >
      4 * 60 * 60 * 1000;
  const allStatuses = RELEASE_READINESS_SNAPSHOT.gates.map((gate) =>
    effectiveReadinessStatus(gate, RELEASE_READINESS_SNAPSHOT, now, currentSha),
  );
  const pending = allStatuses.filter((status) => status === "PENDING").length;

  return (
    <section
      aria-labelledby="release-readiness-heading"
      className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="release-readiness-heading"
            className="text-base font-black text-zinc-900"
          >
            آمادگی انتشار HEAVIX
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            snapshot مستند و زمان‌دار؛ این بخش feed زنده GitHub نیست و مجوز انتشار صادر نمی‌کند.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          NO-GO · {pending} مورد در انتظار
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>
          SHA snapshot: <code>{RELEASE_READINESS_SNAPSHOT.mainSha.slice(0, 12)}</code>
        </span>
        <span>
          زمان بررسی: {RELEASE_READINESS_SNAPSHOT.observedAt}
        </span>
        <Link
          href={RELEASE_READINESS_SNAPSHOT.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-[#F58220] hover:underline"
        >
          منبع snapshot
        </Link>
      </div>

      {(!currentSha || currentSha !== RELEASE_READINESS_SNAPSHOT.mainSha || stale) && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          SHA اجرا با snapshot همخوان نیست یا شواهد منقضی شده‌اند؛ وضعیت‌های PASS به PENDING تنزل می‌کنند تا snapshot از نو بررسی شود.
        </p>
      )}

      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {RELEASE_READINESS_SNAPSHOT.gates.map((gate, index) => {
          const status = effectiveReadinessStatus(
            gate,
            RELEASE_READINESS_SNAPSHOT,
            now,
            currentSha,
          );
          return (
            <li
              key={gate.id}
              className="rounded-xl border border-zinc-200 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs font-bold leading-5 text-zinc-800">
                  {gate.title}
                </h3>
                <span
                  className={
                    "shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold " +
                    (STATUS_CLASS[status] ?? STATUS_CLASS.PENDING)
                  }
                >
                  {STATUS_LABEL[status] ?? STATUS_LABEL.PENDING}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                {gate.evidence}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                <span>
                  SHA: {gate.evidenceSha ? gate.evidenceSha.slice(0, 12) : "ثبت نشده"}
                </span>
                <Link
                  href={gate.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-[#F58220] hover:underline"
                >
                  مشاهده شواهد
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
