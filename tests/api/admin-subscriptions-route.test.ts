import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn(),
  checkCsrf: vi.fn(),
  userFindUnique: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  subscriptionUpsert: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/admin/subscriptions/route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const existingSubscription = {
  id: "subscription-1",
  userId: "target-user",
  plan: "PRO",
  status: "ACTIVE",
  featuredCredits: 2,
  analyticsAccess: true,
  aiAssistantAccess: false,
  priorityLeads: true,
  companyPage: true,
  paymentRef: "existing-payment-ref",
  amount: 125000n,
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-user" });
  mocks.hasPermission.mockResolvedValue(true);
  mocks.checkCsrf.mockReturnValue(true);
  mocks.userFindUnique.mockResolvedValue({ id: "target-user" });
  mocks.subscriptionFindUnique.mockResolvedValue(existingSubscription);
  mocks.subscriptionUpsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
    ...existingSubscription,
    ...update,
  }));
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      user: { findUnique: mocks.userFindUnique },
      premiumSubscription: {
        findUnique: mocks.subscriptionFindUnique,
        upsert: mocks.subscriptionUpsert,
      },
      auditLog: { create: mocks.auditCreate },
    }),
  );
});

describe("POST /api/admin/subscriptions behavioral regression", () => {
  it("preserves omitted entitlement and payment fields during a partial update", async () => {
    const response = await POST(makeRequest({
      userId: "target-user",
      featuredCredits: 3,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpsert).toHaveBeenCalledOnce();
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "target-user" },
      update: { featuredCredits: 3 },
    }));
    expect(payload.subscription.analyticsAccess).toBe(true);
    expect(payload.subscription.priorityLeads).toBe(true);
    expect(payload.subscription.companyPage).toBe(true);
    expect(payload.subscription.paymentRef).toBe("existing-payment-ref");
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });

  it("returns a zero BigInt amount as the string \"0\"", async () => {
    mocks.subscriptionUpsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
      ...existingSubscription,
      ...update,
      amount: update.amount,
    }));

    const response = await POST(makeRequest({
      userId: "target-user",
      amount: "0",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subscription.amount).toBe("0");
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { amount: 0n },
    }));
  });

  it("rejects a user-only request before opening a database transaction", async () => {
    const response = await POST(makeRequest({ userId: "target-user" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("At least one subscription field is required");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
  });
});
