import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn(),
  updatePaymentMany: vi.fn(),
  updateSubscriptionMany: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
}));

let mockCurrentUser: { id: string } | null = null;
let mockRequirePermissionThrows = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  requirePermission: async () => {
    if (mockRequirePermissionThrows) throw new Error("Forbidden");
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));

const { POST } = await import("@/app/api/payments/[id]/verify/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser = null;
  mockRequirePermissionThrows = false;
  mocks.findPayment.mockResolvedValue({
    id: "p1",
    status: "PENDING",
    amount: 1000n,
    type: "SUBSCRIPTION",
    subscriptionId: "sub-1",
    userId: "seller-1",
    paidAt: null,
  });
  mocks.updatePaymentMany.mockResolvedValue({ count: 1 });
  mocks.updateSubscriptionMany.mockResolvedValue({ count: 1 });
  mocks.createAudit.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      payment: {
        findUnique: mocks.findPayment,
        updateMany: mocks.updatePaymentMany,
      },
      premiumSubscription: {
        updateMany: mocks.updateSubscriptionMany,
      },
      auditLog: { create: mocks.createAudit },
    }),
  );
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/payments/p1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ARGS = { params: Promise.resolve({ id: "p1" }) };

describe("POST /api/payments/[id]/verify", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);
    expect(res.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("NEGATIVE: user without payment.manage → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockRequirePermissionThrows = true;
    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);
    expect(res.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("POSITIVE: admin verifies a pending subscription in one transaction", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.findPayment
      .mockResolvedValueOnce({
        id: "p1", status: "PENDING", amount: 1000n, type: "SUBSCRIPTION",
        subscriptionId: "sub-1", userId: "seller-1", paidAt: null,
      })
      .mockResolvedValueOnce({
        id: "p1", status: "PAID", amount: 1000n, type: "SUBSCRIPTION",
        subscriptionId: "sub-1", userId: "seller-1", paidAt: new Date(),
      });

    const res = await POST(makeReq({ status: "PAID", reason: "bank receipt checked" }), ARGS);

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updatePaymentMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "p1", status: "PENDING" },
    }));
    expect(mocks.updateSubscriptionMany).toHaveBeenCalledWith({
      where: { id: "sub-1", userId: "seller-1" },
      data: { status: "ACTIVE", paymentRef: "p1" },
    });
    expect(mocks.createAudit).toHaveBeenCalledOnce();
  });

  it("NEGATIVE: stale/concurrent payment transition → 409 and no subscription activation", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.updatePaymentMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);

    expect(res.status).toBe(409);
    expect(mocks.updateSubscriptionMany).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("NEGATIVE: linked subscription owned by another user → 409", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.updateSubscriptionMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);

    expect(res.status).toBe(409);
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("NEGATIVE: payment not PENDING → 409 without mutation", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.findPayment.mockResolvedValue({
      id: "p1", status: "PAID", amount: 1000n, type: "SUBSCRIPTION",
      subscriptionId: "sub-1", userId: "seller-1", paidAt: new Date(),
    });

    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);

    expect(res.status).toBe(409);
    expect(mocks.updatePaymentMany).not.toHaveBeenCalled();
    expect(mocks.updateSubscriptionMany).not.toHaveBeenCalled();
  });

  it("NEGATIVE: refunds are not accepted through the verification endpoint", async () => {
    mockCurrentUser = { id: "admin-1" };

    const res = await POST(makeReq({ status: "REFUNDED" }), ARGS);

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("NEGATIVE: SUBSCRIPTION payment without a subscription link → 409", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.findPayment.mockResolvedValue({
      id: "p1", status: "PENDING", amount: 1000n, type: "SUBSCRIPTION",
      subscriptionId: null, userId: "seller-1", paidAt: null,
    });

    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);

    expect(res.status).toBe(409);
    expect(mocks.updatePaymentMany).not.toHaveBeenCalled();
  });

  it("NEGATIVE: audit failure aborts the transaction", async () => {
    mockCurrentUser = { id: "admin-1" };
    mocks.findPayment
      .mockResolvedValueOnce({
        id: "p1", status: "PENDING", amount: 1000n, type: "SUBSCRIPTION",
        subscriptionId: "sub-1", userId: "seller-1", paidAt: null,
      })
      .mockResolvedValueOnce({
        id: "p1", status: "PAID", amount: 1000n, type: "SUBSCRIPTION",
        subscriptionId: "sub-1", userId: "seller-1", paidAt: new Date(),
      });
    mocks.createAudit.mockRejectedValue(new Error("audit unavailable"));

    const res = await POST(makeReq({ status: "PAID", reason: "reviewed bank evidence" }), ARGS);

    expect(res.status).toBe(500);
    expect(mocks.createAudit).toHaveBeenCalledOnce();
  });

  it("NEGATIVE: missing or too-short audit reason is rejected", async () => {
    mockCurrentUser = { id: "admin-1" };
    const missing = await POST(makeReq({ status: "PAID" }), ARGS);
    expect(missing.status).toBe(400);
    const short = await POST(makeReq({ status: "PAID", reason: "ok" }), ARGS);
    expect(short.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("NEGATIVE: malformed/non-object payloads are rejected", async () => {
    mockCurrentUser = { id: "admin-1" };
    const invalidJson = new Request("http://localhost/api/payments/p1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const malformed = await POST(invalidJson, ARGS);
    expect(malformed.status).toBe(400);

    const arrayBody = await POST(makeReq([]), ARGS);
    expect(arrayBody.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("payment verification source contract", () => {
  it("does not use the generic authentication-only gate", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/payments/[id]/verify/route.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/);
    expect(source).toContain('requirePermission(user.id, "payment.manage")');
  });

  it("keeps payment, subscription activation and audit inside one transaction", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/payments/[id]/verify/route.ts"),
      "utf-8",
    );
    expect(source).toContain("await db.$transaction(async (tx) =>");
    expect(source).toContain('where: { id, status: "PENDING" }');
    expect(source).toContain("tx.premiumSubscription.updateMany");
    expect(source).toContain("tx.auditLog.create");
    expect(source).not.toContain("await logAudit(");
  });
});
