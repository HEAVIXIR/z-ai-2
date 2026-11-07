import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/store-inventory-service.ts", "utf8");
const start = source.indexOf("export async function adjustStock(");
const end = source.indexOf("\n// ── reserveStock", start);
if (start < 0 || end < 0) throw new Error("adjustStock function boundaries not found");
const body = source.slice(start, end);

describe("Warehouse stock adjustment invariants", () => {
  it("fails closed instead of implicitly creating a first or missing warehouse balance", () => {
    expect(body).toContain("balances.length === 0");
    expect(body).toContain("!targetBalance");
    expect(body).not.toContain("tx.inventoryBalance.upsert");
  });

  it("prevents a negative adjustment from consuming reserved units", () => {
    expect(body).toContain("targetBalance.quantity - targetBalance.reserved < -qty");
    expect(body).toContain("reserved: targetBalance.reserved");
  });

  it("acquires stock mutation locks in the global Part then Balance order", () => {
    const partClaim = body.indexOf("tx.part.updateMany");
    const balanceClaim = body.indexOf("tx.inventoryBalance.updateMany");
    expect(partClaim).toBeGreaterThan(-1);
    expect(balanceClaim).toBeGreaterThan(-1);
    expect(partClaim).toBeLessThan(balanceClaim);
  });

  it("commits Part, InventoryBalance, StockMovement, and all audit outbox events together", () => {
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.stockMovement.create");
    expect(body.match(/await enqueueAuditOutbox\(/g)?.length).toBe(3);
    expect(body).toContain("isolationLevel");
  });
});
