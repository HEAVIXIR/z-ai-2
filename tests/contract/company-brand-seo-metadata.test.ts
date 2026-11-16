import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("company and brand SEO metadata", () => {
  it("honors brand SEO overrides and prevents indexing inactive brands", () => {
    const source = read("src/app/brands/[slug]/page.tsx");
    expect(source).toContain('getSEO("Brand", brand.id)');
    expect(source).toContain("!brand.active");
    expect(source).toContain("seo?.canonicalUrl");
    expect(source).toContain("seo?.robotsIndex");
    expect(source).toContain("seo?.robotsFollow");
  });

  it("honors company SEO overrides and noindexes thin company pages", () => {
    const source = read("src/app/companies/[slug]/page.tsx");
    expect(source).toContain('getSEO("Company", company.id)');
    expect(source).toContain("company._count.listings === 0");
    expect(source).toContain("robots: { index: !thin");
    expect(source).toContain("seo?.canonicalUrl");
  });

  it("includes active companies with published inventory in both sitemap producers", () => {
    const sitemap = read("src/app/sitemap.ts");
    const service = read("src/lib/seo-service.ts");
    for (const source of [sitemap, service]) {
      expect(source).toContain("db.company");
      expect(source).toContain('status: "ACTIVE", listings: { some: { status: "PUBLISHED" } }');
      expect(source).toContain("companies.map((c) => c.id)");
      expect(source).toContain("/companies/");
    }
  });
});
