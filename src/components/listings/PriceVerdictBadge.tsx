import type { PriceHealthStatus } from "@/lib/price-engine";

type PriceVerdictBadgeProps = {
  status: PriceHealthStatus;
};

const VERDICT: Record<
  Exclude<PriceHealthStatus, "INSUFFICIENT">,
  { label: string; className: string }
> = {
  BELOW_RANGE: {
    label: "UNDERPRICED",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  },
  IN_RANGE: {
    label: "FAIR",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  },
  ABOVE_RANGE: {
    label: "OVERPRICED",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  },
};

/**
 * Legacy parity adaptation: explicit verdict label, derived only from the
 * canonical price-engine health status. No second fetch or alternate pricing
 * algorithm is introduced. Insufficient data deliberately yields no verdict.
 */
export default function PriceVerdictBadge({ status }: PriceVerdictBadgeProps) {
  if (status === "INSUFFICIENT") return null;

  const verdict = VERDICT[status];
  return (
    <span
      aria-label={`Price verdict: ${verdict.label}`}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${verdict.className}`}
    >
      {verdict.label}
    </span>
  );
}
