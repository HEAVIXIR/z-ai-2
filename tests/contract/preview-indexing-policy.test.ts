import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("preview indexing safety", () => {
  it("detects Cloudflare Preview and local development deployments", () => {
    const config = read("src/lib/site-config.ts");
    expect(config).toMatch(/HEAVIX_ENV\?\.trim\(\)\.toLowerCase\(\)/);
    expect(config).toMatch(/heavixEnvironment === "preview"/);
    expect(config).toMatch(/NODE_ENV === "development"/);
    expect(config).toContain('host.endsWith(".workers.dev")');
    expect(config).toContain('host.endsWith(".pages.dev")');
  });

  it("sets one request-time noindex response header for Preview deployments", () => {
    const middleware = read("src/middleware.ts");
    const nextConfig = read("next.config.ts");
    expect(middleware).toContain("X-Robots-Tag");
    expect(middleware).toContain("noindex, nofollow, noarchive");
    expect(middleware).toContain("isPreviewDeployment(req.nextUrl.hostname)");
    // Build-time noindex is limited to local development; Preview is detected
    // from the request hostname/runtime and must remain middleware-owned.
    expect(nextConfig).toMatch(
      /\.\.\.\(process\.env\.NODE_ENV === "development"[\s\S]*?key: "X-Robots-Tag"/,
    );
    expect(nextConfig).not.toMatch(/IS_PREVIEW_DEPLOYMENT|HEAVIX_ENV/);
  });

  it("keeps root metadata canonical and delegates Preview noindex to middleware", () => {
    const layout = read("src/app/layout.tsx");
    const middleware = read("src/middleware.ts");
    expect(layout).toContain("metadataBase: new URL(SITE_BASE_URL)");
    expect(layout).not.toContain("robots:");
    expect(middleware).toContain('response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")');
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
