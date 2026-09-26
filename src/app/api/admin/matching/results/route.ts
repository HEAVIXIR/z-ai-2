import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { listRecentMatchRuns, getMatchResults } from "@/lib/matching-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/matching/results — list recent match runs.

   Query params:
     ?limit=50   — cap 200 (default 50)
     ?id=<aid>  — if present, return a single match-run record
                  (used by the admin detail drawer)

   Permission: matching.read (canonical admin read gate;
     the GET /admin/matching page also uses matching.read).
   Audit: logAudit('marketplace.matching.list_view', entityType:
     'AuditLog') — best-effort, never throws.
   ============================================================ */

export async function GET(req: Request) {
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
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const idParam = url.searchParams.get("id");

    // ?id=<aid> → return a single match-run record
    if (idParam) {
      const record = await getMatchResults(idParam);
      return NextResponse.json({ ok: true, match: record });
    }

    const records = await listRecentMatchRuns(limitParam);

    // Best-effort audit (list_view) — never throws
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "marketplace.matching.list_view",
      entityType: "AuditLog",
      reason: `viewed matching results list (${records.length} records)`,
    }).catch(() => {
      /* non-fatal */
    });

    return NextResponse.json({ ok: true, matches: records });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
