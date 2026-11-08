import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("public SEO metadata safety", () => {
  it("gives knowledge articles route-specific canonical metadata and noindexes unpublished articles", () => {
    const source = read("src/app/knowledge/[slug]/page.tsx");
    expect(source).toContain("export async function generateMetadata");
    expect(source).toContain('alternates: { canonical: `/knowledge/${slug}` }');
    expect(source).toContain('robots: { index: false, follow: false }');
    expect(source).toContain('article.status !== "PUBLISHED"');
  });

  it("sets store canonical metadata in a server layout around the client page", () => {
    const source = read("src/app/store/layout.tsx");
    expect(source).toContain('alternates: { canonical: "/store" }');
    expect(source).toContain('robots: { index: true, follow: true }');
  });

  it("does not claim a fresh modification timestamp for unchanged static sitemap URLs", () => {
    const source = read("src/app/sitemap.ts");
    const staticBlock = source.slice(source.indexOf("// Static pages"), source.indexOf("// Categories"));
    expect(staticBlock).not.toContain("lastModified: new Date()");
    expect(source).toContain("[sitemap] category lookup failed");
    expect(source).toContain("[sitemap] brand lookup failed");
    expect(source).toContain("[sitemap] listing lookup failed");
    expect(source).toContain("[sitemap] article lookup failed");
  });

  it("applies a runtime noindex header to public Preview responses", () => {
    const source = read("src/proxy.ts");
    expect(source).toContain("isPreviewDeployment(req.nextUrl.hostname)");
    expect(source).toContain('response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")');
    expect(source).toContain('matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]');
  });

  it("does not advertise production host or sitemap from Preview robots.txt", () => {
    const source = read("src/app/robots.ts");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("export function buildRobots(hostname?: string)");
    expect(source).toContain("isPreviewDeployment(hostname)");
    expect(source).toContain("if (preview) return { rules }");
  });

  it("keeps the secondary robots API aligned with the Preview policy", () => {
    const source = read("src/lib/seo-service.ts");
    expect(source).toContain("isPreviewDeployment(hostname)");
    const route = read("src/app/api/robots-txt/route.ts");
    expect(route).toContain("const requestHeaders = await headers()");
    expect(route).toContain('getRobotsTxt(requestHeaders.get("host") ?? "")');
    expect(source).toContain("Sitemap:");
    expect(source).toContain("Host:");
  });

});
