import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCsrf } from "@/lib/csrf";

const PREVIEW_ORIGIN = "https://heavix-preview.heavixir.workers.dev";

afterEach(() => {
  vi.unstubAllEnvs();
});

function post(headers: HeadersInit = {}) {
  return new Request(`${PREVIEW_ORIGIN}/api/auth/register`, {
    method: "POST",
    headers,
  });
}

describe("Cloudflare Preview CSRF origin allowlist", () => {
  it("allows the exact active Preview origin only when HEAVIX_ENV=preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HEAVIX_ENV", "preview");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("HEAVIX_PREVIEW_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    expect(checkCsrf(post({ origin: PREVIEW_ORIGIN }))).toBe(true);
    expect(checkCsrf(post({ origin: "https://attacker.workers.dev" }))).toBe(false);
    expect(
      checkCsrf(post({
        origin: "https://recovery-heavix-full-product-integration-2026-11-heavix-preview.heavixir.workers.dev",
      })),
    ).toBe(false);
  });

  it("does not allow the Preview origin in a non-Preview deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HEAVIX_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("HEAVIX_PREVIEW_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    expect(checkCsrf(post({ origin: PREVIEW_ORIGIN }))).toBe(false);
  });

  it("requires Origin and Referer to agree with the configured allowlist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HEAVIX_ENV", "preview");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("HEAVIX_PREVIEW_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    expect(
      checkCsrf(post({
        origin: PREVIEW_ORIGIN,
        referer: `${PREVIEW_ORIGIN}/register`,
      })),
    ).toBe(true);
    expect(
      checkCsrf(post({
        origin: PREVIEW_ORIGIN,
        referer: "https://attacker.example/register",
      })),
    ).toBe(false);
  });

  it("continues to allow safe methods without browser origin headers", () => {
    expect(
      checkCsrf(new Request(`${PREVIEW_ORIGIN}/api/auth/register`, { method: "GET" })),
    ).toBe(true);
  });
});
