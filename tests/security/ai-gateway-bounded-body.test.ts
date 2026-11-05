import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  recordCost: vi.fn(),
  createProvider: vi.fn(),
  logAudit: vi.fn(),
  createGatewayLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "bounded-body-test-user" })),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, resetAt: new Date(Date.now() + 60_000) })),
  retryAfterSeconds: vi.fn(() => 60),
}));
vi.mock("@/lib/rate-limit-presets", () => ({
  AI: { label: "ai-test", limit: 10, windowMs: 60_000 },
}));
vi.mock("@/lib/request-context", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  rateLimitKey: vi.fn(() => "bounded-body-test"),
}));
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: mocks.preflight,
  recordAICost: mocks.recordCost,
  getAIBudget: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { aIGatewayLog: { create: mocks.createGatewayLog } },
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: { create: mocks.createProvider },
}));

import { POST } from "@/app/api/ai-gateway/route";

describe("AI Gateway bounded request body route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 413 before policy, provider, cost, audit, or DB work for oversized Content-Length", async () => {
    const request = new NextRequest("http://localhost/api/ai-gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "65537",
      },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "request body too large",
    });
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.recordCost).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.createGatewayLog).not.toHaveBeenCalled();
  });
});
