import { NextResponse } from "next/server";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { isAdmin } from "@/lib/authorization";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { LOGIN } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
    });

    if (!user) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    const passwordValid = await verifyPassword(String(password), user.passwordHash);
    if (!passwordValid) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    if (user.status === "BLOCKED") {
      return NextResponse.json({ error: "حساب کاربری شما مسدود شده است" }, { status: 403 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await createUserSession(user.id);

    const admin = await isAdmin(user.id);
    const userRoles = await db.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { key: true } } },
    });
    const roles = userRoles.map((r) => r.role.key);
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
