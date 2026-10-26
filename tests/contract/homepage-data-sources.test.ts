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
    expect(source?.apiPath).toBe("/api/listings?featured=true&limit=8");
    expect(source?.permissions).toEqual([]);
  });

  it("uses the public category endpoint for the category grid", () => {
    const source = getDataSource("taxonomy.categories");
    expect(source?.apiPath).toBe("/api/taxonomy/categories?root=true&layer=CATALOG");
    expect(source?.permissions).toEqual([]);
    expect(getWidget("category-grid")?.defaultDataSource).toBe("taxonomy.categories");
  });

  it("does not put the admin-only site statistics endpoint on the public homepage", () => {
    expect(homepageDataSources).not.toContain("site-stats");
    expect(defaultLayoutSource).not.toContain('key: "stats"');
  });
});
