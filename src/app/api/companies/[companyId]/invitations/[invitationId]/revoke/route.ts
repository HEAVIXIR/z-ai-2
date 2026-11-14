import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { trackError } from "@/lib/error-tracking";
import { getActiveCompanyMembership } from "@/lib/identity/company-access";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string; invitationId: string }> };

/** POST /api/companies/:companyId/invitations/:invitationId/revoke */
export async function POST(req: Request, context: RouteContext) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "csrf_failed" }, { status: 403 });
  }
  try {
    const user = await getCurrentUser();
    if (!user || user.status !== "ACTIVE" || !user.emailVerified) {
      return NextResponse.json({ ok: false, error: "verified_account_required" }, { status: 403 });
    }
    const { companyId, invitationId } = await context.params;
    const membership = await getActiveCompanyMembership(user.id, companyId);
    if (!membership || !["OWNER", "ORG_ADMIN"].includes(membership.roleKey)) {
      return NextResponse.json({ ok: false, error: "company_permission_denied" }, { status: 403 });
    }

    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const revoked = await tx.companyInvitation.updateMany({
        where: { id: invitationId, companyId, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "REVOKED", revokedAt: now, activeKey: null },
      });
      if (revoked.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "USER",
          action: "company.invitation.revoke",
          entityType: "CompanyInvitation",
          entityId: invitationId,
          afterJson: JSON.stringify({ companyId, status: "REVOKED" }),
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
          requestId: req.headers.get("x-request-id")?.slice(0, 128) ?? null,
        },
      });
      return true;
    });

    if (!result) {
      return NextResponse.json({ ok: false, error: "invitation_not_pending" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, revoked: true });
  } catch (error) {
    trackError(error, { endpoint: "POST /api/companies/[companyId]/invitations/[invitationId]/revoke" });
    return NextResponse.json({ ok: false, error: "invitation_revoke_unavailable" }, { status: 500 });
  }
}
