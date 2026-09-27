import { NextResponse } from "next/server";
import { validateLogin, createSession, createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { LOGIN } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/login
   Body: { username, password }   → admin login
   Body: { mobile, password }     → user login
   Body: { email, password }      → user login

   Admin authentication is ONLY performed through `username`.
   Mobile/email values are NEVER retried as admin credentials.
*/
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
        {
          error: "درخواست بیش از حد. بعداً تلاش کنید.",
          retryAfter: retryAfterSeconds(rl.resetAt),
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { username, password, mobile, email } = body ?? {};

    if (!password) {
      return NextResponse.json(
        { error: "رمز عبور الزامی است" },
        { status: 400 },
      );
    }

    /*
     * ADMIN PATH
     *
     * Important:
     * The admin credential pair is accepted ONLY through `username`.
     * We deliberately do not fall back from mobile/email to username.
     */
    if (username !== undefined && username !== null && String(username).trim()) {
      if (!validateLogin(String(username), String(password))) {
        return NextResponse.json(
          { error: "نام کاربری یا رمز عبور نادرست است" },
          { status: 401 },
        );
      }
      await createSession();
      return NextResponse.json({
        ok: true,
        role: "admin",
        message: "ورود مدیر موفقیت‌آمیز بود",
      });
    }

    /*
     * USER PATH
     *
     * Users authenticate through mobile OR email.
     * No user identifier is ever retried against admin credentials.
     */
    if (!mobile && !email) {
      return NextResponse.json(
        { error: "شماره موبایل یا ایمیل الزامی است" },
        { status: 400 },
      );
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          mobile ? { mobile: String(mobile) } : {},
          email ? { email: String(email) } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "کاربر یافت نشد یا رمز نادرست است" },
        { status: 401 },
      );
    }

    const passwordValid = await verifyPassword(
      String(password),
      user.passwordHash,
    );

    if (!passwordValid) {
      return NextResponse.json(
        { error: "کاربر یافت نشد یا رمز نادرست است" },
        { status: 401 },
      );
    }

    if (user.status === "BLOCKED") {
      return NextResponse.json(
        { error: "حساب کاربری شما مسدود شده است" },
        { status: 403 },
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createUserSession(user.id);

    return NextResponse.json({
      ok: true,
      role: user.role || "BUYER",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        email: user.email,
        userType: user.userType,
        role: user.role || "BUYER",
        status: user.status,
        emailVerified: user.emailVerified,
        mobileVerified: user.mobileVerified,
      },
    });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/auth/login" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
