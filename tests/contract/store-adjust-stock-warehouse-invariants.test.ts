import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/store-inventory-service.ts", "utf8");
const start = source.indexOf("export async function adjustStock(");
const end = source.indexOf("\n// ── reserveStock", start);
if (start < 0 || end < 0) throw new Error("adjustStock function boundaries not found");
const body = source.slice(start, end);
const reserveStart = source.indexOf("export async function reserveStock(");
const releaseStart = source.indexOf("export async function releaseStock(", reserveStart);
const nextSection = source.indexOf("\n// ── ", releaseStart);
if (reserveStart < 0 || releaseStart < 0 || nextSection < 0) {
  throw new Error("reserve/release function boundaries not found");
}
const reserveBody = source.slice(reserveStart, releaseStart);
const releaseBody = source.slice(releaseStart, nextSection);

describe("Warehouse stock adjustment invariants", () => {
  it("disables the legacy Part-only movement entry point", () => {
    const start = source.indexOf("export async function createMovement(");
    const end = source.indexOf("\n// ── listMovements", start);
    const legacy = source.slice(start, end);
    expect(legacy).toContain("throw new InventoryServiceError");
    expect(legacy).not.toContain("storeDb.part.update");
    expect(legacy).not.toContain("tx.part.update");
  });

  it("fails closed instead of implicitly creating a first or missing warehouse balance", () => {
    expect(body).toContain("balances.length === 0");
    expect(body).toContain("!targetBalance");
    expect(body).not.toContain("tx.inventoryBalance.upsert");
  });

  it("prevents a negative adjustment from consuming reserved units", () => {
    expect(body).toContain("targetBalance.quantity - targetBalance.reserved < -qty");
    expect(body).toContain("type === 'TRANSFER' || type === 'RETURN'");
    expect(body).toContain("reserved: targetBalance.reserved");
  });

  it("acquires stock mutation locks in the global Part then Balance order", () => {
    const partLock = body.indexOf('SELECT id FROM "Part"');
    const balanceRead = body.indexOf("tx.inventoryBalance.findMany");
    const partMutation = body.indexOf("tx.part.update");
    const balanceMutation = body.indexOf("tx.inventoryBalance.update");
    expect(partLock).toBeGreaterThan(-1);
    expect(balanceRead).toBeGreaterThan(-1);
    expect(partMutation).toBeGreaterThan(-1);
    expect(balanceMutation).toBeGreaterThan(-1);
    expect(partLock).toBeLessThan(balanceRead);
    expect(partMutation).toBeLessThan(balanceMutation);
  });

  it("uses transactional compare-and-set and outbox events for reserve and release", () => {
    for (const fn of [reserveBody, releaseBody]) {
      expect(fn).toContain("storeDb.$transaction");
      expect(fn).toContain("tx.inventoryBalance.updateMany");
      expect(fn).toContain("quantity: balance.quantity");
      expect(fn).toContain("reserved: balance.reserved");
      expect(fn).toContain("enqueueAuditOutbox");
      expect(fn).not.toContain("storeDb.inventoryBalance.update(");
    }
  });

  it("commits Part, InventoryBalance, StockMovement, and all audit outbox events together", () => {
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.stockMovement.create");
    expect(body.match(/await enqueueAuditOutbox\(/g)?.length).toBe(3);
  });
});
