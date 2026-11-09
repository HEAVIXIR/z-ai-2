import { afterEach, describe, expect, it } from "vitest";
import { checkCsrf } from "../src/lib/csrf";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("checkCsrf", () => {
  it("allows same-origin POSTs on the explicitly configured Cloudflare Preview origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";
    process.env.HEAVIX_PREVIEW_URL = "https://heavix-preview.heavixir.workers.dev";

    const req = new Request("https://heavix-preview.heavixir.workers.dev/api/auth/register", {
      method: "POST",
      headers: { origin: "https://heavix-preview.heavixir.workers.dev" },
    });

    expect(checkCsrf(req)).toBe(true);
  });

  it("allows same-origin POSTs on the explicitly configured canonical origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";
    delete process.env.HEAVIX_PREVIEW_URL;

    const req = new Request("https://heavix.ir/api/auth/register", {
      method: "POST",
      headers: { origin: "https://heavix.ir" },
    });

    expect(checkCsrf(req)).toBe(true);
  });

  it("rejects a cross-origin POST", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";
    process.env.HEAVIX_PREVIEW_URL = "https://heavix-preview.heavixir.workers.dev";

    const req = new Request("https://heavix-preview.heavixir.workers.dev/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("does not trust an attacker-controlled request URL as an allowed origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";
    delete process.env.HEAVIX_PREVIEW_URL;

    const req = new Request("https://attacker.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects mutation requests with no Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";

    const req = new Request("https://heavix.ir/api/auth/register", {
      method: "POST",
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects requests when either supplied Origin or Referer is cross-origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";

    const req = new Request("https://heavix.ir/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://heavix.ir",
        referer: "https://attacker.example/form",
      },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("allows safe methods without Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.ir";

    const req = new Request("https://heavix.ir/api/auth/register", {
      method: "GET",
    });

    expect(checkCsrf(req)).toBe(true);
  });
});
