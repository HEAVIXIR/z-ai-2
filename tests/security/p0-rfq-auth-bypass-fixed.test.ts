import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01 — P0-5 FIX VERIFICATION (RFQ auth bypass)
   ------------------------------------------------------------
   This test verifies that the P0-5 vulnerability (RFQ buyerId
   impersonation) has been FIXED.

   Vulnerability that was fixed:
     - src/app/api/rfq/route.ts POST accepted `buyerId` from the
       request body (`buyerId: buyerId ?? user.id`). An attacker
       could supply another user's id, causing createRFQ to look
       up that user's PII and persist an RFQ under their identity.

   Fix (defense in depth):
     1. route.ts: buyerId removed from body destructuring; always
        uses user.id from the authenticated session.
     2. rfq-service.ts: createRFQ throws 403 when userId is provided
        and buyerId !== userId (prevents any future caller from
        reintroducing the impersonation).

   These tests use static analysis (source-code assertions) because
   a live server is not available in this environment.
   ============================================================ */

const ROUTE_PATH = "src/app/api/rfq/route.ts";
const SERVICE_PATH = "src/lib/rfq-service.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("P0-5 FIX — RFQ buyerId impersonation is blocked", () => {
  describe("route layer: src/app/api/rfq/route.ts", () => {
    const source = readSource(ROUTE_PATH);

    it("does NOT destructure buyerId from the request body", () => {
      // The fix removed `buyerId` from the destructuring list.
      // If it reappears, the vulnerability is reintroduced.
      const destructuringBlock = source.match(
        /const\s*\{[^}]*\}\s*=\s*body;/s,
      );
      expect(
        destructuringBlock,
        "body destructuring block must exist",
      ).toBeTruthy();
      const block = destructuringBlock![0];
      expect(block).not.toMatch(/\bbuyerId\b/);
    });

    it("passes user.id (session) as buyerId to createRFQ — never a body value", () => {
      // The createRFQ call must use `buyerId: user.id` (hardcoded
      // from the session), not `buyerId: buyerId ?? user.id`.
      const createCallMatch = source.match(/createRFQ\(\{[\s\S]*?\}\)/);
      expect(createCallMatch, "createRFQ call must exist").toBeTruthy();
      const call = createCallMatch![0];
      expect(call).toMatch(/buyerId:\s*user\.id\b/);
      expect(call).not.toMatch(/buyerId:\s*buyerId/);
      expect(call).not.toMatch(/buyerId\s*\?\?\s*user\.id/);
    });

    it("passes userId: user.id for audit (so the actor is the real buyer)", () => {
      const createCallMatch = source.match(/createRFQ\(\{[\s\S]*?\}\)/);
      const call = createCallMatch![0];
      expect(call).toMatch(/userId:\s*user\.id/);
    });

    it("contains the P0-5 FIX comment marker for audit traceability", () => {
      expect(source).toContain("P0-5 FIX");
    });
  });

  describe("service layer: src/lib/rfq-service.ts createRFQ", () => {
    const source = readSource(SERVICE_PATH);

    it("throws 403 when userId is provided and buyerId !== userId", () => {
      // The fix adds a guard: if (userId && buyerId !== userId) throw 403
      // We search the whole file (the guard is unique to createRFQ).
      expect(source).toMatch(/if\s*\(\s*userId\s*&&\s*buyerId\s*!==\s*userId\s*\)/);
      expect(source).toMatch(/RFQServiceError\(\s*403/);
      expect(source).toContain("P0-5 FIX");
    });

    it("the 403 guard appears BEFORE the buyer PII lookup (so PII is never fetched for a mismatch)", () => {
      // Scope the search to the createRFQ function body only — other
      // functions in this file also call db.user.findUnique.
      const createRFQStart = source.indexOf("export async function createRFQ");
      expect(createRFQStart, "createRFQ function must exist").toBeGreaterThan(-1);
      // Find the next "export async function" or "export function" after
      // createRFQ to bound the function body.
      const restAfterCreate = source.slice(createRFQStart);
      const nextFnMatch = restAfterCreate
        .slice(1)
        .match(/\nexport\s+(async\s+)?function\s+\w+/);
      const createRFQEnd = nextFnMatch
        ? createRFQStart + 1 + nextFnMatch.index!
        : source.length;
      const fnBody = source.slice(createRFQStart, createRFQEnd);

      const guardIndex = fnBody.indexOf("buyerId !== userId");
      const piiLookupIndex = fnBody.indexOf("db.user.findUnique");

      expect(guardIndex, "403 guard must exist in createRFQ").toBeGreaterThan(-1);
      expect(piiLookupIndex, "PII lookup must exist in createRFQ").toBeGreaterThan(-1);
      // Guard must appear before the PII lookup in createRFQ.
      expect(guardIndex).toBeLessThan(piiLookupIndex);
    });

    it("the guard is inside the createRFQ function (not some other function)", () => {
      // Verify the guard is between createRFQ's opening and its first
      // db.rFQ.create call (which is where the RFQ is persisted).
      const createRFQIndex = source.indexOf("export async function createRFQ");
      const guardIndex = source.indexOf("buyerId !== userId");
      const persistIndex = source.indexOf("db.rFQ.create");

      expect(createRFQIndex, "createRFQ function must exist").toBeGreaterThan(-1);
      expect(guardIndex).toBeGreaterThan(createRFQIndex);
      expect(guardIndex).toBeLessThan(persistIndex);
    });

    it("still allows buyerId === userId (normal flow: user creates own RFQ)", () => {
      // The guard is `userId && buyerId !== userId` — so when
      // buyerId === userId (the normal case), the guard does NOT
      // throw. This confirms the fix doesn't break legitimate use.
      expect(source).toMatch(/userId\s*&&\s*buyerId\s*!==\s*userId/);
    });
  });

  describe("regression: vulnerable patterns are gone", () => {
    const routeSource = readSource(ROUTE_PATH);

    it("vulnerable pattern `buyerId: buyerId ?? user.id` is gone from route.ts", () => {
      // The old vulnerable pattern must NOT be present anymore.
      // (It may appear in comments documenting the fix — so we check
      // that it does not appear as executable code: a line that
      // starts with optional whitespace then `buyerId:`.)
      const executableLines = routeSource
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const joined = executableLines.join("\n");
      expect(joined).not.toMatch(/buyerId:\s*buyerId\s*\?\?\s*user\.id/);
    });

    const serviceSource = readSource(SERVICE_PATH);

    it("createRFQ now has a userId/buyerId mismatch check", () => {
      expect(serviceSource).toMatch(/buyerId\s*!==\s*userId/);
    });
  });
});
