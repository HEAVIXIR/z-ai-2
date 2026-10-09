import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.35 — isAuthenticated() IDOR misuses fix
   ------------------------------------------------------------
   4 route families used isAuthenticated() (true for ANY logged-in
   user) as the admin flag — same pattern as NEW-C2. Any logged-in
   BUYER could:
   - GET/PATCH any inspection (inspections/[id])
   - GET/PATCH any transport request (transport/[id])
   - PATCH (accept/reject/counter) any offer (offers/[id])
   - POST/PATCH/DELETE any company's partners (company/partners)

   Fix: replace isAuthenticated() with isAdmin() from
   @/lib/authorization (RBAC-only, no legacy fallback).

   These tests verify the fix via source-code inspection (the
   routes are too complex to unit-test without extensive mocking
   of Prisma includes). The source-code check asserts that
   isAuthenticated() is NOT used as the admin flag in any of the
   5 fixed files.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
  getCurrentUserId: async () => mockCurrentUser?.id ?? null,
  isAuthenticated: async () => mockCurrentUser !== null,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
  requirePermission: async () => {},
}));
vi.mock("@/lib/db", () => ({
  db: {
    inspection: { findUnique: vi.fn(async () => null) },
    transportRequest: { findUnique: vi.fn(async () => null) },
    listingOffer: { findUnique: vi.fn(async () => null) },
    company: { findUnique: vi.fn(async () => null) },
    companyPartner: { findUnique: vi.fn(async () => null), delete: vi.fn() },
  },
}));
vi.mock("@/lib/api-helpers", () => ({
  parseBig: vi.fn(),
  parseNumber: vi.fn(),
}));
vi.mock("@/lib/inspection-checklists", () => ({ scoreChecklist: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
});

describe("STEP 11.35: isAuthenticated() IDOR fixes — source code verification", () => {
  it("inspections/[id] uses rbacIsAdmin, not isAuthenticated, for admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/inspections/[id]/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*isAdmin as rbacIsAdmin.*from.*@\/lib\/authorization/);
    // isAuthenticated should NOT be imported (we removed it)
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    // The admin check should use rbacIsAdmin, not isAuthenticated
    expect(source).toMatch(/rbacIsAdmin/);
    expect(source).not.toMatch(/const admin = await isAuthenticated/);
  });

  it("transport/[id] uses rbacIsAdmin, not isAuthenticated, for admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/transport/[id]/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*isAdmin as rbacIsAdmin.*from.*@\/lib\/authorization/);
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toMatch(/rbacIsAdmin/);
    expect(source).not.toMatch(/const admin = await isAuthenticated/);
  });

  it("offers/[id] uses rbacIsAdmin, not isAuthenticated, for admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/offers/[id]/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*isAdmin as rbacIsAdmin.*from.*@\/lib\/authorization/);
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toMatch(/rbacIsAdmin/);
    expect(source).not.toMatch(/const adminOk = await isAuthenticated/);
  });

  it("company/partners/route.ts uses rbacIsAdmin, not isAuthenticated, for admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/company/partners/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*isAdmin as rbacIsAdmin.*from.*@\/lib\/authorization/);
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toMatch(/rbacIsAdmin/);
  });

  it("company/partners/[id]/route.ts uses rbacIsAdmin, not isAuthenticated, for admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/company/partners/[id]/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*isAdmin as rbacIsAdmin.*from.*@\/lib\/authorization/);
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toMatch(/rbacIsAdmin/);
  });
});

describe("STEP 11.35: no remaining 'const admin = await isAuthenticated' pattern in IDOR routes", () => {
  it("grep across all API routes — no 'const admin = await isAuthenticated' remaining", async () => {
    const { execSync } = await import("child_process");
    let result = "";
    try {
      result = execSync(
        `grep -rn "const admin = await isAuthenticated\\|const adminOk = await isAuthenticated" src/app/api/ 2>/dev/null || true`,
        { encoding: "utf-8" },
      );
    } catch {
      // grep returns non-zero if no matches — that's what we want
    }
    // The IDOR-pattern isAuthenticated misuses should be gone.
    // (Other 'if (!(await isAuthenticated()))' patterns in admin-only routes
    //  like transaction-types/brand-families are a separate Class 2 issue.)
    const lines = result.trim().split("\n").filter(Boolean);
    // Filter out any remaining occurrences — we expect 0 in the IDOR routes
    const idorRoutes = lines.filter(l =>
      l.includes("inspections/") || l.includes("transport/") ||
      l.includes("offers/") || l.includes("company/partners")
    );
    expect(idorRoutes.length).toBe(0);
  });
});
