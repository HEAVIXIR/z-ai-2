import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { matchAllRequests } from "@/lib/ai-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/matching/run — run AI matching for all
   active BuyRequests.

   Permission: matching.read
   Pattern: getCurrentUser() → 401 → requirePermission → 403
   ============================================================ */

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "matching.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires matching.read" },
      { status: 403 },
    );
  }
  try {
    // Audit the admin trigger (the matching lib also writes its own
    // SYSTEM-level batched entry — this one records the human actor).
    try {
      await logAudit({
        actorId: user.id,
        actorType: "ADMIN",
        action: "matching.admin.trigger",
        entityType: "BuyRequest",
        entityId: null,
        reason: "اجرای دستی موتور تطبیق هوشمند توسط ادمین",
      });
    } catch {
      /* non-fatal */
    }

    const result = await matchAllRequests();
    return NextResponse.json({
      ok: true,
      totalRequests: result.totalRequests,
      totalMatches: result.totalMatches,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
