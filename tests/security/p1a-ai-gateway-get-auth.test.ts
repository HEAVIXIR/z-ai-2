import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.34 — P1-A Security Fix: GET /api/ai-gateway auth
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - GET /api/ai-gateway had NO auth check.
   - Anonymous could read last 50 AIGatewayLog entries (userId,
     taskType, model, cost, input/output snippets) + AI budget.

   Fix (AFTER):
   - GET requires getCurrentUser() + isAdmin() (RBAC ADMIN role).
   - Anonymous → 401; non-admin → 403; admin → 200.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    aIGatewayLog: {
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/lib/ai-policy", () => ({
  getAIBudget: vi.fn(async () => ({
    dailySpendUsd: 0,
    monthlySpendUsd: 0,
    dailyLimitUsd: 100,
    monthlyLimitUsd: 3000,
    dailyResetAt: null,
    monthlyResetAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  preflightAIRequest: vi.fn(),
  recordAICost: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  retryAfterSeconds: vi.fn(() => 0),
}));
vi.mock("@/lib/rate-limit-presets", () => ({ AI: { label: "ai", limit: 60, windowMs: 60000 } }));
vi.mock("@/lib/request-context", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  rateLimitKey: vi.fn(() => "key"),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: { create: vi.fn(async () => ({ chat: { completions: { create: vi.fn() } } })) },
}));

const { GET } = await import("@/app/api/ai-gateway/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
});

function makeReq(url: string): Request {
  return new Request(url);
}

describe("P1-A: GET /api/ai-gateway — admin gate", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await GET(makeReq("http://localhost/api/ai-gateway"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: BUYER (non-admin) → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockIsAdminResult = false;
    const res = await GET(makeReq("http://localhost/api/ai-gateway"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it("NEGATIVE: SELLER (non-admin) → 403", async () => {
    mockCurrentUser = { id: "seller-1" };
    mockIsAdminResult = false;
    const res = await GET(makeReq("http://localhost/api/ai-gateway"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: ADMIN → passes auth gate (not 401/403)", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    const res = await GET(makeReq("http://localhost/api/ai-gateway"));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("POSITIVE: ADMIN with ?task=SEARCH filter → passes auth gate", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    const res = await GET(makeReq("http://localhost/api/ai-gateway?task=SEARCH"));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
