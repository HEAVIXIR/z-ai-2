import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* ============================================================
   STEP 13.00 — Canonical Domain Hotfix
   Output-domain tests for sitemap & robots (BOTH producers)
   ------------------------------------------------------------
   The codebase has TWO parallel producers of sitemap/robots output:

     1. Official Next.js metadata routes:
        - src/app/sitemap.ts   (default export, async)
        - src/app/robots.ts    (default export, sync)

     2. Legacy service-layer helpers (Wave 3B, used by /api/sitemap
        and /api/robots-txt):
        - src/lib/seo-service.ts → generateSitemap() (async)
        - src/lib/seo-service.ts → getRobotsTxt()    (sync)

   Per owner directive (STEP 13.00 acceptance criteria), BOTH
   producers must be covered by tests so they cannot drift apart
   and so neither silently reverts to the legacy "havix.ir" domain.

   The DB-dependent functions (sitemap.ts default export and
   seo-service.generateSitemap) are tested by mocking @/lib/db to
   return empty result sets — the functions are fail-open by design
   (each query has a .catch(() => [])), so with empty DB results
   they emit only the static path entries. This lets us assert the
   domain of every emitted URL without a live PostgreSQL.
   ============================================================ */

// Mock the db module so neither producer touches a real database.
// Each model's findMany resolves to [] (empty array). The producers
// are fail-open (.catch(() => [])) so this is their safe fallback.
vi.mock("@/lib/db", () => {
  const noRows = () => Promise.resolve([]);
  return {
    db: new Proxy(
      {},
      {
        get: () =>
          new Proxy(
            {},
            {
              get: (_t, prop) => {
                if (prop === "findMany") return noRows;
                // Any other method → resolves to null/empty safely.
                return () => Promise.resolve(null);
              },
            },
          ),
      },
    ),
  };
});

describe("robots.ts (official Next.js metadata route)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("emits host = https://heavix.ir (not the legacy havix.ir)", async () => {
    const mod = await import("@/app/robots");
    const result = mod.default();
    expect(result.host).toBe("https://heavix.ir");
    expect(result.host).not.toBe("https://havix.ir");
  });

  it("emits sitemap URL pointing to the canonical domain", async () => {
    const mod = await import("@/app/robots");
    const result = mod.default();
    expect(result.sitemap).toBe("https://heavix.ir/sitemap.xml");
  });

  it("preserves the disallow list for private routes", async () => {
    const mod = await import("@/app/robots");
    const result = mod.default();
    const disallow = result.rules?.[0]?.disallow;
    expect(Array.isArray(disallow)).toBe(true);
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/admin/",
        "/api/",
        "/dashboard/",
        "/seller/",
        "/login",
        "/register",
      ]),
    );
  });

  it("allows the root path", async () => {
    const mod = await import("@/app/robots");
    const result = mod.default();
    expect(result.rules?.[0]?.allow).toBe("/");
  });

  it("respects a custom NEXT_PUBLIC_SITE_URL override", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.heavix.ir";
    const mod = await import("@/app/robots");
    const result = mod.default();
    expect(result.host).toBe("https://staging.heavix.ir");
    expect(result.sitemap).toBe("https://staging.heavix.ir/sitemap.xml");
  });
});

describe("seo-service.getRobotsTxt() (legacy Wave 3B producer)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("emits Host: https://heavix.ir (not the legacy havix.ir)", async () => {
    const mod = await import("@/lib/seo-service");
    const txt = mod.getRobotsTxt();
    expect(txt).toContain("Host: https://heavix.ir");
    expect(txt).not.toContain("havix.ir");
  });

  it("emits Sitemap: https://heavix.ir/sitemap.xml", async () => {
    const mod = await import("@/lib/seo-service");
    const txt = mod.getRobotsTxt();
    expect(txt).toContain("Sitemap: https://heavix.ir/sitemap.xml");
  });

  it("contains the same disallow directives as the official robots.ts", async () => {
    const mod = await import("@/lib/seo-service");
    const txt = mod.getRobotsTxt();
    for (const rule of [
      "Disallow: /admin/",
      "Disallow: /api/",
      "Disallow: /dashboard/",
      "Disallow: /seller/",
      "Disallow: /login",
      "Disallow: /register",
    ]) {
      expect(txt).toContain(rule);
    }
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
  });
});

describe("sitemap.ts (official Next.js metadata route) — static paths domain", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("emits every static URL with the canonical heavix.ir domain", async () => {
    const mod = await import("@/app/sitemap");
    const entries = await mod.default();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(6);
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\/heavix\.ir\//);
      expect(e.url).not.toMatch(/havix\.ir/);
    }
  });

  it("includes the homepage at priority 1.0", async () => {
    const mod = await import("@/app/sitemap");
    const entries = await mod.default();
    const home = entries.find((e) => e.url === "https://heavix.ir/");
    expect(home).toBeDefined();
    expect(home?.priority).toBe(1.0);
  });

  it("includes /listings, /brands, /store, /knowledge, /categories", async () => {
    const mod = await import("@/app/sitemap");
    const entries = await mod.default();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://heavix.ir/listings");
    expect(urls).toContain("https://heavix.ir/brands");
    expect(urls).toContain("https://heavix.ir/store");
    expect(urls).toContain("https://heavix.ir/knowledge");
    expect(urls).toContain("https://heavix.ir/categories");
  });

  it("does NOT include any private-route URL", async () => {
    const mod = await import("@/app/sitemap");
    const entries = await mod.default();
    const urls = entries.map((e) => e.url).join("\n");
    for (const forbidden of [
      "/admin/",
      "/api/",
      "/dashboard/",
      "/seller/",
      "/login",
      "/register",
    ]) {
      expect(urls).not.toContain(forbidden);
    }
  });

  it("respects a custom NEXT_PUBLIC_SITE_URL override for all emitted URLs", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.heavix.ir";
    const mod = await import("@/app/sitemap");
    const entries = await mod.default();
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\/staging\.heavix\.ir\//);
    }
  });
});

describe("seo-service.generateSitemap() (legacy Wave 3B producer) — static paths domain", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("emits valid XML with the canonical heavix.ir domain in every <loc>", async () => {
    const mod = await import("@/lib/seo-service");
    const xml = await mod.generateSitemap();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<urlset");
    // Every <loc> must use heavix.ir
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    expect(locs.length).toBeGreaterThanOrEqual(6);
    for (const loc of locs) {
      expect(loc).toContain("https://heavix.ir/");
      expect(loc).not.toContain("havix.ir");
    }
  });

  it("includes the homepage and the 5 other static paths", async () => {
    const mod = await import("@/lib/seo-service");
    const xml = await mod.generateSitemap();
    expect(xml).toContain("<loc>https://heavix.ir/</loc>");
    expect(xml).toContain("<loc>https://heavix.ir/listings</loc>");
    expect(xml).toContain("<loc>https://heavix.ir/brands</loc>");
    expect(xml).toContain("<loc>https://heavix.ir/store</loc>");
    expect(xml).toContain("<loc>https://heavix.ir/knowledge</loc>");
    expect(xml).toContain("<loc>https://heavix.ir/categories</loc>");
  });

  it("does NOT include any private-route URL in the XML", async () => {
    const mod = await import("@/lib/seo-service");
    const xml = await mod.generateSitemap();
    for (const forbidden of [
      "/admin/",
      "/api/",
      "/dashboard/",
      "/seller/",
      "/login",
      "/register",
    ]) {
      expect(xml).not.toContain(`https://heavix.ir${forbidden}`);
    }
  });

  it("respects a custom NEXT_PUBLIC_SITE_URL override for every emitted URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.heavix.ir";
    const mod = await import("@/lib/seo-service");
    const xml = await mod.generateSitemap();
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    expect(locs.length).toBeGreaterThanOrEqual(6);
    for (const loc of locs) {
      expect(loc).toContain("https://staging.heavix.ir/");
    }
  });
});

describe("cross-producer consistency — official vs legacy output the same domain", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("robots.ts.host and getRobotsTxt() Host: line agree on heavix.ir", async () => {
    const robotsRoute = await import("@/app/robots");
    const seoService = await import("@/lib/seo-service");
    const official = robotsRoute.default();
    const legacy = seoService.getRobotsTxt();
    expect(official.host).toBe("https://heavix.ir");
    expect(legacy).toContain(`Host: ${official.host}`);
  });

  it("sitemap.ts and generateSitemap() both emit https://heavix.ir/ as the homepage URL", async () => {
    const sitemapRoute = await import("@/app/sitemap");
    const seoService = await import("@/lib/seo-service");
    const officialEntries = await sitemapRoute.default();
    const legacyXml = await seoService.generateSitemap();
    const officialHome = officialEntries.find(
      (e) => e.url === "https://heavix.ir/",
    );
    expect(officialHome).toBeDefined();
    expect(legacyXml).toContain("<loc>https://heavix.ir/</loc>");
  });
});
