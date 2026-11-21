import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GMAIL_ENV = [
  "GMAIL_OAUTH_CLIENT_ID",
  "GMAIL_OAUTH_CLIENT_SECRET",
  "GMAIL_OAUTH_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
] as const;
const SMTP_ENV = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;
const ALL_ENV = [...GMAIL_ENV, ...SMTP_ENV, "SMTP_FROM"] as const;

const originalEnv = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;

async function loadEmailModule() {
  vi.resetModules();
  return import("@/lib/email");
}

beforeEach(() => {
  originalEnv.clear();
  for (const key of ALL_ENV) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }

  process.env.GMAIL_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GMAIL_OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_OAUTH_REFRESH_TOKEN = "test-refresh-token";
  process.env.GMAIL_SENDER_EMAIL = "sender@example.test";

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const key of ALL_ENV) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

function successfulTokenResponse() {
  return new Response(JSON.stringify({ access_token: "test-access-token" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulGmailResponse() {
  return new Response(JSON.stringify({ id: "test-message-id" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HEAVIX Gmail OAuth2 email delivery", () => {
  it("recognizes Gmail OAuth2 configuration without SMTP credentials", async () => {
    const email = await loadEmailModule();

    expect(email.isSmtpConfigured()).toBe(false);
    expect(email.isGmailOAuthConfigured()).toBe(true);
    expect(email.isEmailDeliveryConfigured()).toBe(true);
  });

  it("refreshes an OAuth token and sends a MIME message through Gmail API", async () => {
    fetchMock
      .mockResolvedValueOnce(successfulTokenResponse())
      .mockResolvedValueOnce(successfulGmailResponse());

    const email = await loadEmailModule();
    await email.sendEmail({
      to: "recipient@example.test",
      subject: "HEAVIX test",
      text: "Plain-text verification body",
      html: "<p>HTML verification body</p>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(tokenInit.method).toBe("POST");
    expect(tokenInit.cache).toBe("no-store");
    const tokenBody = tokenInit.body as URLSearchParams;
    expect(tokenBody.get("client_id")).toBe("test-client-id");
    expect(tokenBody.get("client_secret")).toBe("test-client-secret");
    expect(tokenBody.get("refresh_token")).toBe("test-refresh-token");
    expect(tokenBody.get("grant_type")).toBe("refresh_token");

    const [gmailUrl, gmailInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(gmailUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(gmailInit.method).toBe("POST");
    expect(new Headers(gmailInit.headers).get("Authorization")).toBe("Bearer test-access-token");

    const payload = JSON.parse(String(gmailInit.body)) as { raw: string };
    expect(payload.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(payload.raw, "base64url").toString("utf8");
    expect(mime).toContain("To: recipient@example.test");
    expect(mime).toContain("MIME-Version: 1.0");

    // MIME transfer-encoding is base64; assert decoded part bodies rather than
    // searching for the original UTF-8 text in the encoded wire representation.
    const plainTextPart = mime.match(
      /Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--heavix_[a-f0-9]+/,
    );
    const htmlPart = mime.match(
      /Content-Type: text\/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--heavix_[a-f0-9]+--/,
    );

    expect(plainTextPart?.[1]).toBeDefined();
    expect(htmlPart?.[1]).toBeDefined();
    expect(
      Buffer.from(plainTextPart![1].replace(/\r\n/g, ""), "base64").toString("utf8"),
    ).toBe("Plain-text verification body");
    expect(
      Buffer.from(htmlPart![1].replace(/\r\n/g, ""), "base64").toString("utf8"),
    ).toBe("<p>HTML verification body</p>");
  });

  it("fails closed when Google rejects the refresh token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    const email = await loadEmailModule();
    await expect(
      email.sendEmail({
        to: "recipient@example.test",
        subject: "HEAVIX test",
        text: "Sensitive one-time code",
      }),
    ).rejects.toThrow("Email delivery is unavailable");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not report success when Gmail API rejects message delivery", async () => {
    fetchMock
      .mockResolvedValueOnce(successfulTokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 }),
      );

    const email = await loadEmailModule();
    await expect(
      email.sendEmail({
        to: "recipient@example.test",
        subject: "HEAVIX test",
        text: "Sensitive one-time code",
      }),
    ).rejects.toThrow("Email delivery failed");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects CRLF header injection before making network requests", async () => {
    const email = await loadEmailModule();

    await expect(
      email.sendEmail({
        to: "recipient@example.test\r\nBcc: attacker@example.test",
        subject: "HEAVIX test",
        text: "Body",
      }),
    ).rejects.toThrow("Invalid To header");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects delivery when neither Gmail OAuth2 nor SMTP is configured", async () => {
    for (const key of GMAIL_ENV) delete process.env[key];

    const email = await loadEmailModule();
    expect(email.isEmailDeliveryConfigured()).toBe(false);

    await expect(
      email.sendEmail({
        to: "recipient@example.test",
        subject: "HEAVIX test",
        text: "Body",
      }),
    ).rejects.toThrow("Email delivery is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false rather than masking failed delivery as success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    const email = await loadEmailModule();
    await expect(
      email.sendEmailWithResult({
        to: "recipient@example.test",
        subject: "HEAVIX test",
        text: "Sensitive one-time code",
      }),
    ).resolves.toBe(false);
  });
});
