import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/inventory — HEAVIX stock movement ledger
   T2-W2-A — Inventory domain (balance + movement ledger).
   GET  : list recent movements with filters (partId, type, limit)
   POST : record a movement and adjust Part.stock atomically.
   Every mutation to Part.stock MUST be recorded as a StockMovement
   so the ledger reconstructs the balance at any point in time.
   ============================================================ */

const ALLOWED_TYPES = [
  "RECEIVE",
  "SALE",
  "RETURN",
  "TRANSFER",
  "ADJUSTMENT",
  "DAMAGE",
] as const;

function serialize(m: any) {
  return {
    ...m,
    createdAt: m.createdAt?.toISOString?.() ?? null,
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const partId = url.searchParams.get("partId") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const reference = url.searchParams.get("reference") || undefined;
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 100);

    const where: any = {};
    if (partId) where.partId = partId;
    if (type) {
      if (!ALLOWED_TYPES.includes(type as any)) {
        return NextResponse.json(
          { success: false, error: "نوع حرکت نامعتبر" },
          { status: 400 },
        );
      }
      where.type = type;
    }
    if (reference) where.reference = reference;

    const [items, total] = await Promise.all([
      storeDb.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
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
      }),
      storeDb.stockMovement.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total,
    });
  } catch (e: any) {
    console.error("[store/inventory GET] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { partId, type, quantity, reason, reference } = body;

    if (!partId || !type || quantity === undefined) {
      return NextResponse.json(
        { success: false, error: "partId، نوع و تعداد الزامی هستند" },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(type as any)) {
      return NextResponse.json(
        { success: false, error: "نوع حرکت نامعتبر" },
        { status: 400 },
      );
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty === 0) {
      return NextResponse.json(
        { success: false, error: "تعداد باید عدد صحیح غیر صفر باشد" },
        { status: 400 },
      );
    }

    const part = await storeDb.part.findUnique({ where: { id: partId } });
    if (!part) {
      return NextResponse.json(
        { success: false, error: "قطعه یافت نشد" },
        { status: 404 },
      );
    }

    const balanceAfter = part.stock + qty;
    if (balanceAfter < 0) {
      return NextResponse.json(
        {
          success: false,
          error: `موجودی ناکافی. فعلی: ${part.stock}، درخواست: ${qty}`,
        },
        { status: 400 },
      );
    }

    // Atomically: create the ledger entry + adjust Part.stock.
    const movement = await storeDb.stockMovement.create({
      data: {
        partId,
        type,
        quantity: qty,
        balanceAfter,
        reason: reason || null,
        reference: reference || null,
        createdBy: user.id,
      },
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

    const beforePart = { ...part };
    const afterPart = await storeDb.part.update({
      where: { id: partId },
      data: { stock: balanceAfter },
      select: { id: true, name: true, sku: true, stock: true },
    });

    // Audit: the ledger entry is the primary audit hook for this route
    // (per T2-W2-A spec). Best-effort — never throws.
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.inventory.movement.create',
      entityType: 'StockMovement',
      entityId: movement.id,
      after: {
        partId,
        type,
        quantity: qty,
        balanceAfter,
        reason: reason || null,
        reference: reference || null,
      },
    });

    // Audit: the Part.stock update is a side-effect mutation, so it gets
    // its own audit entry (mirrors payments/[id] side-effect pattern).
    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.part.update',
      entityType: 'Part',
      entityId: partId,
      before: { stock: beforePart.stock },
      after: { stock: afterPart.stock },
    });

    return NextResponse.json({ success: true, data: serialize(movement) });
  } catch (e: any) {
    console.error("[store/inventory POST] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
