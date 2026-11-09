import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get: () => new Proxy({}, {
      get: () => vi.fn().mockResolvedValue([]),
    }),
  }),
}));

const original = {
  nodeEnv: process.env.NODE_ENV,
  heavixEnv: process.env.HEAVIX_ENV,
  vercelEnv: process.env.VERCEL_ENV,
};

describe("legacy SEO producers on Preview", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.HEAVIX_ENV = "preview";
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.heavixEnv === undefined) delete process.env.HEAVIX_ENV;
    else process.env.HEAVIX_ENV = original.heavixEnv;
    if (original.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original.vercelEnv;
  });

  it("omits the sitemap directive from the legacy robots endpoint", async () => {
    const { getRobotsTxt } = await import("@/lib/seo-service");
    const robots = getRobotsTxt();
    expect(robots).toContain("User-agent: *");
    expect(robots).not.toContain("Sitemap:");
  });

  it("returns an empty legacy sitemap on Preview", async () => {
    const { generateSitemap } = await import("@/lib/seo-service");
    const sitemap = await generateSitemap();
    expect(sitemap).toContain("<urlset");
    expect(sitemap).not.toContain("<url>");
    expect(sitemap).not.toContain("https://heavix.ir/");
  });
});
