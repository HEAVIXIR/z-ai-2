import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { sendEmailWithResult } from "@/lib/email";
import { trackError } from "@/lib/error-tracking";
import { getActiveCompanyMembership } from "@/lib/identity/company-access";
import {
  companyInvitationActiveKey,
  COMPANY_INVITATION_TTL_MS,
  createCompanyInvitationToken,
  hashCompanyInvitationToken,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/identity/invitations";
import { isCompanyMembershipRoleKey } from "@/lib/identity/standard";
import { COMPANY_INVITATION } from "@/lib/rate-limit-presets";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey, getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function configuredAppUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** POST /api/companies/:companyId/invitations */
/** GET /api/companies/:companyId/invitations — pending invitations only. */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user || user.status !== "ACTIVE" || !user.emailVerified) {
      return NextResponse.json({ ok: false, error: "verified_account_required" }, { status: 403 });
    }
    const { companyId } = await context.params;
    const membership = await getActiveCompanyMembership(user.id, companyId);
    if (!membership || !["OWNER", "ORG_ADMIN"].includes(membership.roleKey)) {
      return NextResponse.json({ ok: false, error: "company_permission_denied" }, { status: 403 });
    }

    const now = new Date();
    await db.companyInvitation.updateMany({
      where: { companyId, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", activeKey: null },
    });
    const invitations = await db.companyInvitation.findMany({
      where: { companyId, status: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        emailNormalized: true,
        roleKey: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ ok: true, invitations });
  } catch (error) {
    trackError(error, { endpoint: "GET /api/companies/[companyId]/invitations" });
    return NextResponse.json({ ok: false, error: "invitations_unavailable" }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "csrf_failed" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user || user.status !== "ACTIVE" || !user.emailVerified) {
      return NextResponse.json({ ok: false, error: "verified_account_required" }, { status: 403 });
    }

    const rl = rateLimit({
      key: rateLimitKey(user.id, COMPANY_INVITATION.label),
      limit: COMPANY_INVITATION.limit,
      windowMs: COMPANY_INVITATION.windowMs,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfter: retryAfterSeconds(rl.resetAt) },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
      );
    }

    const { companyId } = await context.params;
    if (!companyId || companyId.length > 128) {
      return NextResponse.json({ ok: false, error: "invalid_company" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const emailNormalized = normalizeInvitationEmail(
      typeof body.email === "string" ? body.email : "",
    );
    const roleKey: unknown = body.roleKey;

    if (!isValidInvitationEmail(emailNormalized) || !isCompanyMembershipRoleKey(roleKey)) {
      return NextResponse.json({ ok: false, error: "invalid_invitation" }, { status: 400 });
    }
    if (emailNormalized === normalizeInvitationEmail(user.email)) {
      return NextResponse.json({ ok: false, error: "cannot_invite_self" }, { status: 400 });
    }
    if (roleKey === "OWNER") {
      return NextResponse.json({ ok: false, error: "owner_transfer_requires_separate_flow" }, { status: 400 });
    }

    const inviterMembership = await getActiveCompanyMembership(user.id, companyId);
    if (!inviterMembership || !["OWNER", "ORG_ADMIN"].includes(inviterMembership.roleKey)) {
      return NextResponse.json({ ok: false, error: "company_permission_denied" }, { status: 403 });
    }
    if (roleKey === "ORG_ADMIN" && inviterMembership.roleKey !== "OWNER") {
      return NextResponse.json({ ok: false, error: "cannot_grant_org_admin" }, { status: 403 });
    }

    const appUrl = configuredAppUrl();
    if (!appUrl) {
      return NextResponse.json({ ok: false, error: "invitation_delivery_not_configured" }, { status: 503 });
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, status: true },
    });
    if (!company || company.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "company_unavailable" }, { status: 404 });
    }

    const invitee = await db.user.findUnique({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
      select: { id: true, status: true },
    });
    if (invitee) {
      const existingMembership = await db.companyMembership.findUnique({
        where: { companyId_userId: { companyId, userId: invitee.id } },
        select: { status: true },
      });
      if (existingMembership) {
        return NextResponse.json(
          { ok: false, error: existingMembership.status === "ACTIVE" ? "already_a_member" : "membership_requires_admin_review" },
          { status: 409 },
        );
      }
    }

    const activeKey = companyInvitationActiveKey(companyId, emailNormalized);
    const previous = await db.companyInvitation.findUnique({
      where: { activeKey },
      select: { id: true, status: true, expiresAt: true },
    });
    if (previous?.status === "PENDING" && previous.expiresAt > new Date()) {
      return NextResponse.json({ ok: false, error: "invitation_already_pending" }, { status: 409 });
    }
    if (previous) {
      await db.companyInvitation.updateMany({
        where: { id: previous.id, status: "PENDING" },
        data: { status: "EXPIRED", activeKey: null },
      });
    }

    const token = createCompanyInvitationToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COMPANY_INVITATION_TTL_MS);
    let invitation;
    try {
      invitation = await db.$transaction(async (tx) => {
        const created = await tx.companyInvitation.create({
          data: {
            companyId,
            emailNormalized,
            roleKey,
            tokenHash: hashCompanyInvitationToken(token),
            activeKey,
            status: "PENDING",
            expiresAt,
            invitedById: user.id,
          },
          select: { id: true, emailNormalized: true, roleKey: true, expiresAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorType: "USER",
            action: "company.invitation.create",
            entityType: "CompanyInvitation",
            entityId: created.id,
            afterJson: JSON.stringify({ companyId, email: emailNormalized, roleKey, expiresAt }),
            ip: getClientIp(req),
            userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
            requestId: req.headers.get("x-request-id")?.slice(0, 128) ?? null,
          },
        });
        return created;
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return NextResponse.json({ ok: false, error: "invitation_already_pending" }, { status: 409 });
      }
      throw error;
    }

    const inviteUrl = new URL("/company/invitations/accept", appUrl);
    inviteUrl.hash = new URLSearchParams({ token }).toString();
    const safeCompanyName = escapeHtml(company.name);
    const safeRole = escapeHtml(roleKey);
    const delivered = await sendEmailWithResult({
      to: emailNormalized,
      subject: "دعوت عضویت در سازمان — HEAVIX",
      text: [
        "برای عضویت در سازمان زیر در HEAVIX دعوت شده‌اید:",
        company.name,
        `نقش: ${roleKey}`,
        "",
        "برای پذیرش دعوت، این پیوند را باز کنید:",
        inviteUrl.toString(),
        "",
        "این پیوند فقط یک‌بار قابل استفاده است و تا ۷۲ ساعت اعتبار دارد.",
        "اگر منتظر این دعوت نبوده‌اید، این پیام را نادیده بگیرید.",
      ].join("\n"),
      html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
        <h2>دعوت عضویت در HEAVIX</h2>
        <p>برای پیوستن به <strong>${safeCompanyName}</strong> دعوت شده‌اید.</p>
        <p>نقش سازمانی: <strong>${safeRole}</strong></p>
        <p><a href="${inviteUrl.toString()}" style="display:inline-block;padding:12px 20px;background:#f58220;color:#111;text-decoration:none;border-radius:8px">پذیرش دعوت</a></p>
        <p>این پیوند یک‌بارمصرف است و تا ۷۲ ساعت اعتبار دارد.</p>
      </div>`,
      sensitive: true,
    });

    if (!delivered) {
      await db.companyInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "DELIVERY_FAILED", activeKey: null },
      });
      return NextResponse.json({ ok: false, error: "invitation_email_failed" }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.emailNormalized,
        roleKey: invitation.roleKey,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    trackError(error, { endpoint: "POST /api/companies/[companyId]/invitations" });
    return NextResponse.json({ ok: false, error: "invitation_unavailable" }, { status: 500 });
  }
}
