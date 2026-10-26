export type ReadinessStatus = "PASS" | "PENDING" | "FAIL";

export interface ReadinessGate {
  id: string;
  title: string;
  status: ReadinessStatus;
  evidenceSha: string | null;
  sourceUrl: string;
  evidence: string;
}

export interface ReadinessSnapshot {
  mainSha: string;
  observedAt: string;
  sourceUrl: string;
  gates: ReadinessGate[];
}

export const MAX_EVIDENCE_AGE_MS = 4 * 60 * 60 * 1000;

/**
 * This is a timestamped repository snapshot, not a live GitHub API feed.
 * Any missing, stale, or SHA-mismatched evidence must render PENDING.
 * Update the snapshot only from independently checked source evidence.
 */
export const RELEASE_READINESS_SNAPSHOT: ReadinessSnapshot = {
  mainSha: "0366635c64782e5f3b94b7da333e01372f5a6d6e",
  observedAt: "2026-10-26T10:04:00.000Z",
  sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/commit/0366635c64782e5f3b94b7da333e01372f5a6d6e",
  gates: [
    {
      id: "exact-main-ci",
      title: "CI روی SHA نهایی main",
      status: "PENDING",
      evidenceSha: "00c8cb6482b3783f21f473fbcaec25f2982ebba8",
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/actions/runs/40302809814",
      evidence: "CI پنج‌گانه روی HEAD پیش از merge موفق بود؛ اجرای CI روی commit ادغام هنوز در شواهد این snapshot تأیید نشده است.",
    },
    {
      id: "migration-deploy",
      title: "مهاجرت تازه و پذیرش baseline برای Main و Store",
      status: "PENDING",
      evidenceSha: "e073c07560a61ea64fc18e4e71a6957582e4ee7b",
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/pull/90",
      evidence: "آزمون‌های CI روی SHA مربوط به PR موفق بودند؛ پذیرش عملیاتی در محیط مستقل غیرتولیدی جداگانه نیازمند ثبت شواهد است.",
    },
    {
      id: "store-outbox-runtime",
      title: "رفتار Store و Outbox در PostgreSQL غیرتولیدی",
      status: "PENDING",
      evidenceSha: null,
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/issues/81",
      evidence: "Issue #81 تا ثبت شواهد مستقل تراکنش، هم‌زمانی، retry، lease، پایش و بازیابی باز می‌ماند.",
    },
    {
      id: "backup-restore",
      title: "تمرین پشتیبان‌گیری، بازیابی و rollback",
      status: "PENDING",
      evidenceSha: null,
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/docs/RELEASE-READINESS-2026-10-26.md",
      evidence: "آزمون disposable در CI به‌تنهایی جایگزین تمرین عملیاتی مستقل و ثبت نتیجه نیست.",
    },
    {
      id: "seo-live-audit",
      title: "ممیزی مسیرهای SEO و وضعیت ایندکس زنده",
      status: "PENDING",
      evidenceSha: "00c8cb6482b3783f21f473fbcaec25f2982ebba8",
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/issues/98",
      evidence: "اصلاح metadata ادغام شده است؛ JSON-LD و crawl/index واقعی هنوز تأیید نشده‌اند.",
    },
    {
      id: "production-authorization",
      title: "مجوز انتشار Production",
      status: "PENDING",
      evidenceSha: null,
      sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/issues/88",
      evidence: "این داشبورد مجوز انتشار صادر نمی‌کند؛ تصمیم انتشار باید جداگانه ثبت شود.",
    },
  ],
};

export function effectiveReadinessStatus(
  gate: ReadinessGate,
  snapshot: ReadinessSnapshot,
  now: Date,
  currentSha: string | null,
): ReadinessStatus {
  const shaPattern = /^[a-f0-9]{40}$/;
  if (
    !shaPattern.test(snapshot.mainSha) ||
    !snapshot.observedAt ||
    !snapshot.sourceUrl ||
    !currentSha ||
    !shaPattern.test(currentSha) ||
    !gate.title ||
    !gate.sourceUrl ||
    !gate.evidence
  ) {
    return "PENDING";
  }
  const observedAt = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observedAt)) return "PENDING";
  const age = now.getTime() - observedAt;
  if (age < 0 || age > MAX_EVIDENCE_AGE_MS) return "PENDING";
  if (currentSha !== snapshot.mainSha) return "PENDING";
  if (
    !gate.evidenceSha ||
    !shaPattern.test(gate.evidenceSha) ||
    gate.evidenceSha !== snapshot.mainSha
  ) {
    return "PENDING";
  }
  return gate.status;
}

// Stable named export consumed by dashboard integrations and contract tests.
export const releaseReadiness = RELEASE_READINESS_SNAPSHOT;
