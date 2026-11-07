import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { requirePermission } from "@/lib/authorization";
import { InventoryServiceError } from "@/lib/store-inventory-service";
import {
  allocateOpeningBalance,
  listOpeningBalanceCandidates,
} from "@/lib/store-opening-balance-service";
import type { OpeningBalanceAllocation } from "@/lib/store-opening-balance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    );
  }
  console.error("[store/opening-balance] error:", error);
  return NextResponse.json(
    { success: false, error: "خطای داخلی در تخصیص موجودی اولیه" },
    { status: 500 },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requirePermission(user.id, 'inventory.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires inventory.read" }, { status: 403 });
  }
  try {
    const data = await listOpeningBalanceCandidates();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ success: false, error: "CSRF check failed" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requirePermission(user.id, 'inventory.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires inventory.manage" }, { status: 403 });
  }
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "بدنه درخواست JSON معتبر نیست" },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "ساختار درخواست تخصیص نامعتبر است" },
        { status: 400 },
      );
    }
    const payload = body as Record<string, unknown>;
    if (payload.confirm !== true) {
      return NextResponse.json(
        { success: false, error: "تأیید صریح عملیات الزامی است" },
        { status: 400 },
      );
    }
    if (typeof payload.partId !== "string"
      || typeof payload.reason !== "string"
      || (payload.reference != null && typeof payload.reference !== "string")
      || !Array.isArray(payload.allocations)) {
      return NextResponse.json({ success: false, error: "ساختار درخواست تخصیص نامعتبر است" }, { status: 400 });
    }
    if (payload.reason.length > 500 || (typeof payload.reference === "string" && payload.reference.length > 160)) {
      return NextResponse.json({ success: false, error: "طول دلیل یا مرجع بیش از حد مجاز است" }, { status: 400 });
    }
    const data = await allocateOpeningBalance({
      partId: payload.partId,
      allocations: payload.allocations as OpeningBalanceAllocation[],
      reason: payload.reason,
      reference: typeof payload.reference === "string" ? payload.reference : null,
      userId: user.id,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}
