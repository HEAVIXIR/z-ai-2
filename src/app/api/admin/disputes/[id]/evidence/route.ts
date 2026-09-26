import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { addEvidence, listEvidence } from "@/lib/disputes-service";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/disputes/[id]/evidence — evidence lifecycle.

   GET  — list evidence rows for a dispute.
          Permission: dispute.read (canonical read gate).
   POST — add a typed evidence row (SCREENSHOT | DOCUMENT |
          MESSAGE | OTHER). The `url` must point to an already-
          uploaded attachment (uploaded via /api/admin/attachments;
          we never accept raw bytes here).
          Permission: dispute.manage (admins add evidence).

   Audit (POST): `marketplace.dispute.evidence.add` (entityType:
     DisputeEvidence). Written inside the service layer; this route
     also writes a `marketplace.dispute.evidence.list_view` audit
     on GET (best-effort).
   ============================================================ */

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "dispute.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires dispute.read" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const evidence = await listEvidence(id);

    // Best-effort audit (list_view) — never throws
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "marketplace.dispute.evidence.list_view",
      entityType: "DisputeEvidence",
      entityId: id,
      reason: `viewed evidence list for dispute ${id} (${evidence.length} rows)`,
    }).catch(() => {
      /* non-fatal */
    });

    return NextResponse.json({ ok: true, evidence });
  } catch (err: any) {
    const status =
      err?.name === "DisputesServiceError" ? err.status : 500;
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status },
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "dispute.manage");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires dispute.manage" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const evidenceType = String(body?.evidenceType ?? body?.type ?? "").toUpperCase();
    const evidenceUrl = String(body?.evidenceUrl ?? body?.url ?? "").trim();
    const description = body?.description ? String(body.description) : null;

    if (!evidenceType || !evidenceUrl) {
      return NextResponse.json(
        {
          error:
            "evidenceType (SCREENSHOT | DOCUMENT | MESSAGE | OTHER) و evidenceUrl الزامی هستند",
        },
        { status: 400 },
      );
    }

    const evidence = await addEvidence({
      disputeId: id,
      evidenceType,
      evidenceUrl,
      description,
      uploadedBy: user.id,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, evidence });
  } catch (err: any) {
    const status =
      err?.name === "DisputesServiceError" ? err.status : 500;
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status },
    );
  }
}
