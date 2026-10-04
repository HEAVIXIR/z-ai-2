import { NextResponse } from "next/server";
import { matchSavedSearches } from "@/lib/alert-matcher";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/alerts/match — run the alert matcher (P1-5).
   ------------------------------------------------------------
   Triggers `matchSavedSearches()` synchronously — every active
   SavedSearch is re-run against the current PUBLISHED listing
   pool and one Notification per user is created for any new
   matches found. Returns aggregate counts.

   Admin-only. Uses the dual-path authorization pattern (legacy
   admin-cookie OR user session with ADMIN role).
   ============================================================ */

export async function POST() {
  // CP-02.15.3: migrated from authorizeAdmin() legacy hybrid to canonical requireAdmin(perm)
  const [user, error] = await requireAdmin("analytics.manage");
  if (error) return error;

  try {
    const result = await matchSavedSearches();

    await logAudit({
      actorId: user?.id ?? null,
      actorType: "ADMIN",
      action: "alert.match_run",
      entityType: "SavedSearch",
      entityId: null,
      after: result,
      reason: `اجرای دستی تطبیق هشدارها — ${result.scanned} جستجوی ذخیره‌شده اسکن شد (${result.matched} مطابقت، ${result.notified} اعلان).`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
