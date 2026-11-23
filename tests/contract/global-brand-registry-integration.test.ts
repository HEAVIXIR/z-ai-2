import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("HEAVIX global brand registry integration", () => {
  it("opens the global brand picker with suggestions and keeps model as free text after brand", () => {
    const wizard = read("src/app/listings/new/page.tsx");
    const brandField = wizard.indexOf("برند مرتبط (اختیاری)");
    const modelField = wizard.indexOf("مدل (اختیاری)");
    expect(brandField).toBeGreaterThan(-1);
    expect(modelField).toBeGreaterThan(brandField);
    expect(wizard).toContain('setBrandBrowseKey((key) => key + 1)');
    expect(wizard).toContain('const searchUrl = q');
    expect(wizard).toContain('"/api/brands/search"');
    expect(wizard).toContain('setModelName(e.target.value.slice(0, 120))');
    expect(wizard).toContain("میراثی");
    expect(wizard).toContain("تاریخی");
  });

  it("searches the global catalog without category coupling and preserves active legacy brands", () => {
    const search = read("src/lib/search.ts");
    const start = search.indexOf("export async function searchBrands");
    const end = search.indexOf("/* ============================================================", start);
    const brandSearch = search.slice(start, end);
    expect(brandSearch).toContain("active: true");
    expect(brandSearch).toContain("BRAND_UNAVAILABLE_STATUSES");
    expect(brandSearch).not.toContain('status: "ACTIVE"');
    expect(brandSearch).not.toContain("categories:");
    const listingApi = read("src/app/api/listings/route.ts");
    const wantedApi = read("src/app/api/wanted/route.ts");
    expect(listingApi).toContain("if (!isBrandSelectable(brand))");
    expect(listingApi).not.toContain("brand.status !== \"ACTIVE\"");
    expect(wantedApi).toContain("if (requestedBrandId && !isBrandSelectable(brandRow))");
    expect(wantedApi).not.toContain("brandRow.status !== \"ACTIVE\"");
    const policy = read("src/lib/brand-labels.ts");
    expect(policy).toContain('["PENDING_REVIEW", "PENDING", "DRAFT", "INACTIVE", "ARCHIVED"]');
  });

  it("uses the canonical brand create page and searches admin records by aliases", () => {
    const admin = read("src/app/admin/taxonomy/brands/page.tsx");
    expect(admin).toContain('href="/admin/brands/new"');
    expect(admin).toContain("normalizedValue: { contains: normalizedQ }");
    const placeholder = read("src/app/admin/brands/new/page.tsx");
    expect(placeholder).toContain('redirect("/admin/taxonomy/brands/new")');
    const nav = read("src/components/admin/BrandManagementNav.tsx");
    expect(nav).toContain('href="/admin/brands"');
    expect(nav).toContain("مرکز یکپارچه مدیریت برندها");
    const sidebarDefaults = read("src/lib/admin/navigation-defaults.ts");
    expect(sidebarDefaults).toContain("key: 'brand-center'");
    expect(sidebarDefaults).toContain("href: '/admin/brands'");
    expect(sidebarDefaults).not.toContain("href: '/admin/brand-families'");
    expect(sidebarDefaults).not.toContain("href: '/admin/home/trusted-brands'");
    const navigationApi = read("src/app/api/admin/navigation/route.ts");
    expect(navigationApi).toContain("LEGACY_BRAND_NAV_HREFS");
  });

  it("makes explicit homepage display choices override legacy featured flags", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain("const explicitDisplayIds = new Set(displayBrands.map((d) => d.brandId))");
    expect(home).toContain("displayBrands.filter((d) => d.showOnHomepage)");
    expect(home).toContain("featuredBrands.filter((b) => !explicitDisplayIds.has(b.id))");
    const ticker = read("src/components/home/TrustedBrandsSection.tsx");
    expect(ticker).toContain('href={`/brands/${encodeURIComponent(brand.slug)}`}');
    expect(ticker).toContain('href="/brands"');
    const curation = read("src/app/api/admin/home/trusted-brands/route.ts");
    const featuredFeed = read("src/app/api/brands/featured/route.ts");
    expect(curation).toContain("showOnHomepage: b.display?.showOnHomepage ?? b.featured");
    expect(curation).toContain("const legacyFeatured = await db.brand.findMany");
    expect(curation).toContain("create: { brandId: brand.id, showOnHomepage: false }");
    expect(featuredFeed).toContain("displayBrands.length === 0 && featuredBrands.length === 0");
    expect(featuredFeed).toContain('return NextResponse.json({ brands: [] });');
  });

  it("uses one canonical type, status, and verification vocabulary in brand create/edit", () => {
    const create = read("src/app/admin/taxonomy/brands/new/CreateBrandForm.tsx");
    const edit = read("src/app/admin/taxonomy/brands/[id]/BrandControlCenter.tsx");
    expect(create).toContain('type: "MACHINE_BRAND"');
    expect(create).toContain('Object.keys(BRAND_TYPE_LABELS).filter((type) => type !== "BRAND_FAMILY")');
    expect(edit).toContain("Object.keys(BRAND_TYPE_LABELS)");
    expect(edit).toContain("Object.keys(BRAND_STATUS_LABELS)");
    expect(edit).toContain("Object.keys(VERIFICATION_LABELS)");
  });
  it("protects family and homepage brand mutations with CSRF checks", () => {
    const family = read("src/app/api/brand-families/route.ts");
    const familyId = read("src/app/api/brand-families/[id]/route.ts");
    const homepage = read("src/app/api/admin/home/trusted-brands/route.ts");
    expect(family).toContain("checkCsrf(req)");
    expect(familyId).toContain("checkCsrf(req)");
    expect(homepage).toContain("checkCsrf(req)");
  });
  it("exposes one brand-management destination and hides the legacy homepage duplicate", () => {
    const nav = read("src/lib/admin/navigation-defaults.ts");
    const navApi = read("src/app/api/admin/navigation/route.ts");
    const hub = read("src/app/admin/brands/page.tsx");
    const sections = read("src/lib/homepage/sections.ts");
    expect(nav).toContain("key: 'brand-center'");
    expect(nav).toContain("href: '/admin/brands'");
    expect(nav).not.toContain("href: '/admin/brand-families'");
    expect(nav).not.toContain("href: '/admin/home/trusted-brands'");
    expect(navApi).toContain("LEGACY_BRAND_NAV_HREFS");
    expect(hub).toContain("مرکز یکپارچه مدیریت برندها");
    expect(hub).toContain("/admin/brand-families");
    expect(hub).toContain("/admin/home/trusted-brands");
    expect(sections).toContain('rows.filter((row) => row.key !== "brands")');
    expect(sections).not.toContain('{ key: "brands", title: "برندهای معتبر"');
  });

});
