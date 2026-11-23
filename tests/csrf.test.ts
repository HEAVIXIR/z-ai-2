import { afterEach, describe, expect, it } from "vitest";
import { checkCsrf } from "../src/lib/csrf";

const envKeys = [
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
  "HEAVIX_ENV",
  "HEAVIX_PREVIEW_URL",
  "HEAVIX_PREVIEW_ORIGIN",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("checkCsrf", () => {
  it("allows same-origin POSTs on a configured Vercel alias when NEXTAUTH_URL is canonical", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: { origin: "https://heavix-app.vercel.app" },
    });

    expect(checkCsrf(req)).toBe(true);
  });

  it("allows the exact configured Cloudflare branch Preview origin", () => {
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    process.env.HEAVIX_PREVIEW_ORIGIN =
      "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev";

    const origin =
      "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev";
    const req = new Request(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        origin,
        referer: `${origin}/login`,
      },
    });

    expect(checkCsrf(req)).toBe(true);
  });

  it("rejects the old generic workers.dev hostname when the branch Preview origin is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    process.env.HEAVIX_PREVIEW_ORIGIN =
      "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev";

    const req = new Request(
      "https://heavix-preview.heavixir.workers.dev/api/auth/login",
      {
        method: "POST",
        headers: {
          origin: "https://heavix-preview.heavixir.workers.dev",
          referer: "https://heavix-preview.heavixir.workers.dev/login",
        },
      },
    );

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects an arbitrary workers.dev origin even in Preview", () => {
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    process.env.HEAVIX_PREVIEW_ORIGIN =
      "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev";

    const req = new Request("https://attacker.heavixir.workers.dev/api/auth/login", {
      method: "POST",
      headers: { origin: "https://attacker.heavixir.workers.dev" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects a cross-origin POST", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("does not trust an attacker-controlled request URL as an allowed origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://attacker.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects mutation requests with no Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects requests when either supplied Origin or Referer is cross-origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://heavix-app.vercel.app",
        referer: "https://attacker.example/form",
      },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("does not treat unverified authentication headers as a CSRF bypass", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";

    for (const header of ["authorization", "x-cron-key", "x-webhook-signature", "x-api-key"]) {
      const req = new Request("https://heavix.example.com/api/mutation", {
        method: "POST",
        headers: { [header]: "arbitrary-value" },
      });
      expect(checkCsrf(req)).toBe(false);
    }
  });

  it("allows safe methods without Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "GET",
    });

    expect(checkCsrf(req)).toBe(true);
  });
});
