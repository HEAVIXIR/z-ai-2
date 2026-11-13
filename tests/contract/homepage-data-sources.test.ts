import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDataSource, getWidget } from "../../src/lib/admin/page-builder/widget-registry";

const root = process.cwd();
const homepageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const cachedQueriesSource = readFileSync(path.join(root, "src/lib/homepage-cached-queries.ts"), "utf8");

describe("public homepage renderer contracts", () => {
  it("uses the canonical database-backed homepage composition and cached independent sources", () => {
    expect(homepageSource).toContain("getCachedHomePageSections()");
    expect(homepageSource).toContain("getCachedCatalogCategories()");
    expect(homepageSource).toContain("getCachedTopBrands()");
    expect(homepageSource).toContain("getCachedActiveRequests()");
    expect(homepageSource).toContain("getCachedArticles()");
    expect(homepageSource).toContain("db.listing.findMany");
    expect(homepageSource).toContain("getActiveStats");

    expect(cachedQueriesSource).toContain("db.homePageSection.findMany");
    expect(cachedQueriesSource).toContain("db.category.findMany");
    expect(cachedQueriesSource).toContain("db.brand.findMany");
    expect(cachedQueriesSource).toContain("db.buyRequest.findMany");
    expect(cachedQueriesSource).toContain("db.article.findMany");
  });

  it("keeps PageBuilder data sources registered for custom pages and preview flows", () => {
    const featured = getDataSource("listing.featured");
    expect(featured?.apiPath).toBe("/api/listings?featured=true&limit=8");
    expect(featured?.permissions).toEqual([]);

    const categories = getDataSource("taxonomy.categories");
    expect(categories?.apiPath).toBe("/api/taxonomy/categories?root=true&layer=CATALOG");
    expect(categories?.permissions).toEqual([]);
    expect(getWidget("category-grid")?.defaultDataSource).toBe("taxonomy.categories");
  });

  it("does not call admin-only APIs or mutate homepage configuration during public rendering", () => {
    expect(homepageSource).not.toContain("/api/admin/");
    expect(homepageSource).not.toMatch(/db\.homePageSection\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  });

  it("does not call an admin-only site statistics endpoint from the public homepage", () => {
    expect(homepageSource).not.toContain("/api/admin/site-stats");
    expect(homepageSource).not.toContain("fetch('/api/site-stats");
    expect(homepageSource).toContain("getActiveStats");
    expect(homepageSource).not.toContain("31 استان");
  });
});
