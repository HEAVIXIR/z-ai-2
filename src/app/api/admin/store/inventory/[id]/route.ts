import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory/[id] — single StockMovement detail
   T2-W2-A — Inventory domain (movement ledger read).
   ============================================================ */

function serialize(m: any) {
  return {
    ...m,
    createdAt: m.createdAt?.toISOString?.() ?? null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const movement = await storeDb.stockMovement.findUnique({
      where: { id },
      include: {
        part: {
          select: {
            id: true,
            name: true,
            nameFa: true,
            sku: true,
            stock: true,
          },
        },
      },
    });
    if (!movement) {
      return NextResponse.json(
        { success: false, error: "حرکت یافت نشد" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serialize(movement) });
  } catch (e: any) {
    console.error("[store/inventory/[id] GET] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
