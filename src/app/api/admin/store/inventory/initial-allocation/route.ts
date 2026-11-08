import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { requirePermission } from "@/lib/authorization";
import {
  allocateInitialStock,
  InventoryServiceError,
} from "@/lib/store-inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ success: false, error: "CSRF check failed" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "inventory.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden: requires inventory.manage" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
    }
    const { partId, warehouseId, reason } = body;
    if (
      typeof partId !== "string" || !partId.trim() ||
      typeof warehouseId !== "string" || !warehouseId.trim() ||
      typeof reason !== "string" || !reason.trim()
    ) {
      return NextResponse.json({
        success: false,
        error: "قطعه، انبار مقصد و دلیل تخصیص الزامی هستند",
      }, { status: 400 });
    }

    const result = await allocateInitialStock(partId, warehouseId, reason, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof InventoryServiceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error?.code === "P2034" || error?.code === "P2002") {
      return NextResponse.json({
        success: false,
        error: "تخصیص اولیه هم‌زمان انجام شده است؛ صفحه را تازه‌سازی و وضعیت را بررسی کنید",
      }, { status: 409 });
    }
    console.error("[store/inventory/initial-allocation] error:", error);
    return NextResponse.json({ success: false, error: "خطای داخلی در تخصیص اولیه موجودی" }, { status: 500 });
  }
}
