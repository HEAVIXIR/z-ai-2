import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDataSource,
  getWidget,
} from "../../src/lib/admin/page-builder/widget-registry";

const root = process.cwd();
const homepageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const layoutStart = homepageSource.indexOf("const DEFAULT_HOME_LAYOUT");
const layoutEnd = homepageSource.indexOf("export default async function HomePage");
const defaultLayoutSource = homepageSource.slice(layoutStart, layoutEnd);
const homepageDataSources = [
  ...defaultLayoutSource.matchAll(/dataSource:\s*"([^"]+)"/g),
].map((match) => match[1]);

describe("public homepage renderer contracts", () => {
  it("uses only registered data sources in the default homepage layout", () => {
    expect(homepageDataSources.length).toBeGreaterThan(0);
    for (const key of homepageDataSources) {
      expect(getDataSource(key), `unregistered homepage data source: ${key}`).toBeDefined();
    }
  });

  it("uses the public featured-listings endpoint without an admin permission gate", () => {
    const source = getDataSource("listing.featured");
    expect(source?.apiPath).toBe("/api/listings?sort=featured&limit=8");
    expect(source?.permissions).toEqual([]);
  });

  it("uses the public category endpoint for the category grid", () => {
    const source = getDataSource("taxonomy.categories");
    expect(source?.apiPath).toBe("/api/taxonomy/categories?root=true&layer=CATALOG");
    expect(source?.permissions).toEqual([]);
    expect(getWidget("category-grid")?.defaultDataSource).toBe("taxonomy.categories");
  });

  it("registers every public homepage data source with no admin permission requirement", () => {
    const expected = [
      "listing.featured",
      "listing.latest",
      "taxonomy.categories",
      "brand.popular",
      "service.all",
      "article.latest",
    ];
    for (const key of expected) {
      expect(homepageDataSources).toContain(key);
      expect(getDataSource(key)?.permissions).toEqual([]);
    }
  });

  it("filters homepage brand cards to explicitly active records", () => {
    const route = readFileSync(
      path.join(root, "src/app/api/taxonomy/brands/route.ts"),
      "utf8",
    );
    expect(getDataSource("brand.popular")?.apiPath).toContain("active=true");
    expect(route).toContain('const activeRaw = url.searchParams.get("active")');
    expect(route).toContain("if (active !== undefined) where.active = active");
  });

  it("renders all intended public content widget types in the default homepage", () => {
    for (const key of ["listing-grid", "category-grid", "brand-grid", "service-grid", "article-list"]) {
      expect(defaultLayoutSource).toContain(`key: "${key}"`);
    }
  });

  it("uses the real public endpoint envelopes for brands, services, and articles", () => {
    expect(getDataSource("brand.popular")?.apiPath).toBe(
      "/api/taxonomy/brands?active=true&status=ACTIVE&sort=featured&limit=12",
    );
    expect(getDataSource("service.all")?.apiPath).toBe("/api/services?limit=12");
    expect(getDataSource("article.latest")?.apiPath).toBe("/api/articles?limit=6");
    expect(getWidget("brand-grid")?.defaultDataSource).toBe("brand.popular");
    expect(getWidget("service-grid")?.defaultDataSource).toBe("service.all");
    expect(getWidget("article-list")?.permissions).toEqual([]);
  });

  it("keeps public services informational rather than linking to an unverified route", () => {
    const source = readFileSync(
      path.join(root, "src/components/page-renderer/widgets/service-grid-widget.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/href=/);
    expect(source).toContain("<article");
  });

  it("preserves the published HOME AdminPage override", () => {
    expect(homepageSource).toContain('pageType: "HOME", status: "PUBLISHED"');
    expect(homepageSource).toContain("layout = publishedVersion.layout");
  });

  it("does not put the admin-only site statistics endpoint on the public homepage", () => {
    expect(homepageDataSources).not.toContain("site-stats");
    expect(defaultLayoutSource).not.toContain('key: "stats"');
  });
});
