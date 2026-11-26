import { NextResponse } from "next/server";
import { getCurrentUser, createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, isPasswordWithinBcryptLimit } from "@/lib/password";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد حساب شوید." }, { status: 401 });

  const rl = rateLimit({
    key: rateLimitKey(getClientIp(req), `ACCOUNT_PASSWORD_CHANGE:${user.id}`),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "تعداد تلاش‌ها بیش از حد مجاز است." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  if (!currentPassword || newPassword.length < 8 || newPassword.length > 128 || !isPasswordWithinBcryptLimit(newPassword)) {
    return NextResponse.json({ error: "رمز فعلی و رمز جدید ۸ تا ۱۲۸ کاراکتری (حداکثر ۷۲ بایت UTF-8) الزامی است." }, { status: 400 });
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "رمز عبور فعلی صحیح نیست." }, { status: 403 });
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    return NextResponse.json({ error: "رمز جدید باید با رمز فعلی متفاوت باشد." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Revoke every existing session; the current browser receives a fresh one below.
      await tx.session.deleteMany({ where: { userId: user.id } });
      // Credential rotation invalidates outstanding reset and contact-change challenges.
      await tx.verificationCode.updateMany({
        where: { userId: user.id, type: { in: ["PASSWORD_RESET", "EMAIL_CHANGE", "MOBILE_CHANGE"] }, used: false },
        data: { used: true },
      });
    });

    await createUserSession(user.id);
    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "account.password.changed",
      entityType: "User",
      entityId: user.id,
      after: { sessionsRevoked: true, currentSessionRotated: true },
    });

    return NextResponse.json({ ok: true, message: "رمز عبور تغییر کرد و نشست‌های قبلی بسته شدند." });
  } catch {
    return NextResponse.json({ error: "تغییر رمز عبور انجام نشد. دوباره تلاش کنید." }, { status: 500 });
  }
}
