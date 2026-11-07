/**
 * Payment resource behavior tests.
 *
 * Refund initiation is intentionally unavailable until a dedicated
 * immutable refund record captures verified money movement. The tests
 * therefore prove that a refund action is absent and fails before any
 * database or audit mutation, while preserving the transactional verify
 * behavior for PENDING payments.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

import { db } from "@/lib/db";
import "@/lib/admin/resource-index";
import { executeAction } from "@/lib/admin/action-engine";
import { paymentConfig } from "@/lib/admin/resources/store-resources";

const RUN = !!process.env.DATABASE_URL;
let adminId = "";
let buyerId = "";
let adminRole: any;
let buyerRole: any;
const createdPaymentIds: string[] = [];
const ts = Date.now();

beforeAll(async () => {
  if (!RUN) return;
  adminRole = await (db as any).role.findUnique({ where: { key: "ADMIN" } });
  buyerRole = await (db as any).role.findUnique({ where: { key: "BUYER" } });
  if (!adminRole || !buyerRole) throw new Error("roles not seeded");

  const createUser = async (first: string, suffix: string, roleId: string) => {
    const user = await (db as any).user.create({
      data: {
        firstName: first,
        lastName: "PaymentTest",
        email: `payment-test-${suffix}-${ts}@test.local`,
        mobile: `0914${String(ts).slice(-7)}${suffix}`,
        passwordHash: "x",
        status: "ACTIVE",
        userType: "BUSINESS",
      },
    });
    await (db as any).userRole.create({ data: { userId: user.id, roleId } });
    return user.id;
  };
  adminId = await createUser("Admin", "1", adminRole.id);
  buyerId = await createUser("Buyer", "2", buyerRole.id);
}, 60000);

afterAll(async () => {
  if (!RUN) return;
  await (db as any).payment.deleteMany({ where: { id: { in: createdPaymentIds } } }).catch(() => {});
  await (db as any).auditLog.deleteMany({ where: { actorId: { in: [adminId, buyerId] } } }).catch(() => {});
  await (db as any).userRole.deleteMany({ where: { userId: { in: [adminId, buyerId] } } }).catch(() => {});
  await (db as any).user.deleteMany({ where: { id: { in: [adminId, buyerId] } } }).catch(() => {});
}, 60000);

async function seedPayment(status: string, suffix: string) {
  const payment = await (db as any).payment.create({
    data: {
      userId: adminId,
      amount: BigInt(50000),
      currency: "IRR",
      type: "ORDER_PAYMENT",
      status,
      gateway: "MANUAL",
      trackingCode: `tc-${ts}-${suffix}`,
    },
  });
  createdPaymentIds.push(payment.id);
  return payment;
}

describe("STEP 12.29 — payment action boundaries", () => {
  it("does not expose the generic status-only refund action", () => {
    expect(paymentConfig.actions?.some((action) => action.key === "refund")).toBe(false);
    expect(paymentConfig.actions?.some((action) => action.key === "verify")).toBe(true);
  });

  it.skipIf(!RUN)("admin refund attempt is rejected before mutation and audit", async () => {
    const payment = await seedPayment("PAID", "refund-disabled");
    const result = await executeAction("payments", payment.id, "refund", {
      userId: adminId,
      reason: "test refund",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("ACTION_UNAVAILABLE");
    expect(result.message).toMatch(/evidence-backed refund workflow/);

    const row = await (db as any).payment.findUnique({ where: { id: payment.id } });
    expect(row.status).toBe("PAID");
    const audit = await (db as any).auditLog.count({
      where: { actorId: adminId, action: "payments.refund", entityId: payment.id },
    });
    expect(audit).toBe(0);
  });

  it.skipIf(!RUN)("admin verifies a PENDING payment transactionally", async () => {
    const payment = await seedPayment("PENDING", "verify");
    const result = await executeAction("payments", payment.id, "verify", { userId: adminId });
    expect(result.success).toBe(true);

    const row = await (db as any).payment.findUnique({ where: { id: payment.id } });
    expect(row.status).toBe("PAID");
    expect(row.paidAt).not.toBeNull();
    const audit = await (db as any).auditLog.count({
      where: { actorId: adminId, action: "payments.verify", entityId: payment.id },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!RUN)("buyer cannot verify a PENDING payment", async () => {
    const payment = await seedPayment("PENDING", "buyer-verify");
    const result = await executeAction("payments", payment.id, "verify", { userId: buyerId });
    expect(result.success).toBe(false);
    expect(result.error).toBe("FORBIDDEN");
    const row = await (db as any).payment.findUnique({ where: { id: payment.id } });
    expect(row.status).toBe("PENDING");
  });
});
