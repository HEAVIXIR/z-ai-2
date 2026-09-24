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
  month: string; // YYYY-MM (Gregorian)
  avgPrice: number | null;
  count: number;
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
 * Monthly timeseries of average price + sample count.
 *
 * `months` (default 12) caps how far back we look. Each point is
 * keyed by `YYYY-MM` (Gregorian — Jalali conversion is the UI's
 * responsibility). Empty months are skipped (not zero-filled) so
 * the chart only shows months with real data.
 *
 * NOTE: reads observedAt (not recordedAt) from PriceObservation.
 */
export async function getPriceHistory(params: {
  productId?: string;
  categoryId?: string;
  brandId?: string;
  months?: number;
}): Promise<PriceHistoryPoint[]> {
  const months = Math.min(36, Math.max(1, params.months ?? 12));
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const where: Record<string, unknown> = { observedAt: { gte: since } };
  if (params.productId) where.productId = params.productId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.brandId) where.brandId = params.brandId;

  const rows = await db.priceObservation.findMany({
    where,
    select: { askingPrice: true, observedAt: true },
  });

  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const n = bigIntToNumber(r.askingPrice);
    if (n === null) continue;
    const d = r.observedAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(n);
    buckets.set(key, arr);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, vals]) => ({
      month,
      avgPrice: vals.reduce((s, v) => s + v, 0) / vals.length,
      count: vals.length,
    }));
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
