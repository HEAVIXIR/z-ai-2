import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01 — P0-4 FIX VERIFICATION (deals auth bypass)
   ------------------------------------------------------------
   This test verifies that the P0-4 vulnerability (deals buyerId/
   sellerId impersonation) has been FIXED.

   Vulnerability that was fixed:
     - src/app/api/deals/route.ts had @ts-nocheck (hiding type errors)
     - POST accepted buyerId/sellerId from the request body
     - For RFQ_QUOTE sourceType, verifiedBuyerId was NEVER
       overwritten from the source — body value was persisted directly
     - For LISTING_OFFER, verifiedSellerId was never overwritten
     - An attacker could create a deal attributing any user as buyer

   Fix:
     1. @ts-nocheck removed from both deals/route.ts and deals/[id]/route.ts
     2. buyerId/sellerId/listingId NO LONGER accepted from body
     3. Both buyerId and sellerId ALWAYS derived from the source entity:
        - LISTING_OFFER: buyerId from offer.buyerId, sellerId from
          offer.listing.sellerId (listing now included in query)
        - DEAL_ROOM: buyerId/sellerId from room
        - RFQ_QUOTE: buyerId from quote.rfq.buyerId (RFQ now included),
          sellerId from quote.sellerId
     4. Full TypeScript types restored (no `any` in new code)

   These tests use static analysis (source-code assertions) because
   a live server is not available in this environment.
   ============================================================ */

const ROUTE_PATH = "src/app/api/deals/route.ts";
const DETAIL_PATH = "src/app/api/deals/[id]/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("P0-4 FIX — deals auth bypass is blocked", () => {
  describe("src/app/api/deals/route.ts — @ts-nocheck removed", () => {
    const source = readSource(ROUTE_PATH);

    it("does NOT have @ts-nocheck directive on line 1", () => {
      const firstLine = source.split("\n")[0];
      expect(firstLine).not.toMatch(/@ts-nocheck/);
    });

    it("contains the P0-4 FIX comment marker", () => {
      expect(source).toContain("P0-4 FIX");
    });
  });

  describe("src/app/api/deals/route.ts — body no longer accepts buyerId/sellerId", () => {
    const source = readSource(ROUTE_PATH);

    it("POST body destructuring does NOT include buyerId", () => {
      // The fix removed buyerId from the body destructuring.
      const bodyDestructure = source.match(
        /const\s*\{[^}]*\}\s*=\s*body(?:\s+as\s+[^;]+)?;/s,
      );
      expect(bodyDestructure, "body destructuring must exist").toBeTruthy();
      expect(bodyDestructure![0]).not.toMatch(/\bbuyerId\b/);
    });

    it("POST body destructuring does NOT include sellerId", () => {
      const bodyDestructure = source.match(
        /const\s*\{[^}]*\}\s*=\s*body(?:\s+as\s+[^;]+)?;/s,
      );
      expect(bodyDestructure).toBeTruthy();
      expect(bodyDestructure![0]).not.toMatch(/\bsellerId\b/);
    });

    it("POST body destructuring does NOT include listingId", () => {
      const bodyDestructure = source.match(
        /const\s*\{[^}]*\}\s*=\s*body(?:\s+as\s+[^;]+)?;/s,
      );
      expect(bodyDestructure).toBeTruthy();
      expect(bodyDestructure![0]).not.toMatch(/\blistingId\b/);
    });
  });

  describe("src/app/api/deals/route.ts — RFQ_QUOTE derives buyerId from source", () => {
    const source = readSource(ROUTE_PATH);

    it("RFQ_QUOTE branch includes the rfq relation in the query", () => {
      // The fix adds `include: { rfq: { select: { buyerId: true } } }`
      // to the rFQQuote.findUnique call.
      const quoteMatch = source.match(
        /db\.rFQQuote\.findUnique\(\{[\s\S]*?\}\)/,
      );
      expect(quoteMatch, "rFQQuote.findUnique call must exist").toBeTruthy();
      const call = quoteMatch![0];
      expect(call).toMatch(/include:\s*\{/);
      expect(call).toMatch(/rfq:/);
      expect(call).toMatch(/buyerId:\s*true/);
    });

    it("verifiedBuyerId is set from quote.rfq.buyerId (NOT from body)", () => {
      expect(source).toMatch(/verifiedBuyerId\s*=\s*quote\.rfq\.buyerId/);
    });

    it("does NOT initialize verifiedBuyerId from a body value", () => {
      // The old vulnerable pattern: `let verifiedBuyerId = buyerId || null`
      // The fix: `let verifiedBuyerId: string | null = null`
      expect(source).not.toMatch(/verifiedBuyerId\s*=\s*buyerId/);
    });

    it("does NOT initialize verifiedSellerId from a body value", () => {
      expect(source).not.toMatch(/verifiedSellerId\s*=\s*sellerId/);
    });
  });

  describe("src/app/api/deals/route.ts — LISTING_OFFER derives sellerId from listing", () => {
    const source = readSource(ROUTE_PATH);

    it("LISTING_OFFER branch includes the listing relation in the query", () => {
      const offerMatch = source.match(
        /db\.listingOffer\.findUnique\(\{[\s\S]*?\}\)/,
      );
      expect(offerMatch, "listingOffer.findUnique call must exist").toBeTruthy();
      const call = offerMatch![0];
      expect(call).toMatch(/include:\s*\{/);
      expect(call).toMatch(/listing:/);
      expect(call).toMatch(/sellerId:\s*true/);
    });

    it("verifiedSellerId is set from offer.listing.sellerId", () => {
      expect(source).toMatch(/verifiedSellerId\s*=\s*offer\.listing\.sellerId/);
    });
  });

  describe("src/app/api/deals/route.ts — TypeScript types restored", () => {
    const source = readSource(ROUTE_PATH);

    it("POST body is typed (not untyped any)", () => {
      // The fix casts body to a typed object: `body as { sourceType?: ... }`
      expect(source).toMatch(/body\s+as\s+\{/);
      expect(source).toMatch(/sourceType\?:\s*string/);
    });

    it("catch blocks use `unknown` (not `any`)", () => {
      expect(source).toMatch(/catch\s*\(\s*err:\s*unknown\s*\)/);
    });

    it("does NOT use `any` type annotation in new code", () => {
      // The old code had `where: any` and `catch (err: any)`.
      // The fix removes these. We check that `: any` doesn't appear
      // in executable code (excluding comments).
      const executableLines = source
        .split("\n")
        .filter(
          (l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"),
        );
      const joined = executableLines.join("\n");
      expect(joined).not.toMatch(/:\s*any\b/);
    });
  });

  describe("src/app/api/deals/[id]/route.ts — @ts-nocheck removed", () => {
    const source = readSource(DETAIL_PATH);

    it("does NOT have @ts-nocheck directive on line 1", () => {
      const firstLine = source.split("\n")[0];
      expect(firstLine).not.toMatch(/@ts-nocheck/);
    });

    it("contains the P0-4 FIX comment marker", () => {
      expect(source).toContain("P0-4 FIX");
    });

    it("PATCH handler includes order relation in the deal query", () => {
      // The fix adds `include: { order: { select: { id: true } } }`
      // to the findUnique so `deal.order` is typed.
      const findMatch = source.match(
        /db\.deal\.findUnique\(\{[\s\S]*?include:[\s\S]*?\}\)/,
      );
      expect(findMatch).toBeTruthy();
      expect(findMatch![0]).toMatch(/order:/);
    });

    it("catch blocks use `unknown` (not `any`)", () => {
      expect(source).toMatch(/catch\s*\(\s*err:\s*unknown\s*\)/);
    });

    it("ownership checks are still present (buyerId or sellerId match)", () => {
      // The original auth checks must remain intact.
      expect(source).toMatch(/deal\.buyerId\s*!==\s*userId/);
      expect(source).toMatch(/deal\.sellerId\s*!==\s*userId/);
    });
  });

  describe("regression: vulnerable patterns are gone", () => {
    const routeSource = readSource(ROUTE_PATH);

    it("vulnerable `let verifiedBuyerId = buyerId || null` is gone", () => {
      expect(routeSource).not.toMatch(
        /let\s+verifiedBuyerId\s*=\s*buyerId\s*\|\|\s*null/,
      );
    });

    it("vulnerable `let verifiedSellerId = sellerId || null` is gone", () => {
      expect(routeSource).not.toMatch(
        /let\s+verifiedSellerId\s*=\s*sellerId\s*\|\|\s*null/,
      );
    });

    it("RFQ_QUOTE branch does NOT leave verifiedBuyerId unset", () => {
      // In the RFQ_QUOTE branch, verifiedBuyerId MUST be assigned
      // from the source (not left as the default null or body value).
      // v2 note: the regex uses a broader lookahead to accommodate
      // the restructured code (else branch moved to earlier validation).
      const rfqBranchMatch = routeSource.match(
        /sourceType\s*===\s*["']RFQ_QUOTE["'][\s\S]*?(?:verifiedBuyerId\s*=\s*quote\.rfq\.buyerId)/,
      );
      expect(rfqBranchMatch, "RFQ_QUOTE branch must set verifiedBuyerId").toBeTruthy();
    });

    it("LISTING_OFFER branch does NOT leave verifiedSellerId unset", () => {
      const offerBranchMatch = routeSource.match(
        /sourceType\s*===\s*["']LISTING_OFFER["'][\s\S]*?(?=}\s*else)/,
      );
      expect(offerBranchMatch, "LISTING_OFFER branch must exist").toBeTruthy();
      const branch = offerBranchMatch![0];
      expect(branch).toMatch(/verifiedSellerId\s*=/);
    });
  });
});
