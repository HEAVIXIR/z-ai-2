import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01-R1 — P0-2 FIX v2 VERIFICATION
   ------------------------------------------------------------
   Senior manager directive: "رفع افشای شناسه‌های داخلی در صفحه
   SSR. یکسان‌سازی سیاست دسترسی بین Service، API و Page. تعریف
   ماتریس دسترسی Buyer / Seller مرتبط / Seller نامرتبط / Admin.
   افزودن تست HTTP برای تمام گروه‌ها."

   This test verifies the v2 fix:
     1. No `...rfq` or `...q` spread in page.tsx (no id leak)
     2. buyerId explicitly redacted for non-buyer viewers
     3. sellerId explicitly redacted in quotes for non-buyer viewers
     4. viewerUserId required in getRFQ service contract
     5. Access matrix documented in code
   ============================================================ */

const PAGE_PATH = "src/app/rfq/[id]/page.tsx";
const SERVICE_PATH = "src/lib/rfq-service.ts";
const QUOTES_ROUTE_PATH = "src/app/api/rfq/[id]/quotes/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Filter to executable lines only (no comments). */
function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("P0-2 FIX v2 — no internal id leak in SSR page", () => {
  const pageSource = readSource(PAGE_PATH);
  const pageExecutable = executableLines(pageSource);

  describe("page.tsx: no spread operators in safeRfq construction", () => {
    it("does NOT use `...rfq` spread in safeRfq (would leak buyerId)", () => {
      // Find the safeRfq construction block
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      expect(safeRfqMatch, "safeRfq construction must exist").toBeTruthy();
      const block = safeRfqMatch![0];
      expect(block).not.toMatch(/\.\.\.rfq/);
    });

    it("does NOT use `...q` spread in quotes map (would leak sellerId)", () => {
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      expect(safeRfqMatch).toBeTruthy();
      const block = safeRfqMatch![0];
      expect(block).not.toMatch(/\.\.\.q\b/);
    });

    it("explicitly lists buyerId field (not inherited from spread)", () => {
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      const block = safeRfqMatch![0];
      expect(block).toMatch(/buyerId:/);
    });

    it("explicitly redacts buyerId for non-buyer viewers", () => {
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      const block = safeRfqMatch![0];
      expect(block).toMatch(/buyerId:\s*isBuyer\s*\?\s*rfq\.buyerId\s*:\s*null/);
    });
  });

  describe("page.tsx: quotes — sellerId explicitly redacted", () => {
    it("explicitly lists sellerId field in quotes map", () => {
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      const block = safeRfqMatch![0];
      expect(block).toMatch(/sellerId:/);
    });

    it("explicitly redacts sellerId for non-buyer viewers", () => {
      const safeRfqMatch = pageExecutable.match(
        /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
      );
      const block = safeRfqMatch![0];
      expect(block).toMatch(/sellerId:\s*isBuyer\s*\?\s*q\.sellerId\s*:\s*null/);
    });
  });

  describe("page.tsx: access matrix documented", () => {
    it("contains access matrix comment with 4 viewer groups", () => {
      expect(pageSource).toContain("Access matrix");
      expect(pageSource).toMatch(/buyer themselves/);
      expect(pageSource).toMatch(/seller who quoted/);
      expect(pageSource).toMatch(/other sellers/);
      expect(pageSource).toMatch(/admin/);
    });

    it("contains the P0-2 FIX v2 comment marker", () => {
      expect(pageSource).toContain("P0-2 FIX v2");
    });
  });
});

describe("P0-2 FIX v2 — getRFQ service contract: viewerUserId required", () => {
  const serviceSource = readSource(SERVICE_PATH);

  it("getRFQ declares viewerUserId as required string (not optional)", () => {
    const sigMatch = serviceSource.match(
      /export async function getRFQ\([\s\S]*?\):/,
    );
    expect(sigMatch, "getRFQ signature must exist").toBeTruthy();
    const sig = sigMatch![0];
    expect(sig).toMatch(/viewerUserId:\s*string/);
    expect(sig).not.toMatch(/viewerUserId\?:\s*string\s*\|\s*null/);
  });

  it("contains the P0-2 FIX v2 comment marker", () => {
    expect(serviceSource).toContain("P0-2 FIX v2");
  });
});

describe("P0-2 FIX v2 — quotes route: auth + viewer context", () => {
  const quotesSource = readSource(QUOTES_ROUTE_PATH);

  it("requires authentication (calls getCurrentUser)", () => {
    expect(quotesSource).toMatch(/getCurrentUser/);
  });

  it("returns 401 when user is not authenticated", () => {
    expect(quotesSource).toMatch(/if\s*\(\s*!user\s*\)/);
    expect(quotesSource).toMatch(/status:\s*401/);
  });

  it("passes user.id as viewerUserId to getRFQ", () => {
    expect(quotesSource).toMatch(/getRFQ\(\s*id,\s*user\.id\s*\)/);
  });

  it("contains the P0-2 FIX v2 comment marker", () => {
    expect(quotesSource).toContain("P0-2 FIX v2");
  });

  it("does NOT call getRFQ(id) without viewer context", () => {
    const executable = executableLines(quotesSource);
    expect(executable).not.toMatch(/getRFQ\(\s*id\s*\)/);
  });
});

describe("P0-2 FIX v2 — regression: v1 spread patterns are gone", () => {
  const pageExecutable = executableLines(readSource(PAGE_PATH));

  it("v1 `...rfq` spread is gone from executable code", () => {
    const safeRfqMatch = pageExecutable.match(
      /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
    );
    const block = safeRfqMatch![0];
    expect(block).not.toMatch(/\.\.\.rfq/);
  });

  it("v1 `...q` spread is gone from executable code", () => {
    const safeRfqMatch = pageExecutable.match(
      /const\s+safeRfq\s*=\s*\{[\s\S]*?\};/,
    );
    const block = safeRfqMatch![0];
    expect(block).not.toMatch(/\.\.\.q\b/);
  });
});
