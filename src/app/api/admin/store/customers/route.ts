import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  listCustomers,
  CustomersServiceError,
} from "@/lib/store-customers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/customers — HEAVIX customers list (read-only)
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-customers-service.ts; route handler stays thin.
   No mutations → no audit. Customers is read-only.
   ============================================================ */

function serialize(c: any) {
  return {
    ...c,
    totalSpentIrr: c.totalSpentIrr?.toString?.() ?? String(c.totalSpentIrr ?? 0),
    walletBalanceIrr: c.walletBalanceIrr?.toString?.() ?? String(c.walletBalanceIrr ?? 0),
    createdAt: c.createdAt?.toISOString?.() ?? null,
    updatedAt: c.updatedAt?.toISOString?.() ?? null,
    orderCount: c._count?.orders ?? 0,
    _count: undefined,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof CustomersServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/customers] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
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
    const q = url.searchParams.get("q")?.trim() || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await listCustomers({ q, status, limit });
    return NextResponse.json({
      success: true,
      data: result.items.map(serialize),
      total: result.total,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
