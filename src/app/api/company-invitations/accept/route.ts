import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { trackError } from "@/lib/error-tracking";
import {
  hashCompanyInvitationToken,
  isCompanyInvitationToken,
  normalizeInvitationEmail,
} from "@/lib/identity/invitations";
import { isCompanyMembershipRoleKey } from "@/lib/identity/standard";
import { COMPANY_INVITATION_ACCEPT } from "@/lib/rate-limit-presets";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey, getClientIp } from "@/lib/request-context";

/** POST /api/company-invitations/accept */
export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "csrf_failed" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user || user.status !== "ACTIVE" || !user.emailVerified) {
      return NextResponse.json({ ok: false, error: "verified_account_required" }, { status: 403 });
    }

    const rl = rateLimit({
      key: rateLimitKey(user.id, COMPANY_INVITATION_ACCEPT.label),
      limit: COMPANY_INVITATION_ACCEPT.limit,
      windowMs: COMPANY_INVITATION_ACCEPT.windowMs,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfter: retryAfterSeconds(rl.resetAt) },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
      );
    }

    const bodyValue: unknown = await req.json().catch(() => null);
    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_invitation" }, { status: 404 });
    }
    const body = bodyValue as Record<string, unknown>;
    const token = body.token;
    if (!isCompanyInvitationToken(token)) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_invitation" }, { status: 404 });
    }

    const tokenHash = hashCompanyInvitationToken(token);
    const invitation = await db.companyInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        emailNormalized: true,
        roleKey: true,
        status: true,
        expiresAt: true,
        companyId: true,
        company: { select: { id: true, name: true, status: true } },
      },
    });
    if (!invitation || invitation.status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_invitation" }, { status: 404 });
    }

    const now = new Date();
    if (invitation.expiresAt <= now) {
      await db.companyInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "EXPIRED", activeKey: null },
      });
      return NextResponse.json({ ok: false, error: "invalid_or_expired_invitation" }, { status: 410 });
    }

    if (normalizeInvitationEmail(user.email) !== invitation.emailNormalized) {
      return NextResponse.json({ ok: false, error: "invitation_email_mismatch" }, { status: 403 });
    }
    if (invitation.company.status !== "ACTIVE" || !isCompanyMembershipRoleKey(invitation.roleKey) || invitation.roleKey === "OWNER") {
      return NextResponse.json({ ok: false, error: "invitation_unavailable" }, { status: 409 });
    }

    const result = await db.$transaction(async (tx) => {
      const claimed = await tx.companyInvitation.updateMany({
        where: { id: invitation.id, tokenHash, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", acceptedAt: now, acceptedById: user.id, activeKey: null },
      });
      if (claimed.count !== 1) throw new Error("INVITATION_NOT_AVAILABLE");

      const existingMembership = await tx.companyMembership.findUnique({
        where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } },
        select: { id: true },
      });
      if (existingMembership) throw new Error("MEMBERSHIP_ALREADY_EXISTS");

      const membership = await tx.companyMembership.create({
        data: {
          companyId: invitation.companyId,
          userId: user.id,
          roleKey: invitation.roleKey,
          status: "ACTIVE",
          isPrimary: false,
        },
        select: { id: true, companyId: true, roleKey: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "USER",
          action: "company.invitation.accept",
          entityType: "CompanyInvitation",
          entityId: invitation.id,
          afterJson: JSON.stringify({ companyId: invitation.companyId, membershipId: membership.id, roleKey: invitation.roleKey }),
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
          requestId: req.headers.get("x-request-id")?.slice(0, 128) ?? null,
        },
      });
      return membership;
    });

    return NextResponse.json({
      ok: true,
      membership: result,
      company: { id: invitation.company.id, name: invitation.company.name },
    });
  } catch (error) {
    if (error instanceof Error && ["INVITATION_NOT_AVAILABLE", "MEMBERSHIP_ALREADY_EXISTS"].includes(error.message)) {
      return NextResponse.json({ ok: false, error: "invitation_cannot_be_accepted" }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "invitation_cannot_be_accepted" }, { status: 409 });
    }
    trackError(error, { endpoint: "POST /api/company-invitations/accept" });
    return NextResponse.json({ ok: false, error: "invitation_acceptance_unavailable" }, { status: 500 });
  }
}
