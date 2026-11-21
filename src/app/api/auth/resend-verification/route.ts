import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { RESEND } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/resend-verification  (FIX 7)
   Body: { email }
   - Looks up the user by email.
   - Rate-limit-ish: only allow resend if the latest EMAIL code is
     older than 60 seconds (otherwise reject with 429).
   - Generates a new 6-digit EMAIL code (10-min expiry) and emails it.
   - Returns { ok, devEmailCode } in sandbox/dev mode so the developer
     can complete the flow without a real SMTP gateway.

   Rate-limited: RESEND preset (3 / hour / IP) per HEAVIX-SECURITY-BASELINE-V1 §6.
   (The 60s per-user throttle below is an additional in-DB guard, not
   a substitute for the IP-level limit above.)
*/
export async function POST(req: Request) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    // ── Rate limit (P0-6) — IP-level, before any DB lookup ──
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: rateLimitKey(ip, RESEND.label),
      limit: RESEND.limit,
      windowMs: RESEND.windowMs,
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
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "ایمیل معتبر نیست" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Don't leak existence — return generic ok.
      return NextResponse.json({ ok: true, message: "اگر ایمیل معتبر باشد، کد ارسال شد." });
    }
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, message: "ایمیل شما قبلاً تأیید شده است." });
    }

    // Throttle: most recent EMAIL code must be at least 60s old.
    const latest = await db.verificationCode.findFirst({
      where: { userId: user.id, type: "EMAIL", used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < 60 * 1000) {
      return NextResponse.json(
        { error: "برای ارسال مجدد یک دقیقه صبر کنید." },
        { status: 429 },
      );
    }

    const emailCode = String(randomInt(100000, 1000000));
    const codeHash = await hashPassword(emailCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Replace all prior active challenges atomically so only the newest
    // emailed code can activate the account.
    const newChallenge = await db.$transaction(async (tx) => {
      await tx.verificationCode.updateMany({
        where: { userId: user.id, type: "EMAIL", used: false },
        data: { used: true },
      });
      return tx.verificationCode.create({
        data: {
          userId: user.id,
          code: codeHash,
          type: "EMAIL",
          expiresAt,
          used: false,
        },
      });
    });

    try {
      await sendVerificationEmail(user.email, emailCode);
    } catch {
      // Do not leave an undelivered code usable.
      await db.verificationCode.updateMany({
        where: { id: newChallenge.id, used: false },
        data: { used: true },
      });
      console.error("[resend-verification] email delivery failed");
      return NextResponse.json(
        { error: "ارسال ایمیل انجام نشد. تنظیمات سرویس ایمیل باید تکمیل شود." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "کد جدید به ایمیل شما ارسال شد.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
