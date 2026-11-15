import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { VERIFY } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/verify-email
   Accepts { userId, code } for the original registration flow or
   { email, code } for the persistent recovery flow.
*/
export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: rateLimitKey(ip, VERIFY.label),
      limit: VERIFY.limit,
      windowMs: VERIFY.windowMs,
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
    const userId = String(body.userId ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();

    if ((!userId && !email) || !code) {
      return NextResponse.json({ error: "ایمیل و کد تأیید الزامی است" }, { status: 400 });
    }

    const user = userId
      ? await db.user.findUnique({ where: { id: userId } })
      : await db.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ error: "حسابی با این ایمیل پیدا نشد" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, message: "ایمیل قبلاً تأیید شده است" });
    }

    const rec = await db.verificationCode.findFirst({
      where: { userId: user.id, code, type: "EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    if (!rec) {
      return NextResponse.json({ error: "کد تأیید نامعتبر است" }, { status: 400 });
    }
    if (rec.used) {
      return NextResponse.json({ error: "کد تأیید قبلاً استفاده شده است" }, { status: 400 });
    }
    if (rec.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "کد منقضی شده است؛ کد تازه درخواست کنید." }, { status: 400 });
    }

    await db.$transaction([
      db.verificationCode.update({ where: { id: rec.id }, data: { used: true } }),
      db.user.update({
        where: { id: user.id },
        data: { emailVerified: true, status: "ACTIVE" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message: "ایمیل تأیید شد و حساب شما فعال شد.",
      activated: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
