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

  it("sets a global noindex response header for preview deployments", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/X-Robots-Tag/);
    expect(config).toMatch(/noindex, nofollow, noarchive/);
    expect(config).toMatch(/IS_PREVIEW_DEPLOYMENT/);
  });

  it("sets root metadata to noindex on preview", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/robots: IS_PREVIEW_DEPLOYMENT/);
    expect(layout).toMatch(/index: false, follow: false, noarchive: true/);
  });

  it("does not publish a sitemap URL or sitemap entries for preview", () => {
    const robots = read("src/app/robots.ts");
    const sitemap = read("src/app/sitemap.ts");
    expect(robots).toMatch(/IS_PREVIEW_DEPLOYMENT \? \{\} : \{ sitemap:/);
    expect(sitemap).toMatch(/if \(IS_PREVIEW_DEPLOYMENT\) return \[\]/);
  });
});
