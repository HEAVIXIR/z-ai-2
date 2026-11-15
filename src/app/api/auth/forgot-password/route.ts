import { randomInt, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordResetEmail, isSmtpConfigured } from "@/lib/email";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_RESPONSE = {
  ok: true,
  message: "اگر این ایمیل در هویکس ثبت شده باشد، دستور بازیابی برای آن ارسال می‌شود.",
};

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const ip = getClientIp(req);
  const rl = rateLimit({
    key: rateLimitKey(ip, "PASSWORD_RESET_REQUEST"),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "درخواست بیش از حد. کمی بعد دوباره تلاش کنید." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "یک ایمیل معتبر وارد کنید." }, { status: 400 });
  }

  // Keep behavior identical for known and unknown addresses when SMTP is unavailable.
  if (!isSmtpConfigured()) {
    return NextResponse.json(
      { error: "سرویس بازیابی رمز عبور موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید." },
      { status: 503 },
    );
  }

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true, status: true },
    });

    if (user && user.emailVerified && user.status !== "BLOCKED") {
      const code = String(randomInt(100000, 1000000));
      await db.verificationCode.updateMany({
        where: { userId: user.id, type: "PASSWORD_RESET", used: false },
        data: { used: true },
      });
      await db.verificationCode.create({
        data: {
          userId: user.id,
          code: hashCode(code),
          type: "PASSWORD_RESET",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await sendPasswordResetEmail(user.email, code);
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch {
    return NextResponse.json(
      { error: "ارسال درخواست بازیابی انجام نشد. لطفاً دوباره تلاش کنید." },
      { status: 503 },
    );
  }
}
