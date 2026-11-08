import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

describe("Preview crawler Edge Middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.HEAVIX_ENV;
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix-preview.heavixir.workers.dev";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("adds noindex to public Cloudflare Preview responses", async () => {
    process.env.HEAVIX_ENV = "preview";
    const { middleware } = await import("@/middleware");
    const response = middleware(
      new NextRequest("https://heavix-preview.heavixir.workers.dev/listings"),
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });

  it("adds noindex to provider Preview hosts without an environment binding", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(
      new NextRequest("https://heavix-preview.vercel.app/categories"),
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });

  it("does not add noindex to the official production host", async () => {
    process.env.HEAVIX_ENV = "production";
    const { middleware } = await import("@/middleware");
    const response = middleware(new NextRequest("https://heavix.ir/listings"));
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("preserves admin API authorization while marking Preview responses noindex", async () => {
    process.env.HEAVIX_ENV = "preview";
    const { middleware } = await import("@/middleware");
    const response = middleware(
      new NextRequest("https://heavix-preview.heavixir.workers.dev/api/admin/users"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });
});
