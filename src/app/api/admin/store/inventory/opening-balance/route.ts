import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { requirePermission } from "@/lib/authorization";
import { InventoryServiceError } from "@/lib/store-inventory-service";
import {
  allocateOpeningBalance,
  listOpeningBalanceCandidates,
} from "@/lib/store-opening-balance-service";

export const runtime = 'nodejs";
export const dynamic = 'force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof InventoryServiceError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    );
  }
  console.error('[store/opening-balance] error:', error);
  return NextResponse.json(
    { success: false, error: 'خطای داخلی در تخصیص موجودی اولیه' },
    { status: 500 },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requirePermission(user.id, 'inventory.read');
  } catch {
    return NextResponse.json({ error: 'Forbidden: requires inventory.read' }, { status: 403 });
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
    return NextResponse.json({ success: false, error: 'CSRF check failed' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requirePermission(user.id, 'inventory.manage');
  } catch {
    return NextResponse.json({ error: 'Forbidden: requires inventory.manage' }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (body?.confirm !== true) {
      return NextResponse.json(
        { success: false, error: 'تأیید صریح عملیات الزامی است' },
        { status: 400 },
      );
    }
    if (typeof body?.partId !== 'string'
      || typeof body?.reason !== 'string'
      || (body?.reference != null && typeof body.reference !== 'string')
      || !Array.isArray(body?.allocations)) {
      return NextResponse.json({ success: false, error: 'ساختار درخواست تخصیص نامعتبر است' }, { status: 400 });
    }
    if (body.reason.length > 500 || (body.reference?.length ?? 0) > 160) {
      return NextResponse.json({ success: false, error: 'طول دلیل یا مرجع بیش از حد مجاز است' }, { status: 400 });
    }
    const data = await allocateOpeningBalance({
      partId: body.partId,
      allocations: body.allocations,
      reason: body.reason,
      reference: body.reference ?? null,
      userId: user.id,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}
