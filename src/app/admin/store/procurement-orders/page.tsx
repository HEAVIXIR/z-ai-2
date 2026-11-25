import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import Link from "next/link";
import PurchaseOrderReceivingClient from "./purchase-order-receiving-client";

export const dynamic = "force-dynamic";

export default async function StorePurchaseOrderReceivingPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;

  try {
    await requirePermission(user.id, "procurement.read");
  } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires procurement.read</div>;
  }

  let canReceive = true;
  try {
    await requirePermission(user.id, "procurement.manage");
    await requirePermission(user.id, "inventory.manage");
  } catch {
    canReceive = false;
  }

  const purchaseOrders = await storeDb.purchaseOrder.findMany({
    where: { status: { in: ["APPROVED", "RECEIVED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      procurement: { select: { id: true, title: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          part: {
            select: {
              id: true,
              name: true,
              nameFa: true,
              sku: true,
              stock: true,
              inventoryBalances: {
                where: { warehouse: { active: true } },
                select: { warehouseId: true },
              },
            },
          },
        },
      },
    },
  });

  const warehouses = canReceive
    ? await storeDb.warehouse.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true },
      })
    : [];

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div>
        <Link href="/admin/procurement" className="text-sm text-zinc-500 hover:text-[#F58220]">بازگشت به مناقصه‌ها</Link>
        <h1 className="mt-2 text-2xl font-black text-zinc-900">دریافت سفارش‌های خرید</h1>
        <p className="mt-1 text-sm text-zinc-500">
          ثبت دریافت جزئی یا کامل هر قلم، فقط در انبار فعال و دارای ردیف موجودی برای همان قطعه.
        </p>
      </div>
      {!canReceive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          برای ثبت دریافت، هر دو مجوز procurement.manage و inventory.manage لازم است. در حال حاضر فقط امکان مشاهده دارید.
        </div>
      )}
      <PurchaseOrderReceivingClient
        purchaseOrders={purchaseOrders.map((po) => ({
          ...po,
          createdAt: po.createdAt.toISOString(),
        }))}
        warehouses={warehouses}
        canReceive={canReceive}
      />
    </div>
  );
}
