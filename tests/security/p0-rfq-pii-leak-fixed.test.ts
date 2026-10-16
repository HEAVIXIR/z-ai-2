import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01 — P0-2 FIX VERIFICATION (RFQ PII leak)
   ------------------------------------------------------------
   This test verifies that the P0-2 vulnerability (RFQ PII leak)
   has been FIXED.

   Vulnerability that was fixed:
     - GET /api/rfq/[id] was public (no auth). getRFQ() returned
       buyerName, buyerPhone, buyerEmail, buyerId + every seller's
       sellerName, sellerPhone, sellerEmail in quotes to ANY visitor.
     - src/app/rfq/[id]/page.tsx (server component) rendered the
       same PII directly from db to any anonymous visitor.

   Fix (viewer-aware PII redaction):
     1. API route: getCurrentUser() required; 401 if not authed.
        Passes user.id to getRFQ(id, viewerUserId).
     2. Service: getRFQ now accepts viewerUserId. PII (phone/email/
        internal ids) is only returned when viewer === buyer.
        Non-buyer viewers see names (trust) but not contact info.
     3. Page: getCurrentUser() required; redirect to /login if not
        authed. PII redacted in safeRfq based on isBuyer.

   These tests use static analysis (source-code assertions) because
   a live server is not available in this environment.
   ============================================================ */

const API_ROUTE_PATH = "src/app/api/rfq/[id]/route.ts";
const SERVICE_PATH = "src/lib/rfq-service.ts";
const PAGE_PATH = "src/app/rfq/[id]/page.tsx";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("P0-2 FIX — RFQ PII leak is blocked", () => {
  describe("API route: src/app/api/rfq/[id]/route.ts", () => {
    const source = readSource(API_ROUTE_PATH);

    it("requires authentication (calls getCurrentUser)", () => {
      expect(source).toMatch(/getCurrentUser/);
    });

    it("returns 401 when user is not authenticated", () => {
      expect(source).toMatch(/if\s*\(\s*!user\s*\)/);
      expect(source).toMatch(/status:\s*401/);
    });

    it("passes user.id as viewerUserId to getRFQ", () => {
      expect(source).toMatch(/getRFQ\(\s*id,\s*user\.id\s*\)/);
    });

    it("contains the P0-2 FIX comment marker", () => {
      expect(source).toContain("P0-2 FIX");
    });

    it("no longer calls getRFQ(id) without a viewer context", () => {
      // The old vulnerable pattern: getRFQ(id) with no second arg.
      // Must be gone from executable code.
      const executableLines = source
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const joined = executableLines.join("\n");
      expect(joined).not.toMatch(/getRFQ\(\s*id\s*\)/);
    });
  });

  describe("service layer: src/lib/rfq-service.ts getRFQ", () => {
    const source = readSource(SERVICE_PATH);

    it("getRFQ accepts an optional viewerUserId parameter", () => {
      expect(source).toMatch(
        /export async function getRFQ\(\s*id:\s*string,\s*viewerUserId\?:\s*string\s*\|\s*null/,
      );
    });

    it("computes isBuyer flag (viewerUserId === rfq.buyerId)", () => {
      expect(source).toMatch(/const\s+isBuyer\s*=/);
      expect(source).toMatch(/viewerUserId\s*===\s*rfq\.buyerId/);
    });

    it("redacts buyerPhone for non-buyer viewers", () => {
      expect(source).toMatch(/buyerPhone:\s*isBuyer\s*\?\s*rfq\.buyerPhone\s*:\s*null/);
    });

    it("redacts buyerEmail for non-buyer viewers", () => {
      expect(source).toMatch(/buyerEmail:\s*isBuyer\s*\?\s*rfq\.buyerEmail\s*:\s*null/);
    });

    it("redacts buyerId for non-buyer viewers (prevents IDOR)", () => {
      expect(source).toMatch(/buyerId:\s*isBuyer\s*\?\s*rfq\.buyerId\s*:\s*null/);
    });

    it("keeps buyerName visible (trust signal, not PII)", () => {
      expect(source).toMatch(/buyerName:\s*rfq\.buyerName/);
    });

    it("redacts sellerPhone in quotes for non-buyer viewers", () => {
      expect(source).toMatch(/sellerPhone:\s*isBuyer\s*\?\s*q\.sellerPhone\s*:\s*null/);
    });

    it("redacts sellerEmail in quotes for non-buyer viewers", () => {
      expect(source).toMatch(/sellerEmail:\s*isBuyer\s*\?\s*q\.sellerEmail\s*:\s*null/);
    });

    it("redacts sellerId in quotes for non-buyer viewers (prevents IDOR)", () => {
      expect(source).toMatch(/sellerId:\s*isBuyer\s*\?\s*q\.sellerId\s*:\s*null/);
    });

    it("keeps sellerName visible in quotes (trust signal)", () => {
      expect(source).toMatch(/sellerName:\s*q\.sellerName/);
    });

    it("contains the P0-2 FIX comment marker", () => {
      expect(source).toContain("P0-2 FIX");
    });

    it("return type declares buyerPhone/buyerEmail/buyerId as nullable", () => {
      // The old type had `buyerPhone: string` (non-nullable). The fix
      // makes it `buyerPhone: string | null` since it's redacted.
      // We search the whole file for the type annotations.
      expect(source).toMatch(/buyerPhone:\s*string\s*\|\s*null/);
      expect(source).toMatch(/buyerEmail:\s*string\s*\|\s*null/);
      expect(source).toMatch(/sellerPhone:\s*string\s*\|\s*null/);
      expect(source).toMatch(/sellerEmail:\s*string\s*\|\s*null/);
    });
  });

  describe("page: src/app/rfq/[id]/page.tsx", () => {
    const source = readSource(PAGE_PATH);

    it("requires authentication (calls getCurrentUser)", () => {
      expect(source).toMatch(/getCurrentUser/);
    });

    it("redirects to /login when user is not authenticated", () => {
      expect(source).toMatch(/redirect\(/);
      expect(source).toMatch(/\/login/);
    });

    it("computes isBuyer flag", () => {
      expect(source).toMatch(/const\s+isBuyer\s*=/);
      expect(source).toMatch(/rfq\.buyerId\s*===\s*user/);
    });

    it("redacts buyerPhone in safeRfq for non-buyer viewers", () => {
      expect(source).toMatch(/buyerPhone:\s*isBuyer\s*\?\s*rfq\.buyerPhone\s*:\s*null/);
    });

    it("redacts buyerEmail in safeRfq for non-buyer viewers", () => {
      expect(source).toMatch(/buyerEmail:\s*isBuyer\s*\?\s*rfq\.buyerEmail\s*:\s*null/);
    });

    it("redacts sellerPhone in quotes for non-buyer viewers", () => {
      expect(source).toMatch(/sellerPhone:\s*isBuyer\s*\?\s*q\.sellerPhone\s*:\s*null/);
    });

    it("redacts sellerEmail in quotes for non-buyer viewers", () => {
      expect(source).toMatch(/sellerEmail:\s*isBuyer\s*\?\s*q\.sellerEmail\s*:\s*null/);
    });

    it("contains the P0-2 FIX comment marker", () => {
      expect(source).toContain("P0-2 FIX");
    });
  });

  describe("regression: vulnerable patterns are gone", () => {
    const apiSource = readSource(API_ROUTE_PATH);

    it("API route no longer has a public GET without auth", () => {
      // The old comment said "Public route" — that must be gone.
      expect(apiSource).not.toMatch(/Public route/);
    });

    const serviceSource = readSource(SERVICE_PATH);

    it("getRFQ no longer returns buyerPhone unconditionally", () => {
      // The old pattern: `buyerPhone: rfq.buyerPhone` (no isBuyer guard).
      // Must be replaced by the redacting pattern.
      const fnMatch = serviceSource.match(
        /export async function getRFQ[\s\S]*?^}/m,
      );
      // The function is long; just check the redacting pattern exists
      // and the unconditional pattern does NOT exist in the return block.
      expect(serviceSource).toMatch(/buyerPhone:\s*isBuyer\s*\?/);
      expect(serviceSource).not.toMatch(/^\s*buyerPhone:\s*rfq\.buyerPhone\s*,\s*$/m);
    });
  });
});
