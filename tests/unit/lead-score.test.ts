import { describe, it, expect } from "vitest";
import { computeLeadScore, leadScoreBand, LEAD_SCORE_VERSION, type LeadScoreInput } from "@/lib/crm/lead-score";

/* ============================================================
   Unit tests for src/lib/crm/lead-score.ts (PR-SC-01)
   ------------------------------------------------------------
   The Lead Score v1 algorithm is a PURE FUNCTION — no DB, no I/O.
   These tests pin its determinism, factor weights, clamping, and
   explainability output so a future algorithm change is forced to
   bump the version (v2) rather than silently drift.
   ============================================================ */

const NOW = new Date("2026-10-09T12:00:00Z");

function baseInput(over: Partial<LeadScoreInput> = {}): LeadScoreInput {
  return {
    leadType: "OFFER",
    createdAt: NOW,
    note: "Interested, can we negotiate?",
    viewerLeadCountForSeller: 1,
    listingPriceUsd: 50000,
    sellerPriceQuartiles: { q1: 30000, q3: 70000 },
    listingViewCount: 150,
    listingFavoriteCount: 12,
    now: NOW,
    ...over,
  };
}

describe("computeLeadScore — determinism", () => {
  it("returns the same score for identical input", () => {
    const a = computeLeadScore(baseInput());
    const b = computeLeadScore(baseInput());
    expect(a.score).toBe(b.score);
    expect(a.breakdown).toEqual(b.breakdown);
    expect(a.reason).toBe(b.reason);
  });

  it("uses the explicit `now` override (no hidden Date.now dependency)", () => {
    const fresh = computeLeadScore(baseInput({ createdAt: NOW }));
    const stale = computeLeadScore(baseInput({ createdAt: new Date("2026-08-01T00:00:00Z") }));
    expect(fresh.score).toBeGreaterThan(stale.score);
  });
});

describe("computeLeadScore — L1 leadType (35 pts)", () => {
  const cases: Array<[string, number]> = [
    ["OFFER", 35],
    ["CALL", 28],
    ["MESSAGE", 22],
    ["CONTACT", 18],
    ["FAVORITE", 10],
    ["VIEW", 5],
  ];
  for (const [type, expected] of cases) {
    it(`OFFER-type "${type}" → ${expected} pts`, () => {
      const r = computeLeadScore(baseInput({ leadType: type }));
      const l1 = r.breakdown.find((f) => f.factor === "L1_leadType")!;
      expect(l1.points).toBe(expected);
    });
  }
  it("case-insensitive (offer == OFFER)", () => {
    const r = computeLeadScore(baseInput({ leadType: "offer" }));
    expect(r.breakdown.find((f) => f.factor === "L1_leadType")!.points).toBe(35);
  });
  it("unknown leadType → floor (5 pts), never 0 or inflated", () => {
    const r = computeLeadScore(baseInput({ leadType: "WIDGET" }));
    expect(r.breakdown.find((f) => f.factor === "L1_leadType")!.points).toBe(5);
  });
});

describe("computeLeadScore — L2 recency (20 pts)", () => {
  it("≤24h → 20 pts", () => {
    const r = computeLeadScore(baseInput({ createdAt: new Date(NOW.getTime() - 12 * 3600 * 1000) }));
    expect(r.breakdown.find((f) => f.factor === "L2_recency")!.points).toBe(20);
  });
  it("24–72h → 15 pts", () => {
    const r = computeLeadScore(baseInput({ createdAt: new Date(NOW.getTime() - 48 * 3600 * 1000) }));
    expect(r.breakdown.find((f) => f.factor === "L2_recency")!.points).toBe(15);
  });
  it("3–7d → 10 pts", () => {
    const r = computeLeadScore(baseInput({ createdAt: new Date(NOW.getTime() - 5 * 24 * 3600 * 1000) }));
    expect(r.breakdown.find((f) => f.factor === "L2_recency")!.points).toBe(10);
  });
  it("8–30d → 5 pts", () => {
    const r = computeLeadScore(baseInput({ createdAt: new Date(NOW.getTime() - 15 * 24 * 3600 * 1000) }));
    expect(r.breakdown.find((f) => f.factor === "L2_recency")!.points).toBe(5);
  });
  it(">30d → 0 pts", () => {
    const r = computeLeadScore(baseInput({ createdAt: new Date(NOW.getTime() - 60 * 24 * 3600 * 1000) }));
    expect(r.breakdown.find((f) => f.factor === "L2_recency")!.points).toBe(0);
  });
});

describe("computeLeadScore — L3 note (10 pts)", () => {
  it("null note → 0", () => {
    const r = computeLeadScore(baseInput({ note: null }));
    expect(r.breakdown.find((f) => f.factor === "L3_note")!.points).toBe(0);
  });
  it("whitespace-only note → 0 (not 4)", () => {
    const r = computeLeadScore(baseInput({ note: "   " }));
    expect(r.breakdown.find((f) => f.factor === "L3_note")!.points).toBe(0);
  });
  it("short note (≤20ch) → 4", () => {
    const r = computeLeadScore(baseInput({ note: "hi" }));
    expect(r.breakdown.find((f) => f.factor === "L3_note")!.points).toBe(4);
  });
  it("medium note (21–100ch) → 7", () => {
    const r = computeLeadScore(baseInput({ note: "x".repeat(50) }));
    expect(r.breakdown.find((f) => f.factor === "L3_note")!.points).toBe(7);
  });
  it("detailed note (>100ch) → 10", () => {
    const r = computeLeadScore(baseInput({ note: "x".repeat(150) }));
    expect(r.breakdown.find((f) => f.factor === "L3_note")!.points).toBe(10);
  });
});

describe("computeLeadScore — L4 repeat buyer (10 pts)", () => {
  it("first contact (≤1) → 4", () => {
    const r = computeLeadScore(baseInput({ viewerLeadCountForSeller: 1 }));
    expect(r.breakdown.find((f) => f.factor === "L4_repeatBuyer")!.points).toBe(4);
  });
  it("returning buyer (2–3) → 7", () => {
    const r = computeLeadScore(baseInput({ viewerLeadCountForSeller: 3 }));
    expect(r.breakdown.find((f) => f.factor === "L4_repeatBuyer")!.points).toBe(7);
  });
  it("frequent buyer (≥4) → 10", () => {
    const r = computeLeadScore(baseInput({ viewerLeadCountForSeller: 5 }));
    expect(r.breakdown.find((f) => f.factor === "L4_repeatBuyer")!.points).toBe(10);
  });
});

describe("computeLeadScore — L5 price band (15 pts)", () => {
  it("hidden price → neutral 8", () => {
    const r = computeLeadScore(baseInput({ listingPriceUsd: null }));
    expect(r.breakdown.find((f) => f.factor === "L5_priceBand")!.points).toBe(8);
  });
  it("no quartiles → neutral 8", () => {
    const r = computeLeadScore(baseInput({ sellerPriceQuartiles: null }));
    expect(r.breakdown.find((f) => f.factor === "L5_priceBand")!.points).toBe(8);
  });
  it("top-quartile (≥Q3) → 15", () => {
    const r = computeLeadScore(baseInput({ listingPriceUsd: 75000, sellerPriceQuartiles: { q1: 30000, q3: 70000 } }));
    expect(r.breakdown.find((f) => f.factor === "L5_priceBand")!.points).toBe(15);
  });
  it("mid-quartile (Q1..Q3) → 10", () => {
    const r = computeLeadScore(baseInput({ listingPriceUsd: 50000, sellerPriceQuartiles: { q1: 30000, q3: 70000 } }));
    expect(r.breakdown.find((f) => f.factor === "L5_priceBand")!.points).toBe(10);
  });
  it("bottom-quartile (<Q1) → 5", () => {
    const r = computeLeadScore(baseInput({ listingPriceUsd: 20000, sellerPriceQuartiles: { q1: 30000, q3: 70000 } }));
    expect(r.breakdown.find((f) => f.factor === "L5_priceBand")!.points).toBe(5);
  });
});

describe("computeLeadScore — L6 listing heat (10 pts)", () => {
  it("hot (views>100 OR fav>10) → 10", () => {
    const r = computeLeadScore(baseInput({ listingViewCount: 150, listingFavoriteCount: 0 }));
    expect(r.breakdown.find((f) => f.factor === "L6_listingHeat")!.points).toBe(10);
  });
  it("hot via favorites (>10) → 10", () => {
    const r = computeLeadScore(baseInput({ listingViewCount: 5, listingFavoriteCount: 12 }));
    expect(r.breakdown.find((f) => f.factor === "L6_listingHeat")!.points).toBe(10);
  });
  it("warm (views>20) → 6", () => {
    const r = computeLeadScore(baseInput({ listingViewCount: 50, listingFavoriteCount: 2 }));
    expect(r.breakdown.find((f) => f.factor === "L6_listingHeat")!.points).toBe(6);
  });
  it("cold (else) → 3", () => {
    const r = computeLeadScore(baseInput({ listingViewCount: 5, listingFavoriteCount: 1 }));
    expect(r.breakdown.find((f) => f.factor === "L6_listingHeat")!.points).toBe(3);
  });
});

describe("computeLeadScore — clamping + structure", () => {
  it("max possible score (all factors maxed) = 100 (clamped)", () => {
    const r = computeLeadScore({
      leadType: "OFFER",
      createdAt: NOW,
      note: "x".repeat(150),
      viewerLeadCountForSeller: 5,
      listingPriceUsd: 100000,
      sellerPriceQuartiles: { q1: 30000, q3: 70000 },
      listingViewCount: 200,
      listingFavoriteCount: 20,
      now: NOW,
    });
    expect(r.score).toBe(100);
  });
  it("min score never below 0", () => {
    const r = computeLeadScore({
      leadType: "VIEW",
      createdAt: new Date(NOW.getTime() - 90 * 24 * 3600 * 1000),
      note: null,
      viewerLeadCountForSeller: 0,
      listingPriceUsd: 10000,
      sellerPriceQuartiles: { q1: 30000, q3: 70000 },
      listingViewCount: 0,
      listingFavoriteCount: 0,
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  it("version is v1", () => {
    expect(computeLeadScore(baseInput()).version).toBe(LEAD_SCORE_VERSION);
    expect(LEAD_SCORE_VERSION).toBe("v1");
  });
  it("breakdown has 6 factors with factor/max/points/detail", () => {
    const r = computeLeadScore(baseInput());
    expect(r.breakdown).toHaveLength(6);
    for (const f of r.breakdown) {
      expect(f).toHaveProperty("factor");
      expect(f).toHaveProperty("points");
      expect(f).toHaveProperty("max");
      expect(f).toHaveProperty("detail");
      expect(f.points).toBeGreaterThanOrEqual(0);
      expect(f.points).toBeLessThanOrEqual(f.max);
    }
  });
  it("reason string is non-empty and mentions the score + version", () => {
    const r = computeLeadScore(baseInput());
    expect(r.reason).toContain(String(r.score));
    expect(r.reason.toLowerCase()).toContain("v1");
  });
});

describe("leadScoreBand", () => {
  it("≥70 → HOT", () => { expect(leadScoreBand(70)).toBe("HOT"); expect(leadScoreBand(100)).toBe("HOT"); });
  it("40–69 → WARM", () => { expect(leadScoreBand(40)).toBe("WARM"); expect(leadScoreBand(69)).toBe("WARM"); });
  it("<40 → COLD", () => { expect(leadScoreBand(0)).toBe("COLD"); expect(leadScoreBand(39)).toBe("COLD"); });
});
