import { describe, expect, it } from "vitest";
import fs from "node:fs";

const siteConfig = fs.readFileSync("src/lib/site-config.ts", "utf8");
const homepage = fs.readFileSync("src/app/page.tsx", "utf8");
const categoriesPage = fs.readFileSync("src/app/categories/page.tsx", "utf8");
const sitemap = fs.readFileSync("src/app/sitemap.ts", "utf8");

describe("Preview-safe canonical URL resolution", () => {
  it("uses the deployment-specific Vercel host for Preview URLs", () => {
    expect(siteConfig).toContain('process.env.VERCEL_ENV === "preview"');
    expect(siteConfig).toContain("process.env.VERCEL_URL");
    expect(siteConfig).toContain("PREVIEW_SITE_URL");
    expect(siteConfig).toContain("http://localhost:3000");
  });

  it("does not let the default homepage expose internal section keys as headings", () => {
    for (const label of ["Hero", "Search", "Featured Listings", "Categories", "Trust"]) {
      expect(homepage).not.toContain(`title: "${label}"`);
    }
  });

  it("implements the categories index that the sitemap advertises", () => {
    expect(categoriesPage).toContain('alternates: { canonical: "/categories" }');
    expect(categoriesPage).toContain("getPublicListingWhere()");
    expect(sitemap).toContain('{ url: "/categories"');
  });
});
