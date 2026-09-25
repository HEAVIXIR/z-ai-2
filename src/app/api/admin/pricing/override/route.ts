import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { createOverride } from "@/lib/price-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/admin/pricing/override
   Admin only. Creates a PriceOverride (with audit log) per spec §13.
   STEP 6D.4: Permission gate upgraded from isAuthenticated() to requirePermission('price.override')

   Body: { listingId, overridePrice, reason }
*/
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'price.override');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires price.override" }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const listingId = String(body.listingId ?? "").trim();
    const overridePrice = Number(body.overridePrice);
    const reason = String(body.reason ?? "").trim();

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    if (!Number.isFinite(overridePrice) || overridePrice <= 0) {
      return NextResponse.json(
        { error: "overridePrice must be a positive number" },
        { status: 400 },
      );
    }
    if (reason.length < 3) {
      return NextResponse.json(
        { error: "reason is required (min 3 chars)" },
        { status: 400 },
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const created = await createOverride({
      listingId,
      overridePrice,
      reason,
      adminId: user.id,
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
