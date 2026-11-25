import { NextResponse } from "next/server";
import { getCurrentUser, createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { checkCsrf } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailChangePayload = { v: 1; targetEmail: string; codeHash: string };

function decodeChallenge(value: string): EmailChangePayload | null {
  if (!value.startsWith("ACV1.")) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(5), "base64url").toString("utf8")) as Partial<EmailChangePayload>;
    if (parsed.v !== 1 || typeof parsed.targetEmail !== "string" || typeof parsed.codeHash !== "string") return null;
    if (parsed.targetEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.targetEmail)) return null;
    if (!parsed.codeHash.startsWith("$2")) return null;
    return parsed as EmailChangePayload;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد حساب شوید." }, { status: 401 });

  const rl = rateLimit({
    key: rateLimitKey(getClientIp(req), `ACCOUNT_EMAIL_VERIFY:${user.id}`),
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "تعداد تلاش‌ها بیش از حد مجاز است." }, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) },
    });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "کد باید شش‌رقمی باشد." }, { status: 400 });

  try {
    const record = await db.verificationCode.findFirst({
      where: { userId: user.id, type: "EMAIL_CHANGE", used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true },
    });
    if (!record) return NextResponse.json({ error: "کد معتبر یا قابل استفاده نیست." }, { status: 400 });

    const payload = decodeChallenge(record.code);
    if (!payload || !(await verifyPassword(code, payload.codeHash))) {
      return NextResponse.json({ error: "کد معتبر یا قابل استفاده نیست." }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      const consumed = await tx.verificationCode.updateMany({
        where: { id: record.id, userId: user.id, type: "EMAIL_CHANGE", used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      if (consumed.count !== 1) throw new Error("EMAIL_CHANGE_CODE_CONSUMED");

      const duplicate = await tx.user.findFirst({
        where: { email: payload.targetEmail, id: { not: user.id } },
        select: { id: true },
      });
      if (duplicate) throw new Error("EMAIL_ALREADY_REGISTERED");

      await tx.user.update({
        where: { id: user.id },
        data: { email: payload.targetEmail, emailVerified: true },
      });
      await tx.verificationCode.updateMany({
        where: { userId: user.id, type: { in: ["EMAIL_CHANGE", "PASSWORD_RESET"] }, used: false },
        data: { used: true },
      });
      // Rotate all sessions after changing the account's primary identifier.
      await tx.session.deleteMany({ where: { userId: user.id } });
    });

    await createUserSession(user.id);
    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "account.email_changed",
      entityType: "User",
      entityId: user.id,
      after: { emailVerified: true, sessionsRevoked: true, currentSessionRotated: true },
    });
    return NextResponse.json({ ok: true, message: "ایمیل جدید تأیید و جایگزین شد. نشست‌های قبلی بسته شدند." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "EMAIL_ALREADY_REGISTERED" || (typeof error === "object" && error !== null && "code" in error && (error as {code?:string}).code === "P2002")) {
      return NextResponse.json({ error: "این ایمیل قبلاً ثبت شده است؛ ایمیل فعلی شما حفظ شد." }, { status: 409 });
    }
    if (message === "EMAIL_CHANGE_CODE_CONSUMED") {
      return NextResponse.json({ error: "این کد قبلاً استفاده شده یا منقضی شده است." }, { status: 409 });
    }
    return NextResponse.json({ error: "تأیید ایمیل جدید انجام نشد." }, { status: 500 });
  }
}
