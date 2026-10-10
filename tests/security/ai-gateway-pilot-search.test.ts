import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.41 — AI Gateway Pilot: ai-search migration test
   ------------------------------------------------------------
   Verifies that ai-search now has Gateway controls:
   - preflightAIRequest is called (policy + auth + quota + budget)
   - recordAICost is called (cost tracking)
   - AIGatewayLog is created (usage logging)
   - Output format is UNCHANGED (API compatibility)
   - Anonymous → 401 (existing auth check preserved)
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockPreflightOk = true;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: async () =>
    mockPreflightOk
      ? { ok: true, policy: { model: "default", costCeilingUsd: 0.05, timeoutMs: 30000 }, budget: {}, actorId: "user-1" }
      : { ok: false, statusCode: 429, reason: "quota exceeded" },
  recordAICost: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    aIGatewayLog: { create: vi.fn(async () => ({})) },
    demandSignal: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/search", () => ({
  searchListings: vi.fn(async () => ({ results: [], total: 0 })),
}));
vi.mock("@/lib/api-helpers", () => ({
  parseBig: vi.fn(),
  parseNumber: vi.fn(),
}));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: {
    create: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: '{"intent":"BUY","filters":{"q":"test"}}' } }],
          })),
        },
      },
    })),
  },
}));

const { POST } = await import("@/app/api/ai-search/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockPreflightOk = true;
});

function makeReq(body: any): Request {
  return new Request("http://localhost/api/ai-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("STEP 11.41: ai-search Gateway pilot — auth + preflight", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await POST(makeReq({ query: "test" }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: preflight denied (quota exceeded) → 429", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = false;
    const res = await POST(makeReq({ query: "test" }));
    expect(res.status).toBe(429);
  });

  it("POSITIVE: authenticated + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    const res = await POST(makeReq({ query: "بیل بلاک" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Verify output format is UNCHANGED (API compatibility)
    expect(body.success).toBe(true);
    expect(body.filters).toBeDefined();
    expect(body.intent).toBeDefined();
    expect(body.count).toBeDefined();
    expect(body.results).toBeDefined();
    expect(body.listings).toBeDefined();
  });
});

describe("STEP 11.41: ai-search Gateway pilot — cost + logging", () => {
  it("VERIFY: recordAICost is called on success", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    await POST(makeReq({ query: "test" }));
    const { recordAICost } = await import("@/lib/ai-policy");
    expect(recordAICost).toHaveBeenCalled();
  });

  it("VERIFY: AIGatewayLog.create is called on success", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    await POST(makeReq({ query: "test" }));
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls[0][0];
    expect(logCall.data.taskType).toBe("SEARCH");
    expect(logCall.data.success).toBe(true);
    expect(logCall.data.userId).toBe("user-1");
    expect(logCall.data.cost).toBeGreaterThan(0);
  });
});

describe("STEP 11.41: ai-search Gateway pilot — source code verification", () => {
  it("VERIFY: ai-search imports preflightAIRequest + recordAICost", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/ai-search/route.ts"),
      "utf-8",
    );
    expect(source).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(source).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
    expect(source).toMatch(/preflightAIRequest\(/);
    expect(source).toMatch(/recordAICost\(/);
    expect(source).toMatch(/aIGatewayLog\.create/);
  });
});
