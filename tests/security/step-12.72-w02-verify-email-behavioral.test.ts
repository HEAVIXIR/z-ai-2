/**
 * HEAVIX — STEP 12.72 W-02 Behavioral Test: /api/auth/verify-email
 * ====================================================================
 *
 * REAL behavioral test that INVOkES the actual POST route handler with
 * mocked db + rate-limit, and asserts real HTTP status codes.
 *
 * Tests the FULL verification contract:
 *   - valid 6-digit EMAIL code → 200
 *   - wrong code → 400
 *   - expired code → 400
 *   - already-used code → 400
 *   - non-existent user → 404
 *   - missing userId/code → 400
 *
 * This test verifies the API behavioral contract that the W-02 UI fix
 * (maxLength 5→6, devEmailCode mapping) depends on.
 *
 * Runs under `bun run test:security`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────
// The verify-email handler uses: db, rateLimit, getClientIp, rateLimitKey.
// We mock all so the test runs without real DB (the API contract is what we test).

const mockUser: any = { id: "user-1", emailVerified: false, mobileVerified: true, status: "PENDING" };
const mockCode: any = {
  id: "code-1",
  userId: "user-1",
  code: "123456",
  type: "EMAIL",
  used: false,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min in future
};

let mockUserRecord = { ...mockUser };
let mockCodeRecord: any = { ...mockCode };

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(async () => mockUserRecord),
      update: vi.fn(async () => mockUserRecord),
    },
    verificationCode: {
      findFirst: vi.fn(async (args: any) => {
        // Return the mock code record ONLY if the queried code matches the stored code
        const queriedCode = args?.where?.code;
        if (queriedCode === mockCodeRecord.code) return mockCodeRecord;
        return null;
      }),
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops.map((op) => op))),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, resetAt: new Date(Date.now() + 60000) })),
  retryAfterSeconds: () => 60,
}));
vi.mock("@/lib/rate-limit-presets", () => ({
  VERIFY: { label: "verify", limit: 10, windowMs: 3600000 },
}));
vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: (a: string, b: string) => `${a}:${b}`,
}));

// Import AFTER mocks
const verifyRoute = await import("@/app/api/auth/verify-email/route");

beforeEach(() => {
  // Reset to valid state
  mockUserRecord = { ...mockUser, emailVerified: false };
  mockCodeRecord = { ...mockCode, used: false, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
});

// F-006 fix: verify-email route now enforces fail-closed CSRF.
// We send a Bearer token so the request is classified as a
// non-browser API client and exempted from CSRF (see src/lib/csrf.ts).
// This test exercises the verification logic, not the CSRF layer.
const CSRF_BYPASS_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Bearer test-csrf-exempt",
} as const;

function makeReq(body: any): Request {
  return new Request("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: CSRF_BYPASS_HEADERS,
    body: JSON.stringify(body),
  });
}

// ════════════════════════════════════════════════════════════
// W-02 Behavioral Tests: /api/auth/verify-email
// ════════════════════════════════════════════════════════════

describe("W-02: POST /api/auth/verify-email — behavioral route test", () => {
  it("POSITIVE: valid 6-digit EMAIL code → 200", async () => {
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.activated).toBe(true); // mobileVerified=true → activated
  });

  it("NEGATIVE: wrong code → 400", async () => {
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "999999" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/نامعتبر/);
  });

  it("NEGATIVE: 5-digit code (the old UI limit) → 400 (code not found)", async () => {
    // The UI used to limit to 5 digits. A 5-digit code won't match the 6-digit EMAIL code.
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "12345" }));
    expect(res.status).toBe(400);
  });

  it("NEGATIVE: expired code → 400", async () => {
    mockCodeRecord.expiresAt = new Date(Date.now() - 1000); // expired
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "123456" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/منقضی/);
  });

  it("NEGATIVE: already-used code → 400", async () => {
    mockCodeRecord.used = true;
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "123456" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/استفاده شده/);
  });

  it("NEGATIVE: non-existent user → 404", async () => {
    const { db } = await import("@/lib/db");
    (db.user.findUnique as any).mockResolvedValueOnce(null);
    const res = await verifyRoute.POST(makeReq({ userId: "nobody", code: "123456" }));
    expect(res.status).toBe(404);
  });

  it("NEGATIVE: missing userId or code → 400", async () => {
    const res1 = await verifyRoute.POST(makeReq({ code: "123456" }));
    expect(res1.status).toBe(400);
    const res2 = await verifyRoute.POST(makeReq({ userId: "user-1" }));
    expect(res2.status).toBe(400);
  });

  it("POSITIVE: already-verified user → 200 (alreadyVerified)", async () => {
    mockUserRecord = { ...mockUser, emailVerified: true };
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyVerified).toBe(true);
  });

  it("POSITIVE: mobileVerified=false → 200 but not activated (PENDING)", async () => {
    mockUserRecord = { ...mockUser, emailVerified: false, mobileVerified: false };
    const res = await verifyRoute.POST(makeReq({ userId: "user-1", code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activated).toBe(false);
  });
});
