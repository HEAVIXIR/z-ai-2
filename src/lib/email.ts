/* ============================================================
   HEAVIX email utility — production-ready signature, sandbox-safe.
   ============================================================ */

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM =
  process.env.SMTP_FROM ?? "HEAVIX <no-reply@havix.local>";

export const isSmtpConfigured = (): boolean =>
  Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

/** Low-level send. Falls back to console logging when SMTP is not set. */
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (!isSmtpConfigured()) {
    console.log(
      [
        "────────────── [HEAVIX EMAIL — DEV FALLBACK] ──────────────",
        `To:      ${args.to}`,
        `From:    ${SMTP_FROM}`,
        `Subject: ${args.subject}`,
        "Body:",
        args.text,
        "───────────────────────────────────────────────────────────",
      ].join("\\n"),
    );
    return;
  }

  try {
    const mod = (await import("nodemailer")) as typeof import("nodemailer");
    const transporter = mod.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_FROM,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html ?? args.text,
    });
  } catch (err) {
    console.error("[HEAVIX EMAIL] send failed:", err);
    throw err;
  }
}

export async function sendVerificationEmail(
  email: string,
  code: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "کد تأیید ایمیل — HEAVIX",
    text: [
      "با سلام،",
      "",
      `کد تأیید ایمیل شما در هویکس: ${code}`,
      "",
      "این کد تا ۱۰ دقیقه معتبر است.",
      "اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.",
      "",
      "— تیم هویکس",
    ].join("\\n"),
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px"><h2 style="color:#F58220">HEAVIX — تأیید ایمیل</h2><p>کد تأیید ایمیل شما:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;background:#fafafa;padding:16px">${code}</p><p style="font-size:12px;color:#888">این کد تا ۱۰ دقیقه معتبر است.</p><p style="font-size:11px;color:#aaa">اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.</p></div>`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  code: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "بازیابی رمز عبور — HEAVIX",
    text: [
      "درخواست بازیابی رمز عبور حساب HEAVIX دریافت شد.",
      "",
      `کد بازیابی شما: ${code}`,
      "این کد فقط ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.",
      "اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.",
      "",
      "— تیم هویکس",
    ].join("\\n"),
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px"><h2 style="color:#F58220">HEAVIX — بازیابی رمز عبور</h2><p>کد بازیابی رمز عبور شما:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;background:#fafafa;padding:16px">${code}</p><p style="font-size:12px;color:#888">این کد فقط ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</p><p style="font-size:11px;color:#aaa">اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.</p></div>`,
  });
}
