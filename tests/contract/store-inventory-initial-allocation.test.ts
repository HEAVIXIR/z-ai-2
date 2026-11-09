import { describe, expect, it } from "vitest";
import fs from "node:fs";

const service = fs.readFileSync("src/lib/store-inventory-service.ts", "utf8");
const route = fs.readFileSync("src/app/api/admin/store/inventory/initial-allocation/route.ts", "utf8");
const page = fs.readFileSync("src/app/admin/store/inventory/reconciliation/page.tsx", "utf8");
const component = fs.readFileSync("src/app/admin/store/inventory/initial-stock-allocation.tsx", "utf8");
const transferRoute = fs.readFileSync("src/app/api/admin/store/inventory/transfers/route.ts", "utf8");
const transferPage = fs.readFileSync("src/app/admin/store/inventory/transfers/page.tsx", "utf8");
const transferForm = fs.readFileSync("src/app/admin/store/inventory/warehouse-transfer-form.tsx", "utf8");

describe("Explicit initial warehouse stock allocation", () => {
  it("locks the Part, requires an active warehouse, and creates exactly one opening balance", () => {
    const fn = service.slice(service.indexOf("export async function allocateInitialStock("));
    expect(fn).toContain('FOR UPDATE');
    expect(fn).toContain("warehouse.active");
    expect(fn).toContain("tx.inventoryBalance.count({ where: { partId } })");
    expect(fn).toContain("tx.inventoryBalance.create");
    expect(fn).toContain("isolationLevel: 'Serializable'");
    expect(fn).toContain("store.inventory.initial_allocation");
    expect(fn).not.toContain("tx.part.update");
    expect(fn).not.toContain("tx.part.updateMany");
  });

  it("protects the endpoint with CSRF, authentication, and inventory.manage", () => {
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("getCurrentUser()");
    expect(route).toContain('requirePermission(user.id, "inventory.manage")');
    expect(route).toContain("allocateInitialStock(partId, warehouseId, reason, user.id)");
  });

  it("offers explicit allocation only to inventory managers from the read-only reconciliation report", () => {
    expect(page).toContain('requirePermission(user.id, "inventory.manage")');
    expect(page).toContain("part.inventoryBalances.length === 0 && part.stock >= 0");
    expect(page).toContain("<InitialStockAllocation");
    expect(component).toContain("/api/admin/store/inventory/initial-allocation");
    expect(component).toContain("reason.trim()");
    expect(component).toContain("router.refresh()");
  });
});


describe("Atomic paired warehouse transfer", () => {
  it("locks Part, warehouses and balances in order and never changes the global Part snapshot", () => {
    const fn = service.slice(service.indexOf("export async function transferStock("));
    expect(fn).toContain('SELECT id FROM "Part"');
    expect(fn).toContain('SELECT id FROM "Warehouse"');
    expect(fn).toContain('ORDER BY id');
    expect(fn).toContain('ORDER BY "warehouseId" ASC');
    expect(fn).toContain("isolationLevel: 'Serializable'");
    expect(fn).toContain("tx.inventoryBalance.updateMany");
    expect(fn).toContain("type: 'TRANSFER'");
    expect(fn).toContain("reference: transferReference");
    expect(fn).toContain("store.inventory.transfer");
    expect(fn).not.toContain("tx.part.update");
    expect(fn).not.toContain("tx.part.updateMany");
  });

  it("protects the transfer endpoint with CSRF, authentication and inventory.manage", () => {
    expect(transferRoute).toContain("checkCsrf(req)");
    expect(transferRoute).toContain("getCurrentUser()");
    expect(transferRoute).toContain('requirePermission(user.id, "inventory.manage")');
    expect(transferRoute).toContain("transferStock(");
    expect(transferRoute).toContain("{ status: 201 }");
  });

  it("exposes a dedicated manager-only transfer page and a form that validates available stock", () => {
    expect(transferPage).toContain('requirePermission(user.id, "inventory.manage")');
    expect(transferPage).toContain("<WarehouseTransferForm");
    expect(transferForm).toContain("/api/admin/store/inventory/transfers");
    expect(transferForm).toContain("sourceBalance.quantity - sourceBalance.reserved");
    expect(transferForm).toContain("selectedPart.stock");
    expect(transferForm).toContain("router.refresh()");
  });
});
