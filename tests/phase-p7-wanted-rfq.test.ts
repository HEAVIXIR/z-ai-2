/**
 * HEAVIX — Phase P7: Wanted Marketplace + RFQ + Matching engine
 * ------------------------------------------------------------
 * Contract tests for the Phase 7 deepening deliverables described
 * in PHASE7-WANTED-RFQ-MATCHING:
 *
 *   1. src/lib/wanted-service.ts — 5 exports (createWanted,
 *      listWanted, getWanted, closeWanted, getWantedMatches)
 *   2. src/lib/rfq-service.ts   — 6 exports (createRFQ,
 *      submitQuote, acceptQuote, rejectQuote, listRFQs, getRFQ)
 *   3. Public API routes:
 *      - /api/wanted (GET list + POST create)
 *      - /api/wanted/[id] (GET single + PATCH close)
 *      - /api/wanted/[id]/matches (GET matches)
 *      - /api/rfq (GET list + POST create)
 *      - /api/rfq/[id] (GET single)
 *      - /api/rfq/[id]/quotes (GET quotes + POST submit)
 *   4. Admin page: /admin/wanted (Permission: request.read)
 *   5. Audit keys:
 *      - marketplace.wanted.create
 *      - marketplace.wanted.close
 *      - marketplace.rfq.create
 *      - marketplace.rfq.quote.submit
 *      - marketplace.rfq.quote.accept
 *      - marketplace.rfq.quote.reject
 *
 * Tests are file-content based (no DB calls) so they pass in
 * every environment — including CI without DATABASE_URL set.
 * This matches the established pattern from
 * tests/phase-p6-price-intelligence.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const WANTED_SVC = "src/lib/wanted-service.ts";
const RFQ_SVC = "src/lib/rfq-service.ts";

const WANTED_ROUTE = "src/app/api/wanted/route.ts";
const WANTED_ID_ROUTE = "src/app/api/wanted/[id]/route.ts";
const WANTED_MATCHES_ROUTE = "src/app/api/wanted/[id]/matches/route.ts";
const RFQ_ROUTE = "src/app/api/rfq/route.ts";
const RFQ_ID_ROUTE = "src/app/api/rfq/[id]/route.ts";
const RFQ_QUOTES_ROUTE = "src/app/api/rfq/[id]/quotes/route.ts";

const ADMIN_WANTED_PAGE = "src/app/admin/wanted/page.tsx";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("Phase P7 — Wanted Marketplace + RFQ + Matching engine", () => {
  // ── 1. wanted-service.ts exists + exports ──────────────────
  describe("1. wanted-service.ts", () => {
    it("should exist as src/lib/wanted-service.ts", () => {
      expect(fs.existsSync(WANTED_SVC)).toBe(true);
    });

    it("should export createWanted(params)", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("export async function createWanted");
      // The params object must accept the documented fields.
      expect(c).toContain("title");
      expect(c).toContain("quantity");
      expect(c).toContain("budgetMin");
      expect(c).toContain("budgetMax");
      expect(c).toContain("categoryId");
      expect(c).toContain("brandId");
      expect(c).toContain("transactionType");
      expect(c).toContain("province");
      expect(c).toContain("city");
      expect(c).toContain("userId");
    });

    it("should export listWanted({ status, categoryId, limit, offset })", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("export async function listWanted");
      expect(c).toContain("status");
      expect(c).toContain("categoryId");
      expect(c).toContain("limit");
      expect(c).toContain("offset");
    });

    it("should export getWanted(id)", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("export async function getWanted");
      // Single id arg.
      expect(c).toMatch(/getWanted\(\s*id:\s*string\s*,?\s*\)/);
    });

    it("should export closeWanted(id, userId)", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("export async function closeWanted");
      // Two args: id + userId.
      expect(c).toMatch(
        /closeWanted\(\s*id:\s*string\s*,\s*userId:\s*string\s*,?\s*\)/,
      );
    });

    it("should export getWantedMatches(id)", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("export async function getWantedMatches");
      // The function delegates to matching-service.matchBuyRequest.
      expect(c).toContain("matchBuyRequest");
    });

    it("should audit createWanted as marketplace.wanted.create", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("marketplace.wanted.create");
      // Should write to entityType BuyRequest.
      expect(c).toContain('"BuyRequest"');
    });

    it("should audit closeWanted as marketplace.wanted.close", () => {
      const c = read(WANTED_SVC);
      expect(c).toContain("marketplace.wanted.close");
      // Should flip status to CLOSED.
      expect(c).toContain('"CLOSED"');
    });
  });

  // ── 2. rfq-service.ts exists + exports ─────────────────────
  describe("2. rfq-service.ts", () => {
    it("should exist as src/lib/rfq-service.ts", () => {
      expect(fs.existsSync(RFQ_SVC)).toBe(true);
    });

    it("should export createRFQ(params)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function createRFQ");
      // The params object must accept the documented fields.
      expect(c).toContain("title");
      expect(c).toContain("description");
      expect(c).toContain("buyerId");
      expect(c).toContain("sellerId");
      expect(c).toContain("deadline");
      expect(c).toContain("categoryId");
      expect(c).toContain("brandId");
      expect(c).toContain("specs");
      expect(c).toContain("userId");
    });

    it("should export submitQuote(rfqId, sellerId, params)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function submitQuote");
      // Three args: rfqId + sellerId + params object.
      expect(c).toMatch(
        /submitQuote\(\s*rfqId:\s*string\s*,\s*sellerId:\s*string\s*,/,
      );
      // The params object must accept price + deliveryTime +
      // validity + notes + userId.
      expect(c).toContain("price");
      expect(c).toContain("deliveryTime");
      expect(c).toContain("validity");
      expect(c).toContain("notes");
    });

    it("should export acceptQuote(quoteId, userId)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function acceptQuote");
      expect(c).toMatch(
        /acceptQuote\(\s*quoteId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export rejectQuote(quoteId, reason, userId)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function rejectQuote");
      expect(c).toMatch(
        /rejectQuote\(\s*quoteId:\s*string\s*,\s*reason\?\s*:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export listRFQs(params)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function listRFQs");
      // Filters: status, buyerId, sellerId, limit.
      expect(c).toContain("status");
      expect(c).toContain("buyerId");
      expect(c).toContain("sellerId");
      expect(c).toContain("limit");
    });

    it("should export getRFQ(id)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("export async function getRFQ");
      expect(c).toMatch(/getRFQ\(\s*id:\s*string\s*,?\s*\)/);
      // The return shape includes quotes[].
      expect(c).toContain("quotes");
    });

    it("should audit createRFQ as marketplace.rfq.create", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("marketplace.rfq.create");
      expect(c).toContain('"RFQ"');
    });

    it("should audit submitQuote as marketplace.rfq.quote.submit (status=PENDING)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("marketplace.rfq.quote.submit");
      expect(c).toContain('"PENDING"');
      expect(c).toContain('"RFQQuote"');
    });

    it("should audit acceptQuote as marketplace.rfq.quote.accept (status=ACCEPTED)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("marketplace.rfq.quote.accept");
      expect(c).toContain('"ACCEPTED"');
    });

    it("should audit rejectQuote as marketplace.rfq.quote.reject (status=REJECTED)", () => {
      const c = read(RFQ_SVC);
      expect(c).toContain("marketplace.rfq.quote.reject");
      expect(c).toContain('"REJECTED"');
    });
  });

  // ── 3. Public API routes ───────────────────────────────────
  describe("3. Public API routes", () => {
    it("should expose GET + POST /api/wanted", () => {
      expect(fs.existsSync(WANTED_ROUTE)).toBe(true);
      const c = read(WANTED_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function POST");
      // The POST handler must delegate to wanted-service.
      expect(c).toContain("createWanted");
      // The GET handler must delegate to wanted-service.listWanted.
      expect(c).toContain("listWanted");
    });

    it("should expose GET + PATCH /api/wanted/[id]", () => {
      expect(fs.existsSync(WANTED_ID_ROUTE)).toBe(true);
      const c = read(WANTED_ID_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function PATCH");
      // Next.js 16 dynamic route — params is a Promise.
      expect(c).toContain("params: Promise<{ id: string }>");
      expect(c).toContain("await params");
      // The GET handler must delegate to wanted-service.getWanted.
      expect(c).toContain("getWanted");
      // The PATCH handler must delegate to wanted-service.closeWanted.
      expect(c).toContain("closeWanted");
    });

    it("should expose GET /api/wanted/[id]/matches", () => {
      expect(fs.existsSync(WANTED_MATCHES_ROUTE)).toBe(true);
      const c = read(WANTED_MATCHES_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("params: Promise<{ id: string }>");
      // The handler must delegate to wanted-service.getWantedMatches.
      expect(c).toContain("getWantedMatches");
    });

    it("should expose GET + POST /api/rfq", () => {
      expect(fs.existsSync(RFQ_ROUTE)).toBe(true);
      const c = read(RFQ_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function POST");
      // The POST handler must delegate to rfq-service.createRFQ.
      expect(c).toContain("createRFQ");
      // The GET handler must delegate to rfq-service.listRFQs.
      expect(c).toContain("listRFQs");
    });

    it("should expose GET /api/rfq/[id]", () => {
      expect(fs.existsSync(RFQ_ID_ROUTE)).toBe(true);
      const c = read(RFQ_ID_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("params: Promise<{ id: string }>");
      expect(c).toContain("getRFQ");
    });

    it("should expose GET + POST /api/rfq/[id]/quotes", () => {
      expect(fs.existsSync(RFQ_QUOTES_ROUTE)).toBe(true);
      const c = read(RFQ_QUOTES_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function POST");
      expect(c).toContain("params: Promise<{ id: string }>");
      // The POST handler must delegate to rfq-service.submitQuote.
      expect(c).toContain("submitQuote");
      // The GET handler should also include the RFQ context
      // (rfq-service.getRFQ returns quotes inline).
      expect(c).toContain("getRFQ");
    });
  });

  // ── 4. Admin wanted page ───────────────────────────────────
  describe("4. Admin wanted page", () => {
    it("should exist as src/app/admin/wanted/page.tsx", () => {
      expect(fs.existsSync(ADMIN_WANTED_PAGE)).toBe(true);
    });

    it("should gate on request.read permission", () => {
      const c = read(ADMIN_WANTED_PAGE);
      expect(c).toContain("requirePermission");
      expect(c).toContain('"request.read"');
    });

    it("should list wanted requests with status, category, budget, match count", () => {
      const c = read(ADMIN_WANTED_PAGE);
      expect(c).toContain("db.buyRequest");
      expect(c).toContain("STATUS_CFG");
      expect(c).toContain("category");
      expect(c).toContain("budgetMin");
      expect(c).toContain("matchCount");
      // The page must surface the matching engine — either via
      // matchBuyRequest import or via the match-count lookup loop.
      expect(c).toContain("matchBuyRequest");
    });

    it("should audit the list_view action", () => {
      const c = read(ADMIN_WANTED_PAGE);
      expect(c).toContain("logAudit");
      expect(c).toContain("marketplace.wanted.admin.list_view");
    });
  });

  // ── 5. Audit key coverage ──────────────────────────────────
  describe("5. Audit key coverage", () => {
    it("marketplace.wanted.create appears in wanted-service", () => {
      expect(read(WANTED_SVC)).toContain("marketplace.wanted.create");
    });

    it("marketplace.wanted.close appears in wanted-service", () => {
      expect(read(WANTED_SVC)).toContain("marketplace.wanted.close");
    });

    it("marketplace.rfq.create appears in rfq-service", () => {
      expect(read(RFQ_SVC)).toContain("marketplace.rfq.create");
    });

    it("marketplace.rfq.quote.submit appears in rfq-service", () => {
      expect(read(RFQ_SVC)).toContain("marketplace.rfq.quote.submit");
    });

    it("marketplace.rfq.quote.accept appears in rfq-service", () => {
      expect(read(RFQ_SVC)).toContain("marketplace.rfq.quote.accept");
    });

    it("marketplace.rfq.quote.reject appears in rfq-service", () => {
      expect(read(RFQ_SVC)).toContain("marketplace.rfq.quote.reject");
    });

    it("all six audit keys appear together across the two services", () => {
      const combined = read(WANTED_SVC) + "\n" + read(RFQ_SVC);
      const keys = [
        "marketplace.wanted.create",
        "marketplace.wanted.close",
        "marketplace.rfq.create",
        "marketplace.rfq.quote.submit",
        "marketplace.rfq.quote.accept",
        "marketplace.rfq.quote.reject",
      ];
      for (const k of keys) {
        expect(combined).toContain(k);
      }
    });
  });
});
