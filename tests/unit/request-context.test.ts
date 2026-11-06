import { describe, expect, it } from "vitest";
import { getClientIp, rateLimitKey } from "@/lib/request-context";

describe("trusted client IP extraction", () => {
  it("prefers Cloudflare's connecting IP over caller-supplied forwarding headers", () => {
    const request = new Request("https://example.test", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.99, 203.0.113.10",
        "x-real-ip": "198.51.100.99",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("uses the right-most proxy-appended X-Forwarded-For hop", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.20" },
    });
    expect(getClientIp(request)).toBe("203.0.113.20");
  });

  it("falls back to trusted X-Real-IP and then the unknown sentinel", () => {
    expect(
      getClientIp(new Request("https://example.test", {
        headers: { "x-real-ip": "203.0.113.30" },
      })),
    ).toBe("203.0.113.30");
    expect(getClientIp(new Request("https://example.test"))).toBe("unknown");
  });

  it("keeps rate-limit buckets endpoint-specific", () => {
    expect(rateLimitKey("203.0.113.10", "login")).toBe("203.0.113.10:login");
  });
});
