/**
 * STEP 17.82 — real call-site and transaction type fixtures.
 *
 * These functions are compile-only fixtures: they are never invoked and do
 * not construct either Prisma client. Each runtime is checked independently
 * against the argument shapes used by current HEAVIX Store services/routes.
 *
 * The explicit scalar assignments below verify useful result property types,
 * not merely the existence of result keys. No casts, any, or suppressions.
 */
import type { PrismaClient as StoreNodeClient } from "@/lib/generated/store-node-client";
import type { PrismaClient as StoreWorkerClient } from "@/lib/generated/store-client/client";

function assertString(_value: string): void {}
function assertNumber(_value: number): void {}
function assertDate(_value: Date): void {}

/** Representative real reads/writes from inventory, currency and logistics. */
export async function verifyNodeStoreCallSites(client: StoreNodeClient): Promise<void> {
  const part = await client.part.findUnique({
    where: { id: "fixture-part" },
    select: { id: true, sku: true, stock: true, updatedAt: true },
  });
  if (part) {
    assertString(part.id);
    assertString(part.sku);
    assertNumber(part.stock);
    assertDate(part.updatedAt);
  }

  const balance = await client.inventoryBalance.findUnique({
    where: { partId_warehouseId: { partId: "fixture-part", warehouseId: "fixture-warehouse" } },
    select: { id: true, quantity: true, reserved: true, lowStockThreshold: true },
  });
  if (balance) {
    assertString(balance.id);
    assertNumber(balance.quantity);
    assertNumber(balance.reserved);
    assertNumber(balance.lowStockThreshold);
  }

  const order = await client.order.findUnique({
    where: { id: "fixture-order" },
    select: { id: true, orderNumber: true, totalUsd: true, paymentStatus: true },
  });
  if (order) {
    assertString(order.id);
    assertString(order.orderNumber);
    assertNumber(order.totalUsd);
    assertString(order.paymentStatus);
  }

  const shipment = await client.shipment.findMany({
    where: { status: "DELIVERED" },
    orderBy: { deliveredAt: "desc" },
    take: 10,
    select: { id: true, orderId: true, status: true, deliveredAt: true },
  });
  for (const row of shipment) {
    assertString(row.id);
    assertString(row.orderId);
    assertString(row.status);
    if (row.deliveredAt) assertDate(row.deliveredAt);
  }

  const created = await client.stockMovement.create({
    data: {
      partId: "fixture-part",
      type: "ADJUSTMENT",
      quantity: 1,
      balanceAfter: 1,
      reason: "compile-only fixture",
      warehouseId: "fixture-warehouse",
    },
    select: { id: true, quantity: true, balanceAfter: true, createdAt: true },
  });
  assertString(created.id);
  assertNumber(created.quantity);
  assertNumber(created.balanceAfter);
  assertDate(created.createdAt);
}

/** Same authored call-site contract compiled against the Cloudflare client. */
export async function verifyWorkerStoreCallSites(client: StoreWorkerClient): Promise<void> {
  const part = await client.part.findUnique({
    where: { id: "fixture-part" },
    select: { id: true, sku: true, stock: true, updatedAt: true },
  });
  if (part) {
    assertString(part.id);
    assertString(part.sku);
    assertNumber(part.stock);
    assertDate(part.updatedAt);
  }

  const balance = await client.inventoryBalance.findUnique({
    where: { partId_warehouseId: { partId: "fixture-part", warehouseId: "fixture-warehouse" } },
    select: { id: true, quantity: true, reserved: true, lowStockThreshold: true },
  });
  if (balance) {
    assertString(balance.id);
    assertNumber(balance.quantity);
    assertNumber(balance.reserved);
    assertNumber(balance.lowStockThreshold);
  }

  const order = await client.order.findUnique({
    where: { id: "fixture-order" },
    select: { id: true, orderNumber: true, totalUsd: true, paymentStatus: true },
  });
  if (order) {
    assertString(order.id);
    assertString(order.orderNumber);
    assertNumber(order.totalUsd);
    assertString(order.paymentStatus);
  }

  const shipment = await client.shipment.findMany({
    where: { status: "DELIVERED" },
    orderBy: { deliveredAt: "desc" },
    take: 10,
    select: { id: true, orderId: true, status: true, deliveredAt: true },
  });
  for (const row of shipment) {
    assertString(row.id);
    assertString(row.orderId);
    assertString(row.status);
    if (row.deliveredAt) assertDate(row.deliveredAt);
  }

  const created = await client.stockMovement.create({
    data: {
      partId: "fixture-part",
      type: "ADJUSTMENT",
      quantity: 1,
      balanceAfter: 1,
      reason: "compile-only fixture",
      warehouseId: "fixture-warehouse",
    },
    select: { id: true, quantity: true, balanceAfter: true, createdAt: true },
  });
  assertString(created.id);
  assertNumber(created.quantity);
  assertNumber(created.balanceAfter);
  assertDate(created.createdAt);
}

/** Exercise callback transaction delegates and their real argument shapes. */
export async function verifyNodeTransactionCallSites(client: StoreNodeClient): Promise<void> {
  await client.$transaction(async (tx) => {
    const row = await tx.inventoryBalance.upsert({
      where: { partId_warehouseId: { partId: "fixture-part", warehouseId: "fixture-warehouse" } },
      create: { partId: "fixture-part", warehouseId: "fixture-warehouse", quantity: 0, reserved: 0 },
      update: { quantity: { increment: 1 } },
      select: { id: true, quantity: true, reserved: true },
    });
    assertString(row.id);
    assertNumber(row.quantity);
    assertNumber(row.reserved);

    const movement = await tx.stockMovement.create({
      data: { partId: "fixture-part", type: "RECEIVE", quantity: 1, balanceAfter: row.quantity },
      select: { id: true, balanceAfter: true },
    });
    assertString(movement.id);
    assertNumber(movement.balanceAfter);

    const outbox = await tx.auditOutbox.create({
      data: { payloadJson: "{}", status: "PENDING" },
      select: { id: true },
    });
    assertString(outbox.id);
  });
}

export async function verifyWorkerTransactionCallSites(client: StoreWorkerClient): Promise<void> {
  await client.$transaction(async (tx) => {
    const row = await tx.inventoryBalance.upsert({
      where: { partId_warehouseId: { partId: "fixture-part", warehouseId: "fixture-warehouse" } },
      create: { partId: "fixture-part", warehouseId: "fixture-warehouse", quantity: 0, reserved: 0 },
      update: { quantity: { increment: 1 } },
      select: { id: true, quantity: true, reserved: true },
    });
    assertString(row.id);
    assertNumber(row.quantity);
    assertNumber(row.reserved);

    const movement = await tx.stockMovement.create({
      data: { partId: "fixture-part", type: "RECEIVE", quantity: 1, balanceAfter: row.quantity },
      select: { id: true, balanceAfter: true },
    });
    assertString(movement.id);
    assertNumber(movement.balanceAfter);

    const outbox = await tx.auditOutbox.create({
      data: { payloadJson: "{}", status: "PENDING" },
      select: { id: true },
    });
    assertString(outbox.id);
  });
}
