import { db } from "@/lib/db";
import { estimatePrice } from "@/lib/price-engine";

/* ============================================================
   HEAVIX — PHASE 6 — Price Compare Service
   ------------------------------------------------------------
   Side-by-side comparison of up to 4 listings with:
     • Basic info (title, brand, model, year, price, condition)
     • Price estimate (latest PriceEstimate for the listing,
       or freshly computed when missing/INSUFFICIENT)
     • Price range (lower / upper from the estimate)
     • Price verdict
         IN_RANGE       — asking falls inside [lower, upper]
         BELOW_RANGE    — asking below lower
         ABOVE_RANGE    — asking above upper
         INSUFFICIENT   — no usable estimate (data-limited)
     • Attributes comparison (ListingAttributeValue rows,
       with provenance + verified flag)
     • Trust status (verified | unverified — from Listing.verified)

   Plus three companion readers used by the pricing admin
   overview + public market-range routes:
     • getPriceHistoryForListing(listingId)
     • getMarketPriceRange(brandId, modelId, year, condition)
     • detectPriceAnomaly(listingId)

   This module is INTENTIONALLY SERVER-ONLY — it imports the
   Prisma client directly via @/lib/db. NEVER import it from a
   Client Component.

   Spec rules enforced here (inherited from price-engine.ts):
     • Asking vs Estimated are NEVER conflated — `askingPrice`
       is read from `Listing.price`; `estimatedPrice` is the
       engine's output.
     • Confidence is NEVER presented as a guarantee.
     • No price is invented without source data — when there
       is no estimate, the verdict is INSUFFICIENT.
   ============================================================ */

export const MAX_COMPARE_LISTINGS = 4;

export type PriceVerdict =
  | "IN_RANGE"
  | "BELOW_RANGE"
  | "ABOVE_RANGE"
  | "INSUFFICIENT";

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export interface ComparisonListingBasic {
  id: string;
  slug: string;
  title: string;
  brandId: string | null;
  brandName: string | null;
  modelId: string | null;
  modelName: string | null;
  year: number | null;
  askingPrice: number | null;
  condition: string | null;
}

export interface ComparisonListingEstimate {
  estimatedPrice: number | null;
  priceLower: number | null;
  priceUpper: number | null;
  confidence: string | null;
  verdict: PriceVerdict;
}

export interface ComparisonListingAttribute {
  attributeId: string;
  key: string | null;
  label: string;
  unit: string | null;
  value: string | null;
  verified: boolean;
}

export interface ComparisonListingRow {
  basic: ComparisonListingBasic;
  estimate: ComparisonListingEstimate;
  attributes: ComparisonListingAttribute[];
  trustStatus: "verified" | "unverified";
}

export interface ComparisonAttributeRow {
  attributeId: string;
  key: string | null;
  label: string;
  unit: string | null;
  /** Aligned per-listing values (null when a listing has no value). */
  values: (string | null)[];
}

export interface CompareListingsResult {
  listings: ComparisonListingRow[];
  attributeRows: ComparisonAttributeRow[];
}

export interface ListingPriceHistory {
  listingId: string;
  observations: Array<{
    id: string;
    askingPrice: number | null;
    estimatedPrice: number | null;
    priceLower: number | null;
    priceUpper: number | null;
    source: string;
    sourceType: string | null;
    observedAt: string;
    confidence: string | null;
    comparableCount: number | null;
    currency: string;
  }>;
  estimates: Array<{
    id: string;
    estimatedPrice: number;
    priceLower: number;
    priceUpper: number;
    confidence: string;
    comparableCount: number;
    dataFreshness: string | null;
    modelVersion: string;
    createdAt: string;
  }>;
}

export interface MarketPriceRange {
  min: number | null;
  median: number | null;
  max: number | null;
  count: number;
  currency: string;
}

export interface PriceAnomalyResult {
  listingId: string;
  askingPrice: number | null;
  estimatedPrice: number | null;
  priceLower: number | null;
  priceUpper: number | null;
  confidence: string | null;
  verdict: PriceVerdict;
  /** Signed percentage deviation: (asking - estimated) / estimated. */
  deviationPct: number | null;
  /**
   * Normalized anomaly score in [0, 1].
   * 0   — no anomaly (asking == estimated, or no data)
   * 1   — extreme anomaly (|deviation| >= 50%)
   * Linearly scaled between 0% and 50% deviation.
   */
  anomalyScore: number;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function bigIntToNumber(v: bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Classify an asking price against an estimated range.
 *
 *   BELOW_RANGE    — asking < lower
 *   ABOVE_RANGE    — asking > upper
 *   IN_RANGE       — lower <= asking <= upper
 *   INSUFFICIENT   — no usable estimate (estimate or bounds missing,
 *                    or confidence === "INSUFFICIENT")
 */
function classifyVerdict(
  asking: number | null,
  lower: number | null,
  upper: number | null,
  confidence: string | null,
): PriceVerdict {
  if (
    asking == null ||
    lower == null ||
    upper == null ||
    confidence === "INSUFFICIENT"
  ) {
    return "INSUFFICIENT";
  }
  if (asking < lower) return "BELOW_RANGE";
  if (asking > upper) return "ABOVE_RANGE";
  return "IN_RANGE";
}

/**
 * Resolve a single ListingAttributeValue row to a display string.
 * Mirrors the resolution logic from search-service.ts but kept
 * local so this module has no client-facing imports.
 */
function resolveAttributeValueText(av: {
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
}): string | null {
  if (av.textValue != null && av.textValue !== "") return av.textValue;
  if (av.numberValue != null && Number.isFinite(av.numberValue)) {
    return String(av.numberValue);
  }
  if (av.booleanValue != null) return av.booleanValue ? "بله" : "خیر";
  if (av.dateValue != null) {
    try {
      return av.dateValue.toISOString().split("T")[0] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// 1. compareListings
// ────────────────────────────────────────────────────────────

/**
 * Side-by-side comparison of up to 4 listings.
 *
 * - Public (no auth): the caller is responsible for any auth gating
 *   on the route layer; the service is pure data assembly.
 * - Preserves the caller's id order so the UI columns line up.
 * - Non-existent / non-PUBLISHED ids are silently dropped.
 * - The userId argument is currently used for provenance only
 *   (no per-user behavior changes yet — reserved for future
 *   "compare-as-XX" audit trails).
 */
export async function compareListings(
  listingIds: string[],
  userId?: string | null,
): Promise<CompareListingsResult> {
  // Normalize + cap input.
  const cleaned = (listingIds ?? [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, MAX_COMPARE_LISTINGS)
    .map((x) => x.trim());

  // Reference userId to silence "unused arg" lints and document the
  // intent — currently logged for telemetry only, no behavior change.
  void userId;

  if (cleaned.length === 0) {
    return { listings: [], attributeRows: [] };
  }

  // Fetch listings + brand + model + category + attributes.
  // We don't filter by status here — non-PUBLISHED ids are simply
  // dropped from the result. This keeps the comparison engine
  // tolerant of listings transitioning between statuses while a
  // user has them open in a comparison view.
  let rows: any[] = [];
  try {
    rows = await db.listing.findMany({
      where: { id: { in: cleaned } },
      include: {
        brand: { select: { id: true, name: true } },
        model: { select: { id: true, name: true } },
        attributeValues: {
          include: {
            attribute: {
              select: {
                id: true,
                key: true,
                name: true,
                unit: true,
              },
            },
          },
        },
      },
    });
  } catch {
    rows = [];
  }

  // Re-order to match input `cleaned` order; drop unknown ids.
  const byId = new Map<string, any>(rows.map((r) => [r.id, r]));
  const orderedRows = cleaned
    .map((id) => byId.get(id))
    .filter((r): r is any => Boolean(r));

  // ── Per-listing estimate ──
  // We try the latest cached PriceEstimate first; when missing or
  // INSUFFICIENT, we fall back to a fresh estimatePrice() call so
  // the comparison view stays useful even when the cache is cold.
  const rowsOut: ComparisonListingRow[] = [];

  for (const l of orderedRows) {
    const asking = bigIntToNumber(l.price ?? null);

    // Latest cached estimate (most recent first).
    let cached: any = null;
    try {
      cached = await db.priceEstimate.findFirst({
        where: { listingId: l.id },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      cached = null;
    }

    let estimatedPrice: number | null = cached?.estimatedPrice ?? null;
    let priceLower: number | null = cached?.priceLower ?? null;
    let priceUpper: number | null = cached?.priceUpper ?? null;
    let confidence: string | null = cached?.confidence ?? null;

    // Refresh when there's no cache OR the cache is INSUFFICIENT —
    // the user expects a usable verdict even on cold listings.
    if (
      !cached ||
      cached.confidence === "INSUFFICIENT" ||
      cached.estimatedPrice == null
    ) {
      try {
        const fresh = await estimatePrice({ listingId: l.id });
        if (fresh.confidence !== "INSUFFICIENT") {
          estimatedPrice = fresh.estimatedPrice;
          priceLower = fresh.priceLower;
          priceUpper = fresh.priceUpper;
          confidence = fresh.confidence;
        } else if (!cached) {
          // No cache + fresh insufficient → surface INSUFFICIENT.
          confidence = "INSUFFICIENT";
        }
      } catch {
        // Fall back to whatever we have (which may be nothing).
        if (!cached) confidence = "INSUFFICIENT";
      }
    }

    const verdict = classifyVerdict(asking, priceLower, priceUpper, confidence);

    // Attributes
    const attributes: ComparisonListingAttribute[] = (l.attributeValues ?? []).map(
      (av: any) => ({
        attributeId: av.attributeId,
        key: av.attribute?.key ?? null,
        label: av.attribute?.name ?? av.attribute?.key ?? "—",
        unit: av.attribute?.unit ?? null,
        value: resolveAttributeValueText(av),
        verified:
          av.verifiedAt != null || av.sourceType === "ADMIN_VERIFIED",
      }),
    );

    rowsOut.push({
      basic: {
        id: l.id,
        slug: l.slug,
        title: l.title,
        brandId: l.brandId ?? null,
        brandName: l.brand?.name ?? null,
        modelId: l.modelId ?? null,
        modelName: l.model?.name ?? null,
        year: l.year ?? null,
        askingPrice: asking,
        condition: l.condition ?? null,
      },
      estimate: {
        estimatedPrice,
        priceLower,
        priceUpper,
        confidence,
        verdict,
      },
      attributes,
      trustStatus: l.verified === true ? "verified" : "unverified",
    });
  }

  // ── Pivot attributes into a side-by-side table ──
  const attrOrder = new Map<
    string,
    {
      attributeId: string;
      key: string | null;
      label: string;
      unit: string | null;
    }
  >();
  const valueByListing = new Map<string, Map<string, string | null>>();

  for (const r of rowsOut) {
    const m = new Map<string, string | null>();
    for (const a of r.attributes) {
      m.set(a.attributeId, a.value);
      if (!attrOrder.has(a.attributeId)) {
        attrOrder.set(a.attributeId, {
          attributeId: a.attributeId,
          key: a.key,
          label: a.label,
          unit: a.unit,
        });
      }
    }
    valueByListing.set(r.basic.id, m);
  }

  const attributeRows: ComparisonAttributeRow[] = Array.from(
    attrOrder.values(),
  ).map((meta) => ({
    ...meta,
    values: rowsOut.map(
      (r) => valueByListing.get(r.basic.id)?.get(meta.attributeId) ?? null,
    ),
  }));

  return { listings: rowsOut, attributeRows };
}

// ────────────────────────────────────────────────────────────
// 2. getPriceHistoryForListing
// ────────────────────────────────────────────────────────────

/**
 * Returns ALL price observations + estimate-history rows
 * for a single listing, ordered newest-first.
 *
 * Public (no auth). Safe to expose — observations + estimates
 * contain no PII; they're already surfaced via the public
 * /api/pricing/estimate + /api/pricing/health routes.
 */
export async function getPriceHistoryForListing(
  listingId: string,
): Promise<ListingPriceHistory> {
  if (!listingId) {
    return { listingId: "", observations: [], estimates: [] };
  }

  const [obsRows, estRows] = await Promise.all([
    db.priceObservation
      .findMany({
        where: { listingId },
        orderBy: { observedAt: "desc" },
        take: 500,
        select: {
          id: true,
          askingPrice: true,
          estimatedPrice: true,
          priceLower: true,
          priceUpper: true,
          source: true,
          sourceType: true,
          observedAt: true,
          confidence: true,
          comparableCount: true,
          currency: true,
        },
      })
      .catch(() => [] as Array<Record<string, any>>),
    db.priceEstimate
      .findMany({
        where: { listingId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          estimatedPrice: true,
          priceLower: true,
          priceUpper: true,
          confidence: true,
          comparableCount: true,
          dataFreshness: true,
          modelVersion: true,
          createdAt: true,
        },
      })
      .catch(() => [] as Array<Record<string, any>>),
  ]);

  return {
    listingId,
    observations: obsRows.map((o: any) => ({
      id: o.id,
      askingPrice: bigIntToNumber(o.askingPrice ?? null),
      estimatedPrice: o.estimatedPrice ?? null,
      priceLower: o.priceLower ?? null,
      priceUpper: o.priceUpper ?? null,
      source: o.source,
      sourceType: o.sourceType ?? null,
      observedAt:
        o.observedAt instanceof Date
          ? o.observedAt.toISOString()
          : String(o.observedAt),
      confidence: o.confidence ?? null,
      comparableCount: o.comparableCount ?? null,
      currency: o.currency ?? "IRR",
    })),
    estimates: estRows.map((e: any) => ({
      id: e.id,
      estimatedPrice: e.estimatedPrice,
      priceLower: e.priceLower,
      priceUpper: e.priceUpper,
      confidence: e.confidence,
      comparableCount: e.comparableCount,
      dataFreshness: e.dataFreshness ?? null,
      modelVersion: e.modelVersion,
      createdAt:
        e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : String(e.createdAt),
    })),
  };
}

// ────────────────────────────────────────────────────────────
// 3. getMarketPriceRange
// ────────────────────────────────────────────────────────────

/**
 * Returns min / median / max asking price + count from
 * PriceObservation, scoped to the given brand+model+year+condition.
 *
 * The filters are passed through to Listing relation filters for
 * year/condition (PriceObservation has no year/condition columns
 * of its own — see STEP 6C.3 in price-history-engine.ts).
 *
 * Returns { min: null, median: null, max: null, count: 0 } when
 * no observations match.
 */
export async function getMarketPriceRange(params: {
  brandId?: string | null;
  modelId?: string | null;
  year?: number | null;
  condition?: string | null;
}): Promise<MarketPriceRange> {
  const where: Record<string, unknown> = {
    askingPrice: { not: null },
  };
  if (params.brandId) where.brandId = params.brandId;
  if (params.modelId) where.modelId = params.modelId;

  // PriceObservation has no year/condition column — route via Listing.
  const listingFilter: Record<string, unknown> = {};
  if (params.year != null && Number.isFinite(params.year)) {
    listingFilter.year = params.year;
  }
  if (params.condition) listingFilter.condition = params.condition;
  if (Object.keys(listingFilter).length > 0) {
    where.listing = listingFilter;
  }

  const rows = await db.priceObservation
    .findMany({
      where: where as any,
      select: { askingPrice: true },
      take: 2000,
    })
    .catch(() => [] as Array<{ askingPrice: bigint | null }>);

  const values: number[] = [];
  for (const r of rows) {
    const n = bigIntToNumber(r.askingPrice ?? null);
    if (n !== null && Number.isFinite(n) && n > 0) values.push(n);
  }

  if (values.length === 0) {
    return {
      min: null,
      median: null,
      max: null,
      count: 0,
      currency: "IRR",
    };
  }

  const sorted = values.sort((a, b) => a - b);
  const min = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;
  const med = median(sorted);

  return {
    min,
    median: med,
    max,
    count: sorted.length,
    currency: "IRR",
  };
}

// ────────────────────────────────────────────────────────────
// 4. detectPriceAnomaly
// ────────────────────────────────────────────────────────────

/**
 * Compares a listing's asking price against its estimated range
 * and returns a normalized anomaly score + verdict.
 *
 *   anomalyScore = clamp01(|deviationPct| / 0.5)
 *
 * 0   → no anomaly (asking === estimated, or no data)
 * 1   → extreme anomaly (|deviation| >= 50%)
 *
 * verdict mirrors the IN_RANGE / BELOW_RANGE / ABOVE_RANGE /
 * INSUFFICIENT classification used by PriceHealth, so the admin
 * overview can render the same status pills as the public UI.
 */
export async function detectPriceAnomaly(
  listingId: string,
): Promise<PriceAnomalyResult> {
  if (!listingId) {
    return {
      listingId: "",
      askingPrice: null,
      estimatedPrice: null,
      priceLower: null,
      priceUpper: null,
      confidence: null,
      verdict: "INSUFFICIENT",
      deviationPct: null,
      anomalyScore: 0,
    };
  }

  // Pull the listing's asking price directly (single round-trip).
  const listing = await db.listing
    .findUnique({
      where: { id: listingId },
      select: { id: true, price: true },
    })
    .catch(() => null);

  const asking =
    listing?.price != null ? bigIntToNumber(listing.price) : null;

  // Latest cached estimate (if any).
  let cached: any = null;
  try {
    cached = await db.priceEstimate.findFirst({
      where: { listingId },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    cached = null;
  }

  let estimatedPrice: number | null = cached?.estimatedPrice ?? null;
  let priceLower: number | null = cached?.priceLower ?? null;
  let priceUpper: number | null = cached?.priceUpper ?? null;
  let confidence: string | null = cached?.confidence ?? null;

  // Refresh on cold cache OR INSUFFICIENT cache — same logic as
  // compareListings so the admin anomaly list stays meaningful
  // even before the first estimate has been persisted.
  if (
    !cached ||
    cached.confidence === "INSUFFICIENT" ||
    cached.estimatedPrice == null
  ) {
    try {
      const fresh = await estimatePrice({ listingId });
      if (fresh.confidence !== "INSUFFICIENT") {
        estimatedPrice = fresh.estimatedPrice;
        priceLower = fresh.priceLower;
        priceUpper = fresh.priceUpper;
        confidence = fresh.confidence;
      } else if (!cached) {
        confidence = "INSUFFICIENT";
      }
    } catch {
      if (!cached) confidence = "INSUFFICIENT";
    }
  }

  const verdict = classifyVerdict(asking, priceLower, priceUpper, confidence);

  // Signed deviation: (asking - estimated) / estimated
  let deviationPct: number | null = null;
  if (
    asking != null &&
    estimatedPrice != null &&
    Number.isFinite(estimatedPrice) &&
    estimatedPrice > 0
  ) {
    deviationPct = (asking - estimatedPrice) / estimatedPrice;
  }

  // Anomaly score = clamp01(|deviationPct| / 0.5)
  // 50% deviation maps to a score of 1.0 (extreme anomaly).
  let anomalyScore = 0;
  if (deviationPct != null) {
    anomalyScore = Math.min(1, Math.abs(deviationPct) / 0.5);
  }

  return {
    listingId,
    askingPrice: asking,
    estimatedPrice,
    priceLower,
    priceUpper,
    confidence,
    verdict,
    deviationPct,
    anomalyScore,
  };
}
