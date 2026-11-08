import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePermission(user.id, 'inventory.read');
    await requirePermission(user.id, 'inventory.manage');
  } catch {
    return NextResponse.json(
      { success: false, error: "Forbidden: requires inventory.manage" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = rawQuery.trim();
  if (query.length > 100) {
    return NextResponse.json(
      { success: false, error: "عبارت جستجو نباید بیشتر از ۱۰۰ نویسه باشد" },
      { status: 400 },
    );
  }

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
    return NextResponse.json(
      { success: false, error: "اندازه صفحه نامعتبر است" },
      { status: 400 },
    );
  }
  const limit = Math.min(parsedLimit, MAX_LIMIT);
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;
  if (cursor && cursor.length > 128) {
    return NextResponse.json(
      { success: false, error: "نشانگر صفحه نامعتبر است" },
      { status: 400 },
    );
  }

  const where = {
    active: true,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { nameFa: { contains: query, mode: "insensitive" as const } },
            { sku: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const rows = await storeDb.part.findMany({
      where,
      orderBy: [{ sku: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        nameFa: true,
        sku: true,
        stock: true,
        inventoryBalances: {
          where: { warehouse: { active: true } },
          select: { warehouseId: true, quantity: true, reserved: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      success: true,
      data: items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit,
    });
  } catch (error) {
    console.error("[store/inventory/transfer-parts] load failed:", error);
    return NextResponse.json(
      { success: false, error: "بارگذاری فهرست قطعات انجام نشد" },
      { status: 500 },
    );
  }
}
