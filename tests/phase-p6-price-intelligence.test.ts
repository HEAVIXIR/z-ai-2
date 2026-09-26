/**
 * HEAVIX — PHASE 6: Price Intelligence + Compare (Deepening)
 *
 * Contract tests for the new price-compare-service + 3 public
 * API routes + admin overview page. Verifies the existence and
 * shape of the deliverables described in PHASE6-PRICE-INTELLIGENCE:
 *
 *   1. src/lib/price-compare-service.ts             (4 exports + MAX_COMPARE_LISTINGS)
 *   2. src/app/api/pricing/compare/route.ts          (GET ?ids=...)
 *   3. src/app/api/pricing/history/[listingId]/route.ts (GET)
 *   4. src/app/api/pricing/market-range/route.ts    (GET ?brandId=&modelId=&year=&condition=)
 *   5. src/app/admin/price-intelligence/overview/page.tsx (stats + overrides + anomaly alerts)
 *   6. Audit coverage for pricing.override           (already wired in 6D — sanity-check)
 *
 * Tests are file-content based (no DB calls) so they pass in
 * every environment — including CI without DATABASE_URL set.
 * This matches the established pattern from
 * tests/phase6d-estimate-confidence.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const SVC = "src/lib/price-compare-service.ts";
const ROUTE_COMPARE = "src/app/api/pricing/compare/route.ts";
const ROUTE_HISTORY = "src/app/api/pricing/history/[listingId]/route.ts";
const ROUTE_RANGE = "src/app/api/pricing/market-range/route.ts";
const ADMIN_OVERVIEW = "src/app/admin/price-intelligence/overview/page.tsx";
const PRICE_ENGINE = "src/lib/price-engine.ts";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("Phase P6 — Price Intelligence (Deepening)", () => {
  // ── 1. price-compare-service.ts exists + exports ──
  describe("1. price-compare-service.ts", () => {
    it("should exist as src/lib/price-compare-service.ts", () => {
      expect(fs.existsSync(SVC)).toBe(true);
    });

    it("should export compareListings(listingIds, userId?)", () => {
      const c = read(SVC);
      expect(c).toContain("export async function compareListings");
      // The signature must accept listingIds and an optional userId.
      expect(c).toMatch(/compareListings\(\s*listingIds[^,]*,\s*userId\?\s*:\s*string \| null,?\s*\)/);
    });

    it("should export getPriceHistoryForListing(listingId)", () => {
      const c = read(SVC);
      expect(c).toContain(
        "export async function getPriceHistoryForListing",
      );
      // Signature must accept a single `listingId: string` arg
      // (optionally followed by a trailing comma for formatting).
      expect(c).toMatch(
        /getPriceHistoryForListing\(\s*listingId:\s*string\s*,?\s*\)/,
      );
    });

    it("should export getMarketPriceRange(brandId, modelId, year, condition)", () => {
      const c = read(SVC);
      expect(c).toContain("export async function getMarketPriceRange");
      // params object must accept the four documented filters.
      expect(c).toContain("brandId");
      expect(c).toContain("modelId");
      expect(c).toContain("year");
      expect(c).toContain("condition");
    });

    it("should export detectPriceAnomaly(listingId) returning anomalyScore", () => {
      const c = read(SVC);
      expect(c).toContain("export async function detectPriceAnomaly");
      // Returns the normalized 0..1 score.
      const fnIdx = c.indexOf("export async function detectPriceAnomaly");
      expect(fnIdx).toBeGreaterThan(-1);
      const body = c.substring(fnIdx, fnIdx + 3000);
      expect(body).toContain("anomalyScore");
      expect(body).toContain("verdict");
    });

    it("should export MAX_COMPARE_LISTINGS = 4 (the up-to-4 cap)", () => {
      const c = read(SVC);
      expect(c).toContain("MAX_COMPARE_LISTINGS");
      // Must be assigned to the literal 4.
      expect(c).toMatch(/MAX_COMPARE_LISTINGS\s*=\s*4/);
    });

    it("should define the 4-value PriceVerdict type", () => {
      const c = read(SVC);
      // Type declared.
      expect(c).toMatch(/export type PriceVerdict\s*=/);
      // All four verdict states present.
      expect(c).toContain('"IN_RANGE"');
      expect(c).toContain('"BELOW_RANGE"');
      expect(c).toContain('"ABOVE_RANGE"');
      expect(c).toContain('"INSUFFICIENT"');
    });
  });

  // ── 2. Public API routes ──
  describe("2. Public API routes", () => {
    it("should expose GET /api/pricing/compare?ids=...", () => {
      expect(fs.existsSync(ROUTE_COMPARE)).toBe(true);
      const c = read(ROUTE_COMPARE);
      expect(c).toContain("export async function GET");
      expect(c).toContain('searchParams.get("ids")');
      // The route calls compareListings(ids).
      expect(c).toContain("compareListings");
      // Public — no auth import (no getCurrentUser / requirePermission).
      expect(c).not.toContain("requirePermission");
      expect(c).not.toContain("getCurrentUser");
    });

    it("should expose GET /api/pricing/history/[listingId]", () => {
      expect(fs.existsSync(ROUTE_HISTORY)).toBe(true);
      const c = read(ROUTE_HISTORY);
      expect(c).toContain("export async function GET");
      // Next.js 16 dynamic route — params is a Promise.
      expect(c).toContain("params: Promise<{ listingId: string }>");
      // The handler awaits params and pulls listingId.
      expect(c).toContain("await params");
      // Delegates to the service function.
      expect(c).toContain("getPriceHistoryForListing");
      // Public — no auth import.
      expect(c).not.toContain("requirePermission");
      expect(c).not.toContain("getCurrentUser");
    });

    it("should expose GET /api/pricing/market-range?brandId=&modelId=&year=&condition=", () => {
      expect(fs.existsSync(ROUTE_RANGE)).toBe(true);
      const c = read(ROUTE_RANGE);
      expect(c).toContain("export async function GET");
      expect(c).toContain('searchParams.get("brandId")');
      expect(c).toContain('searchParams.get("modelId")');
      expect(c).toContain('searchParams.get("year")');
      expect(c).toContain('searchParams.get("condition")');
      expect(c).toContain("getMarketPriceRange");
      // Public — no auth import.
      expect(c).not.toContain("requirePermission");
      expect(c).not.toContain("getCurrentUser");
    });
  });

  // ── 3. Admin price-intelligence overview page ──
  describe("3. Admin overview page", () => {
    it("should exist as src/app/admin/price-intelligence/overview/page.tsx", () => {
      expect(fs.existsSync(ADMIN_OVERVIEW)).toBe(true);
    });

    it("should render four stat cards: observations / estimates / overrides / avg confidence", () => {
      const c = read(ADMIN_OVERVIEW);
      // The four aggregates are computed in parallel.
      expect(c).toContain("db.priceObservation");
      expect(c).toContain("db.priceEstimate");
      expect(c).toContain("db.priceOverride");
      // avg confidence is derived from PriceEstimate.confidence.
      expect(c).toMatch(/confidence.*weight|CONFIDENCE_WEIGHT/);
      // The stats array surfaces all four labels.
      expect(c).toContain("کل مشاهدات قیمت");
      expect(c).toContain("کل تخمین‌ها");
      expect(c).toContain("تعدیل‌های دستی");
      expect(c).toContain("میانگین اطمینان");
    });

    it("should render a recent overrides table (with who/when/reason)", () => {
      const c = read(ADMIN_OVERVIEW);
      expect(c).toContain("recentOverrides");
      expect(c).toContain("overriddenBy");
      expect(c).toContain("overriddenAt");
      expect(c).toContain("reason");
      // And it pulls them ordered newest-first.
      expect(c).toContain('orderBy: { overriddenAt: "desc" }');
    });

    it("should render price anomaly alerts (>20% deviation)", () => {
      const c = read(ADMIN_OVERVIEW);
      // 20% threshold constant.
      expect(c).toMatch(/ANOMALY_THRESHOLD_PCT\s*=\s*0\.2/);
      // Computes deviation: (asking - estimated) / estimated.
      expect(c).toMatch(/\(asking\s*-\s*est\)\s*\/\s*est/);
      // Caps the result list.
      expect(c).toMatch(/ANOMALY_LIMIT\s*=\s*50/);
      // Verdict pills carry the same 4-state vocabulary as the
      // public PriceHealth route.
      expect(c).toContain("BELOW_RANGE");
      expect(c).toContain("ABOVE_RANGE");
    });
  });

  // ── 4. Audit coverage (price.override) ──
  describe("4. Audit coverage (price.override)", () => {
    it("should already wire logAudit into createOverride (6D baseline)", () => {
      const c = read(PRICE_ENGINE);
      expect(c).toContain("logAudit");
      expect(c).toContain("pricing.override");
      expect(c).toContain("PriceOverride");
    });

    it("price-compare-service should NOT silently mutate estimates (read-only assembly)", () => {
      // The compare service should not create/update/delete any
      // price tables directly — it only READS. The single write
      // path for prices remains the existing
      // /api/admin/pricing/override (audited) + the engine's own
      // persistEstimate (best-effort). This keeps the audit surface
      // intact: any admin-observable price mutation still flows
      // through createOverride.
      const c = read(SVC);
      expect(c).not.toContain("db.priceOverride.create");
      expect(c).not.toContain("db.priceOverride.update");
      expect(c).not.toContain("db.priceOverride.delete");
      expect(c).not.toContain("db.priceEstimate.create");
      expect(c).not.toContain("db.priceEstimate.update");
      expect(c).not.toContain("db.priceObservation.create");
      expect(c).not.toContain("db.priceObservation.update");
    });
  });
});
