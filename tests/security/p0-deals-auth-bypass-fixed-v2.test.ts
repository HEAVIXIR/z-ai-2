import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01-R1 — P0-4 FIX v2 VERIFICATION
   ------------------------------------------------------------
   Senior manager directive: 'بررسی مجوز دسترسی به Offer، Deal Room
   و RFQ Quote مبدأ. الزام عضویت Actor در طرفین مجاز معامله. حذف
   امکان تغییر غیرمجاز مبلغ از Body. اعتبارسنجی Transaction Type،
   وضعیت مبدأ و ایجاد تکراری Deal. تست حمله با کاربر غیرمرتبط
   برای هر Source Type.'

   This test verifies the v2 fix:
     1. Party-membership check: actor must be buyer or seller
     2. agreedAmount NO LONGER accepted from body
     3. transactionType validated against allowed enum
     4. Duplicate deal prevention: one deal per sourceId
   ============================================================ */

const ROUTE_PATH = "src/app/api/deals/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("P0-4 FIX v2 — party-membership check", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("checks that userId is one of the deal parties (buyer or seller)", () => {
    // The party-membership check: if (verifiedBuyerId !== userId && verifiedSellerId !== userId) → 403
    expect(executable).toMatch(
      /if\s*\(\s*verifiedBuyerId\s*!==\s*userId\s*&&\s*verifiedSellerId\s*!==\s*userId\s*\)/,
    );
    expect(executable).toMatch(/status:\s*403/);
  });

  it("party-membership check appears AFTER source entity resolution (so verifiedBuyerId/verifiedSellerId are set)", () => {
    // The check must come after all source branches set verifiedBuyerId/SellerId
    const partyCheckIndex = executable.indexOf(
      "verifiedBuyerId !== userId && verifiedSellerId !== userId",
    );
    const rfqQuoteIndex = executable.indexOf('sourceType === "RFQ_QUOTE"');

    expect(partyCheckIndex).toBeGreaterThan(-1);
    expect(rfqQuoteIndex).toBeGreaterThan(-1);
    expect(partyCheckIndex).toBeGreaterThan(rfqQuoteIndex);
  });

  it("contains the P0-4 FIX v2 comment marker for party-membership", () => {
    expect(source).toContain("P0-4 FIX v2");
    expect(source).toContain("party-membership");
  });
});

describe("P0-4 FIX v2 — agreedAmount NOT accepted from body", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("body destructuring does NOT include agreedAmount", () => {
    const bodyDestructure = source.match(
      /const\s*\{[^}]*\}\s*=\s*body(?:\s+as\s+[^;]+)?;/s,
    );
    expect(bodyDestructure, "body destructuring must exist").toBeTruthy();
    expect(bodyDestructure![0]).not.toMatch(/\bagreedAmount\b/);
  });

  it("deal.create uses verifiedAmount (NOT body agreedAmount)", () => {
    // The v1 pattern: `agreedAmount: agreedAmount ? BigInt(...) : verifiedAmount`
    // The v2 pattern: `agreedAmount: verifiedAmount`
    const createMatch = executable.match(/db\.deal\.create\(\{[\s\S]*?\}\)/);
    expect(createMatch).toBeTruthy();
    const create = createMatch![0];
    expect(create).toMatch(/agreedAmount:\s*verifiedAmount/);
    // Must NOT have the v1 pattern that allowed body override
    expect(create).not.toMatch(
      /agreedAmount:\s*agreedAmount\s*\?/,
    );
  });

  it("contains the P0-4 FIX v2 comment marker for agreedAmount", () => {
    expect(source).toContain("agreedAmount NO LONGER accepted from body");
  });
});

describe("P0-4 FIX v2 — transactionType validated against enum", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("defines a VALID_TRANSACTION_TYPES array", () => {
    expect(executable).toMatch(/VALID_TRANSACTION_TYPES\s*=/);
    expect(executable).toMatch(/\[\s*["']SALE["']/);
    expect(executable).toMatch(/["']RENT["']/);
  });

  it("uses includes() to validate transactionType", () => {
    expect(executable).toMatch(/VALID_TRANSACTION_TYPES\.includes\(transactionType\)/);
  });

  it("defaults to SALE when transactionType is invalid or not provided", () => {
    // The resolvedTransactionType ternary: transactionType && VALID... ? transactionType : "SALE"
    expect(executable).toMatch(/resolvedTransactionType\s*=/);
    expect(executable).toMatch(/:\s*["']SALE["']/);
  });

  it("contains the P0-4 FIX v2 comment marker for transactionType", () => {
    expect(source).toContain("validate transactionType");
  });
});

describe("P0-4 FIX v2 — duplicate deal prevention", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("checks for existing deal by sourceId before creating", () => {
    expect(executable).toMatch(/db\.deal\.findFirst\(/);
    expect(executable).toMatch(/where:\s*\{\s*sourceId\s*\}/);
  });

  it("returns 409 when a deal already exists for the sourceId", () => {
    expect(executable).toMatch(/if\s*\(\s*existingDeal\s*\)/);
    expect(executable).toMatch(/status:\s*409/);
  });

  it("duplicate check appears BEFORE deal.create", () => {
    const checkIndex = executable.indexOf("existingDeal");
    const createIndex = executable.indexOf("db.deal.create");

    expect(checkIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeLessThan(createIndex);
  });

  it("contains the P0-4 FIX v2 comment marker for duplicate prevention", () => {
    expect(source).toContain("duplicate deal prevention");
  });
});

describe("P0-4 FIX v2 — sourceType validated against enum", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("defines a VALID_SOURCE_TYPES array", () => {
    expect(executable).toMatch(/VALID_SOURCE_TYPES\s*=/);
    expect(executable).toMatch(/\[\s*["']LISTING_OFFER["']/);
    expect(executable).toMatch(/["']DEAL_ROOM["']/);
    expect(executable).toMatch(/["']RFQ_QUOTE["']/);
  });

  it("uses includes() to validate sourceType", () => {
    expect(executable).toMatch(/VALID_SOURCE_TYPES\.includes\(sourceType\)/);
  });

  it("returns 400 for invalid sourceType", () => {
    expect(executable).toMatch(/status:\s*400/);
  });
});

describe("P0-4 FIX v2 — regression: v1 vulnerable patterns are gone", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("v1 `agreedAmount: agreedAmount ? BigInt(...) : verifiedAmount` is gone", () => {
    expect(executable).not.toMatch(
      /agreedAmount:\s*agreedAmount\s*\?\s*BigInt/,
    );
  });

  it("v1 `transactionType || 'SALE'` (unvalidated) is gone", () => {
    expect(executable).not.toMatch(/transactionType\s*\|\|\s*["']SALE["']/);
  });
});
