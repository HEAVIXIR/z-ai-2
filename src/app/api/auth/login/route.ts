import { NextResponse } from "next/server";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { LOGIN } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: rateLimitKey(ip, LOGIN.label),
      limit: LOGIN.limit,
      windowMs: LOGIN.windowMs,
    });

    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست بیش از حد. بعداً تلاش کنید.", retryAfter: retryAfterSeconds(rl.resetAt) },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password, mobile, email } = body ?? {};

    if (!password) return NextResponse.json({ error: "رمز عبور الزامی است" }, { status: 400 });
    if (!mobile && !email) {
      return NextResponse.json({ error: "شماره موبایل یا ایمیل الزامی است" }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          mobile ? { mobile: String(mobile) } : {},
          email ? { email: String(email).toLowerCase() } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        emailVerified: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        mobile: true,
        userType: true,
        mobileVerified: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });

    if (!user) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    const passwordValid = await verifyPassword(String(password), user.passwordHash);
    if (!passwordValid) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    if (user.status === "BLOCKED") {
      return NextResponse.json({ error: "حساب کاربری شما مسدود شده است" }, { status: 403 });
    }
    if (!user.emailVerified || user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "ابتدا ایمیل خود را با کد ارسال‌شده تأیید کنید." },
        { status: 403 },
      );
    }

    // Resolve canonical RBAC roles in the initial user lookup. This avoids
    // two additional permission queries on every successful login.
    let roles = (user.userRoles ?? []).map((entry) => entry.role.key);

    // Preview-only owner bootstrap: exact allowlisted, verified account must
    // successfully authenticate with its password before receiving ADMIN.
    const isPreviewDeployment = process.env.HEAVIX_ENV === "preview";
    const ownerEmail = process.env.HEAVIX_OWNER_EMAIL?.trim().toLowerCase();
    if (
      isPreviewDeployment &&
      ownerEmail &&
      user.email.toLowerCase() === ownerEmail &&
      !roles.includes("ADMIN")
    ) {
      const adminRole = await db.role.findUnique({
        where: { key: "ADMIN" },
        select: { id: true },
      });
      if (!adminRole) {
        throw new Error('RBAC ADMIN role is missing; run the RBAC seed before owner bootstrap.');
      }

      const previousRole = user.role;
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { role: "ADMIN" },
        });

        // Delete the replaceable default roles directly; avoid a read-before-delete
        // round trip while keeping custom roles untouched.
        await tx.userRole.deleteMany({
          where: {
            userId: user.id,
            role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } },
          },
        });

        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
          create: { userId: user.id, roleId: adminRole.id },
          update: {},
        });
      });

      roles = [...roles.filter((key) => !["ADMIN", "SELLER", "BUYER"].includes(key)), "ADMIN"];

      await logAudit({
        actorId: user.id,
        actorType: "SYSTEM",
        action: "user.role.owner_bootstrap",
        entityType: "User",
        entityId: user.id,
        before: { role: previousRole },
        after: { role: "ADMIN", roleKey: "ADMIN" },
        reason: "Verified owner account authenticated; Preview-only HEAVIX_OWNER_EMAIL allowlist",
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await createUserSession(user.id);

    const admin = roles.includes("ADMIN");
    const role = admin ? "admin" : (roles[0] ?? "BUYER");

    return NextResponse.json({
      ok: true,
      role,
      roles,
      user: {
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        mobile: user.mobile, email: user.email, userType: user.userType,
        role, roles, status: user.status,
        emailVerified: user.emailVerified, mobileVerified: user.mobileVerified,
      },
    });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/auth/login" });
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
