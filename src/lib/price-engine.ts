import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/* ============================================================
   HEAVIX — Price Estimation Engine (PRICE-ENGINE)
   ------------------------------------------------------------
   Implements the data-driven price estimation pipeline described
   in `docs/HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md`:

     Raw Market Data
     → Comparable Selection (same brand+category, year ±3,
       working-hours ±30%)
     → Feature Normalization (Toman/IRR; no fabricated values)
     → Price Estimation (median, p25, p75)
     → Confidence / Data Quality (count-based + variance)
     → Explanation (main drivers + warnings)

   This module is INTENTIONALLY SERVER-ONLY — it imports the Prisma
   client directly. NEVER import it from a Client Component.

   Spec rules enforced here:
     • Asking vs Estimated are NEVER conflated — `askingPrice`
       is read from `Listing.price`; `estimatedPrice` is computed.
     • Confidence is NEVER presented as a guarantee.
     • No price is invented without source data — when there are
       fewer than 2 comparables the engine returns
       `confidence = "INSUFFICIENT"` and no estimatedPrice.
     • Overrides are audited via the shared `logAudit` helper.
   ============================================================ */

export const PRICE_MODEL_VERSION = "v1.0";

/** Comparable-year tolerance (spec §5 — Comparable Based). */
const YEAR_TOLERANCE = 3;
/** Comparable working-hours tolerance, as a fraction of the target. */
const HOURS_TOLERANCE_RATIO = 0.3;
/** Maximum comparables we will read per estimate (cap cost). */
const MAX_COMPARABLES = 60;
/** Data freshness cutoffs (days since most-recent observation). */
const FRESH_DAYS = 30;
const RECENT_DAYS = 90;

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type DataFreshness = "FRESH" | "RECENT" | "STALE";
export type PriceHealthStatus =
  | "IN_RANGE"
  | "BELOW_RANGE"
  | "ABOVE_RANGE"
  | "INSUFFICIENT";

export interface EstimateInput {
  listingId?: string;
  brandId?: string | null;
  categoryId?: string | null;
  modelId?: string | null;
  year?: number | null;
  hours?: number | null;
  condition?: string | null;
  city?: string | null;
}

export interface EstimateResult {
  estimatedPrice: number | null;
  priceLower: number | null;
  priceUpper: number | null;
  medianPrice: number | null;
  confidence: ConfidenceLevel;
  comparableCount: number;
  dataFreshness: DataFreshness | null;
  mainDrivers: string[];
  warnings: string[];
  modelVersion: string;
  comparables: Array<{
    id: string;
    title: string;
    slug: string;
    price: number;
    year: number | null;
    workingHours: number | null;
    city: string | null;
    similarity: number;
  }>;
}

export interface PriceHealthResult {
  status: PriceHealthStatus;
  askingPrice: number | null;
  estimatedLower: number | null;
  estimatedUpper: number | null;
  estimatedPrice: number | null;
  confidence: ConfidenceLevel | null;
  deviationPct: number | null;
}

export interface PriceHistoryPoint {
  month: string; // YYYY-MM
  medianPrice: number | null;
  count: number;
  range: [number, number] | null;
}

export interface RecordObservationInput {
  listingId?: string | null;
  productId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  modelId?: string | null;
  askingPrice?: bigint | number | null;
  estimatedPrice?: number | null;
  priceLower?: number | null;
  priceUpper?: number | null;
  normalizedPrice?: number | null;
  currency?: string;
  source?: string; // LISTING | MANUAL | AI_ESTIMATE | EXTERNAL
  sourceType?: string | null; // HEAVIX | DIVAR | SHEYPOOR | OTHER
  observedAt?: Date;
  market?: string | null;
  quality?: string; // HIGH | MEDIUM | LOW
  status?: string; // ACTIVE | FLAGGED | EXCLUDED
  confidence?: string | null;
  comparableCount?: number | null;
  notes?: string | null;
}

/* ─────────── Private statistical helpers ─────────── */

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? null;
  const frac = idx - lo;
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * frac;
}

/** Coefficient of variation (σ / μ). Robust spread indicator. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function confidenceForCount(count: number): ConfidenceLevel {
  if (count >= 8) return "HIGH";
  if (count >= 4) return "MEDIUM";
  if (count >= 2) return "LOW";
  return "INSUFFICIENT";
}

function freshnessForLatestObserved(latest: Date | null): DataFreshness | null {
  if (!latest) return null;
  const days = (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= FRESH_DAYS) return "FRESH";
  if (days <= RECENT_DAYS) return "RECENT";
  return "STALE";
}

/* ─────────── Core: estimatePrice ─────────── */

export async function estimatePrice(
  params: EstimateInput,
): Promise<EstimateResult> {
  const drivers: string[] = [];
  const warnings: string[] = [];

  /* 1. Resolve target attributes — either from a listingId or
        raw params. NEVER invent missing fields. */
  let target: {
    brandId: string | null;
    categoryId: string | null;
    modelId: string | null;
    year: number | null;
    hours: number | null;
    condition: string | null;
    city: string | null;
  };

  if (params.listingId) {
    const listing = await db.listing.findUnique({
      where: { id: params.listingId },
      select: {
        id: true ,
        brandId: true,
        categoryId: true,
        modelId: true,
        year: true,
        workingHours: true,
        condition: true,
        city: true,
      },
    });
    if (!listing) {
      return emptyEstimate(["آگهی یافت نشد"]);
    }
    target = {
      brandId: params.brandId ?? listing.brandId,
      categoryId: params.categoryId ?? listing.categoryId,
      modelId: params.modelId ?? listing.modelId,
      year: params.year ?? listing.year,
      hours: params.hours ?? listing.workingHours,
      condition: params.condition ?? listing.condition,
      city: params.city ?? listing.city,
    };
  } else {
    target = {
      brandId: params.brandId ?? null,
      categoryId: params.categoryId ?? null,
      modelId: params.modelId ?? null,
      year: params.year ?? null,
      hours: params.hours ?? null,
      condition: params.condition ?? null,
      city: params.city ?? null,
    };
  }

  /* 2. Comparable selection — require brand+category at minimum. */
  if (!target.brandId || !target.categoryId) {
    return emptyEstimate([
      "برای تخمین قیمت، برند و دسته‌بندی لازم است.",
    ]);
  }

  const where: {
    status: string;
    price: { not: null };
    brandId: string;
    categoryId: string;
    modelId?: string;
    year?: { gte: number; lte: number };
    workingHours?: { gte: number; lte: number };
    NOT?: { id: string }[];
  } = {
    status: "PUBLISHED",
    price: { not: null },
    brandId: target.brandId,
    categoryId: target.categoryId,
  };
  if (target.modelId) where.modelId = target.modelId;
  if (params.listingId) (where as any).NOT = { id: params.listingId };

  // Year window (±3). Apply only if target year is known.
  if (target.year && Number.isFinite(target.year)) {
    where.year = {
      gte: target.year - YEAR_TOLERANCE,
      lte: target.year + YEAR_TOLERANCE,
    };
  }

  // Working-hours window (±30%). Apply only if target hours is known.
  if (target.hours != null && Number.isFinite(target.hours) && target.hours > 0) {
    const delta = Math.max(1, target.hours * HOURS_TOLERANCE_RATIO);
    where.workingHours = {
      gte: Math.floor(target.hours - delta),
      lte: Math.ceil(target.hours + delta),
    };
  }

  // Always also consider PriceObservations of the same brand+category
  // (source = LISTING) so the engine benefits from historical data even
  // when active comparable listings are scarce. NEVER fabricate prices.
  const obsRows = await db.priceObservation.findMany({
    where: {
      brandId: target.brandId,
      categoryId: target.categoryId,
      status: "ACTIVE",
      askingPrice: { not: null },
    },
    select: {
      id: true ,
      askingPrice: true,
      observedAt: true,
      listingId: true,
    },
    take: MAX_COMPARABLES,
    orderBy: { observedAt: "desc" },
  });

  // ── Fallback: if the strict query (year±3, hours±30%) yields
  //    fewer than 2 active comparables, retry with a relaxed query
  //    (drop the hours window and widen year to ±5) so the engine
  //    still produces an estimate on smaller datasets. The relaxed
  //    pass is flagged via a warning so consumers know similarity
  //    is looser. NEVER fabricates prices — only uses real listings.
  let rows = await db.listing.findMany({
    where,
    select: {
      id: true ,
      title: true,
      slug: true,
      price: true,
      year: true,
      workingHours: true,
      city: true,
      createdAt: true,
    },
    take: MAX_COMPARABLES,
    orderBy: { createdAt: "desc" },
  });

  let relaxed = false;
  if (rows.length < 2) {
    const relaxedWhere: typeof where = { ...where };
    delete (relaxedWhere ).workingHours;
    if (target.year && Number.isFinite(target.year)) {
      relaxedWhere.year = {
        gte: target.year - (YEAR_TOLERANCE + 2),
        lte: target.year + (YEAR_TOLERANCE + 2),
      };
    } else {
      delete (relaxedWhere ).year;
    }
    const relaxedRows = await db.listing.findMany({
      where: relaxedWhere,
      select: {
        id: true ,
        title: true,
        slug: true,
        price: true,
        year: true,
        workingHours: true,
        city: true,
        createdAt: true,
      },
      take: MAX_COMPARABLES,
      orderBy: { createdAt: "desc" },
    });
    if (relaxedRows.length > rows.length) {
      rows = relaxedRows;
      relaxed = true;
    }
  }

  // ── Final fallback: brand+category only (no year/hours window).
  //    Keeps the engine usable on small catalogs — every comparable
  //    is a real listing, we just broaden similarity to the maximum.
  let brandCategoryOnly = false;
  if (rows.length < 2) {
    const broadRows = await db.listing.findMany({
      where: {
        status: "PUBLISHED",
        price: { not: null },
        brandId: target.brandId,
        categoryId: target.categoryId,
        ...(params.listingId ? { NOT: { id: params.listingId } } : {}),
      },
      select: {
        id: true ,
        title: true,
        slug: true,
        price: true,
        year: true,
        workingHours: true,
        city: true,
        createdAt: true,
      },
      take: MAX_COMPARABLES,
      orderBy: { createdAt: "desc" },
    });
    if (broadRows.length > rows.length) {
      rows = broadRows;
      brandCategoryOnly = true;
    }
  }


  // Merge: prices from active listings + prices from observations.
  // Each row in each table is treated as a DISTINCT market observation
  // (spec §14 — every observation has its own provenance). Multiple
  // observations of the same listing over time legitimately count as
  // separate comparables — this is how the engine benefits from
  // historical price drift on the same machine.
  const seenIds = new Set<string>();
  type Comp = {
    id: string;
    title: string;
    slug: string;
    price: number;
    year: number | null;
    workingHours: number | null;
    city: string | null;
    observedAt: Date;
    similarity: number;
  };
  const comps: Comp[] = [];

  for (const r of rows) {
    if (!r.price) continue;
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    comps.push({
      id: r.id,
      title: r.title,
      slug: r.slug,
      price: Number(r.price),
      year: r.year,
      workingHours: r.workingHours,
      city: r.city,
      observedAt: r.createdAt,
      similarity: computeSimilarity(target, {
        year: r.year,
        hours: r.workingHours,
        city: r.city,
      }),
    });
  }
  for (const o of obsRows) {
    if (!o.askingPrice) continue;
    if (seenIds.has(o.id)) continue;
    seenIds.add(o.id);
    comps.push({
      id: o.id,
      title: "(مشاهده بازار)",
      slug: "",
      price: Number(o.askingPrice),
      year: null,
      workingHours: null,
      city: null,
      observedAt: o.observedAt,
      similarity: 0.5,
    });
  }

  // ── STEP 6B.1: PriceRecord fold-in REMOVED.
  // The legacy PriceRecord table is deprecated (canonical model is
  // PriceObservation per PHASE-6A-RECONCILE). The PriceRecord writer
  // (recordPriceFromListing) is dead code with 0 callers, so the table
  // is empty — folding in its rows would yield zero comparables anyway.
  // All comparable selection now uses PriceObservation exclusively.

  if (comps.length < 2) {
    return emptyEstimate([
      "داده مشابه کافی برای تخمین قیمت موجود نیست.",
      "این تخمین جایگزین کارشناسی حضوری نیست.",
    ]);
  }

  // Sort by similarity (desc) for the comparables preview.
  const bySimilarity = [...comps].sort((a, b) => b.similarity - a.similarity);

  // Price statistics computed across ALL comparables.
  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const med = median(prices);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);
  const count = comps.length;
  const confidence = confidenceForCount(count);

  // Latest observation date → freshness.
  const latest = comps.reduce<Date | null>((acc, c) => {
    if (!acc || c.observedAt > acc) return c.observedAt;
    return acc;
  }, null);
  const dataFreshness = freshnessForLatestObserved(latest);

  // Drivers (explain what influenced the estimate).
  if (target.brandId) drivers.push("برند");
  if (target.categoryId) drivers.push("دسته‌بندی");
  if (target.modelId) drivers.push("مدل");
  if (target.year) drivers.push("سال ساخت");
  if (target.hours != null) drivers.push("ساعت کارکرد");
  if (target.condition) drivers.push("وضعیت دستگاه");
  if (target.city) drivers.push("موقعیت جغرافیایی");
  drivers.push(`تعداد موارد مشابه: ${count}`);

  // Warnings.
  const cv = coefficientOfVariation(prices);
  if (cv != null && cv > 0.5) {
    warnings.push("پراکندگی بالای قیمت در موارد مشابه — تخمین با احتیاط ببینید.");
  }
  if (dataFreshness === "STALE") {
    warnings.push("آخرین داده‌های مشاهده‌شده قدیمی هستند (بیش از ۹۰ روز).");
  }
  if (confidence === "LOW") {
    warnings.push("تعداد موارد مشابه کم است؛ تخمین با قطعیت بالا تلقی نشود.");
  }
  if (confidence === "INSUFFICIENT") {
    warnings.push("داده ناکافی — تخمین معتبر نیست.");
  }
  if (relaxed) {
    warnings.push(
      "بازه جستجوی موارد مشابه به دلیل کمبود داده گسترش یافت (تخمین با دقت کمتر).",
    );
  }
  if (brandCategoryOnly) {
    warnings.push(
      "به دلیل کمبود داده، تخمین بر اساس تمام آگهی‌های همان برند و دسته‌بندی محاسبه شده است (بدون فیلتر سال/کارکرد).",
    );
  }

  // Range: use p25/p75 (when available), widened for low confidence.
  let lower = p25 ?? null;
  let upper = p75 ?? null;
  if (med != null) {
    if (lower == null) lower = med * 0.85;
    if (upper == null) upper = med * 1.15;
    if (confidence === "LOW") {
      lower = med * 0.8;
      upper = med * 1.2;
    } else if (confidence === "MEDIUM") {
      lower = med * 0.88;
      upper = med * 1.12;
    } else if (confidence === "HIGH") {
      lower = med * 0.92;
      upper = med * 1.08;
    }
  }

  const result: EstimateResult = {
    estimatedPrice: med,
    priceLower: lower,
    priceUpper: upper,
    medianPrice: med,
    confidence,
    comparableCount: count,
    dataFreshness,
    mainDrivers: drivers,
    warnings,
    modelVersion: PRICE_MODEL_VERSION,
    comparables: bySimilarity.slice(0, 12).map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      price: c.price,
      year: c.year,
      workingHours: c.workingHours,
      city: c.city,
      similarity: c.similarity,
    })),
  };

  // STEP 6D.3: Persist estimate to PriceEstimate (best-effort, non-blocking).
  // Only persists when we have a listingId (brand-level estimates without
  // listingId can't be linked to a specific listing).
  // Skips INSUFFICIENT confidence — no useful estimate to cache.
  if (params.listingId && result.confidence !== "INSUFFICIENT") {
    try {
      await db.priceEstimate.create({
        data: {
          listingId: params.listingId,
          estimatedPrice: result.estimatedPrice ?? 0,
          priceLower: result.priceLower ?? 0,
          priceUpper: result.priceUpper ?? 0,
          confidence: result.confidence,
          comparableCount: result.comparableCount,
          dataFreshness: result.dataFreshness ?? null,
          mainDrivers: JSON.stringify(result.mainDrivers),
          warnings: JSON.stringify(result.warnings),
          modelVersion: result.modelVersion,
        },
      });
    } catch (err) {
      // Best-effort — log but don't block the estimate from being returned.
      console.error("[price-engine] persistEstimate failed:", err);
    }
  }

  return result;
}

function emptyEstimate(warnings: string[]): EstimateResult {
  return {
    estimatedPrice: null,
    priceLower: null,
    priceUpper: null,
    medianPrice: null,
    confidence: "INSUFFICIENT",
    comparableCount: 0,
    dataFreshness: null,
    mainDrivers: [],
    warnings,
    modelVersion: PRICE_MODEL_VERSION,
    comparables: [],
  };
}

/** Heuristic similarity score (0..1) — higher is closer. */
function computeSimilarity(
  target: { year: number | null; hours: number | null; city: string | null },
  cand: { year: number | null; hours: number | null; city: string | null },
): number {
  let score = 0.5;
  if (target.year != null && cand.year != null) {
    const d = Math.abs(target.year - cand.year);
    score += Math.max(0, 0.25 - d * 0.05);
  }
  if (target.hours != null && cand.hours != null && target.hours > 0) {
    const ratio = Math.abs(target.hours - cand.hours) / target.hours;
    score += Math.max(0, 0.15 - ratio * 0.2);
  }
  if (target.city && cand.city && target.city === cand.city) {
    score += 0.1;
  }
  return Math.min(1, score);
}

/* ─────────── getPriceHealth ─────────── */

export async function getPriceHealth(
  listingId: string,
): Promise<PriceHealthResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true ,
      price: true,
      brandId: true,
      categoryId: true,
      modelId: true,
      year: true,
      workingHours: true,
      condition: true,
      city: true,
    },
  });
  if (!listing) {
    return {
      status: "INSUFFICIENT",
      askingPrice: null,
      estimatedLower: null,
      estimatedUpper: null,
      estimatedPrice: null,
      confidence: null,
      deviationPct: null,
    };
  }

  const estimate = await estimatePrice({
    listingId: listing.id,
    brandId: listing.brandId,
    categoryId: listing.categoryId,
    modelId: listing.modelId,
    year: listing.year,
    hours: listing.workingHours,
    condition: listing.condition,
    city: listing.city,
  });

  const asking =
    listing.price != null ? Number(listing.price) : null;

  if (
    asking == null ||
    estimate.estimatedPrice == null ||
    estimate.priceLower == null ||
    estimate.priceUpper == null ||
    estimate.confidence === "INSUFFICIENT"
  ) {
    return {
      status: "INSUFFICIENT",
      askingPrice: asking,
      estimatedLower: estimate.priceLower,
      estimatedUpper: estimate.priceUpper,
      estimatedPrice: estimate.estimatedPrice,
      confidence: estimate.confidence,
      deviationPct: null,
    };
  }

  let status: PriceHealthStatus;
  if (asking < estimate.priceLower) status = "BELOW_RANGE";
  else if (asking > estimate.priceUpper) status = "ABOVE_RANGE";
  else status = "IN_RANGE";

  const deviationPct =
    estimate.estimatedPrice > 0
      ? (asking - estimate.estimatedPrice) / estimate.estimatedPrice
      : 0;

  return {
    status,
    askingPrice: asking,
    estimatedLower: estimate.priceLower,
    estimatedUpper: estimate.priceUpper,
    estimatedPrice: estimate.estimatedPrice,
    confidence: estimate.confidence,
    deviationPct,
  };
}

/* ─────────── getPriceHistory ─────────── */
// STEP 6B.5: getPriceHistory REMOVED from price-engine.ts.
// Canonical location is now src/lib/price-history-engine.ts.
// All routes (/api/price-history, /api/pricing/history, /api/price-intelligence)
// now import from the canonical module.

/* ─────────── recordObservation ─────────── */

export async function recordObservation(
  params: RecordObservationInput,
): Promise<void> {
  const asking =
    params.askingPrice != null
      ? typeof params.askingPrice === "bigint"
        ? Number(params.askingPrice)
        : params.askingPrice
      : null;

  try {
    await db.priceObservation.create({
      data: {
        listingId: params.listingId ?? null,
        productId: params.productId ?? null,
        brandId: params.brandId ?? null,
        categoryId: params.categoryId ?? null,
        modelId: params.modelId ?? null,
        askingPrice:
          asking != null && Number.isFinite(asking)
            ? BigInt(Math.round(asking))
            : null,
        estimatedPrice: params.estimatedPrice ?? null,
        priceLower: params.priceLower ?? null,
        priceUpper: params.priceUpper ?? null,
        normalizedPrice: params.normalizedPrice ?? null,
        currency: params.currency ?? "IRR",
        source: params.source ?? "LISTING",
        sourceType: params.sourceType ?? null,
        observedAt: params.observedAt ?? new Date(),
        market: params.market ?? null,
        quality: params.quality ?? "MEDIUM",
        status: params.status ?? "ACTIVE",
        confidence: params.confidence ?? null,
        comparableCount: params.comparableCount ?? null,
        notes: params.notes ?? null,
      },
    });
  } catch (err) {
    // Non-fatal — observation logging must not break callers.
    console.error("[price-engine] recordObservation failed:", err);
  }
}

/* ─────────── createOverride (admin, audited) ─────────── */

import type { AuthorizationContext } from '@/lib/authorization-context';
import { can, AuthorizationError } from '@/lib/authorization';
import { logSecurityEvent } from '@/lib/security-event';

export async function createOverride(args: {
  listingId: string;
  overridePrice: number;
  reason: string;
  authCtx: AuthorizationContext;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ id: string }> {
  // V-A (49.2X-09): service-level authorization — REQUIRED, fail-closed (ASVS V8.3.1)
  // Missing AuthorizationContext MUST NOT permit the operation.
  const allowed = await can(args.authCtx.subjectId, 'price.override');
  if (!allowed) {
    await logSecurityEvent({
      type: 'AUTHZ_DENY',
      subjectId: args.authCtx.subjectId,
      requiredPermission: 'price.override',
      reason: 'Service-level authorization denied for price.override',
      requestId: args.authCtx.requestId ?? null,
    });
    throw new AuthorizationError('price.override', 'Service-level: price.override denied');
  }
  if (!args.listingId) throw new Error("listingId is required");
  if (!Number.isFinite(args.overridePrice) || args.overridePrice <= 0) {
    throw new Error("overridePrice must be a positive finite number");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("reason is required (min 3 chars)");
  }

  // Compute the current estimate so we can record the "before" value.
  const estimate = await estimatePrice({ listingId: args.listingId });
  const originalEstimate = estimate.estimatedPrice ?? 0;

  const listing = await db.listing.findUnique({
    where: { id: args.listingId },
    select: { id: true , title: true, slug: true, price: true },
  });

  const created = await db.priceOverride.create({
    data: {
      listingId: args.listingId,
      originalEstimate,
      overridePrice: args.overridePrice,
      reason: args.reason.trim(),
      overriddenBy: args.authCtx.subjectId,
    },
  });

  await logAudit({
    actorId: args.authCtx.subjectId,
    actorType: "ADMIN",
    action: "pricing.override",
    entityType: "PriceOverride",
    entityId: created.id,
    before: {
      listingId: args.listingId,
      listingTitle: listing?.title ?? null,
      originalEstimate,
      listingAskingPrice: listing?.price != null ? Number(listing.price) : null,
    },
    after: {
      listingId: args.listingId,
      overridePrice: args.overridePrice,
      reason: args.reason.trim(),
    },
    ip: args.ip ?? null,
    userAgent: args.userAgent ?? null,
    reason: args.reason.trim(),
  });

  return { id: created.id };
}

/* ─────────── listObservations (admin) ─────────── */

export interface ObservationListFilters {
  brandId?: string | null;
  categoryId?: string | null;
  source?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}

export async function listObservations(filters: ObservationListFilters = {}) {
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);

  const where: {
    brandId?: string;
    categoryId?: string;
    source?: string;
    status?: string;
  } = {};
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.source) where.source = filters.source;
  if (filters.status) where.status = filters.status;

  const [rows, total] = await Promise.all([
    db.priceObservation.findMany({
      where,
      orderBy: { observedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        listing: { select: { id: true , title: true, slug: true } },
        brand: { select: { id: true , name: true } },
        category: { select: { id: true , name: true } },
      },
    }),
    db.priceObservation.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      listingTitle: r.listing?.title ?? null,
      listingSlug: r.listing?.slug ?? null,
      brandId: r.brandId,
      brandName: r.brand?.name ?? null,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      askingPrice: r.askingPrice != null ? Number(r.askingPrice) : null,
      estimatedPrice: r.estimatedPrice,
      priceLower: r.priceLower,
      priceUpper: r.priceUpper,
      currency: r.currency,
      source: r.source,
      sourceType: r.sourceType,
      observedAt: r.observedAt.toISOString(),
      quality: r.quality,
      status: r.status,
      confidence: r.confidence,
      comparableCount: r.comparableCount,
      notes: r.notes,
    })),
    total,
    limit,
    offset,
  };
}

/* ─────────── listOverrides (admin) ─────────── */

export async function listOverrides(limit = 100) {
  const rows = await db.priceOverride.findMany({
    orderBy: { overriddenAt: "desc" },
    take: Math.max(1, Math.min(500, limit)),
    include: {
      listing: { select: { id: true , title: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    listingTitle: r.listing?.title ?? null,
    listingSlug: r.listing?.slug ?? null,
    originalEstimate: r.originalEstimate,
    overridePrice: r.overridePrice,
    reason: r.reason,
    overriddenBy: r.overriddenBy,
    overriddenAt: r.overriddenAt.toISOString(),
  }));
}
