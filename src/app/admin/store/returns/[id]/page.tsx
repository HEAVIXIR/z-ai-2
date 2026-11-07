import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import ReturnLifecycleClient from "./return-lifecycle-client";

export const dynamic = "force-dynamic";

export default async function StoreReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }

  try {
    await requirePermission(user.id, "returns.read");
  } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires returns.read</div>;
  }

  const { id } = await params;
  let canManage = true;
  try {
    await requirePermission(user.id, "returns.manage");
  } catch {
    canManage = false;
  }

  let canReadInventory = true;
  try {
    await requirePermission(user.id, "inventory.read");
  } catch {
    canReadInventory = false;
  }

  const [record, warehouses, walletTransactions, returnMovements] = await Promise.all([
    storeDb.return.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                partNameSnapshot: true,
                quantity: true,
                lineTotalIrr: true,
              },
            },
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            orderItem: {
              select: {
                id: true,
                partNameSnapshot: true,
                quantity: true,
                lineTotalIrr: true,
              },
            },
          },
        },
      },
    }),
    canReadInventory
      ? storeDb.warehouse.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    storeDb.walletTransaction.findMany({
      where: { description: { contains: id } },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, type: true, description: true, createdAt: true },
    }),
    storeDb.stockMovement.findMany({
      where: { reference: id, type: "RETURN" },
      orderBy: { createdAt: "desc" },
      include: {
        part: { select: { name: true, nameFa: true, sku: true } },
        warehouse: { select: { name: true, code: true } },
      },
    }),
  ]);

  if (!record) notFound();

  const initialReturn = {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };

  return (
    <div className="p-4 md:p-6">
      <ReturnLifecycleClient
        initialReturn={initialReturn as any}
        warehouses={warehouses}
        walletTransactions={walletTransactions.map((txn) => ({ ...txn, createdAt: txn.createdAt.toISOString() }))}
        returnMovements={returnMovements.map((movement) => ({ ...movement, createdAt: movement.createdAt.toISOString() }))}
        canManage={canManage}
      />
    </div>
  );
}
