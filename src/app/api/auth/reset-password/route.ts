import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { verifyPasswordResetCode } from "@/lib/password-reset-code";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const ip = getClientIp(req);
  const rl = rateLimit({
    key: rateLimitKey(ip, "PASSWORD_RESET_CONFIRM"),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "تعداد تلاش‌ها بیش از حد مجاز است." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").trim();
  const password = String(body.password ?? "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "ایمیل یا کد بازیابی معتبر نیست." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "رمز عبور باید حداقل ۸ کاراکتر باشد." }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, emailVerified: true } });
    if (!user || user.status !== "ACTIVE" || !user.emailVerified) {
      return NextResponse.json({ error: "کد بازیابی معتبر یا قابل استفاده نیست." }, { status: 400 });
    }

    const record = await db.verificationCode.findFirst({
      where: {
        userId: user.id,
        type: "PASSWORD_RESET",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true },
    });
    if (!record) {
      return NextResponse.json({ error: "کد بازیابی معتبر یا قابل استفاده نیست." }, { status: 400 });
    }
    const codeMatches = await verifyPasswordResetCode(code, record.code);
    if (!codeMatches) {
      return NextResponse.json({ error: "کد بازیابی معتبر یا قابل استفاده نیست." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      // Conditional consumption prevents two concurrent requests from reusing one code.
      const consumed = await tx.verificationCode.updateMany({
        where: {
          id: record.id,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      });
      if (consumed.count !== 1) {
        throw new Error("RESET_CODE_ALREADY_USED");
      }

      await tx.verificationCode.updateMany({
        where: { userId: user.id, type: "PASSWORD_RESET", used: false },
        data: { used: true },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      // Revoke every existing login session after a credential reset.
      await tx.session.deleteMany({ where: { userId: user.id } });
    });

    return NextResponse.json({ ok: true, message: "رمز عبور با موفقیت تغییر کرد. اکنون وارد شوید." });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_CODE_ALREADY_USED") {
      return NextResponse.json({ error: "کد بازیابی قبلاً استفاده شده یا منقضی شده است." }, { status: 409 });
    }
    return NextResponse.json({ error: "بازیابی رمز عبور انجام نشد. دوباره تلاش کنید." }, { status: 500 });
  }
}
