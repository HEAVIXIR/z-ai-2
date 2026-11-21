import { describe, expect, it } from "vitest";
import {
  checkPublicApiRateLimit,
  getPublicApiClientIdentity,
} from "@/lib/public-api-rate-limit";

describe("public API rate limiting", () => {
  it("uses Cloudflare's connecting IP and ignores client-supplied forwarding headers", () => {
    const req = new Request("https://heavix.ir/api/test", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.99, 203.0.113.10",
        "x-real-ip": "192.0.2.10",
      },
    });
    expect(getPublicApiClientIdentity(req)).toBe("203.0.113.10");
  });

  it("does not trust X-Real-IP or X-Forwarded-For without Cloudflare identity", () => {
    const req = new Request("https://heavix.ir/api/test", {
      headers: {
        "x-forwarded-for": "198.51.100.99",
        "x-real-ip": "192.0.2.10",
      },
    });
    expect(getPublicApiClientIdentity(req)).toBe("unknown");
  });

  it("uses a shared unknown bucket when no trusted proxy identity is present", () => {
    const req = new Request("https://heavix.ir/api/test", {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });
    expect(getPublicApiClientIdentity(req)).toBe("unknown");
  });

  it("rejects invalid Cloudflare identity instead of creating attacker-controlled buckets", () => {
    const req = new Request("https://heavix.ir/api/test", {
      headers: {
        "cf-connecting-ip": "attacker-controlled-value",
        "x-real-ip": "192.0.2.10",
        "x-forwarded-for": "198.51.100.99",
      },
    });
    expect(getPublicApiClientIdentity(req)).toBe("unknown");
  });

  it("rejects requests after the configured per-runtime limit", () => {
    const req = new Request("https://heavix.ir/api/test", {
      headers: { "cf-connecting-ip": "198.51.100.77" },
    });
    expect(checkPublicApiRateLimit(req, "unit-test-seller-public", 1, 60_000).ok).toBe(true);
    expect(checkPublicApiRateLimit(req, "unit-test-seller-public", 1, 60_000).ok).toBe(false);
  });
});
