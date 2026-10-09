import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.37 — P1 Fix: payments/[id]/verify admin gate
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - POST /api/payments/[id]/verify used isAuthenticated() (any
     logged-in user) as the sole gate.
   - Any BUYER could mark ANY payment as PAID + activate premium
     subscriptions (financial fraud + privilege escalation).

   Fix (AFTER):
   - Require getCurrentUser() + requirePermission("payment.manage").
   - Anonymous → 401; non-admin (no payment.manage) → 403;
     admin (with payment.manage) → proceeds.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockRequirePermissionThrows = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
  isAuthenticated: async () => mockCurrentUser !== null,
}));
vi.mock("@/lib/authorization", () => ({
  requirePermission: async () => {
    if (mockRequirePermissionThrows) throw new Error("Forbidden");
  },
  isAdmin: async () => !mockRequirePermissionThrows,
}));
vi.mock("@/lib/db", () => ({
  db: {
    payment: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async (args: any) => args.data),
    },
    premiumSubscription: {
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));

const { POST } = await import("@/app/api/payments/[id]/verify/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockRequirePermissionThrows = false;
});

function makeReq(url: string, body: any): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ARGS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("P1: POST /api/payments/[id]/verify — admin gate", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await POST(makeReq("http://localhost/api/payments/p1/verify", { status: "PAID" }), ARGS("p1"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: BUYER (no payment.manage) → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockRequirePermissionThrows = true; // requirePermission throws → 403
    const res = await POST(makeReq("http://localhost/api/payments/p1/verify", { status: "PAID" }), ARGS("p1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/payment\.manage/);
  });

  it("NEGATIVE: SELLER (no payment.manage) → 403", async () => {
    mockCurrentUser = { id: "seller-1" };
    mockRequirePermissionThrows = true;
    const res = await POST(makeReq("http://localhost/api/payments/p1/verify", { status: "PAID" }), ARGS("p1"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: ADMIN (has payment.manage) → passes auth gate", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockRequirePermissionThrows = false; // requirePermission resolves
    const { db } = await import("@/lib/db");
    (db.payment.findUnique as any).mockResolvedValueOnce({
      id: "p1", status: "PENDING", amount: BigInt(1000), type: "SUBSCRIPTION", subscriptionId: "sub-1",
    });
    const res = await POST(makeReq("http://localhost/api/payments/p1/verify", { status: "PAID" }), ARGS("p1"));
    // Admin passes the auth gate — should NOT be 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("P1: source-code verification — isAuthenticated removed", () => {
  it("payments/verify does NOT import isAuthenticated", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/payments/[id]/verify/route.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toMatch(/import.*requirePermission.*from.*@\/lib\/authorization/);
    expect(source).toMatch(/payment\.manage/);
  });
});
