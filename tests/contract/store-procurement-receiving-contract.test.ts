import { describe, expect, it } from "vitest";
import fs from "node:fs";

const service = fs.readFileSync("src/lib/store-procurement-service.ts", "utf8");
const route = fs.readFileSync(
  "src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/receive/route.ts",
  "utf8",
);
const start = service.indexOf("export async function receivePurchaseOrderItem(");
const end = service.indexOf("\n// ── cancelPurchaseOrder", start);
if (start < 0 || end < 0) throw new Error("receiving service boundaries not found");
const body = service.slice(start, end);

describe("Procurement receiving inventory contract", () => {
  it("requires an explicit active destination warehouse and approved PO", () => {
    expect(body).toContain("!warehouseId");
    expect(body).toContain("!warehouse.active");
    expect(body).toContain("status !== 'APPROVED'");
    expect(body).toContain("balances.length === 0");
    expect(body).toContain("targetBalance");
  });

  it("updates the PO line, Part, warehouse balance, movement, and outbox atomically", () => {
    expect(body).toContain("storeDb.$transaction");
    expect(body).toContain("tx.purchaseOrderItem.updateMany");
    expect(body).toContain("tx.part.update");
    expect(body).toContain("tx.inventoryBalance.update");
    expect(body).toContain("tx.stockMovement.create");
    expect(body).toContain("enqueueAuditOutbox");
    expect(body).toContain("isolationLevel: 'Serializable'");
    expect(body).toContain("P2034");
  });

  it("requires both procurement and inventory management permission at the API boundary", () => {
    expect(route).toContain("requirePermission(user.id, 'procurement.manage')");
    expect(route).toContain("requirePermission(user.id, 'inventory.manage')");
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("warehouseId");
    expect(route).toContain("const { id: procurementId, poId: purchaseOrderId } = await params");
    expect(body).toContain("poItem.purchaseOrderId !== purchaseOrderId");
    expect(body).toContain("poItem.purchaseOrder.procurementId !== procurementId");
  });
});
