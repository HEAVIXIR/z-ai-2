import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Store return admin lifecycle UI contract", () => {
  const page = read("src/app/admin/store/returns/[id]/page.tsx");
  const client = read("src/app/admin/store/returns/[id]/return-lifecycle-client.tsx");
  const list = read("src/app/admin/store/returns/page.tsx");
  const route = read("src/app/api/admin/store/returns/[id]/route.ts");

  it("protects the detail page and only loads active destination warehouses", () => {
    expect(page).toContain('requirePermission(user.id, "returns.read")');
    expect(page).toContain('where: { active: true }');
    expect(page).toContain('requirePermission(user.id, "inventory.read")');
    expect(page).toContain("ReturnLifecycleClient");
  });

  it("links the returns list to the individual lifecycle detail page", () => {
    expect(list).toContain("/admin/store/returns/${r.id}");
  });

  it("allows authorized admins to add purchased order lines before inspection", () => {
    expect(page).toContain("items: {");
    expect(client).toContain('"/api/admin/store/returns/${initialReturn.id}/items"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain("orderItemId: selectedOrderItemId");
    expect(client).toContain('["REQUESTED", "APPROVED"].includes(initialReturn.status)');
    expect(route).toContain("addReturnItem(");
  });

  it("supports approval, item inspection, and all resolution choices", () => {
    expect(client).toContain('mutate({ status: "APPROVED" })');
    expect(client).toContain('action: "inspect"');
    expect(client).toContain('itemConditions');
    expect(client).toContain('value="REFUND"');
    expect(client).toContain('value="EXCHANGE"');
    expect(client).toContain('value="REJECT"');
  });

  it("requires explicit warehouse selection for restockable REFUND/EXCHANGE", () => {
    expect(client).toContain('resolution !== "REJECT" && hasRestockable && !warehouseId');
    expect(client).toContain('{ warehouseId }');
    expect(client).not.toContain('warehouses[0]');
  });

  it("loads and displays refund transactions and RETURN stock movements", () => {
    expect(page).toContain("store.walletTransaction.findMany");
    expect(page).toContain('where: { reference: id, type: "RETURN" }');
    expect(client).toContain("walletTransactions.map");
    expect(client).toContain("returnMovements.map");
    expect(client).toContain("balanceAfter");
  });

  it("surfaces API conflicts and preserves server RBAC/CSRF enforcement", () => {
    expect(client).toContain("canManage");
    expect(client).toContain("result?.error");
    expect(client).toContain("response.status");
    expect(route).toContain("requirePermission(user.id, 'returns.manage')");
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain('requirePermission(user.id, "inventory.manage")');
    expect(route).toContain("typeof body.warehouseId === \"string\" ? body.warehouseId : null");
  });
});
