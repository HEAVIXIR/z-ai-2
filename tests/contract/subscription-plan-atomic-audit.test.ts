import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSubscriptionPlanInput } from "../../src/lib/admin/subscription-plan-input";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("admin subscription-plan mutation safety", () => {
  const collection = read("src/app/api/admin/subscription-plans/route.ts");
  const detail = read("src/app/api/admin/subscription-plans/[id]/route.ts");
  const input = read("src/lib/admin/subscription-plan-input.ts");

  it("creates a plan and its audit event in the same transaction", () => {
    expect(collection).toContain("db.$transaction(async (tx)");
    expect(collection).toContain("tx.subscriptionPlan.create");
    expect(collection).toContain("tx.auditLog.create");
    expect(collection).not.toContain("logAudit");
  });

  it("updates a plan with before/after audit snapshots atomically", () => {
    expect(detail).toContain("tx.subscriptionPlan.update");
    expect(detail).toContain("tx.auditLog.create");
    expect(detail).toContain("beforeJson: auditSnapshot(before)");
    expect(detail).toContain("afterJson: auditSnapshot(updated)");
    expect(detail).not.toContain("logAudit");
  });

  it("deletes only unused plans and audits the deletion transactionally", () => {
    expect(detail).toContain("tx.premiumSubscription.count");
    expect(detail).toContain("tx.subscriptionPlan.delete");
    expect(detail).toContain('action: "admin.subscriptionPlans.delete"');
    expect(detail).toContain("tx.auditLog.create");
  });

  it("bounds request size and rejects unknown fields and malformed values", () => {
    expect(input).toContain("16 * 1024");
    expect(input).toContain("if (!ALLOWED.has(key))");
    expect(input).toContain("MAX_I64");
    expect(input).toContain("Array.isArray(parsed)");
    expect(input).toContain("حداقل یک فیلد");
  });

  it("rejects unknown fields, coercive booleans, negative prices, and empty PATCHes", () => {
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", unexpected: true }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", active: "false" }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", priceMonthly: "-1" }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({}, "update").ok).toBe(false);
  });

  it("normalizes valid values and enforces the signed 64-bit money ceiling", () => {
    const result = parseSubscriptionPlanInput({
      code: "PRO",
      nameFa: "حرفه‌ای",
      priceMonthly: "120000",
      analyticsAccess: true,
      featuresJson: ["پشتیبانی", "گزارش"],
    }, "create");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currency).toBe("IRR");
      expect(result.data.maxImages).toBe(8);
      expect(result.data.priceMonthly).toBe(120000n);
      expect(result.data.featuresJson).toBe('["پشتیبانی","گزارش"]');
    }
    expect(parseSubscriptionPlanInput({
      code: "PRO",
      nameFa: "حرفه‌ای",
      priceMonthly: "9223372036854775808",
    }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({
      code: "PRO",
      nameFa: "حرفه‌ای",
      priceMonthly: Number.MAX_SAFE_INTEGER + 1,
    }, "create").ok).toBe(false);
  });
});
