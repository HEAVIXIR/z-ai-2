import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/store/inventory/route.ts", "utf8");
const form = fs.readFileSync("src/app/admin/store/inventory/inventory-adjustment-form.tsx", "utf8");
const resourceConfig = fs.readFileSync("src/lib/admin/resources/store-domain-resources.ts", "utf8");

describe("Universal inventory resource form safety", () => {
  it("does not offer unsupported one-sided RETURN or TRANSFER writes", () => {
    const fieldsStart = resourceConfig.indexOf("  fields: [", resourceConfig.indexOf("export const inventoryConfig"));
    const fieldsEnd = resourceConfig.indexOf("  detailTabs:", fieldsStart);
    expect(fieldsStart).toBeGreaterThanOrEqual(0);
    expect(fieldsEnd).toBeGreaterThan(fieldsStart);
    const createFields = resourceConfig.slice(fieldsStart, fieldsEnd);
    expect(createFields).not.toContain("{ value: 'RETURN'");
    expect(createFields).not.toContain("{ value: 'TRANSFER'");
    // Historical ledger filters remain searchable without exposing invalid writes.
    expect(resourceConfig).toContain("{ value: 'RETURN', label: 'مرجوعی' }");
    expect(resourceConfig).toContain("{ value: 'TRANSFER', label: 'انتقال' }");
    expect(createFields).toContain("{ key: 'warehouseId', label: 'انبار', type: 'relation', required: true");
  });
});


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
