import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/api/admin/payments/route.ts"),
  "utf8",
);

describe("admin payments read endpoint hardening", () => {
  it("requires payment.read before querying the payment ledger", () => {
    const permission = source.indexOf('hasPermission(sessionUser.id, "payment.read")');
    const query = source.indexOf("db.payment.findMany");
    expect(permission).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(permission);
  });

  it("rejects invalid pagination, status, type, and oversized user filters", () => {
    expect(source).toContain("Number.isSafeInteger(take)");
    expect(source).toContain("take < 1 || take > 500");
    expect(source).toContain("allowedStatuses.has(status)");
    expect(source).toContain("allowedTypes.has(type)");
    expect(source).toContain("userId.length > 128");
  });

  it("never returns raw database or runtime exception messages to the caller", () => {
    expect(source).toContain('{ error: "Unable to load payments" }');
    expect(source).not.toContain("err?.message ??");
    expect(source).not.toContain("{ error: err.message }");
  });
});
