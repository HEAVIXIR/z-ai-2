import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("SEO canonical routes and private-page indexing contract", () => {
  it("uses one canonical article route and redirects legacy knowledge URLs", () => {
    const legacy = read("src/app/knowledge/[slug]/page.tsx");
    const canonical = read("src/app/articles/[slug]/page.tsx");
    const sitemap = read("src/app/sitemap.ts");
    const serviceSitemap = read("src/lib/seo-service.ts");
    expect(legacy).toContain("permanentRedirect");
    expect(legacy).toContain("/articles/");
    expect(canonical).toContain("/articles/");
    expect(sitemap).toContain("/articles/");
    expect(serviceSitemap).toContain("/articles/");
    expect(sitemap).not.toContain("/knowledge/");
    expect(serviceSitemap).not.toContain("/knowledge/");
  });

  it("uses brand-scoped canonical model URLs instead of ambiguous global slugs", () => {
    const model = read("src/app/brands/[slug]/models/[modelSlug]/page.tsx");
    const legacy = read("src/app/models/[slug]/page.tsx");
    const brand = read("src/app/brands/[slug]/page.tsx");
    const sitemap = read("src/app/sitemap.ts");
    expect(model).toContain("brandId: brand.id");
    expect(model).toContain("canonical:");
    expect(legacy).toContain("findMany");
    expect(legacy).toContain("models.length === 1");
    expect(legacy).toContain("permanentRedirect");
    expect(brand).toContain("/brands/${encodeURIComponent(brand.slug)}/models/");
    expect(sitemap).toContain("/models/");
    expect(sitemap).toContain('getSEOOverridesByType("ProductModel"');
  });

  it("includes company and model pages only when public inventory exists", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('status: "ACTIVE", listings: { some: { status: "PUBLISHED" } }');
    expect(sitemap).toContain("/companies/");
    expect(sitemap).toContain('getSEOOverridesByType("Company"');
  });

  it("noindexes user-specific, transaction, tracking, and utility pages", () => {
    const privatePages = [
      "src/app/compare/layout.tsx",
      "src/app/find-my-need/layout.tsx",
      "src/app/rfq/new/layout.tsx",
      "src/app/transport/request/page.tsx",
      "src/app/sell-in-7-days/track/page.tsx",
      "src/app/sell-in-7-days/register/page.tsx",
    ];
    for (const file of privatePages) {
      expect(read(file)).toContain("index: false");
    }
  });

  it("supports SEO metadata for companies and brand-scoped product models", () => {
    const seo = read("src/lib/seo.ts");
    const admin = read("src/lib/admin/resources/store-domain-resources.ts");
    expect(seo).toContain('"ProductModel"');
    expect(seo).toContain('"Company"');
    expect(seo).toContain('case "ProductModel"');
    expect(seo).toContain('case "Company"');
    expect(admin).toContain("value: 'ProductModel'");
    expect(admin).toContain("value: 'Company'");
    const adminClient = read("src/app/admin/seo/SEOAdminClient.tsx");
    expect(adminClient).toContain('"ProductModel"');
    expect(adminClient).toContain('"Company"');
  });
});
