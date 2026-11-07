import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/store-order-stock.ts", "utf8");
const start = source.indexOf("export async function decrementOrderStock(");
if (start < 0) throw new Error("checkout stock helper not found");
const body = source.slice(start);

describe("Checkout stock lock order", () => {
  it("claims the Part row before warehouse balance rows", () => {
    const partClaim = body.indexOf("tx.part.updateMany");
    const balanceClaim = body.indexOf("tx.inventoryBalance.updateMany");
    expect(partClaim).toBeGreaterThan(-1);
    expect(balanceClaim).toBeGreaterThan(-1);
    expect(partClaim).toBeLessThan(balanceClaim);
  });

  it("uses deterministic warehouse order and exact balance/reservation CAS", () => {
    expect(body).toContain('orderBy: [{ warehouseId: "asc" }, { id: "asc" }]');
    expect(body).toContain("quantity: sourceBalance.quantity");
    expect(body).toContain("reserved: sourceBalance.reserved");
  });

  it("retains legacy-only compare-and-set without allowing negative stock", () => {
    expect(body).toContain("if (part.stock < quantity)");
    expect(body).toContain("where: { id: partId, stock: part.stock }");
  });
});
