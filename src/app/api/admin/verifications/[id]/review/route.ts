import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { getClientIp } from "@/lib/request-context";
import { logAudit } from "@/lib/audit";
import {
  reviewVerification,
  TrustServiceError,
} from "@/lib/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/admin/verifications/[id]/review
 *
 * Review a pending verification: approve (VERIFIED), reject
 * (REJECTED), or move to UNDER_REVIEW for further investigation.
 *
 * Body: { status: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW',
 *         reviewNotes?: string, expiresAt?: string (ISO) }
 *
 * The service writes the canonical `trust.verification.review`
 * audit entry. This route also stamps a lightweight
 * `trust.verification.review.api` access audit capturing the
 * reviewer's IP/UA (best-effort, never throws).
 *
 * Permission: company.verify
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "company.verify");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires company.verify" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { status, reviewNotes, expiresAt } = body;

    const result = await reviewVerification({
      verificationId: id,
      status,
      reviewNotes,
      reviewedBy: user.id,
      expiresAt,
    });

    // Access audit (best-effort) — captures IP/UA separately from
    // the canonical audit written by the service layer.
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "trust.verification.review.api",
      entityType: "CompanyVerification",
      entityId: id,
      ip: getClientIp(req),
      reason: `POST /api/admin/verifications/${id}/review → ${result.status}`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof TrustServiceError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: (err as Error)?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
