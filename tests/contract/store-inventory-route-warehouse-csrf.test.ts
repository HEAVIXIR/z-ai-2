import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/store/inventory/route.ts", "utf8");
const form = fs.readFileSync("src/app/admin/store/inventory/inventory-adjustment-form.tsx", "utf8");
const reserveRoute = fs.readFileSync("src/app/api/admin/store/inventory/reserve/route.ts", "utf8");
const releaseRoute = fs.readFileSync("src/app/api/admin/store/inventory/release/route.ts", "utf8");
const malformedMutationRoutes = [
  "src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/receive/route.ts",
  "src/app/api/admin/store/returns/[id]/items/route.ts",
  "src/app/api/admin/store/returns/[id]/route.ts",
  "src/app/api/store/orders/route.ts",
  "src/app/api/admin/store/warehouses/route.ts",
  "src/app/api/admin/store/warehouses/[id]/route.ts",
].map((path) => fs.readFileSync(path, "utf8"));

describe("Admin inventory movement route and form", () => {
  it("requires CSRF, inventory.manage, and an explicit warehouse on every write", () => {
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("requirePermission(user.id, 'inventory.manage')");
    expect(route).toContain('typeof warehouseId !== "string"');
    expect(route).toContain("adjustStock(");
    expect(route).not.toContain("createMovement(");
  });

  it("returns HTTP 400 for malformed or non-object mutation JSON", () => {
    for (const source of [route, reserveRoute, releaseRoute]) {
      expect(source).toContain("let body: unknown");
      expect(source).toContain("body = await req.json()");
      expect(source).toContain("بدنه درخواست JSON معتبر نیست");
      expect(source).toContain("Array.isArray(body)");
      expect(source).toContain("{ status: 400 }");
    }
    expect(reserveRoute).toContain("Number.isSafeInteger(payload.quantity)");
    expect(releaseRoute).toContain("Number.isSafeInteger(payload.quantity)");
  });

  it("returns HTTP 400 for malformed JSON and non-object bodies on stock-affecting routes", () => {
    for (const source of malformedMutationRoutes) {
      expect(source).toContain("بدنه درخواست JSON معتبر نیست");
      expect(source).toContain("Array.isArray");
      expect(source).toContain("{ status: 400 }");
    }
  });

  it("does not expose one-sided RETURN or TRANSFER actions in the adjustment form", () => {
    expect(form).not.toContain('value="RETURN"');
    expect(form).not.toContain('value="TRANSFER"');
    expect(form).toContain('value="RECEIVE"');
    expect(form).toContain('value="SALE"');
    expect(form).toContain('value="DAMAGE"');
    expect(form).toContain('value="ADJUSTMENT"');
  });

  it("requires a reason and sends a signed quantity with the selected warehouse", () => {
    expect(form).toContain("!reason.trim()");
    expect(form).toContain("warehouseId,");
    expect(form).toContain("quantity: signedQuantity");
    expect(form).toContain('method: "POST"');
  });
});
