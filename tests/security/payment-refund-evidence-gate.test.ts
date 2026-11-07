import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("marketplace refund evidence gate", () => {
  it("does not expose a status-only refund action for Payment", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/admin/resources/store-resources.ts"),
      "utf8",
    );
    const start = source.indexOf("export const paymentConfig:");
    const end = source.indexOf("export const companyConfig:", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const payment = source.slice(start, end);

    expect(payment).not.toMatch(/key:\s*['"]refund['"]/);
    expect(payment).toContain("key: 'verify'");
    expect(payment).toContain("actions: ['payment.manage']");
    expect(payment).not.toContain("'payment.refund'");
  });

  it("documents why refund remains unavailable until money-movement evidence exists", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/admin/resources/store-resources.ts"),
      "utf8",
    );
    expect(source).toContain("immutable refund record");
    expect(source).toContain("status-only transition");
  });
});
