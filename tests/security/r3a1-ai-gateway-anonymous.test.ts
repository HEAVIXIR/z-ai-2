import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.33 — R-3-A1 Security Fix: AI Gateway anonymous bypass
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - checkAIAuth(null, { allowedRoles: "ADMIN,SELLER" }) returned
     { ok: true } because roles.includes("ADMIN") was true.
   - The Gateway route computed `adminOk` but never passed it to
     preflight — so anonymous callers bypassed directly.
   - Net effect: any anonymous attacker could call /api/ai-gateway
     with any task type (all 8 seeded policies allow ADMIN).

   Fix (AFTER):
   - checkAIAuth(null, ...) → { ok: false, reason: "authentication required" }
     (fail-closed, unconditionally)
   - Gateway route: 401 for anonymous BEFORE any policy lookup

   These tests verify the pure-function fix in ai-policy.ts.
   The Gateway route integration is covered by the route-level test.
   ============================================================ */

let mockIsAdminResult = false;
let mockHasRoleResult = false;

vi.mock("@/lib/db", () => ({
  db: {},
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
  hasRole: async () => mockHasRoleResult,
}));

// Import AFTER mocks
const { checkAIAuth } = await import("@/lib/ai-policy");

beforeEach(() => {
  mockIsAdminResult = false;
  mockHasRoleResult = false;
});

describe("R-3-A1: checkAIAuth — fail-closed for anonymous", () => {
  it("NEGATIVE: null user → { ok: false } regardless of allowedRoles", async () => {
    // Even if ADMIN is in allowedRoles, anonymous must be denied.
    const r = await checkAIAuth(null, { allowedRoles: "ADMIN,SELLER" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/authentication required/i);
  });

  it("NEGATIVE: null user + allowedRoles='*' → still denied", async () => {
    // The wildcard "*" expands to all roles including ADMIN — but
    // anonymous must still be denied.
    const r = await checkAIAuth(null, { allowedRoles: "*" });
    expect(r.ok).toBe(false);
  });

  it("NEGATIVE: null user + allowedRoles='ADMIN' only → denied (was the bypass)", async () => {
    // This is the EXACT scenario that was bypassed before the fix.
    const r = await checkAIAuth(null, { allowedRoles: "ADMIN" });
    expect(r.ok).toBe(false);
  });

  it("NEGATIVE: null user + empty allowedRoles → denied", async () => {
    const r = await checkAIAuth(null, { allowedRoles: "" });
    expect(r.ok).toBe(false);
  });
});

describe("R-3-A1: checkAIAuth — authenticated user passes correctly", () => {
  it("POSITIVE: admin user → { ok: true } (isAdmin bypass)", async () => {
    mockIsAdminResult = true;
    const r = await checkAIAuth({ id: "admin-1" }, { allowedRoles: "ADMIN" });
    expect(r.ok).toBe(true);
  });

  it("POSITIVE: seller user with SELLER in allowedRoles → { ok: true }", async () => {
    mockHasRoleResult = true;
    const r = await checkAIAuth({ id: "seller-1" }, { allowedRoles: "SELLER" });
    expect(r.ok).toBe(true);
  });

  it("NEGATIVE: buyer user with allowedRoles='SELLER' only → { ok: false }", async () => {
    mockHasRoleResult = false;
    const r = await checkAIAuth({ id: "buyer-1" }, { allowedRoles: "SELLER" });
    expect(r.ok).toBe(false);
  });

  it("POSITIVE: wildcard allowedRoles + authenticated user → { ok: true }", async () => {
    mockHasRoleResult = true;
    const r = await checkAIAuth({ id: "user-1" }, { allowedRoles: "*" });
    expect(r.ok).toBe(true);
  });
});

describe("R-3-A1: checkAIAuth — edge cases", () => {
  it("NEGATIVE: empty allowedRoles → denied for any user", async () => {
    const r = await checkAIAuth({ id: "admin-1" }, { allowedRoles: "" });
    expect(r.ok).toBe(false);
  });

  it("NEGATIVE: whitespace allowedRoles → denied", async () => {
    const r = await checkAIAuth({ id: "admin-1" }, { allowedRoles: "   " });
    expect(r.ok).toBe(false);
  });
});
