import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("subscription billing release gate", () => {
  it("rejects manual subscription payment creation at the API boundary", () => {
    const source = read("src/app/api/admin/payments/route.ts");
    expect(source).toContain('if (type === "SUBSCRIPTION")');
    expect(source).toContain('"SUBSCRIPTION_BILLING_UNAVAILABLE"');
    expect(source).toContain('["FEATURED_LISTING", "PROMOTION", "LEAD_FEE", "INSPECTION_FEE"]');
    expect(source).not.toContain("premiumSubscription.updateMany");
  });

  it("rejects paid verification for legacy subscription payments in the direct API", () => {
    const source = read("src/app/api/payments/[id]/verify/route.ts");
    expect(source).toContain('status === "PAID" && before.type === "SUBSCRIPTION"');
    expect(source).toContain("SubscriptionBillingUnavailableError");
    expect(source).not.toContain("tx.premiumSubscription.updateMany");
  });

  it("keeps the generic admin action engine fail-closed for subscription verification", () => {
    const source = read("src/lib/admin/action-engine.ts");
    expect(source).toContain("SUBSCRIPTION_BILLING_UNAVAILABLE");
    expect(source).toContain("String(before.type ?? '') === 'SUBSCRIPTION'");
    expect(source).not.toContain("txClient as any).premiumSubscription.updateMany");
  });

  it("does not offer manual subscription payments in the admin UI", () => {
    const source = read("src/app/admin/subscriptions/PaymentsAdminClient.tsx");
    expect(source).not.toContain('<option value="SUBSCRIPTION">');
    expect(source).not.toContain("subscriptionId: form.subscriptionId");
    expect(source).toContain("FEATURED_LISTING");
  });
});
