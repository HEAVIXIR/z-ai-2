import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get: () => new Proxy({}, {
      get: () => vi.fn().mockResolvedValue([]),
    }),
  }),
}));

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  heavixEnv: process.env.HEAVIX_ENV,
  previewUrl: process.env.HEAVIX_PREVIEW_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

afterEach(() => {
  for (const [key, value] of [
    ["NODE_ENV", originalEnv.nodeEnv],
    ["HEAVIX_ENV", originalEnv.heavixEnv],
    ["HEAVIX_PREVIEW_URL", originalEnv.previewUrl],
    ["NEXT_PUBLIC_SITE_URL", originalEnv.siteUrl],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("official sitemap runtime policy", () => {
  it("is generated at request time rather than prerendered during build", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.HEAVIX_ENV;
    vi.resetModules();

    const sitemap = await import("@/app/sitemap");
    expect(sitemap.dynamic).toBe("force-dynamic");
    expect(sitemap.revalidate).toBe(0);
  });

  it("returns no production sitemap URLs in Cloudflare Preview", async () => {
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    process.env.HEAVIX_PREVIEW_URL = "https://heavix-preview.heavixir.workers.dev";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();

    const sitemap = await import("@/app/sitemap");
    const entries = await sitemap.default();

    expect(entries).toEqual([]);
    expect(JSON.stringify(entries)).not.toContain("https://heavix.ir");
  });
});
