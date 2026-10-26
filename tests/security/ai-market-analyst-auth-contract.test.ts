import { beforeEach, describe, expect, it, vi } from "vitest";

let mockCurrentUser: { id: string } | null = null;
let mockCanExecute = false;
let mockPreflightAllowed = true;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));

vi.mock("@/lib/authorization", () => ({
  can: vi.fn(async () => mockCanExecute),
  isAdmin: vi.fn(async () => false),
  hasRole: vi.fn(async () => false),
}));

vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: vi.fn(async () =>
    mockPreflightAllowed
      ? {
          ok: true,
          policy: {
            model: "default",
            costCeilingUsd: 0.05,
            timeoutMs: 30000,
            hourlyLimit: 10,
            dailyLimit: 100,
            maxInputChars: 10000,
            allowedRoles: "ADMIN",
            active: true,
          },
          budget: {},
          actorId: mockCurrentUser?.id ?? null,
        }
      : {
          ok: false,
          statusCode: 429,
          reason: "budget/quota denied",
        },
  ),
  recordAICost: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      count: vi.fn(async () => 10),
      aggregate: vi.fn(async () => ({ _avg: { price: 5000 } })),
      findMany: vi.fn(async () => []),
    },
    buyRequest: { count: vi.fn(async () => 2) },
    brand: { findMany: vi.fn(async () => []) },
    category: { findMany: vi.fn(async () => []) },
    aIGatewayLog: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock("z-ai-web-dev-sdk", () => ({
  default: {
    create: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: "تحلیل آزمایشی بازار" } }],
          })),
        },
      },
    })),
  },
}));

import { POST } from "@/app/api/ai-market-analyst/route";
import ZAI from "z-ai-web-dev-sdk";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import { can } from "@/lib/authorization";
import { db } from "@/lib/db";

function makeRequest(body: unknown = { question: "تحلیل بازار" }): Request {
  return new Request("http://localhost/api/ai-market-analyst", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockCurrentUser = null;
  mockCanExecute = false;
  mockPreflightAllowed = true;
  vi.clearAllMocks();
});

describe("POST /api/ai-market-analyst — auth and deny-before-provider contract", () => {
  it("rejects anonymous callers before policy, database, or provider access", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(preflightAIRequest).not.toHaveBeenCalled();
    expect(ZAI.create).not.toHaveBeenCalled();
    expect(db.listing.count).not.toHaveBeenCalled();
    expect(can).not.toHaveBeenCalled();
  });

  it("rejects authenticated callers without ai.execute permission before provider access", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockCanExecute = false;

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(preflightAIRequest).not.toHaveBeenCalled();
    expect(ZAI.create).not.toHaveBeenCalled();
    expect(db.listing.count).not.toHaveBeenCalled();
  });

  it("denies policy/budget preflight before invoking the provider", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockCanExecute = true;
    mockPreflightAllowed = false;

    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
    expect(preflightAIRequest).toHaveBeenCalledWith({
      taskType: "MARKET_ANALYST",
      user: { id: "admin-1" },
      inputLength: expect.any(Number),
    });
    expect(ZAI.create).not.toHaveBeenCalled();
    expect(db.listing.count).not.toHaveBeenCalled();
  });

  it("allows a permitted caller after preflight and records cost/audit log", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockCanExecute = true;

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe("تحلیل آزمایشی بازار");
    expect(ZAI.create).toHaveBeenCalledTimes(1);
    expect(recordAICost).toHaveBeenCalledWith("MARKET_ANALYST", 0.05, "admin-1");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
  });
});
