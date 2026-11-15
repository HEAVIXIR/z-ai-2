import { describe, expect, it } from "vitest";
import { hashSessionToken } from "@/lib/session-token";

describe("session token at-rest protection", () => {
  it("returns a stable 256-bit lowercase hex digest", () => {
    const first = hashSessionToken("sample-session-token");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken("sample-session-token")).toBe(first);
  });

  it("produces distinct digests for distinct bearer tokens", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});
