import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mobile changes are deliberately fail-closed until a free/approved SMS
 * delivery adapter and its OTP verification flow are configured. The
 * current mobile number is never overwritten or marked verified here.
 */
export async function POST(req: Request) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد حساب شوید." }, { status: 401 });

  const rl = rateLimit({
    key: rateLimitKey(getClientIp(req), `ACCOUNT_MOBILE_CHANGE:${user.id}`),
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "درخواست بیش از حد مجاز است." }, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) },
    });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const mobile = String(body.mobile ?? "").replace(/[\s()-]/g, "");
  if (!/^\+?[0-9۰-۹٠-٩]{10,16}$/.test(mobile)) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست." }, { status: 400 });
  }
  if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "برای تغییر موبایل، رمز عبور فعلی لازم است." }, { status: 403 });
  }

  return NextResponse.json({
    error: "تغییر شماره تا اتصال درگاه پیامکی و فعال‌شدن تأیید OTP غیرفعال است؛ شماره فعلی شما بدون تغییر باقی ماند.",
    code: "SMS_VERIFICATION_NOT_CONFIGURED",
  }, { status: 503 });
}
