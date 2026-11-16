import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("public SEO metadata safety", () => {
  it("redirects legacy knowledge article URLs to the canonical published article route", () => {
    const legacy = read("src/app/knowledge/[slug]/page.tsx");
    const canonical = read("src/app/articles/[slug]/page.tsx");
    expect(legacy).toContain("permanentRedirect");
    expect(legacy).toContain('where: { slug, status: "PUBLISHED" }');
    expect(legacy).toContain("encodeURIComponent(article.slug)");
    expect(canonical).toContain("export async function generateMetadata");
    expect(canonical).toContain("alternates: { canonical: url }");
    expect(canonical).toContain("const url = `/articles/${article.slug}`");
  });

  it("uses canonical article URLs in both sitemap producers and public/internal article links", () => {
    const sitemap = read("src/app/sitemap.ts");
    const service = read("src/lib/seo-service.ts");
    expect(sitemap).toContain("url: `${base}/articles/${a.slug}`");
    expect(service).toContain("loc: `${SITE_BASE_URL}/articles/${a.slug}`");
    for (const file of [
      "src/app/knowledge/page.tsx",
      "src/components/home/KnowledgeSection.tsx",
      "src/components/page-renderer/widgets/article-list-widget.tsx",
      "src/components/admin/ArticlesClient.tsx",
      "src/app/admin/content-decay/page.tsx",
      "src/app/admin/content-factory/page.tsx",
      "src/app/admin/articles/page.tsx",
    ]) {
      expect(read(file), file).toContain("/articles/");
      expect(read(file), file).not.toContain("/knowledge/${");
    }
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
