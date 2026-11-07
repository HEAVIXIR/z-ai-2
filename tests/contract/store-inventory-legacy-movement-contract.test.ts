import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/store-inventory-service.ts", "utf8");
const start = source.indexOf("export async function createMovement(");
const end = source.indexOf("\n// ── listMovements", start);
if (start < 0 || end < 0) throw new Error("createMovement function boundaries not found");
const body = source.slice(start, end);

describe("Legacy inventory movement safety contract", () => {
  it("commits stock snapshot, movement ledger, and audit outbox in one Store transaction", () => {
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.part.updateMany");
    expect(body).toContain("tx.stockMovement.create");
    expect(body).toContain("enqueueAuditOutbox");
    expect(body).not.toContain("logAudit(");
  });

  it("fails closed for warehouse-managed parts without an explicit warehouse", () => {
    expect(body).toContain("tx.inventoryBalance.count");
    expect(body).toContain("warehouseBalanceCount > 0");
    expect(body).toContain("warehouseId: null");
    expect(body).toMatch(/new InventoryServiceError\(\s*409,/);
  });

  it("uses a compare-and-set predicate instead of stale absolute stock replacement", () => {
    expect(body).toContain("where: { id: partId, stock: part.stock }");
    expect(body).toContain("data: { stock: { increment: qty } }");
    expect(body).not.toContain("data: { stock: balanceAfter }");
  });
});
