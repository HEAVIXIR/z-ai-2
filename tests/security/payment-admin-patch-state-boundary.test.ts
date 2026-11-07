import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("admin payment generic PATCH state boundary", () => {
  it("allows tracking metadata only and rejects financial state mutation", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/admin/payments/[id]/route.ts"),
      "utf8",
    );
    expect(source).toContain('const forbiddenFields = ["status", "type", "gateway", "paidAt"]');
    expect(source).toContain('code: "PAYMENT_STATE_ACTION_REQUIRED"');
    expect(source).toContain("Only trackingCode metadata can be updated through PATCH");
    expect(source).toContain("data: { trackingCode }");
  });

  it("keeps payment state changes in the audited verify/refund action path", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/admin/payments/[id]/route.ts"),
      "utf8",
    );
    expect(source).toContain("use the audited verify/refund action");
    expect(source).not.toContain("data.status =");
    expect(source).not.toContain("data.paidAt =");
  });
});
