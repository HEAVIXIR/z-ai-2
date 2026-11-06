import { describe, expect, it } from "vitest";
import fs from "node:fs";

const service = fs.readFileSync("src/lib/store-inventory-service.ts", "utf8");
const route = fs.readFileSync("src/app/api/admin/store/inventory/route.ts", "utf8");

function section(start: string, end: string) {
  const from = service.indexOf(start);
  const to = service.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Unable to locate section: ${start}`);
  return service.slice(from, to);
}

describe("Store inventory atomic mutation contract", () => {
  it("commits the legacy stock movement, Part.stock CAS, and both audit events together", () => {
    const body = section("export async function createMovement(", "// ── listMovements");
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.part.updateMany");
    expect(body).toContain("where: { id: partId, stock: part.stock }");
    expect(body).toContain("tx.stockMovement.create");
    expect(body).toContain("await enqueueAuditOutbox(tx");
    expect(body).not.toContain("storeDb.part.update(");
    expect(body).not.toContain("await logAudit(");
  });

  it("prevents concurrent reservations from exceeding on-hand quantity", () => {
    const body = section("export async function reserveStock(", "// ── releaseStock");
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.inventoryBalance.updateMany");
    expect(body).toContain("reserved: balance.reserved");
    expect(body).toContain("quantity: { gte: newReserved }");
    expect(body).toContain("await enqueueAuditOutbox(tx");
    expect(body).not.toContain("storeDb.inventoryBalance.update(");
  });

  it("prevents concurrent releases from underflowing the reserved quantity", () => {
    const body = section("export async function releaseStock(", "// ── getLowStockItems");
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.inventoryBalance.updateMany");
    expect(body).toContain("reserved: { equals: balance.reserved, gte: qty }");
    expect(body).toContain("reserved: { decrement: qty }");
    expect(body).toContain("await enqueueAuditOutbox(tx");
    expect(body).not.toContain("storeDb.inventoryBalance.update(");
  });

  it("does not allow warehouse stock reductions below already-reserved quantity", () => {
    const body = section("export async function adjustStock(", "// ── reserveStock");
    expect(body).toContain("const currentReserved = existingBalance?.reserved ?? 0");
    expect(body).toContain("const nextQty = currentQty + qty");
    expect(body).toContain("if (nextQty < currentReserved)");
    expect(body).toContain("quantity: { equals: currentQty, gte: -qty }");
    expect(body).toContain("reserved: currentReserved");
  });

  it("bounds inventory POST payloads and rejects unknown fields", () => {
    expect(route).toContain("8 * 1024");
    expect(route).toContain("Buffer.byteLength(raw, \"utf8\")");
    expect(route).toContain("allowedFields");
    expect(route).toContain("Number.isSafeInteger(qty)");
    expect(route).toContain("Object.keys(input).some");
  });
});
