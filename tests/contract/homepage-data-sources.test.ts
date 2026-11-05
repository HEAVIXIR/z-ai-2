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

  it("includes all required public content sections", () => {
    expect(homepageDataSources).toEqual(expect.arrayContaining([
      "listing.featured",
      "listing.latest",
      "taxonomy.categories",
      "brand.popular",
      "service.all",
      "article.latest",
    ]));
  });

  it("uses the supported featured-first public listing query", () => {
    const source = getDataSource("listing.featured");
    expect(source?.apiPath).toBe("/api/listings?featuredOnly=true&sort=featured&limit={limit}");
    expect(source?.permissions).toEqual([]);
  });

  it("uses the newest-first public listing query", () => {
    const source = getDataSource("listing.latest");
    expect(source?.apiPath).toBe("/api/listings?limit={limit}&sort=newest");
    expect(source?.permissions).toEqual([]);
  });

  it("uses the public category endpoint for the category grid", () => {
    const source = getDataSource("taxonomy.categories");
    expect(source?.apiPath).toBe("/api/taxonomy/categories?root=true&layer=CATALOG");
    expect(source?.permissions).toEqual([]);
    expect(getWidget("category-grid")?.defaultDataSource).toBe("taxonomy.categories");
  });

  it("uses public-only, active and featured brands", () => {
    const source = getDataSource("brand.popular");
    expect(source?.apiPath).toBe("/api/taxonomy/brands?status=ACTIVE&active=true&featured=true&limit={limit}&sort=featured");
    expect(source?.permissions).toEqual([]);
    expect(getWidget("brand-grid")?.defaultDataSource).toBe("brand.popular");
    expect(getWidget("brand-grid")?.permissions).toEqual([]);
  });

  it("uses public active services and articles without admin permission gates", () => {
    expect(getDataSource("service.all")?.apiPath).toBe("/api/services?featured=1&limit={limit}");
    expect(getDataSource("service.all")?.permissions).toEqual([]);
    expect(getDataSource("article.latest")?.apiPath).toBe("/api/articles?limit={limit}");
    expect(getDataSource("article.latest")?.permissions).toEqual([]);
    expect(getWidget("service-grid")?.defaultDataSource).toBe("service.all");
    expect(getWidget("service-grid")?.permissions).toEqual([]);
    expect(getWidget("article-list")?.permissions).toEqual([]);
  });

  it("keeps admin-only resources protected", () => {
    expect(getDataSource("product.latest")?.permissions).toEqual(["product.read"]);
    expect(getDataSource("stats.site")?.permissions).toEqual(["admin.dashboard.read"]);
    expect(getWidget("stats")?.permissions).toEqual(["admin.dashboard.read"]);
  });

  it("does not put admin-only site statistics on the public homepage", () => {
    expect(homepageDataSources).not.toContain("stats.site");
    expect(homepageDataSources).not.toContain("site-stats");
    expect(defaultLayoutSource).not.toContain('key: "stats"');
  });
  it("does not render an empty trust-badges section without verified badge data", () => {
    expect(defaultLayoutSource).not.toContain('key: "trust-badges"');
  });

  it("keeps listings GET read-only and invalidates homepage cache only after writes", () => {
    const source = readFileSync(path.join(root, "src/app/api/listings/route.ts"), "utf8");
    const getBody = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
    const mutationBody = source.slice(source.indexOf("export async function POST"));
    expect(getBody).not.toContain("revalidateTag(");
    expect(mutationBody).toContain("revalidateTag(HOMEPAGE_CACHE_TAGS.listings");
  });

  it("keeps category GET read-only and invalidates homepage cache only after writes", () => {
    const source = readFileSync(path.join(root, "src/app/api/taxonomy/categories/route.ts"), "utf8");
    const getBody = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
    const postBody = source.slice(source.indexOf("export async function POST"));
    expect(getBody).not.toContain("revalidateTag(");
    expect(postBody).toContain("revalidateTag(HOMEPAGE_CACHE_TAGS.categories");
  });

});
