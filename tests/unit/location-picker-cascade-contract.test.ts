import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("first-party country → province → city picker", () => {
  const picker = read("src/components/listings/LocationPicker.tsx");
  const api = read("src/app/api/locations/route.ts");

  it("loads each hierarchy level only from the HEAVIX locations endpoint", () => {
    expect(picker).toContain('fetch("/api/locations", { cache: "no-store" })');
    expect(picker).toContain("`/api/locations?country=${encodeURIComponent(code)}`");
    expect(picker).toContain("`/api/locations?province=${encodeURIComponent(value.provinceId)}`");
    expect(picker).not.toMatch(/https?:\/\//);
    expect(api).toContain("db.country.findMany");
    expect(api).toContain("db.province.findMany");
    expect(api).toContain("db.city.findMany");
  });

  it("clears dependent selections and labels when a parent selection changes", () => {
    expect(picker).toContain('onChange({ ...value, countryId: e.target.value, provinceId: "", cityId: "", countryLabel: selected?.name, provinceLabel: undefined, cityLabel: undefined, latitude: "", longitude: "" });');
    expect(picker).toContain('provinceId: e.target.value,');
    expect(picker).toContain('cityId: "",');
    expect(picker).toContain('cityLabel: undefined,');
    expect(picker).toContain('cityId: e.target.value,');
    expect(picker).toContain('cityLabel: selected?.name,');
  });

  it("does not let stale parent requests overwrite newer selections", () => {
    expect(picker).toContain("let alive = true;");
    expect(picker).toContain("if (!alive) return;");
    expect(picker).toContain("alive = false;");
    expect(picker).toContain("setLoadingProvinces(false);");
    expect(picker).toContain("setLoadingCities(false);");
  });

  it("surfaces empty catalogs and makes country retry visibly enter loading state", () => {
    expect(picker).toContain("setLoadingCountries(true);");
    expect(picker).toContain("if (countryList.length === 0)");
    expect(picker).toContain("if ((data.provinces ?? []).length === 0) setProvinceError(true)");
    expect(picker).toContain("if ((data.cities ?? []).length === 0) setCityError(true)");
    expect(picker).toContain("فهرست کشورها دریافت نشد یا هنوز داده‌ای در آن ثبت نشده است.");
    expect(picker).toContain("فهرست استان‌های این کشور دریافت نشد یا خالی است.");
    expect(picker).toContain("فهرست شهرهای این استان دریافت نشد یا خالی است.");
  });

  it("keeps administrative writes behind the taxonomy permission boundary", () => {
    expect(api).toContain('requireAdminPermission("taxonomy.write")');
    expect(api).toContain('level must be country | province | city');
  });
});
