import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavior-level tests for the two production login entry points.
 *
 * The route/action are invoked directly with a hermetic mocked Prisma boundary.
 * Password crypto itself is covered by tests/unit/password.test.ts; these tests
 * prove that the handlers enforce the verification result, ACTIVE + verified
 * account gate, compare-and-swap write, and session-creation boundary.
 */

let mockDb: any;
const mockCreateUserSession = vi.fn();
const mockHashPassword = vi.fn();
const mockIsLegacyBcryptHash = vi.fn();
const mockVerifyPassword = vi.fn();
const mockLogAudit = vi.fn();
const mockRateLimit = vi.fn();
const mockTrackError = vi.fn();
const mockIsAdmin = vi.fn();

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/auth", () => ({
  createUserSession: (...args: unknown[]) => mockCreateUserSession(...args),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  isLegacyBcryptHash: (...args: unknown[]) => mockIsLegacyBcryptHash(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  retryAfterSeconds: () => 60,
}));

vi.mock("@/lib/rate-limit-presets", () => ({
  LOGIN: { label: "login", limit: 10, windowMs: 60_000 },
}));

vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: () => "login:test",
}));

vi.mock("@/lib/error-tracking", () => ({
  trackError: (...args: unknown[]) => mockTrackError(...args),
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => true,
}));

vi.mock("@/lib/authorization", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
}));

const { POST } = await import("@/app/api/auth/login/route");
const { loginAction } = await import("@/app/login/actions");

const activeUser = () => ({
  id: "user-preview-test",
  passwordHash: "pbkdf2$sha256$600000$test-salt$test-derived-key",
  status: "ACTIVE",
  emailVerified: true,
  email: "buyer@example.test",
  role: "BUYER",
  firstName: "Preview",
  lastName: "Buyer",
  mobile: "+989120000000",
  userType: "INDIVIDUAL",
  mobileVerified: false,
  userRoles: [{ role: { key: "BUYER" } }],
});

function loginRequest() {
  return new Request("https://heavix.test/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://heavix.test",
      referer: "https://heavix.test/login",
    },
    body: JSON.stringify({
      email: "buyer@example.test",
      password: "Correct#Password123",
    }),
  });
}

async function expectActionRedirect(action: Promise<void>, destination: string) {
  await expect(action).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();

  mockDb = {
    user: {
      findFirst: vi.fn().mockResolvedValue(activeUser()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    userRole: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(mockDb)),
  };

  mockCreateUserSession.mockResolvedValue(undefined);
  mockHashPassword.mockResolvedValue("pbkdf2$sha256$600000$new-salt$new-derived-key");
  mockIsLegacyBcryptHash.mockReturnValue(false);
  mockVerifyPassword.mockResolvedValue(true);
  mockLogAudit.mockResolvedValue(undefined);
  mockRateLimit.mockReturnValue({ ok: true, resetAt: Date.now() + 60_000 });
  mockTrackError.mockReturnValue(undefined);
  mockIsAdmin.mockResolvedValue(false);
});

describe("POST /api/auth/login behavior", () => {
  it("creates a session only after a valid PBKDF2 password and successful CAS", async () => {
    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(mockVerifyPassword).toHaveBeenCalledWith(
      "Correct#Password123",
      activeUser().passwordHash,
      { allowLegacyBcrypt: true },
    );
    expect(mockDb.user.updateMany).toHaveBeenCalledTimes(1);
    expect(mockCreateUserSession).toHaveBeenCalledWith("user-preview-test");
  });

  it("does not write last-login state or create a session for an incorrect password", async () => {
    mockVerifyPassword.mockResolvedValue(false);

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it.each([
    ["PENDING", true],
    ["ACTIVE", false],
  ])("rejects account status=%s / emailVerified=%s before CAS and session creation", async (status, emailVerified) => {
    mockDb.user.findFirst.mockResolvedValue({
      ...activeUser(),
      status,
      emailVerified,
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("fails closed when the password CAS loses a concurrent reset/suspension race", async () => {
    mockDb.user.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("does not invoke legacy bcrypt when the Cloudflare Preview flag disables it", async () => {
    vi.stubEnv("HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT", "false");
    mockIsLegacyBcryptHash.mockReturnValue(true);
    mockVerifyPassword.mockResolvedValue(false);

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    expect(mockVerifyPassword).toHaveBeenCalledWith(
      "Correct#Password123",
      activeUser().passwordHash,
      { allowLegacyBcrypt: false },
    );
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("migrates an allowed legacy bcrypt hash only in the same successful CAS write", async () => {
    vi.stubEnv("HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT", "true");
    mockIsLegacyBcryptHash.mockReturnValue(true);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect(mockVerifyPassword).toHaveBeenCalledWith(
      "Correct#Password123",
      activeUser().passwordHash,
      { allowLegacyBcrypt: true },
    );
    expect(mockHashPassword).toHaveBeenCalledWith("Correct#Password123");
    expect(mockDb.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passwordHash: "pbkdf2$sha256$600000$new-salt$new-derived-key",
      }),
    }));
    expect(mockCreateUserSession).toHaveBeenCalledWith("user-preview-test");
  });

  it("does not create a session for an unsupported or malformed stored hash", async () => {
    mockIsLegacyBcryptHash.mockReturnValue(false);
    mockVerifyPassword.mockResolvedValue(false);

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });
});

describe("loginAction server-action behavior", () => {
  function formData() {
    const data = new FormData();
    data.set("identifier", "buyer@example.test");
    data.set("password", "Correct#Password123");
    return data;
  }

  it("creates a session after valid credentials and redirects a non-admin to the dashboard", async () => {
    await expectActionRedirect(loginAction(formData()), "/dashboard");

    expect(mockDb.user.updateMany).toHaveBeenCalledTimes(1);
    expect(mockCreateUserSession).toHaveBeenCalledWith("user-preview-test");
    expect(mockIsAdmin).toHaveBeenCalledWith("user-preview-test");
  });

  it("does not create a session for an unverified account", async () => {
    mockDb.user.findFirst.mockResolvedValue({
      ...activeUser(),
      emailVerified: false,
    });

    await expectActionRedirect(loginAction(formData()), "/login?error=1");

    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("does not create a session when password verification fails", async () => {
    mockVerifyPassword.mockResolvedValue(false);

    await expectActionRedirect(loginAction(formData()), "/login?error=1");

    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("does not create a session when the server-action CAS loses a concurrent reset race", async () => {
    mockDb.user.updateMany.mockResolvedValue({ count: 0 });

    await expectActionRedirect(loginAction(formData()), "/login?error=1");

    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });
});
