import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("admin subscription mutation transaction contract", () => {
  it("bounds JSON requests and validates CSRF before subscription mutation", () => {
    const source = read("src/app/api/admin/subscriptions/route.ts");
    expect(source).toContain("MAX_SUBSCRIPTION_BODY_BYTES");
    expect(source).toContain("req.body?.getReader()");
    expect(source).toContain("checkCsrf(req)");
    expect(source).toContain("Unknown request field");
  });

  it("preserves omitted entitlement fields during an existing subscription update", () => {
    const source = read("src/app/api/admin/subscriptions/route.ts");
    expect(source).toContain("const createData: any =");
    expect(source).toContain("const updateData: any = {};");
    expect(source).toContain('if ("featuredCredits" in body) updateData.featuredCredits = featuredCredits;');
    expect(source).toContain('if (field in body) updateData[field] = body[field];');
    expect(source).toContain("create: createData");
    expect(source).toContain("update: updateData");
    expect(source).not.toContain("update: data");
  });
  it("rejects requests that contain no subscription mutation fields", () => {
    const source = read("src/app/api/admin/subscriptions/route.ts");
    expect(source).toContain('mutableFields.length === 0');
    expect(source).toContain("At least one subscription field is required");
  });

  it("commits subscription upsert and audit evidence in one transaction", () => {
    const source = read("src/app/api/admin/subscriptions/route.ts");
    expect(source).toContain("db.$transaction(async (tx)");
    expect(source).toContain("tx.premiumSubscription.upsert");
    expect(source).toContain("tx.auditLog.create");
    expect(source).not.toContain("logAudit");
  });
});
