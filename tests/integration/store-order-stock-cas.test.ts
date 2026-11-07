import { afterEach, describe, expect, it } from "vitest";
import { storeDb } from "@/lib/store-db";
import { decrementOrderStock } from "@/lib/store-order-stock";
import { reserveStock, releaseStock } from "@/lib/store-inventory-service";

const suffix = () => String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);

describe("Store checkout stock allocation and compare-and-swap (real PostgreSQL)", () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  const warehouseIds: string[] = [];

  afterEach(async () => {
    if (partId) {
      await storeDb.auditOutbox.deleteMany({ where: { payloadJson: { contains: partId } } });
      await storeDb.stockMovement.deleteMany({ where: { partId } });
      await storeDb.inventoryBalance.deleteMany({ where: { partId } });
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = undefined;
    }
    if (warehouseIds.length > 0) {
      await storeDb.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
      warehouseIds.length = 0;
    }
    if (categoryId) {
      await storeDb.category.deleteMany({ where: { id: categoryId } });
      categoryId = undefined;
    }
  });

  async function createPart(stock: number) {
    const tag = suffix();
    const category = await storeDb.category.create({
      data: { name: "Checkout CAS " + tag, slug: "checkout-cas-" + tag },
    });
    categoryId = category.id;
    const part = await storeDb.part.create({
      data: {
        name: "Checkout CAS part " + tag,
        sku: "CHECKOUT-CAS-" + tag,
        categoryId: category.id,
        priceUsd: 1,
        stock,
      },
    });
    partId = part.id;
    return part;
  }

  async function createWarehouse(codePrefix = "CC") {
    const tag = suffix();
    const warehouse = await storeDb.warehouse.create({
      data: { name: "Checkout warehouse " + tag, code: codePrefix + "-" + tag },
    });
    warehouseIds.push(warehouse.id);
    return warehouse;
  }

  it("allows only one of two competing legacy checkouts to consume the same stock", async () => {
    const part = await createPart(10);

    const outcomes = await Promise.allSettled([
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 6, "ORDER-A")),
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 6, "ORDER-B")),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [persisted, movements, outboxCount] = await Promise.all([
      storeDb.part.findUnique({ where: { id: part.id }, select: { stock: true, soldCount: true } }),
      storeDb.stockMovement.findMany({ where: { partId: part.id } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: part.id } } }),
    ]);
    expect(persisted?.stock).toBe(4);
    expect(persisted?.soldCount).toBe(6);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.quantity).toBe(-6);
    expect(movements[0]?.type).toBe("SALE");
    expect(movements[0]?.balanceAfter).toBe(4);
    expect(outboxCount).toBe(2);
  }, 15000);

  it("allocates checkout stock across active warehouses without consuming reserved units", async () => {
    const part = await createPart(10);
    const first = await createWarehouse();
    const second = await createWarehouse();

    await storeDb.inventoryBalance.createMany({
      data: [
        { partId: part.id, warehouseId: first.id, quantity: 5, reserved: 2 },
        { partId: part.id, warehouseId: second.id, quantity: 5, reserved: 0 },
      ],
    });

    await storeDb.$transaction((tx) =>
      decrementOrderStock(tx, part.id, 6, "ORDER-WH", "test-user"),
    );

    const [balances, persisted, movements, outboxCount] = await Promise.all([
      storeDb.inventoryBalance.findMany({
        where: { partId: part.id },
        orderBy: { warehouseId: "asc" },
      }),
      storeDb.part.findUnique({ where: { id: part.id }, select: { stock: true, soldCount: true } }),
      storeDb.stockMovement.findMany({ where: { partId: part.id } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: part.id } } }),
    ]);

    expect(balances.map((balance) => balance.quantity).sort()).toEqual([2, 2]);
    expect(balances.map((balance) => balance.reserved).sort()).toEqual([0, 2]);
    expect(persisted?.stock).toBe(4);
    expect(persisted?.soldCount).toBe(6);
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.quantity).sort()).toEqual([-3, -3]);
    expect(movements.map((movement) => movement.balanceAfter).sort((a, b) => a - b)).toEqual([4, 7]);
    expect(movements.every((movement) => movement.reference === "ORDER-WH")).toBe(true);
    expect(outboxCount).toBe(3);
  }, 15000);

  it("does not sell reserved units when active warehouse availability is insufficient", async () => {
    const part = await createPart(5);
    const warehouse = await createWarehouse();

    await storeDb.inventoryBalance.create({
      data: { partId: part.id, warehouseId: warehouse.id, quantity: 5, reserved: 4 },
    });

    await expect(
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 2, "ORDER-RESERVED")),
    ).rejects.toThrow("موجودی قابل فروش");

    const [balance, persisted, movementCount] = await Promise.all([
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId: part.id, warehouseId: warehouse.id } },
      }),
      storeDb.part.findUnique({ where: { id: part.id }, select: { stock: true, soldCount: true } }),
      storeDb.stockMovement.count({ where: { partId: part.id } }),
    ]);
    expect(balance?.quantity).toBe(5);
    expect(balance?.reserved).toBe(4);
    expect(persisted?.stock).toBe(5);
    expect(persisted?.soldCount).toBe(0);
    expect(movementCount).toBe(0);
  }, 15000);

  it("allows only one competing reservation when their combined quantity exceeds free stock", async () => {
    const part = await createPart(5);
    const warehouse = await createWarehouse();
    await storeDb.inventoryBalance.create({
      data: { partId: part.id, warehouseId: warehouse.id, quantity: 5, reserved: 0 },
    });

    const outcomes = await Promise.allSettled([
      reserveStock(part.id, warehouse.id, 4, "test-user", "reservation A"),
      reserveStock(part.id, warehouse.id, 4, "test-user", "reservation B"),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const balance = await storeDb.inventoryBalance.findUnique({
      where: { partId_warehouseId: { partId: part.id, warehouseId: warehouse.id } },
    });
    expect(balance?.quantity).toBe(5);
    expect(balance?.reserved).toBe(4);
  }, 15000);

  it("allows only one competing release when their combined quantity exceeds reserved stock", async () => {
    const part = await createPart(5);
    const warehouse = await createWarehouse();
    await storeDb.inventoryBalance.create({
      data: { partId: part.id, warehouseId: warehouse.id, quantity: 5, reserved: 5 },
    });

    const outcomes = await Promise.allSettled([
      releaseStock(part.id, warehouse.id, 4, "test-user", "release A"),
      releaseStock(part.id, warehouse.id, 4, "test-user", "release B"),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const balance = await storeDb.inventoryBalance.findUnique({
      where: { partId_warehouseId: { partId: part.id, warehouseId: warehouse.id } },
    });
    expect(balance?.quantity).toBe(5);
    expect(balance?.reserved).toBe(1);
  }, 15000);

  it("rejects a checkout whose quantity exceeds legacy stock without mutation", async () => {
    const part = await createPart(2);

    await expect(
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 3, "ORDER-LOW")),
    ).rejects.toThrow("موجودی قطعه");

    const persisted = await storeDb.part.findUnique({
      where: { id: part.id },
      select: { stock: true, soldCount: true },
    });
    expect(persisted?.stock).toBe(2);
    expect(persisted?.soldCount).toBe(0);
  }, 15000);
});
