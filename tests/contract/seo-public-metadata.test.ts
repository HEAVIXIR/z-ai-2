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
});
