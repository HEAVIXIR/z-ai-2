/**
 * HEAVIX — Lead Score v1 (PR-SC-01, ADR-005 §5 analog for leads)
 * =================================================================
 * Deterministic, versioned, explainable lead-prioritization score.
 *
 * Design constraints (from STEP 11.29 /analyst + /ceo directives):
 *   - DETERMINISTIC: same input → same score, always. No RNG, no model
 *     drift. This is v1; ML is explicitly deferred (documented in
 *     docs/product/STORE-ANALYTICS-BI.md §6) and must not ship in v1.
 *   - VERSIONED: the `version` field ("v1") lets future algorithms
 *     coexist; cached scores are invalidated by version mismatch.
 *   - EXPLAINABLE: every score carries a per-factor breakdown + a
 *     human-readable reason string so a seller can understand WHY a
 *     lead is "Hot" and correct it (override path is audited).
 *   - NO MUTATION: this module is a pure function. It never reads or
 *     writes the DB. The caller (PR-SC-06 recalc job / API handler)
 *     assembles the input from permitted data and persists the result.
 *   - PERMITTED DATA ONLY: every factor maps to a field the seller's
 *     company already owns (Lead + its Listing). No cross-seller data,
 *     no PII inference, no behavioral tracking beyond what the Lead
 *     row itself records.
 *
 * Factor weights (sum = 100):
 *   L1 leadType        35  (signal strength of the contact intent)
 *   L2 recency         20  (freshness decay)
 *   L3 note length     10  (engagement depth)
 *   L4 repeat buyer    10  (viewer has multiple leads on this seller)
 *   L5 price band      15  (lead targets a high-value listing)
 *   L6 listing heat    10  (the listing itself draws attention)
 *
 * @module crm/lead-score
 */

export const LEAD_SCORE_VERSION = "v1";

// ── L1: leadType signal weights (35 pts max) ──
// Ordered by commercial intent. OFFER = buyer named a price (strongest).
// VIEW = anonymous page view (weakest). Unknown types get the floor (5)
// so a new leadType never silently inflates the score.
const LEAD_TYPE_WEIGHTS: Record<string, number> = {
  OFFER: 35,
  CALL: 28,
  MESSAGE: 22,
  CONTACT: 18,
  FAVORITE: 10,
  VIEW: 5,
};
const LEAD_TYPE_FLOOR = 5;

export type LeadScoreInput = {
  /** Lead.leadType (e.g. "OFFER", "CALL", "VIEW"). Case-insensitive. */
  leadType: string;
  /** Lead.createdAt — when the lead was captured. */
  createdAt: Date;
  /** Lead.note — free-text the buyer left (null = no note). */
  note: string | null;
  /**
   * L4: how many leads this viewer (identified by viewerPhone) has
   * previously submitted on THIS seller's listings. The caller computes
   * this via a scoped count (seller-scoped, phone-equality). 0 = first
   * contact. Provided by caller to keep this module DB-free.
   */
  viewerLeadCountForSeller: number;
  /**
   * L5: the listing's price in a normalized unit (USD). The caller
   * converts Listing.price (BigInt) → number. null = price hidden /
   * "contact for price".
   */
  listingPriceUsd: number | null;
  /**
   * L5: the seller's price quartiles (q1, q3) computed from their
   * PUBLISHED listings. null = fewer than ~4 listings → insufficient
   * data → neutral middle band (8 pts).
   */
  sellerPriceQuartiles: { q1: number; q3: number } | null;
  /** L6: Listing.viewCount. */
  listingViewCount: number;
  /** L6: Listing.favoriteCount. */
  listingFavoriteCount: number;
  /**
   * Optional "now" override for deterministic tests. Defaults to
   * `new Date()` in production.
   */
  now?: Date;
};

export type LeadScoreFactor = {
  /** Factor code, e.g. "L1_leadType". */
  factor: string;
  /** Points awarded for this factor. */
  points: number;
  /** Maximum possible points for this factor. */
  max: number;
  /** Human-readable detail (used to build the reason string). */
  detail: string;
};

export type LeadScoreResult = {
  /** 0–100, clamped. */
  score: number;
  /** Algorithm version, e.g. "v1". */
  version: string;
  /** Per-factor breakdown for explainability + UI rendering. */
  breakdown: LeadScoreFactor[];
  /** Single human-readable reason string (Persian-friendly). */
  reason: string;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── L2: recency (20 pts max) ──
function recencyPoints(ageDays: number): { points: number; detail: string } {
  if (ageDays <= 1) return { points: 20, detail: `≤24h old (${ageDays.toFixed(1)}d)` };
  if (ageDays <= 3) return { points: 15, detail: `24–72h old (${ageDays.toFixed(1)}d)` };
  if (ageDays <= 7) return { points: 10, detail: `3–7d old (${ageDays.toFixed(1)}d)` };
  if (ageDays <= 30) return { points: 5, detail: `8–30d old (${ageDays.toFixed(1)}d)` };
  return { points: 0, detail: `>30d old (${ageDays.toFixed(1)}d)` };
}

// ── L3: note engagement (10 pts max) ──
function notePoints(note: string | null): { points: number; detail: string } {
  if (!note || note.trim().length === 0) return { points: 0, detail: "no note" };
  const len = note.trim().length;
  if (len <= 20) return { points: 4, detail: `short note (${len}ch)` };
  if (len <= 100) return { points: 7, detail: `medium note (${len}ch)` };
  return { points: 10, detail: `detailed note (${len}ch)` };
}

// ── L4: repeat buyer (10 pts max) ──
function repeatBuyerPoints(count: number): { points: number; detail: string } {
  if (count <= 1) return { points: 4, detail: `first contact (${count} lead)` };
  if (count <= 3) return { points: 7, detail: `returning buyer (${count} leads)` };
  return { points: 10, detail: `frequent buyer (${count} leads)` };
}

// ── L5: price band (15 pts max) ──
function priceBandPoints(
  price: number | null,
  q: { q1: number; q3: number } | null,
): { points: number; detail: string } {
  if (price === null) return { points: 8, detail: "price hidden (neutral band)" };
  if (q === null) return { points: 8, detail: "insufficient seller data for quartiles (neutral band)" };
  if (price >= q.q3) return { points: 15, detail: `top-quartile price ($${price.toLocaleString()} ≥ Q3 $${q.q3.toLocaleString()})` };
  if (price >= q.q1) return { points: 10, detail: `mid-quartile price ($${price.toLocaleString()})` };
  return { points: 5, detail: `bottom-quartile price ($${price.toLocaleString()} < Q1 $${q.q1.toLocaleString()})` };
}

// ── L6: listing heat (10 pts max) ──
function listingHeatPoints(
  views: number,
  favorites: number,
): { points: number; detail: string } {
  if (views > 100 || favorites > 10) {
    return { points: 10, detail: `hot listing (${views} views, ${favorites} favorites)` };
  }
  if (views > 20) return { points: 6, detail: `warm listing (${views} views, ${favorites} favorites)` };
  return { points: 3, detail: `cold listing (${views} views, ${favorites} favorites)` };
}

/**
 * Compute the deterministic Lead Score v1.
 *
 * Pure function: no side effects, no I/O. Safe to call from any context
 * (API route, background job, test). The caller is responsible for
 * (a) assembling the input from permitted, seller-scoped data, and
 * (b) persisting the result (Lead.score / scoreVersion / scoreBreakdown /
 * scoredAt) through the normal audited mutation path.
 */
export function computeLeadScore(input: LeadScoreInput): LeadScoreResult {
  const now = (input.now ?? new Date()).getTime();
  const ageMs = now - input.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // L1 — leadType
  const l1Weight = LEAD_TYPE_WEIGHTS[(input.leadType || "").toUpperCase()] ?? LEAD_TYPE_FLOOR;
  const l1: LeadScoreFactor = {
    factor: "L1_leadType",
    points: l1Weight,
    max: 35,
    detail: `leadType="${input.leadType}" → ${l1Weight}/35`,
  };

  // L2 — recency
  const l2r = recencyPoints(ageDays);
  const l2: LeadScoreFactor = { factor: "L2_recency", points: l2r.points, max: 20, detail: l2r.detail };

  // L3 — note
  const l3r = notePoints(input.note);
  const l3: LeadScoreFactor = { factor: "L3_note", points: l3r.points, max: 10, detail: l3r.detail };

  // L4 — repeat buyer
  const l4r = repeatBuyerPoints(input.viewerLeadCountForSeller);
  const l4: LeadScoreFactor = { factor: "L4_repeatBuyer", points: l4r.points, max: 10, detail: l4r.detail };

  // L5 — price band
  const l5r = priceBandPoints(input.listingPriceUsd, input.sellerPriceQuartiles);
  const l5: LeadScoreFactor = { factor: "L5_priceBand", points: l5r.points, max: 15, detail: l5r.detail };

  // L6 — listing heat
  const l6r = listingHeatPoints(input.listingViewCount, input.listingFavoriteCount);
  const l6: LeadScoreFactor = { factor: "L6_listingHeat", points: l6r.points, max: 10, detail: l6r.detail };

  const breakdown = [l1, l2, l3, l4, l5, l6];
  const raw = breakdown.reduce((sum, f) => sum + f.points, 0);
  const score = clamp(raw, 0, 100);

  // Human-readable reason (English; UI localizes). Lists the top 2
  // contributing factors so a seller sees WHY this lead is prioritized.
  const topFactors = [...breakdown].sort((a, b) => b.points / b.max - a.points / a.max).slice(0, 2);
  const reason =
    `Lead Score ${score}/100 (v1). ` +
    `Strongest signals: ${topFactors[0].factor} (${topFactors[0].detail}); ${topFactors[1].factor} (${topFactors[1].detail}). ` +
    `Override available via PATCH with a reason.`;

  return { score, version: LEAD_SCORE_VERSION, breakdown, reason };
}

/**
 * Band label for UI badges. Deterministic from the score.
 *   ≥70 = HOT, 40–69 = WARM, <40 = COLD
 */
export function leadScoreBand(score: number): "HOT" | "WARM" | "COLD" {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}
