import { describe, expect, it } from "vitest";
import fs from "node:fs";

const page = fs.readFileSync(
  "src/app/admin/store/inventory/reconciliation/page.tsx",
  "utf8",
);
const ledger = fs.readFileSync("src/app/admin/store/inventory/page.tsx", "utf8");

describe("Read-only inventory reconciliation report", () => {
  it("requires inventory.read and reads Part plus warehouse balance snapshots", () => {
    expect(page).toContain('requirePermission(user.id, "inventory.read")');
    expect(page).toContain("storeDb.part.findMany");
    expect(page).toContain("inventoryBalances");
    expect(page).toContain("warehouseTotal");
    expect(page).toContain("part.stock - warehouseTotal");
  });

  it("classifies unallocated legacy stock, mismatches, invalid reservations, and inactive stock", () => {
    expect(page).toContain('"LEGACY_UNALLOCATED"');
    expect(page).toContain('"MISMATCH"');
    expect(page).toContain('"RESERVED_EXCEEDS"');
    expect(page).toContain('"INACTIVE_STOCK"');
    expect(page).toContain('"NEGATIVE_STOCK"');
    expect(page).toContain("part.stock < 0");
  });

  it("is strictly read-only and explicitly refuses automatic reconciliation", () => {
    expect(page).not.toMatch(/storeDb\.\w+\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
    expect(page).not.toContain("$transaction");
    expect(page).toContain("هیچ اصلاح یا تخصیص خودکاری انجام نمی‌دهد");
  });

  it("is reachable from the inventory movement ledger", () => {
    expect(ledger).toContain('/admin/store/inventory/reconciliation');
  });
});
