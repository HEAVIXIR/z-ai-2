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
  it("updates and deletes plans with atomic before/after audit snapshots", () => {
    expect(detail).toContain("tx.subscriptionPlan.update");
    expect(detail).toContain("tx.subscriptionPlan.delete");
    expect(detail).toContain("tx.auditLog.create");
    expect(detail).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(detail).not.toContain("logAudit");
  });
  it("rejects unknown, coercive, malformed and out-of-range values", () => {
    expect(input).toContain("16 * 1024");
    expect(input).toContain("req.body?.getReader()");
    expect(input).toContain("if (!ALLOWED.has(key))");
    expect(input).toContain("MAX_I64");
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", unexpected: true }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", active: "false" }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({ code: "PRO", nameFa: "حرفه‌ای", priceMonthly: "-1" }, "create").ok).toBe(false);
    expect(parseSubscriptionPlanInput({}, "update").ok).toBe(false);
  });
  it("requires CSRF validation for every subscription-plan mutation", () => {
    expect(collection).toContain("checkCsrf(req)");
    expect(detail.match(/checkCsrf\(req\)/g)).toHaveLength(2);
  });
});
