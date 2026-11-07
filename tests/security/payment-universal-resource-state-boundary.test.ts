import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Universal Resource payment mutation boundaries", () => {
  it("disables generic Payment creation", () => {
    const route = read("src/app/api/admin/resources/[resource]/route.ts");
    expect(route).toContain('if (resourceKey === "payments")');
    expect(route).toContain('code: "PAYMENT_CREATE_ACTION_REQUIRED"');
  });

  it("allows generic Payment PATCH only for trackingCode metadata", () => {
    const route = read("src/app/api/admin/resources/[resource]/[id]/route.ts");
    expect(route).toContain('if (resourceKey === "payments")');
    expect(route).toContain('key !== "trackingCode"');
    expect(route).toContain('code: "PAYMENT_STATE_ACTION_REQUIRED"');
  });

  it("removes generic create permission and financial edit fields from payment config", () => {
    const config = read("src/lib/admin/resources/store-resources.ts");
    const start = config.indexOf("export const paymentConfig");
    const end = config.indexOf("\n};", start);
    const payment = config.slice(start, end);
    expect(payment).not.toMatch(/permissions:\s*\{[^}]*create:/s);
    const fieldsStart = payment.indexOf("  fields: [");
    const fieldsEnd = payment.indexOf("  ],", fieldsStart);
    const fields = payment.slice(fieldsStart, fieldsEnd);
    expect(fields).toContain("trackingCode");
    expect(fields).not.toContain("key: 'status'");
    expect(fields).not.toContain("key: 'type'");
    expect(fields).not.toContain("key: 'gateway'");
    expect(fields).not.toContain("key: 'amount'");
  });

  it("activates a same-user subscription inside the universal verify transaction", () => {
    const engine = read("src/lib/admin/action-engine.ts");
    expect(engine).toContain('resourceKey === "payments" && actionKey === "verify"');
    expect(engine).toContain("txClient as any).premiumSubscription.updateMany");
    expect(engine).toContain("userId: String(txBefore.userId ?? \"\")");
    expect(engine).toContain("SUBSCRIPTION_PAYMENT_LINK_MISMATCH");
  });
});
