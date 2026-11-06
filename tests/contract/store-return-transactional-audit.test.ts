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

  it("uses serializable transactions for return item duplicate checks and inspection transitions", () => {
    const add = functionBody("addReturnItem", "inspectReturn");
    const inspect = functionBody("inspectReturn", "resolveReturn");
    expect(add).toContain("isolationLevel: 'Serializable'");
    expect(add).toContain("tx.returnItem.findFirst");
    expect(inspect).toContain("isolationLevel: 'Serializable'");
    expect(inspect).toContain("tx.return.updateMany");
    expect(inspect).toContain("where: { id: returnId, status: existing.status }");
  });

  it("keeps refund resolution on the same Store transaction and outbox boundary", () => {
    const resolve = source.slice(source.indexOf("export async function resolveReturn("));
    expect(resolve).toContain("storeDb.$transaction");
    expect(resolve).toContain("tx.walletTransaction.create");
    expect(resolve).toContain("tx.customer.update");
    expect(resolve).toContain("enqueueAuditOutbox");
    expect(resolve).not.toContain("logAudit(");
  });
});
