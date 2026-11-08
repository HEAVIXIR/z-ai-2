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

  it("sets one request-time noindex response header for Preview deployments", () => {
    const middleware = read("src/middleware.ts");
    const nextConfig = read("next.config.ts");
    expect(middleware).toContain("X-Robots-Tag");
    expect(middleware).toContain("noindex, nofollow, noarchive");
    expect(middleware).toContain("isPreviewDeployment(req.nextUrl.hostname)");
    // Preview noindex is owned by request-time middleware. Keeping a second
    // production-build header in next.config duplicates the response header.
    expect(nextConfig).not.toContain("X-Robots-Tag");
  });

  it("sets root metadata to noindex on preview", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/robots: IS_PREVIEW_DEPLOYMENT/);
    expect(layout).toMatch(/index: false, follow: false, noarchive: true/);
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
