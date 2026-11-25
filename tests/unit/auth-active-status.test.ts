import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  findUnique: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    delete: mocks.cookieDelete,
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findUnique: mocks.findUnique,
      delete: mocks.deleteSession,
    },
  },
}));

const { getCurrentUser } = await import("@/lib/auth");

function sessionWithStatus(status: string) {
  return {
    id: "session-1",
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "user-1", status },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieGet.mockReturnValue({ value: "opaque-session-token" });
  mocks.findUnique.mockResolvedValue(sessionWithStatus("ACTIVE"));
  mocks.deleteSession.mockResolvedValue({});
});

describe("canonical session active-account boundary", () => {
  it("returns the user only when account status is ACTIVE", async () => {
    const user = await getCurrentUser();

    expect(user).toMatchObject({ id: "user-1", status: "ACTIVE" });
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "BLOCKED", "SUSPENDED", "UNKNOWN"])(
    "rejects and revokes a session for %s accounts",
    async (status) => {
      mocks.findUnique.mockResolvedValue(sessionWithStatus(status));

      const user = await getCurrentUser();

      expect(user).toBeNull();
      expect(mocks.deleteSession).toHaveBeenCalledWith({
        where: { id: "session-1" },
      });
    },
  );

  it("does not query the database without a session cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
