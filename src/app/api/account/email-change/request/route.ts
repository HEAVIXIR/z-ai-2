import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendEmailChangeVerification, isEmailDeliveryConfigured } from "@/lib/email";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد حساب شوید." }, { status: 401 });

  const rl = rateLimit({
    key: rateLimitKey(getClientIp(req), `ACCOUNT_EMAIL_CHANGE:${user.id}`),
    limit: 4,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "درخواست بیش از حد مجاز است." }, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) },
    });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const currentPassword = String(body.currentPassword ?? "");
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "ایمیل جدید معتبر نیست." }, { status: 400 });
  }
  if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "برای تغییر ایمیل، رمز عبور فعلی را صحیح وارد کنید." }, { status: 403 });
  }
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "ایمیل جدید با ایمیل فعلی یکسان است." }, { status: 400 });
  }
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ error: "سرویس ارسال ایمیل موقتاً پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "این ایمیل قبلاً در HEAVIX ثبت شده است." }, { status: 409 });

    const code = String(randomInt(100000, 1000000));
    const codeHash = await hashPassword(code);
    const payload = Buffer.from(JSON.stringify({ v: 1, targetEmail: email, codeHash })).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const challenge = await db.$transaction(async (tx) => {
      await tx.verificationCode.updateMany({
        where: { userId: user.id, type: "EMAIL_CHANGE", used: false },
        data: { used: true },
      });
      return tx.verificationCode.create({
        data: { userId: user.id, type: "EMAIL_CHANGE", code: `ACV1.${payload}`, expiresAt, used: false },
      });
    });

    try {
      await sendEmailChangeVerification(email, code);
    } catch {
      await db.verificationCode.updateMany({ where: { id: challenge.id, used: false }, data: { used: true } });
      return NextResponse.json({ error: "ارسال کد به ایمیل جدید انجام نشد. ایمیل فعلی شما تغییری نکرده است." }, { status: 503 });
    }

    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "account.email_change.requested",
      entityType: "User",
      entityId: user.id,
      after: { challengeCreated: true, expiresInMinutes: 10 },
    });
    return NextResponse.json({ ok: true, message: "کد تأیید به ایمیل جدید ارسال شد؛ ایمیل فعلی تا زمان تأیید حفظ می‌شود." });
  } catch {
    return NextResponse.json({ error: "درخواست تغییر ایمیل انجام نشد." }, { status: 500 });
  }
}
