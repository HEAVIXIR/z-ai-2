import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01-R1 — P0-5 FIX v2 VERIFICATION
   ------------------------------------------------------------
   Senior manager directive: "اجباری‌کردن هویت Actor در قرارداد
   Service. رد درخواست با هویت مفقود یا نامعتبر. افزودن تست
   رفتاری برای mismatch و جلوگیری از PII lookup."

   This test verifies the v2 fix:
     1. userId is now REQUIRED in createRFQ (type-level + runtime)
     2. Missing/empty userId → 403 (not skipped)
     3. buyerId !== userId → 403 (without falsy check)
     4. Guard runs BEFORE PII lookup (scoped to createRFQ body)
   ============================================================ */

const SERVICE_PATH = "src/lib/rfq-service.ts";
const ROUTE_PATH = "src/app/api/rfq/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Extract the body of createRFQ function (from signature to next export). */
function extractCreateRFQBody(source: string): string {
  const start = source.indexOf("export async function createRFQ");
  if (start < 0) return "";
  const rest = source.slice(start + 1);
  const nextFn = rest.match(/\nexport\s+(async\s+)?function\s+\w+/);
  const end = nextFn ? start + 1 + nextFn.index! : source.length;
  return source.slice(start, end);
}

/** Filter to executable lines only (no comments). */
function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("P0-5 FIX v2 — userId required in createRFQ contract", () => {
  const source = readSource(SERVICE_PATH);
  const createRFQBody = extractCreateRFQBody(source);
  const createRFQExecutable = executableLines(createRFQBody);

  describe("type-level contract: userId is required", () => {
    it("createRFQ params type declares userId as required string (not optional, not nullable)", () => {
      const typeMatch = source.match(
        /export async function createRFQ\(params:\s*\{[\s\S]*?\}\):/,
      );
      expect(typeMatch, "createRFQ signature must exist").toBeTruthy();
      const sig = typeMatch![0];
      expect(sig).toMatch(/userId:\s*string\s*;/);
      expect(sig).not.toMatch(/userId\?:\s*string\s*\|\s*null/);
    });

    it("userId is destructured without a default (no fallback to null)", () => {
      const destructureMatch = source.match(
        /const\s*\{[\s\S]*?userId[\s\S]*?\}\s*=\s*params;/,
      );
      expect(destructureMatch).toBeTruthy();
      const d = destructureMatch![0];
      expect(d).not.toMatch(/userId\s*=\s*null/);
      expect(d).not.toMatch(/userId\s*=\s*undefined/);
    });
  });

  describe("runtime guard: missing/empty userId is rejected (403)", () => {
    it("throws 403 when userId is missing or empty (before PII lookup)", () => {
      expect(createRFQExecutable).toMatch(
        /if\s*\(\s*!userId\s*\|\|\s*typeof\s+userId\s*!==\s*["']string["']\s*\|\|\s*userId\.trim\(\)\s*===\s*["']["']\s*\)/,
      );
      expect(createRFQExecutable).toMatch(/RFQServiceError\(\s*403/);
    });

    it("the missing-userId guard appears BEFORE the buyer PII lookup (within createRFQ)", () => {
      const guardIndex = createRFQExecutable.indexOf('!userId || typeof userId !== "string"');
      const piiLookupIndex = createRFQExecutable.indexOf("db.user.findUnique");

      expect(guardIndex, "missing-userId guard must exist in createRFQ").toBeGreaterThan(-1);
      expect(piiLookupIndex, "PII lookup must exist in createRFQ").toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(piiLookupIndex);
    });

    it("contains the P0-5 FIX v2 comment marker", () => {
      expect(source).toContain("P0-5 FIX v2");
    });
  });

  describe("runtime guard: buyerId !== userId is rejected (403, no falsy check)", () => {
    it("throws 403 when buyerId !== userId (without falsy userId check in executable code)", () => {
      // The v1 guard: `if (userId && buyerId !== userId)` — skipped when userId falsy
      // The v2 guard: `if (buyerId !== userId)` — always checked (userId already validated)
      expect(createRFQExecutable).toMatch(/if\s*\(\s*buyerId\s*!==\s*userId\s*\)/);
      // Must NOT have the old `userId &&` prefix that allowed falsy bypass
      // (only checking executable code, not comments)
      expect(createRFQExecutable).not.toMatch(
        /if\s*\(\s*userId\s*&&\s*buyerId\s*!==\s*userId\s*\)/,
      );
    });

    it("the mismatch guard appears AFTER the missing-userId guard (so userId is validated first)", () => {
      // Use executable lines (no comments) to find the guards.
      const missingGuardIndex = createRFQExecutable.indexOf('!userId || typeof userId !== "string"');
      const mismatchGuardIndex = createRFQExecutable.indexOf("buyerId !== userId");

      expect(missingGuardIndex).toBeGreaterThan(-1);
      expect(mismatchGuardIndex).toBeGreaterThan(-1);
      expect(mismatchGuardIndex).toBeGreaterThan(missingGuardIndex);
    });

    it("the mismatch guard appears BEFORE the buyer PII lookup (within createRFQ)", () => {
      const mismatchGuardIndex = createRFQExecutable.indexOf("buyerId !== userId");
      const piiLookupIndex = createRFQExecutable.indexOf("db.user.findUnique");

      expect(mismatchGuardIndex).toBeGreaterThan(-1);
      expect(piiLookupIndex).toBeGreaterThan(-1);
      expect(mismatchGuardIndex).toBeLessThan(piiLookupIndex);
    });
  });

  describe("route layer: still passes userId from session", () => {
    const routeSource = readSource(ROUTE_PATH);

    it("route passes userId: user.id (session-based, not body-based)", () => {
      const createCallMatch = routeSource.match(/createRFQ\(\{[\s\S]*?\}\)/);
      expect(createCallMatch).toBeTruthy();
      const call = createCallMatch![0];
      expect(call).toMatch(/userId:\s*user\.id/);
    });

    it("route authenticates via getCurrentUser before calling createRFQ", () => {
      expect(routeSource).toMatch(/getCurrentUser/);
      expect(routeSource).toMatch(/if\s*\(\s*!user\s*\)/);
    });
  });

  describe("regression: v1 vulnerable patterns are gone from executable code", () => {
    it("v1 guard `if (userId && buyerId !== userId)` is gone from createRFQ executable code", () => {
      expect(createRFQExecutable).not.toMatch(
        /if\s*\(\s*userId\s*&&\s*buyerId\s*!==\s*userId\s*\)/,
      );
    });

    it("v1 type `userId?: string | null` is gone from createRFQ signature", () => {
      const sigMatch = source.match(
        /export async function createRFQ\(params:\s*\{[\s\S]*?\}\):/,
      );
      const sig = sigMatch![0];
      expect(sig).not.toMatch(/userId\?:\s*string\s*\|\s*null/);
    });
  });
});
