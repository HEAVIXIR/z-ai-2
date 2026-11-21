import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("brand-scoped model canonical routing", () => {
  it("redirects unique legacy model slugs and never chooses an arbitrary brand for ambiguous slugs", () => {
    const legacy = read("src/app/models/[slug]/page.tsx");
    expect(legacy).toContain("getActiveModelsBySlug");
    expect(legacy).toContain("models.length === 1");
    expect(legacy).toContain("permanentRedirect");
    expect(legacy).toContain("models.length > 1");
    expect(legacy).toContain("brand?.active");
    expect(legacy).toContain("انتخاب برند");
    expect(legacy).toContain('robots: { index: false, follow: true }');
  });

  it("scopes canonical model lookups and SEO metadata to the requested active brand", () => {
    const page = read("src/app/brands/[slug]/models/[modelSlug]/page.tsx");
    expect(page).toContain('where: { slug, brandId: brand.id, status: "ACTIVE" }');
    expect(page).toContain('getSEO("ProductModel", model.id)');
    expect(page).toContain("robots: { index: !thin");
    expect(page).toContain("model._count.listings");
    expect(page).toContain("model._count.generations");
  });

  it("links brand model cards to brand-scoped canonical URLs", () => {
    const brand = read("src/app/brands/[slug]/page.tsx");
    expect(brand).toContain('/brands/${encodeURIComponent(brand.slug)}/models/${encodeURIComponent(m.slug)}');
    expect(brand).not.toContain('href={`/models/${encodeURIComponent(m.slug)}`}');
  });

  it("includes only index-worthy brand-scoped models in both sitemap producers", () => {
    const sitemap = read("src/app/sitemap.ts");
    const service = read("src/lib/seo-service.ts");
    for (const source of [sitemap, service]) {
      expect(source).toContain("db.productModel");
      expect(source).toMatch(/(?:fetchSeoMap|getSEOOverridesByType)\("ProductModel"/);
      expect(source).toContain('/brands/${encodeURIComponent(model.brand.slug)}/models/${encodeURIComponent(model.slug)}');
      expect(source).toContain('seo?.robotsIndex === false');
    }
    // The Next.js metadata sitemap allows descriptive, listed, or generated models;
    // the service sitemap intentionally requires published inventory in its query.
    expect(sitemap).toContain("model._count.listings > 0");
    expect(sitemap).toContain("model._count.generations > 0");
    expect(service).toContain('listings: { some: { status: "PUBLISHED" } }');
    expect(service).toContain("m.brand?.active");
  });
});
