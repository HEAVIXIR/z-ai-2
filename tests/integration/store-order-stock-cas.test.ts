import { afterEach, describe, expect, it } from "vitest";
import { storeDb } from "@/lib/store-db";
import { decrementOrderStock } from "@/lib/store-order-stock";

const suffix = () => String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);

describe("Store checkout stock compare-and-swap (real PostgreSQL)", () => {
  let categoryId: string | undefined;
  let partId: string | undefined;

  afterEach(async () => {
    if (partId) {
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = undefined;
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

  it("allows only one of two competing checkouts to consume the same stock", async () => {
    const part = await createPart(10);

    const outcomes = await Promise.allSettled([
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 6)),
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 6)),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);

    const persisted = await storeDb.part.findUnique({
      where: { id: part.id },
      select: { stock: true, soldCount: true },
    });
    expect(persisted?.stock).toBe(4);
    expect(persisted?.soldCount).toBe(6);
  }, 15000);

  it("rejects a checkout whose quantity exceeds the current stock without mutation", async () => {
    const part = await createPart(2);

    await expect(
      storeDb.$transaction((tx) => decrementOrderStock(tx, part.id, 3)),
    ).rejects.toThrow("موجودی قطعه");

    const persisted = await storeDb.part.findUnique({
      where: { id: part.id },
      select: { stock: true, soldCount: true },
    });
    expect(persisted?.stock).toBe(2);
    expect(persisted?.soldCount).toBe(0);
  }, 15000);
});
