import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const original = {
  nodeEnv: process.env.NODE_ENV,
  heavixEnv: process.env.HEAVIX_ENV,
  previewUrl: process.env.HEAVIX_PREVIEW_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

describe("Cloudflare Preview canonical origin", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    delete process.env.HEAVIX_PREVIEW_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.heavixEnv === undefined) delete process.env.HEAVIX_ENV;
    else process.env.HEAVIX_ENV = original.heavixEnv;
    if (original.previewUrl === undefined) delete process.env.HEAVIX_PREVIEW_URL;
    else process.env.HEAVIX_PREVIEW_URL = original.previewUrl;
    if (original.siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original.siteUrl;
    vi.resetModules();
  });

  it("prefers the explicit Cloudflare Preview origin over a production site URL", async () => {
    process.env.HEAVIX_PREVIEW_URL = "https://heavix-preview.heavixir.workers.dev/";
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix.ir";
    const { SITE_BASE_URL, absoluteUrl } = await import("@/lib/site-config");
    expect(SITE_BASE_URL).toBe("https://heavix-preview.heavixir.workers.dev");
    expect(absoluteUrl("/listings")).toBe("https://heavix-preview.heavixir.workers.dev/listings");
  });

  it("accepts a safe non-production HTTPS NEXT_PUBLIC_SITE_URL when Preview URL is absent", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix-preview.heavixir.workers.dev";
    const { SITE_BASE_URL } = await import("@/lib/site-config");
    expect(SITE_BASE_URL).toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("fails closed rather than using the production canonical domain", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix.ir";
    await expect(import("@/lib/site-config")).rejects.toThrow(
      /Cloudflare Preview requires a non-production HTTPS/,
    );
  });

  it("rejects insecure HTTP Preview origins", async () => {
    process.env.HEAVIX_PREVIEW_URL = "http://heavix-preview.heavixir.workers.dev";
    await expect(import("@/lib/site-config")).rejects.toThrow(
      /Cloudflare Preview requires a non-production HTTPS/,
    );
  });

  it("does not recognize Vercel hostnames as HEAVIX Preview infrastructure", async () => {
    process.env.HEAVIX_ENV = "production";
    const { isPreviewDeployment } = await import("@/lib/site-config");
    expect(isPreviewDeployment("heavix-pr-123.vercel.app")).toBe(false);
    expect(isPreviewDeployment("heavix-preview.heavixir.workers.dev")).toBe(true);
  });
});
