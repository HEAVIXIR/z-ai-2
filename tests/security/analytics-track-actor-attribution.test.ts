import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserId, trackEvent } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUserId }));
vi.mock("@/lib/analytics", () => ({
  trackEvent,
  ANALYTICS_EVENT_TYPES: ["LISTING_VIEW", "SEARCH"],
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  retryAfterSeconds: () => 60,
}));
vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: (ip: string, scope: string) => `${ip}:${scope}`,
}));

const { POST } = await import("@/app/api/analytics/track/route");

function request(body: unknown) {
  return new Request("http://localhost/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analytics/track actor attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a forged body userId and attributes the event to the authenticated session", async () => {
    getCurrentUserId.mockResolvedValue("session-user-42");

    const response = await POST(request({
      eventType: "LISTING_VIEW",
      userId: "victim-user-99",
      listingId: "listing-1",
    }));

    expect(response.status).toBe(204);
    expect(getCurrentUserId).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "LISTING_VIEW",
      userId: "session-user-42",
      listingId: "listing-1",
    }));
    expect(trackEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      userId: "victim-user-99",
    }));
  });

  it("stores anonymous events with a null actor even if the body supplies userId", async () => {
    getCurrentUserId.mockResolvedValue(null);

    const response = await POST(request({
      eventType: "SEARCH",
      userId: "forged-user",
      query: "excavator",
    }));

    expect(response.status).toBe(204);
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "SEARCH",
      userId: null,
    }));
  });
});
