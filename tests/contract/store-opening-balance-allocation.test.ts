import { describe, expect, it } from "vitest";
import fs from "node:fs";

const service = fs.readFileSync("src/lib/store-opening-balance-service.ts", "utf8");
const route = fs.readFileSync("src/app/api/admin/store/inventory/opening-balance/route.ts", "utf8");
const panel = fs.readFileSync("src/app/admin/store/inventory/opening-balance-allocation-panel.tsx", "utf8");
const page = fs.readFileSync("src/app/admin/store/inventory/page.tsx", "utf8");

describe("Explicit opening-balance allocation", () => {
  it("only lists active positive-stock parts without any inventory balances", () => {
    expect(service).toContain("active: true");
    expect(service).toContain("FOR SHARE");
    expect(service).toContain("stock: { gt: 0 }");
    expect(service).toContain("inventoryBalances: { none: {} }");
  });

  it("locks the Part first and fails closed if a balance already exists", () => {
    const lock = service.indexOf('SELECT id FROM "Part"');
    const balanceCount = service.indexOf("tx.inventoryBalance.count");
    expect(lock).toBeGreaterThan(-1);
    expect(balanceCount).toBeGreaterThan(lock);
    expect(service).toContain("if (existing !== 0)");
  });

  it("requires unique active warehouses and exact positive safe-integer allocation", () => {
    expect(service).toContain("seen.has(allocation.warehouseId)");
    expect(service).toContain("Number.isSafeInteger(allocation.quantity)");
    expect(service).toContain("requestedTotal !== part.stock");
    expect(service).toContain("active: true");
  });

  it("creates balances, opening movements and audit outbox events in one transaction without changing Part.stock", () => {
    expect(service).toContain("storeDb.$transaction");
    expect(service).toContain("tx.inventoryBalance.create");
    expect(service).toContain("tx.stockMovement.create");
    expect(service).toContain("enqueueAuditOutbox(tx");
    expect(service).toContain("partStockUnchanged: part.stock");
    expect(service).not.toContain("tx.part.update");
    expect(service).not.toContain("tx.part.updateMany");
  });

  it("protects the API with CSRF, inventory permissions and explicit confirmation", () => {
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("inventory.read");
    expect(route).toContain("inventory.manage");
    expect(route).toContain("payload.confirm !== true");
  });

  it("keeps procurement receiving and return restocking on the canonical Part-first lock order", () => {
    const procurement = fs.readFileSync("src/lib/store-procurement-service.ts", "utf8");
    const returns = fs.readFileSync("src/lib/store-returns-service.ts", "utf8");
    const procurementLock = procurement.indexOf('SELECT id FROM "Part"');
    const procurementRead = procurement.indexOf("const part = await tx.part.findUnique", procurementLock);
    const procurementBalanceRead = procurement.indexOf("tx.inventoryBalance.findMany", procurementRead);
    expect(procurementLock).toBeGreaterThan(-1);
    expect(procurementRead).toBeGreaterThan(procurementLock);
    expect(procurementBalanceRead).toBeGreaterThan(procurementRead);
    expect(procurement).toContain("FOR SHARE");

    const returnLock = returns.indexOf('SELECT id FROM "Part"');
    const returnRead = returns.indexOf("tx.part.findUnique", returnLock);
    const returnBalanceRead = returns.indexOf("tx.inventoryBalance.findMany", returnRead);
    expect(returnLock).toBeGreaterThan(-1);
    expect(returnRead).toBeGreaterThan(returnLock);
    expect(returnBalanceRead).toBeGreaterThan(returnRead);
    expect(returns).toContain("FOR SHARE");
  });

  it("returns a client error for malformed JSON and non-object request bodies", () => {
    expect(route).toContain("بدنه درخواست JSON معتبر نیست");
    expect(route).toContain("typeof body !== \"object\" || Array.isArray(body)");
    expect(route).toContain("{ status: 400 }");
  });

  it("previews totals and requires an explicit operator checkbox before submitting", () => {
    expect(panel).toContain("allocated === selectedPart.stock");
    expect(panel).toContain("!invalidQuantity");
    expect(panel).toContain("Number.isSafeInteger(quantity) || quantity < 0");
    expect(panel).toContain("checked={confirmed}");
    expect(panel).toContain("confirm: true");
    expect(panel).toContain("!confirmed");
    expect(page).toContain("<OpeningBalanceAllocationPanel />");
  });
});
