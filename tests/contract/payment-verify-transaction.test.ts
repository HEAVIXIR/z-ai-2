import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  currentUser: null as null | { id: string },
  denied: false,
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  subscriptionUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => state.currentUser,
}));
vi.mock("@/lib/authorization", () => ({
  requirePermission: async () => {
    if (state.denied) throw new Error("Forbidden");
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: state.transaction,
  },
}));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));

const { POST } = await import("@/app/api/payments/[id]/verify/route");

const payment = {
  id: "payment-1",
  userId: "user-1",
  status: "PENDING",
  amount: 250000n,
  type: "SUBSCRIPTION",
  subscriptionId: "subscription-1",
  trackingCode: null,
};
const subscription = {
  id: "subscription-1",
  userId: "user-1",
  status: "PENDING",
  paymentRef: null,
};

function request(body: unknown) {
  return new Request("http://localhost/api/payments/payment-1/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "payment-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  state.currentUser = { id: "admin-1" };
  state.denied = false;
  state.paymentFindUnique.mockResolvedValue(payment);
  state.paymentUpdate.mockResolvedValue({ ...payment, status: "PAID" });
  state.subscriptionFindUnique.mockResolvedValue(subscription);
  state.subscriptionUpdate.mockResolvedValue({ ...subscription, status: "ACTIVE" });
  state.auditCreate.mockResolvedValue({ id: "audit-1" });
  state.transaction.mockImplementation(async (operation: (tx: any) => Promise<unknown>) =>
    operation({
      payment: {
        findUnique: state.paymentFindUnique,
        update: state.paymentUpdate,
      },
      premiumSubscription: {
        findUnique: state.subscriptionFindUnique,
        update: state.subscriptionUpdate,
      },
      auditLog: { create: state.auditCreate },
    }),
  );
});

describe("payment verification transactional behavior", () => {
  it("commits payment, linked subscription activation, and audit in one transaction", async () => {
    const response = await POST(request({ status: "PAID" }), params);
    expect(response.status).toBe(200);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.paymentUpdate).toHaveBeenCalled();
    expect(state.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "ACTIVE", paymentRef: "payment-1" },
    });
    expect(state.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "payment.verify",
        actorId: "admin-1",
        entityType: "Payment",
      }),
    }));
    const payload = await response.json();
    expect(payload.payment.amount).toBe("250000");
  });

  it("does not mark a payment paid when the linked subscription is missing", async () => {
    state.subscriptionFindUnique.mockResolvedValue(null);
    const response = await POST(request({ status: "PAID" }), params);
    expect(response.status).toBe(409);
    expect(state.paymentUpdate).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("does not activate a subscription belonging to another user", async () => {
    state.subscriptionFindUnique.mockResolvedValue({ ...subscription, userId: "other-user" });
    const response = await POST(request({ status: "PAID" }), params);
    expect(response.status).toBe(409);
    expect(state.paymentUpdate).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects repeat verification for payments that are no longer pending", async () => {
    state.paymentFindUnique.mockResolvedValue({ ...payment, status: "PAID" });
    const response = await POST(request({ status: "FAILED" }), params);
    expect(response.status).toBe(409);
    expect(state.paymentUpdate).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("returns failure if the audit insert fails so the database transaction can roll back", async () => {
    state.auditCreate.mockRejectedValue(new Error("audit unavailable"));
    const response = await POST(request({ status: "PAID" }), params);
    expect(response.status).toBe(500);
    expect(state.paymentUpdate).toHaveBeenCalled();
    expect(state.subscriptionUpdate).toHaveBeenCalled();
    expect(state.auditCreate).toHaveBeenCalled();
  });
});
