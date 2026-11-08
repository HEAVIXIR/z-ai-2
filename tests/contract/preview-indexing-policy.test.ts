import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("preview indexing safety", () => {
  it("detects both Cloudflare and Vercel preview deployments", () => {
    const config = read("src/lib/site-config.ts");
    expect(config).toMatch(/HEAVIX_ENV\?\.toLowerCase\(\) === "preview"/);
    expect(config).toMatch(/VERCEL_ENV\?\.toLowerCase\(\) === "preview"/);
    expect(config).toMatch(/NODE_ENV === "development"/);
  });

  it("sets a global noindex response header through the request Edge Middleware", () => {
    const middleware = read("src/middleware.ts");
    const config = read("next.config.ts");
    expect(middleware).toMatch(/X-Robots-Tag/);
    expect(middleware).toMatch(/noindex, nofollow, noarchive/);
    expect(config).not.toMatch(/X-Robots-Tag/);
  });

  it("keeps Preview noindex at the request boundary without duplicate root metadata", () => {
    const layout = read("src/app/layout.tsx");
    const middleware = read("src/middleware.ts");
    expect(layout).not.toMatch(/robots:/);
    expect(middleware).toMatch(/response\.headers\.set\("X-Robots-Tag"/);
  });

  it("does not publish a sitemap URL or sitemap entries for preview", () => {
    const robots = read("src/app/robots.ts");
    const sitemap = read("src/app/sitemap.ts");
    expect(robots).toContain('export const dynamic = "force-dynamic"');
    expect(robots).toContain("if (preview) return { rules }");
    expect(robots).toContain('sitemap: absoluteUrl("/sitemap.xml")');
    expect(sitemap).toMatch(/if \(IS_PREVIEW_DEPLOYMENT\) return \[\]/);
  });
});
