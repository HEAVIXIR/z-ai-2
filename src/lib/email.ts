import { randomBytes } from "node:crypto";

/* HEAVIX email utility — SMTP or Gmail API OAuth2 delivery.
   SMTP is preferred. Gmail API OAuth2 is the no-DNS alternative.
   No OTP is ever written to logs or API responses. */

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Sensitive messages must never be echoed in diagnostics. */
  sensitive?: boolean;
}

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "HEAVIX <no-reply@havix.local>";

const GMAIL_CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID ?? "";
const GMAIL_CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET ?? "";
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_OAUTH_REFRESH_TOKEN ?? "";
const GMAIL_SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL ?? "";

export const isSmtpConfigured = (): boolean =>
  Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

export const isGmailOAuthConfigured = (): boolean =>
  Boolean(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_SENDER_EMAIL);

export const isEmailDeliveryConfigured = (): boolean =>
  isSmtpConfigured() || isGmailOAuthConfigured();

function assertSafeHeader(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error("Invalid " + label + " header");
  }
}

function base64Mime(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendWithSmtp(args: SendEmailArgs): Promise<void> {
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
  } catch {
    console.error("[HEAVIX EMAIL] SMTP delivery failed");
    throw new Error("Email delivery failed");
  }
}

async function sendWithGmailApi(args: SendEmailArgs): Promise<void> {
  assertSafeHeader(args.to, "To");
  assertSafeHeader(args.subject, "Subject");
  assertSafeHeader(GMAIL_SENDER_EMAIL, "From");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    console.error("[HEAVIX EMAIL] Gmail OAuth token refresh failed");
    throw new Error("Email delivery is unavailable");
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new Error("Email delivery is unavailable");

  const boundary = "heavix_" + randomBytes(16).toString("hex");
  const html = args.html ?? "<pre>" + escapeHtml(args.text) + "</pre>";
  const encodedSubject = "=?UTF-8?B?" + Buffer.from(args.subject, "utf8").toString("base64") + "?=";
  const mime = [
    "From: HEAVIX <" + GMAIL_SENDER_EMAIL + ">",
    "To: " + args.to,
    "Subject: " + encodedSubject,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    "",
    "--" + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(args.text),
    "--" + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(html),
    "--" + boundary + "--",
    "",
  ].join("\r\n");

  const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + tokenData.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }),
    cache: "no-store",
  });

  if (!sendResponse.ok) {
    console.error("[HEAVIX EMAIL] Gmail API delivery failed");
    throw new Error("Email delivery failed");
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (isSmtpConfigured()) {
    await sendWithSmtp(args);
    return;
  }
  if (isGmailOAuthConfigured()) {
    await sendWithGmailApi(args);
    return;
  }
  throw new Error("Email delivery is not configured");
}

/** Sends without exposing delivery errors or sensitive message content to callers. */
export async function sendEmailWithResult(args: SendEmailArgs): Promise<boolean> {
  try {
    await sendEmail(args);
    return true;
  } catch {
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "بازیابی رمز عبور — HEAVIX",
    text: [
      "درخواست بازنشانی رمز عبور حساب HEAVIX ثبت شد.",
      "",
      "کد یک‌بارمصرف شما: " + code,
      "این کد تا ۱۰ دقیقه معتبر است.",
      "اگر این درخواست از طرف شما نبوده، این پیام را نادیده بگیرید.",
    ].join("\n"),
    html:
      '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">' +
      '<h2 style="color:#F58220">بازیابی رمز عبور HEAVIX</h2>' +
      '<p>کد یک‌بارمصرف شما:</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;background:#fafafa;padding:16px;border-radius:8px">' +
      escapeHtml(code) +
      '</p><p style="font-size:12px;color:#888">این کد تا ۱۰ دقیقه معتبر است.</p></div>',
    sensitive: true,
  });
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "کد تأیید ایمیل — HEAVIX",
    text: [
      "با سلام،",
      "",
      "کد تأیید ایمیل شما در هویکس: " + code,
      "",
      "این کد تا ۱۰ دقیقه معتبر است.",
      "اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.",
      "",
      "— تیم هویکس",
    ].join("\n"),
    html:
      '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">' +
      '<h2 style="color:#F58220;margin:0 0 16px">HEAVIX — تأیید ایمیل</h2>' +
      '<p style="font-size:14px;color:#333">با سلام،</p>' +
      '<p style="font-size:14px;color:#333">کد تأیید ایمیل شما:</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0b0b0b;text-align:center;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:16px;margin:16px 0">' +
      code +
      '</p><p style="font-size:12px;color:#888">این کد تا ۱۰ دقیقه معتبر است.</p>' +
      '<hr style="border:none;border-top:1px solid #eee;margin:20px 0" />' +
      '<p style="font-size:11px;color:#aaa">اگر شما این درخواست را ارسال نکرده‌اید، این پیام را نادیده بگیرید.</p></div>',
  });
}


export async function sendEmailChangeVerification(email: string, code: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "تأیید ایمیل جدید حساب HEAVIX",
    text: [
      "درخواست تغییر ایمیل حساب HEAVIX ثبت شده است.",
      "",
      "کد تأیید شش‌رقمی: " + code,
      "این کد تا ۱۰ دقیقه معتبر است و فقط یک‌بار استفاده می‌شود.",
      "تا زمان تأیید کد، ایمیل قبلی حساب شما حفظ می‌شود.",
      "اگر این درخواست از طرف شما نبوده، این پیام را نادیده بگیرید.",
    ].join("\n"),
    html:
      '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">' +
      '<h2 style="color:#F58220">تأیید ایمیل جدید HEAVIX</h2>' +
      '<p>کد تأیید شش‌رقمی:</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;background:#fafafa;padding:16px;border-radius:8px">' +
      escapeHtml(code) +
      '</p><p style="font-size:12px;color:#888">اعتبار کد: ۱۰ دقیقه</p><p style="font-size:12px;color:#888">ایمیل قبلی تا تأیید این کد حفظ می‌شود.</p></div>',
    sensitive: true,
  });
}
