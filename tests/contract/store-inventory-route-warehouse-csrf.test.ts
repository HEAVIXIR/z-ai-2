import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/store/inventory/route.ts", "utf8");
const form = fs.readFileSync("src/app/admin/store/inventory/inventory-adjustment-form.tsx", "utf8");

describe("Admin inventory movement route and form", () => {
  it("requires CSRF, inventory.manage, and an explicit warehouse on every write", () => {
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("requirePermission(user.id, 'inventory.manage')");
    expect(route).toContain('typeof warehouseId !== "string"');
    expect(route).toContain("adjustStock(");
    expect(route).not.toContain("createMovement(");
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
