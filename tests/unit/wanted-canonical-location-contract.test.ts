import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const wantedRoute = read("src/app/api/wanted/route.ts");
const wantedService = read("src/lib/wanted-service.ts");
const listingRoute = read("src/app/api/listings/route.ts");
const listingWizard = read("src/app/listings/new/page.tsx");

describe("canonical location integrity across listing and demand creation", () => {
  it("validates and resolves country, province, and city for WANTED requests", () => {
    expect(wantedRoute).toContain("const resolvedProvince = selectedProvince ?? selectedCity?.province ?? null");
    expect(wantedRoute).toContain("const resolvedCountryId = resolvedProvince?.countryId ?? requestedCountryId");
    expect(wantedRoute).toContain("countryId: resolvedCountryId");
    expect(wantedRoute).toContain("provinceId: resolvedProvince?.id ?? null");
    expect(wantedRoute).toContain("cityId: selectedCity?.id ?? null");
  });

  it("rejects non-leaf categories in the WANTED API even if the client bypasses the wizard", () => {
    expect(wantedRoute).toContain("select: { id: true, active: true, name: true, layer: true }");
    expect(wantedRoute).toContain('const expectedLayer = intentStr === "SERVICE_REQUEST" ? "SERVICE" : "MARKETPLACE"');
    expect(wantedRoute).toContain("categoryRow.layer !== expectedLayer");
    expect(wantedRoute).toContain("const activeChild = await db.category.findFirst");
    expect(wantedRoute).toContain("where: { parentId: requestedCategoryId, active: true }");
    expect(wantedRoute).toContain("برای ثبت درخواست، دسته‌بندی نهایی و بدون زیرشاخه فعال را انتخاب کنید.");
  });

  it("persists canonical location foreign keys and legacy display labels atomically", () => {
    for (const field of ["countryId", "provinceId", "cityId"]) {
      expect(wantedService).toContain(`${field}?: string | null`);
      expect(wantedService).toContain(`${field}: ${field} ?? null`);
    }
    expect(wantedService).toContain("city: city ? String(city).slice(0, 120) : null");
    expect(wantedService).toContain("province: province ? String(province).slice(0, 120) : null");
    expect(wantedService).toContain("await tx.buyRequest.create");
  });

  it("keeps supply listing creation on the same validated canonical hierarchy", () => {
    expect(listingRoute).toContain("const requestedCountryId = body.countryId");
    expect(listingRoute).toContain("countryId: resolvedCountryId");
    expect(listingRoute).toContain("provinceId: selectedProvince?.id ?? null");
    expect(listingRoute).toContain("cityId: selectedCity?.id ?? null");
  });

  it("uses the same country → province → city picker in the listing wizard", () => {
    expect(listingWizard).toContain("import LocationPicker");
    expect(listingWizard).toContain("<LocationPicker");
    expect(listingWizard).toContain("value={location}");
    expect(listingWizard).toContain("onChange={setLocation}");
    expect(listingWizard).toContain('showExactPoint={["SALE", "RENT", "AUCTION"].includes(transactionType)}');
    expect(listingWizard).toContain("countryId: location.countryId");
    expect(listingWizard).toContain("provinceId: location.provinceId");
    expect(listingWizard).toContain("cityId: location.cityId");
  });
});
