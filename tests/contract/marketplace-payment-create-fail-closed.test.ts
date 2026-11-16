import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("legacy marketplace payment-create endpoint fail-closed contract", () => {
  it("does not create ledger rows from client-supplied prices before a real gateway exists", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/payments/create/route.ts"),
      "utf8",
    );
    expect(source).toContain("MARKETPLACE_PAYMENT_UNAVAILABLE");
    expect(source).toContain("{ status: 503 }");
    expect(source).not.toContain("db.payment.create");
    expect(source).not.toContain("parseBig(body.amount)");
  });
});
