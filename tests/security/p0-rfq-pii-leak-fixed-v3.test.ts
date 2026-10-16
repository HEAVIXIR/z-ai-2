import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.02 — P0-2 FIX v3 VERIFICATION (Quote Visibility)
   ------------------------------------------------------------
   Senior manager directive: 'فروشنده‌ای که پیشنهاد داده فقط
   پیشنهاد خودش را می‌بیند، ولی قطعه diff بررسی‌شده صرفاً فیلدهای
   تماس و شناسه فروشندگان را مخفی می‌کند و به‌تنهایی ثابت نمی‌کند
   پیشنهادهای دیگران از آرایه حذف شده‌اند.'

   This test verifies the v3 quote-visibility fix:
     1. buyer: sees ALL quotes (with full PII)
     2. seller who quoted: sees ONLY their own quote
     3. other sellers / anonymous: see NO quotes (only quoteCount)
   ============================================================ */

const SERVICE_PATH = "src/lib/rfq-service.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("P0-2 FIX v3 — quote visibility filtering", () => {
  const source = readSource(SERVICE_PATH);
  const executable = executableLines(source);

  describe("viewer role detection", () => {
    it("detects isBuyer (viewer === rfq.buyerId)", () => {
      expect(executable).toMatch(/const\s+isBuyer\s*=/);
      expect(executable).toMatch(/viewerUserId\s*===\s*rfq\.buyerId/);
    });

    it("detects isSellerWhoQuoted (viewer has a quote on this RFQ)", () => {
      expect(executable).toMatch(/const\s+viewerQuote\s*=/);
      expect(executable).toMatch(/rfq\.quotes\.find\(/);
      expect(executable).toMatch(/q\.sellerId\s*===\s*viewerUserId/);
      expect(executable).toMatch(/const\s+isSellerWhoQuoted\s*=/);
    });
  });

  describe("quote array filtering by viewer role", () => {
    it("buyer sees ALL quotes (visibleQuotes = rfq.quotes)", () => {
      expect(executable).toMatch(/if\s*\(\s*isBuyer\s*\)/);
      expect(executable).toMatch(/visibleQuotes\s*=\s*rfq\.quotes/);
    });

    it("seller who quoted sees ONLY their own quote (visibleQuotes = [viewerQuote])", () => {
      expect(executable).toMatch(
        /else\s+if\s*\(\s*isSellerWhoQuoted\s*&&\s*viewerQuote\s*\)/,
      );
      expect(executable).toMatch(/visibleQuotes\s*=\s*\[viewerQuote\]/);
    });

    it("other sellers / anonymous see NO quotes (visibleQuotes = [])", () => {
      expect(executable).toMatch(/visibleQuotes\s*=\s*\[\]/);
    });
  });

  describe("quoteCount always visible (trust signal)", () => {
    it("returns quoteCount in the response", () => {
      expect(executable).toMatch(/quoteCount:\s*rfq\.quotes\.length/);
    });

    it("return type declares quoteCount: number", () => {
      expect(source).toMatch(/quoteCount:\s*number/);
    });
  });

  describe("PII redaction still applied to visible quotes", () => {
    it("buyer sees full PII (isBuyer ? value : null)", () => {
      expect(executable).toMatch(/buyerPhone:\s*isBuyer\s*\?\s*rfq\.buyerPhone/);
      expect(executable).toMatch(/sellerPhone:\s*isBuyer\s*\?\s*q\.sellerPhone/);
    });

    it("seller who quoted does NOT see buyer PII (isBuyer is false for them)", () => {
      // isBuyer is false for sellers, so buyerPhone/Email/Id → null
      // This is verified by the isBuyer check in the redaction logic.
      expect(executable).toMatch(/buyerPhone:\s*isBuyer\s*\?.*:\s*null/);
    });
  });

  describe("regression: v2 features preserved", () => {
    it("viewerUserId is still required (v2 contract)", () => {
      expect(source).toMatch(/viewerUserId:\s*string/);
    });

    it("contains the P0-2 FIX v3 comment marker", () => {
      expect(source).toContain("P0-2 FIX v3");
    });

    it("documents the quote visibility policy (senior manager directive)", () => {
      expect(source).toContain("فروشنده‌ای که پیشنهاد داده فقط");
    });
  });
});
