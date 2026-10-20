import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/* ============================================================
   STEP 14.19-G — AI Gateway anonymous-contract behavioral test
   ------------------------------------------------------------
   Senior manager directive (EO /brainstorm B-02-G):
   "تست باید قرارداد فعلی endpoint را تثبیت کند و جلوی بازگشت
    برچسب‌گذاری جعلی را بگیرد."

   The PR #59 patch changed `actorType: user ? "USER" : "ADMIN"` to
   `actorType: user ? "USER" : "SYSTEM"` in two audit calls. Tracing
   the route shows the POST handler has an early guard:

       const user = await getCurrentUser();
       if (!user) return 401;     // line 57 — returns BEFORE any logAudit

   Therefore the `user ? "USER" : "SYSTEM"` expression can NEVER
   reach the "SYSTEM" branch in the current code flow. The "SYSTEM"
   value is defense-in-depth only — it documents intent in case a
   future refactor moves the 401 guard below the audit call.

   Per the owner's directive, we REJECT testing the dead "SYSTEM"
   branch directly. Instead, this test pins down the REAL contract:

     1. Anonymous (no session) POST → 401 Unauthorized
     2. logAudit is NEVER called for anonymous (the 401 guard
        returns before any audit call) — so no audit row with a
        fake "ADMIN" identity can ever be written for an anonymous
        caller.

   If someone removes the 401 guard, this test FAILS (because
   logAudit would be called, or the response would not be 401).
   If someone reverts `actorType` back to "ADMIN", this test STILL
   PASSES — because the real protection is the 401 guard, not the
   actorType value. The test correctly pins the contract.
   ============================================================ */

// ── Track every logAudit invocation ─────────────────────────────
const logAuditCalls: Array<Record<string, unknown>> = [];

// ── Mock getCurrentUser → returns null (anonymous) ─────────────
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => null,
}));

// ── Mock db with a Proxy that THROWS on any access ─────────────
// The anonymous 401 path must NOT touch Prisma. If it does, this
// mock throws and the test fails loudly (per /brainstorm directive:
// "mockهایی استفاده کند که در صورت دسترسی ناخواسته به دیتابیس
//  یا عبور از guard، تست را fail کنند").
vi.mock("@/lib/db", () => {
  const trap = (): never => {
    throw new Error(
      "P0-7 anonymous-contract test: @/lib/db was accessed on the " +
        "anonymous 401 path. The 401 guard must return before any DB call.",
    );
  };
  const handler: ProxyHandler<Record<string, never>> = {
    get: trap,
    set: trap,
    has: trap,
    getPrototypeOf: trap,
    ownKeys: trap,
    getOwnPropertyDescriptor: trap,
  };
  return { default: new Proxy({} as Record<string, never>, handler) };
});

// ── Mock logAudit — track calls but do NOT write to DB ─────────
vi.mock("@/lib/audit", () => ({
  logAudit: async (params: Record<string, unknown>) => {
    logAuditCalls.push(params);
    return { id: "test-audit-id" };
  },
}));

// ── Mock rate-limit (should NOT be reached for anonymous) ─────
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, resetAt: new Date(Date.now() + 60_000) }),
  retryAfterSeconds: () => 60,
}));

vi.mock("@/lib/rate-limit-presets", () => ({
  AI: { label: "ai-test", limit: 10, windowMs: 60_000 },
}));

vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: () => "test-rate-key",
}));

// ── Mock ai-policy (should NOT be reached for anonymous) ──────
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: async () => ({
    ok: false,
    statusCode: 401,
    reason: "authentication required (mock)",
  }),
  recordAICost: async () => {},
  getAIBudget: async () => ({}),
}));

vi.mock("@/lib/error-tracking", () => ({
  trackError: () => {},
}));

vi.mock("z-ai-web-dev-sdk", () => ({
  default: { create: async () => ({ chat: { completions: { create: async () => ({}) } } }) },
}));

// ── Import AFTER vi.mock so mocks are in effect ────────────────
import { POST } from "@/app/api/ai-gateway/route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/ai-gateway", {
    method: "POST",
    body: JSON.stringify({ task: "SEARCH", input: { query: "test" } }),
    headers: { "content-type": "application/json" },
  });
}

describe("STEP 14.19-G — AI Gateway anonymous contract (pins current behavior)", () => {
  beforeEach(() => {
    logAuditCalls.length = 0;
  });

  it("anonymous POST → 401 Unauthorized (current endpoint contract)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json().catch(() => ({}));
    expect(body).toHaveProperty("error");
  });

  it("anonymous POST → logAudit is NEVER called (401 guard returns before audit)", async () => {
    await POST(makeRequest());
    expect(logAuditCalls).toHaveLength(0);
  });

  it("anonymous POST → no audit row with fake actorType='ADMIN' is ever written", async () => {
    // This is the regression-prevention assertion: if a future refactor
    // removes the 401 guard AND reverts actorType to "ADMIN", this test
    // would catch it (because logAuditCalls would be non-empty + contain
    // an ADMIN-labeled entry). Currently both are impossible because
    // logAudit is never called for anonymous.
    await POST(makeRequest());
    const adminLogs = logAuditCalls.filter((l) => l.actorType === "ADMIN");
    expect(adminLogs).toHaveLength(0);
  });

  it("anonymous POST → db is NEVER accessed (no Prisma call on 401 path)", async () => {
    // The db mock Proxy throws on ANY access. If the 401 path touched db,
    // the test would have thrown above. This assertion makes the
    // expectation explicit and self-documenting.
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });
});
