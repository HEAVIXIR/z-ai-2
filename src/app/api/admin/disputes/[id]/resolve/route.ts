import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { resolveDispute, reviewDispute } from "@/lib/disputes-service";
import { createAuthContext } from '@/lib/authorization-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/disputes/[id]/resolve — resolve a dispute.

   Body:
     { resolution: string (required, min 3 chars),
       refundAmount?: number (optional, > 0 → wallet credit),
       reviewNotes?: string (optional — only used if status is
         OPEN and we auto-review before resolving) }

   Permission: dispute.manage (admins resolve disputes).

   Audit: `marketplace.dispute.resolve` (entityType: Dispute).
   Written inside the service layer (also writes a side-effect
   audit on Customer + WalletTransaction when a wallet txn is
   created). See src/lib/disputes-service.ts for details.
   ============================================================ */

type Params = { params: Promise<{ id: string }> };

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
    const resolution = String(body?.resolution ?? "").trim();
    const refundAmount = body?.refundAmount != null ? Number(body.refundAmount) : null;
    const reviewNotes = body?.reviewNotes ? String(body.reviewNotes) : null;

    if (!resolution) {
      return NextResponse.json(
        { error: "resolution الزامی است (حداقل ۳ حرف)" },
        { status: 400 },
      );
    }

    // If the dispute is still OPEN, auto-flip to UNDER_REVIEW first
    // (the lifecycle must pass through UNDER_REVIEW before RESOLVED;
    // this is a convenience for admins — they can also call the
    // review route explicitly).
    if (reviewNotes != null) {
      try {
        await reviewDispute(
          id,
          reviewNotes,
          createAuthContext(user.id),
          user.id,
        );
      } catch {
        // Non-fatal — the dispute may already be UNDER_REVIEW or
        // terminal. The resolve call below will surface the real
        // error if there is one.
      }
    }

    const result = await resolveDispute(
      id,
      resolution,
      refundAmount,
      createAuthContext(user.id),
      user.id,
    );

    return NextResponse.json({
      ok: true,
      dispute: result,
    });
  } catch (err: any) {
    const status =
      err?.name === "DisputesServiceError" ? err.status : 500;
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status },
    );
  }
}
