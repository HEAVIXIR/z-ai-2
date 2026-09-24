import { db } from "@/lib/db";

/* ============================================================
   HEAVIX — PHASE 6B.1 — Canonical Price History Engine
   ------------------------------------------------------------
   This module is the CANONICAL price history layer per the 6A
   reconciliation decision. It reads from PriceObservation
   (the canonical model) — NOT from PriceRecord (deprecated).

   Background (per PHASE-6A-RECONCILE):
   - PriceRecord has 6 live readers but 0 live writers
     (recordPriceFromListing is dead code with 0 callers).
   - PriceObservation has 1 live writer (recordObservation
     via POST /api/pricing/estimate) and 4 live readers.
   - Both tables are currently EMPTY (verified by live query).
   - Canonical model: PriceObservation (richer schema, proper
     relations, BigInt type consistency with Listing.price).
   - Deprecated model: PriceRecord (dead-writer, Float type
     conflict with Listing.price BigInt).

   This module ports the 4 readers from price-intelligence.ts
   (getPriceStats, getPriceHistory, detectOutliers, getPriceSuggestions)
   to read from PriceObservation. Field mappings:
     - PriceRecord.price Float → PriceObservation.askingPrice BigInt?
     - PriceRecord.recordedAt → PriceObservation.observedAt
     - PriceRecord.productId (bare) → PriceObservation.productId (bare)

   The original price-intelligence.ts is kept for now (will be
   removed in 6B Phase 2 after all consumers are migrated).

   The module is intentionally server-only (imports Prisma).
   ============================================================ */

// ── Type definitions (copied from price-intelligence.ts for stability) ──

export interface PriceStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  count: number;
  p25: number | null;
  p75: number | null;
  currency: string;
}

export interface PriceHistoryPoint {
  month: string; // YYYY-MM (Gregorian, gap-filled)
  medianPrice: number | null;
  count: number;
  range: [number, number] | null;
}

export interface OutlierResult {
  isOutlier: boolean;
  deviation: number; // signed percentage from median (e.g. -0.42 = 42% below)
  expectedRange: { min: number; max: number };
  median: number | null;
  sampleSize: number;
}

export interface PriceSuggestion {
  suggestedMin: number | null;
  suggestedMax: number | null;
  suggestedAvg: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sampleSize: number;
}

// ── Stats helpers (copied from price-intelligence.ts) ──────────────────

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function computeStats(values: number[]): Omit<PriceStats, "currency"> {
  if (values.length === 0) {
    return { avg: null, min: null, max: null, median: null, count: 0, p25: null, p75: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  return {
    avg: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1] ?? null,
    median: median(sorted),
    count: sorted.length,
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}

// ── Helpers for BigInt → Number conversion ──────────────────────────────
// PriceObservation.askingPrice is BigInt? — we convert to Number for
// the stats helpers. This is safe for any realistic machine price
// (< 2^53, which is ~9 quadrillion Toman — far above any machine price).

function bigIntToNumber(v: bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

// ── Public API (4 readers, all read from PriceObservation) ──────────────

/**
 * Compute aggregate price stats over PriceObservation rows.
 *
 * Filters (all optional): productId, categoryId, brandId, year.
 * Returns avg / min / max / median / count / p25 / p75 / currency.
 * When no records match, returns a stats object with null fields
 * and count=0.
 *
 * NOTE: reads askingPrice (BigInt) from PriceObservation — converted
 * to Number for stats computation.
 */
export async function getPriceStats(params: {
  productId?: string;
  categoryId?: string;
  brandId?: string;
  year?: number;
}): Promise<PriceStats> {
  const where: Record<string, unknown> = {};
  if (params.productId) where.productId = params.productId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.brandId) where.brandId = params.brandId;
  if (params.year) where.year = params.year;

  const rows = await db.priceObservation.findMany({
    where,
    select: { askingPrice: true },
  });

  // Filter out null askingPrice, convert BigInt → Number
  const values: number[] = [];
  for (const r of rows) {
    const n = bigIntToNumber(r.askingPrice);
    if (n !== null) values.push(n);
  }

  const stats = computeStats(values);
  return { ...stats, currency: "IRR" };
}

/**
 * Monthly timeseries of median price + range + count.
 *
 * `months` (default 12) caps how far back we look. Each point is
 * keyed by `YYYY-MM` (Gregorian). Months with no data are gap-filled
 * with {medianPrice: null, count: 0, range: null} so charts show
 * continuous timeline.
 *
 * STEP 6B.5: Ported from price-engine.ts to price-history-engine.ts
 * (canonical module). This richer version (median + range + gap-fill
 * + PUBLISHED listings fold-in) replaces the simpler avg-only version.
 *
 * Reads askingPrice (BigInt) from PriceObservation + price (BigInt)
 * from PUBLISHED Listings. Both are converted to Number for stats.
 */
export async function getPriceHistory(params: {
  brandId?: string | null;
  categoryId?: string | null;
  modelId?: string | null;
  productId?: string;
  months?: number;
}): Promise<PriceHistoryPoint[]> {
  const months = Math.max(1, Math.min(36, params.months ?? 12));
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // ── 1. Fetch PriceObservation rows (canonical) ──
  const obsWhere: Record<string, unknown> = { observedAt: { gte: since } };
  if (params.brandId) obsWhere.brandId = params.brandId;
  if (params.categoryId) obsWhere.categoryId = params.categoryId;
  if (params.modelId) obsWhere.modelId = params.modelId;
  if (params.productId) obsWhere.productId = params.productId;

  const obs = await db.priceObservation.findMany({
    where: obsWhere,
    select: { askingPrice: true, observedAt: true },
    take: 2000,
    orderBy: { observedAt: "asc" },
  });

  // ── 2. Also fold in PUBLISHED listings whose createdAt falls in window ──
  // These are first-class price observations too.
  const listingWhere: Record<string, unknown> = {
    status: "PUBLISHED",
    price: { not: null },
    createdAt: { gte: since },
  };
  if (params.brandId) listingWhere.brandId = params.brandId;
  if (params.categoryId) listingWhere.categoryId = params.categoryId;
  if (params.modelId) listingWhere.modelId = params.modelId;

  const listings = await db.listing.findMany({
    where: listingWhere,
    select: { price: true, createdAt: true },
    take: 2000,
    orderBy: { createdAt: "asc" },
  });

  // ── 3. Bucket by month ──
  type Bucket = { prices: number[] };
  const buckets = new Map<string, Bucket>();
  const ensure = (k: string): Bucket => {
    const b = buckets.get(k);
    if (b) return b;
    const nb: Bucket = { prices: [] };
    buckets.set(k, nb);
    return nb;
  };
  const keyOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (const o of obs) {
    if (!o.askingPrice) continue;
    ensure(keyOf(o.observedAt)).prices.push(Number(o.askingPrice));
  }
  for (const l of listings) {
    if (!l.price) continue;
    ensure(keyOf(l.createdAt)).prices.push(Number(l.price));
  }

  // ── 4. Build gap-filled sorted list ──
  const out: PriceHistoryPoint[] = [];
  const cursor = new Date(since);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const now = new Date();
  while (cursor <= now) {
    const key = keyOf(cursor);
    const b = buckets.get(key);
    if (b && b.prices.length > 0) {
      const sorted = b.prices.sort((a, b2) => a - b2);
      const med = median(sorted) ?? null;
      const min = sorted[0] ?? null;
      const max = sorted[sorted.length - 1] ?? null;
      out.push({
        month: key,
        medianPrice: med,
        count: sorted.length,
        range:
          min != null && max != null ? ([min, max] as [number, number]) : null,
      });
    } else {
      out.push({ month: key, medianPrice: null, count: 0, range: null });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/**
 * Compare a listing's price to the category+brand baseline.
 *
 * The baseline is computed from PriceObservation rows that share the
 * listing's categoryId+brandId (and year if available). The
 * detector uses a robust range = [p25 - 1.5*IQR, p75 + 1.5*IQR]
 * (Tukey's fence); anything outside the fence is an outlier.
 *
 * `deviation` is signed: negative = below median (potential
 * opportunity), positive = above median (potential overprice).
 *
 * NOTE: reads askingPrice from PriceObservation.
 */
export async function detectOutliers(listingId: string): Promise<OutlierResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, price: true, categoryId: true, brandId: true, year: true },
  });
  if (!listing || !listing.price) {
    return {
      isOutlier: false,
      deviation: 0,
      expectedRange: { min: 0, max: 0 },
      median: null,
      sampleSize: 0,
    };
  }

  const where: Record<string, unknown> = {};
  if (listing.categoryId) where.categoryId = listing.categoryId;
  if (listing.brandId) where.brandId = listing.brandId;
  if (listing.year) where.year = listing.year;

  const rows = await db.priceObservation.findMany({
    where,
    select: { askingPrice: true },
  });

  // Filter nulls + convert BigInt → Number
  const values: number[] = [];
  for (const r of rows) {
    const n = bigIntToNumber(r.askingPrice);
    if (n !== null) values.push(n);
  }

  if (values.length < 3) {
    const p = Number(listing.price);
    return {
      isOutlier: false,
      deviation: 0,
      expectedRange: { min: p, max: p },
      median: p,
      sampleSize: values.length,
    };
  }

  const sorted = values.sort((a, b) => a - b);
  const med = median(sorted) ?? 0;
  const p25 = percentile(sorted, 0.25) ?? med;
  const p75 = percentile(sorted, 0.75) ?? med;
  const iqr = p75 - p25;
  const lo = p25 - 1.5 * iqr;
  const hi = p75 + 1.5 * iqr;

  const price = Number(listing.price);
  const isOutlier = price < lo || price > hi;
  const deviation = med > 0 ? (price - med) / med : 0;

  return {
    isOutlier,
    deviation,
    expectedRange: { min: Math.max(0, lo), max: hi },
    median: med,
    sampleSize: sorted.length,
  };
}

/**
 * Suggest a price range for a seller creating a listing in a given
 * category+brand (+optional year+condition).
 *
 * Confidence:
 *   HIGH    — sampleSize >= 10 AND p25/p75 not degenerate
 *   MEDIUM  — sampleSize >= 5
 *   LOW     — sampleSize >= 1
 *   (suggested fields null when sampleSize === 0)
 *
 * The suggested range is [p25, p75]; suggestedAvg is the mean.
 *
 * NOTE: reads askingPrice from PriceObservation.
 */
export async function getPriceSuggestions(params: {
  categoryId: string;
  brandId?: string;
  year?: number;
  condition?: string;
}): Promise<PriceSuggestion> {
  const where: Record<string, unknown> = { categoryId: params.categoryId };
  if (params.brandId) where.brandId = params.brandId;
  if (params.year) where.year = params.year;
  if (params.condition) where.condition = params.condition;

  const rows = await db.priceObservation.findMany({
    where,
    select: { askingPrice: true },
  });

  // Filter nulls + convert BigInt → Number
  const values: number[] = [];
  for (const r of rows) {
    const n = bigIntToNumber(r.askingPrice);
    if (n !== null) values.push(n);
  }

  if (values.length === 0) {
    return {
      suggestedMin: null,
      suggestedMax: null,
      suggestedAvg: null,
      confidence: "LOW",
      sampleSize: 0,
    };
  }

  const sorted = values.sort((a, b) => a - b);
  const stats = computeStats(sorted);
  let confidence: PriceSuggestion["confidence"] = "LOW";
  if (sorted.length >= 10) confidence = "HIGH";
  else if (sorted.length >= 5) confidence = "MEDIUM";

  return {
    suggestedMin: stats.p25,
    suggestedMax: stats.p75,
    suggestedAvg: stats.avg,
    confidence,
    sampleSize: sorted.length,
  };
}
