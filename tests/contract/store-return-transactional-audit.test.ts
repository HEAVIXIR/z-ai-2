import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/store-returns-service.ts", "utf8");

function functionBody(name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}(`);
  const end = source.indexOf(`export async function ${nextName}(`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Unable to locate ${name} function boundaries`);
  return source.slice(start, end);
}

describe("Store return lifecycle transactional audit contract", () => {
  it.each([
    ["createReturn", "updateReturnStatus"],
    ["updateReturnStatus", "listReturns"],
    ["addReturnItem", "inspectReturn"],
    ["inspectReturn", "resolveReturn"],
  ])("%s commits its mutation and outbox event in one Store transaction", (name, nextName) => {
    const body = functionBody(name, nextName);
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("enqueueAuditOutbox");
    expect(body).not.toContain("logAudit(");
  });

  it("prevents callers from creating or directly editing terminal return states", () => {
    const create = functionBody("createReturn", "updateReturnStatus");
    const update = functionBody("updateReturnStatus", "listReturns");
    expect(create).toContain("options.status !== 'REQUESTED'");
    expect(create).toContain("options.inspection || options.resolution");
    expect(update).toContain("existing.status === 'RESOLVED' || existing.status === 'REJECTED'");
    expect(update).toContain("status !== existing.status && status !== 'APPROVED'");
    expect(update).toContain("inspection !== undefined || resolution !== undefined");
  });

  it("uses serializable transactions for return item duplicate checks and inspection transitions", () => {
    const add = functionBody("addReturnItem", "inspectReturn");
    const inspect = functionBody("inspectReturn", "resolveReturn");
    expect(add).toContain("isolationLevel: 'Serializable'");
    expect(add).toContain("tx.returnItem.findFirst");
    expect(inspect).toContain("isolationLevel: 'Serializable'");
    expect(inspect).toContain("tx.return.updateMany");
    expect(inspect).toContain("where: { id: returnId, status: existing.status }");
  });

  it("sorts restock Part locks and acquires Part before InventoryBalance", () => {
    const resolve = source.slice(source.indexOf("export async function resolveReturn("));
    expect(resolve).toContain(".sort((a, b) => String(a.orderItem?.partId ?? '').localeCompare(String(b.orderItem?.partId ?? '')))");
    const partClaim = resolve.indexOf("tx.part.update(");
    const balanceClaim = resolve.indexOf("tx.inventoryBalance.update(");
    expect(partClaim).toBeGreaterThan(-1);
    expect(balanceClaim).toBeGreaterThan(-1);
    expect(partClaim).toBeLessThan(balanceClaim);
  });

  it("keeps refund resolution on the same Store transaction and outbox boundary", () => {
    const resolve = source.slice(source.indexOf("export async function resolveReturn("));
    expect(resolve).toContain("storeDb.$transaction");
    expect(resolve).toContain("tx.walletTransaction.create");
    expect(resolve).toContain("tx.customer.update");
    expect(resolve).toContain("enqueueAuditOutbox");
    expect(resolve).toContain("tx.inventoryBalance.update({");
    expect(resolve).toContain("tx.part.update({");
    expect(resolve).toContain("tx.stockMovement.create");
    expect(resolve).toContain("warehouseId");
    expect(resolve).toContain("type: 'RETURN'");
    expect(resolve).not.toContain("logAudit(");
  });
});
