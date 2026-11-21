import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
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
      where: {
        userId: user.id,
        type: "EMAIL",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!rec || rec.used || rec.expiresAt <= new Date()) {
      return NextResponse.json({ error: "کد تأیید نامعتبر، منقضی یا استفاده شده است" }, { status: 400 });
    }

    // New records contain bcrypt hashes. Accept only still-unexpired legacy
    // plaintext rows during their short remaining lifetime for rollout safety.
    const matches = rec.code.startsWith("$2")
      ? await verifyPassword(code, rec.code)
      : rec.code === code || rec.code === createHash("sha256").update(code).digest("hex");
    if (!matches) {
      return NextResponse.json({ error: "کد تأیید نامعتبر، منقضی یا استفاده شده است" }, { status: 400 });
    }

    // Conditional UPDATE is the single-use gate: concurrent requests race
    // on used=false and only one transaction can consume the challenge.
    const activated = await db.$transaction(async (tx) => {
      const consumed = await tx.verificationCode.updateMany({
        where: {
          id: rec.id,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      });
      if (consumed.count !== 1) return false;

      await tx.user.update({
        where: { id: user.id },
        data: { emailVerified: true, status: "ACTIVE" },
      });
      return true;
    });

    if (!activated) {
      return NextResponse.json(
        { error: "کد تأیید قبلاً استفاده شده یا منقضی شده است" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ایمیل تأیید شد و حساب شما فعال شد.",
      activated: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
