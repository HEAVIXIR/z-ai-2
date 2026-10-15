/**
 * HEAVIX — STEP 12.89 Behavioral Tests: P0 Store Security (PR #40 + #41)
 * ====================================================================
 *
 * REAL route-handler behavioral tests that INVOKE the actual POST/GET
 * handlers with mocked auth + store DB. Asserts real HTTP status codes.
 *
 * Tests cover:
 *   PR #40:
 *   - store-auth: isStoreAdmin uses RBAC (not just session)
 *   - orders/[id]: anonymous 401, non-owner 403, owner 200, not-found 404
 *   - wishlist: anonymous 401, session mobile used (not body phone)
 *   - payments/manual: anonymous 401, non-owner 403, cancelled order 409,
 *     duplicate prevention, overpayment prevention
 *
 *   PR #41:
 *   - gateway/request: anonymous 401, non-owner 403, paid order 409,
 *     duplicate prevention (returns existing PENDING)
 *   - preview/page/[key]: noindex metadata present
 *
 * These tests FAIL on main (vulnerable) and PASS on fix branches.
 * Runs under `bun run test:security`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock state ──────────────────────────────────────────────
let mockCurrentUser: { id: string; mobile: string; firstName: string; role: string } | null = null;
let mockIsAdminResult: boolean = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
  getCurrentUserId: async () => mockCurrentUser?.id ?? null,
  isAuthenticated: async () => mockCurrentUser !== null,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
  can: async () => false,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, resetAt: new Date(Date.now() + 60000) }),
  retryAfterSeconds: () => 60,
}));
vi.mock("@/lib/rate-limit-presets", () => ({
  VERIFY: { label: "verify", limit: 10, windowMs: 3600000 },
}));
vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: (a: string, b: string) => `${a}:${b}`,
}));

// Mock store DB — each test can override
const mockStoreDb = {
  order: {
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
  },
  customer: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({ id: "cust-1", phone: "09120000000", userId: null })),
  },
  payment: {
    create: vi.fn(async (args: any) => ({ id: "pay-1", ...args.data })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
  },
  wishlist: {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({})),
  },
  part: { findUnique: vi.fn(async () => ({ id: "part-1" })) },
  $transaction: vi.fn(async (fn: any) => {
    // Mock transaction: pass a mock tx that has same methods as storeDb
    const tx = {
      payment: mockStoreDb.payment,
      order: mockStoreDb.order,
      customer: mockStoreDb.customer,
    };
    return fn(tx);
  }),
};
vi.mock("@/lib/store-db", () => ({ storeDb: mockStoreDb }));

// Mock zarinpal
vi.mock("@/lib/store-zarinpal", () => ({
  requestPayment: vi.fn(async () => ({
    authority: "auth-123",
    gatewayUrl: "https://gateway.example.com/start/auth-123",
    method: "ZARINPAL",
  })),
  verifyPayment: vi.fn(async () => ({ success: true, refId: "ref-123" })),
}));

// Import AFTER mocks
const storeAuth = await import("@/lib/store-auth");
const ordersIdRoute = await import("@/app/api/store/orders/[id]/route");
const wishlistRoute = await import("@/app/api/store/wishlist/route");
const paymentsManualRoute = await import("@/app/api/store/payments/manual/route");
const gatewayRequestRoute = await import("@/app/api/store/payments/gateway/request/route");
const gatewayCallbackRoute = await import("@/app/api/store/payments/gateway/callback/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
  // Reset all mock implementations
  mockStoreDb.order.findUnique.mockResolvedValue(null);
  mockStoreDb.order.findMany.mockResolvedValue([]);
  mockStoreDb.customer.findUnique.mockResolvedValue(null);
  mockStoreDb.customer.upsert.mockResolvedValue({ id: "cust-1", phone: "09120000000", userId: null });
  mockStoreDb.payment.create.mockResolvedValue({ id: "pay-1" });
  mockStoreDb.wishlist.findMany.mockResolvedValue([]);
});

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makePostReq(url: string, body: any): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockOrder = {
  id: "order-1",
  orderNumber: "HV-TEST1",
  userId: "user-A",
  customerId: "cust-1",
  status: "PENDING",
  paymentStatus: "UNPAID",
  totalIrr: 1000000,
  totalUsd: 10,
  currencyRateAtOrder: 100000,
  marginPercentAtOrder: 0,
  customer: { id: "cust-1", phone: "09120000000", userId: null },
  payments: [] as any[],
  items: [],
  shipment: null,
  mechanic: null,
};

// ════════════════════════════════════════════════════════════
// PR #40 — store-auth: isStoreAdmin uses RBAC
// ════════════════════════════════════════════════════════════

describe("PR #40: store-auth isStoreAdmin uses RBAC", () => {
  it("NEGATIVE: logged-in non-admin user → isStoreAdmin = false", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "Test", role: "BUYER" };
    mockIsAdminResult = false;
    const result = await storeAuth.isStoreAdmin();
    expect(result).toBe(false);
  });

  it("POSITIVE: admin user → isStoreAdmin = true", async () => {
    mockCurrentUser = { id: "admin-1", mobile: "09130000000", firstName: "Admin", role: "ADMIN" };
    mockIsAdminResult = true;
    const result = await storeAuth.isStoreAdmin();
    expect(result).toBe(true);
  });

  it("NEGATIVE: no session → isStoreAdmin = false", async () => {
    mockCurrentUser = null;
    const result = await storeAuth.isStoreAdmin();
    expect(result).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// PR #40 — orders/[id]: auth + ownership
// ════════════════════════════════════════════════════════════

describe("PR #40: GET /api/store/orders/[id] — auth + ownership", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner → 403", async () => {
    mockCurrentUser = { id: "user-B", mobile: "09130000000", firstName: "B", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner (by userId) → 200", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09990000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("POSITIVE: owner (by phone) → 200", async () => {
    mockCurrentUser = { id: "user-X", mobile: "09120000000", firstName: "X", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("POSITIVE: admin → 200 (any order)", async () => {
    mockCurrentUser = { id: "admin-1", mobile: "09130000000", firstName: "Admin", role: "ADMIN" };
    mockIsAdminResult = true;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("EDGE: non-existent order → 404", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(null);
    const res = await ordersIdRoute.GET(
      makeReq("http://localhost/api/store/orders/nonexistent"),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// PR #40 — wishlist: auth required, session mobile used
// ════════════════════════════════════════════════════════════

describe("PR #40: GET /api/store/wishlist — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await wishlistRoute.GET(makeReq("http://localhost/api/store/wishlist?phone=09120000000"));
    expect(res.status).toBe(401);
  });

  it("POSITIVE: authenticated → 200 (uses session mobile, not query phone)", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.customer.findUnique.mockResolvedValue({ id: "cust-1", phone: "09120000000", userId: null });
    mockStoreDb.wishlist.findMany.mockResolvedValue([{ partId: "p1" }]);
    const res = await wishlistRoute.GET(makeReq("http://localhost/api/store/wishlist?phone=09130000000"));
    expect(res.status).toBe(200);
    // Verify customer lookup used session mobile, not query phone
    expect(mockStoreDb.customer.findUnique).toHaveBeenCalledWith({ where: { phone: "09120000000" } });
  });
});

describe("PR #40: POST /api/store/wishlist — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await wishlistRoute.POST(makePostReq("http://localhost/api/store/wishlist", { phone: "09120000000", partId: "p1" }));
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// PR #40 — payments/manual: auth + ownership + state + duplicate + overpayment
// ════════════════════════════════════════════════════════════

describe("PR #40: POST /api/store/payments/manual — security", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", amountIrr: 100000 }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner → 403", async () => {
    mockCurrentUser = { id: "user-B", mobile: "09130000000", firstName: "B", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", phone: "09120000000", amountIrr: 100000 }));
    expect(res.status).toBe(403);
  });

  it("NEGATIVE: cancelled order → 409", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, status: "CANCELLED" });
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", amountIrr: 100000 }));
    expect(res.status).toBe(409);
  });

  it("NEGATIVE: too many pending payments → 409", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    const payments = Array(4).fill(null).map((_, i) => ({ id: `p${i}`, status: "PENDING", amountIrr: 100000 }));
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, payments });
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", amountIrr: 100000 }));
    expect(res.status).toBe(409);
  });

  it("NEGATIVE: overpayment → 400", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, payments: [{ status: "APPROVED", amountIrr: 900000 }] });
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", amountIrr: 200000 }));
    // 900000 + 200000 = 1100000 > 1000000 totalIrr
    expect(res.status).toBe(400);
  });

  it("POSITIVE: owner, valid payment → 200", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await paymentsManualRoute.POST(makePostReq("http://localhost/api/store/payments/manual", { orderId: "order-1", amountIrr: 500000 }));
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// PR #41 — gateway/request: auth + ownership + state + duplicate
// ════════════════════════════════════════════════════════════

describe("PR #41: POST /api/store/payments/gateway/request — security", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner → 403", async () => {
    mockCurrentUser = { id: "user-B", mobile: "09130000000", firstName: "B", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(403);
  });

  it("NEGATIVE: already PAID → 409", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, paymentStatus: "PAID" });
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(409);
  });

  it("NEGATIVE: cancelled order → 409", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, status: "CANCELLED" });
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(409);
  });

  it("POSITIVE: duplicate prevention — returns existing PENDING", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    const existingPayment = {
      id: "pay-existing",
      method: "GATEWAY",
      status: "PENDING",
      authority: "auth-existing",
      gatewayUrl: "https://gateway.example.com/start/auth-existing",
      gateway: "ZARINPAL",
    };
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, payments: [existingPayment] });
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authority).toBe("auth-existing");
    // Verify no new payment was created
    expect(mockStoreDb.payment.create).not.toHaveBeenCalled();
  });

  it("POSITIVE: owner, valid order → 200 with gateway URL", async () => {
    mockCurrentUser = { id: "user-A", mobile: "09120000000", firstName: "A", role: "BUYER" };
    mockIsAdminResult = false;
    mockStoreDb.order.findUnique.mockResolvedValue(mockOrder);
    const res = await gatewayRequestRoute.POST(makePostReq("http://localhost/api/store/payments/gateway/request", { orderId: "order-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gatewayUrl).toBeTruthy();
    expect(body.authority).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════
// PR #41 — gateway/callback: replay prevention
// ════════════════════════════════════════════════════════════

describe("PR #41: GET /api/store/payments/gateway/callback — replay prevention", () => {
  it("NEGATIVE: already APPROVED payment → redirect (not re-processed)", async () => {
    const approvedPayment = {
      id: "pay-1",
      method: "GATEWAY",
      status: "APPROVED",
      authority: "auth-123",
      gateway: "ZARINPAL",
      amountIrr: 1000000,
    };
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, payments: [approvedPayment] });
    const res = await gatewayCallbackRoute.GET(
      makeReq("http://localhost/api/store/payments/gateway/callback?orderId=order-1&Authority=auth-123&Status=OK"),
    );
    // Should redirect (302/307) — not re-process
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    // Verify payment was NOT updated (no re-processing)
    expect(mockStoreDb.payment.update).not.toHaveBeenCalled();
  });

  it("NEGATIVE: cancelled order → redirect to failed", async () => {
    const pendingPayment = {
      id: "pay-1",
      method: "GATEWAY",
      status: "PENDING",
      authority: "auth-123",
      gateway: "ZARINPAL",
      amountIrr: 1000000,
    };
    mockStoreDb.order.findUnique.mockResolvedValue({ ...mockOrder, status: "CANCELLED", payments: [pendingPayment] });
    const res = await gatewayCallbackRoute.GET(
      makeReq("http://localhost/api/store/payments/gateway/callback?orderId=order-1&Authority=auth-123&Status=OK"),
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    // Verify payment was NOT approved
    expect(mockStoreDb.payment.update).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// PR #41 — preview/page/[key]: noindex metadata
// ════════════════════════════════════════════════════════════

describe("PR #41: preview/page/[key] — noindex metadata", () => {
  it("metadata export has robots: index=false, follow=false", async () => {
    // Read the source file and verify metadata export exists
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/preview/page/[key]/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("robots");
    expect(content).toContain("index: false");
    expect(content).toContain("follow: false");
  });
});
