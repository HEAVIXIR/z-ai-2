import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * P0-A + P0-B: intent selector in Step 1 + review screen completeness.
 *
 * P0-A: the WANTED intent selector must be in Step 1 (before category
 * selection), NOT Step 6. The user must pick an intent before the taxonomy
 * routing is determined (serviceRoots vs marketplaceRoots).
 *
 * P0-B: the review screen (Step 7) must show human-readable location names
 * (not raw cuid IDs), the created listing id/slug in the success screen,
 * and complete review rows (shortDesc, description, sellerName/Phone,
 * availabilityStart/End, rfq.terms, intent label).
 */
describe("P0-A + P0-B: intent in Step 1 + review screen completeness", () => {
  const page = read("src/app/listings/new/page.tsx");

  it("P0-A: intent selector is rendered in Step 1 (before category)", () => {
    // The intent selector must be inside the `step === 1` block.
    const step1Block = page.split("{step === 1 &&")[1]?.split("{step === 2 &&")[0] ?? "";
    expect(step1Block).toContain("transactionType === \"WANTED\"");
    expect(step1Block).toContain("handleWantedIntentChange");
    expect(step1Block).toContain("SALE_AND_RENT");
    expect(step1Block).toContain("SERVICE_REQUEST");
  });

  it("P0-A: canProceed for Step 1 requires intent when WANTED", () => {
    const step1CanProceed = page.split("if (step === 1)")[1]?.split("if (step === 2)")[0] ?? "";
    expect(step1CanProceed).toContain('transactionType === "WANTED"');
    expect(step1CanProceed).toContain("!wanted.intent");
  });

  it("P0-A: Step 6 shows a read-only intent badge (not the selector)", () => {
    // The Step 6 WANTED block has the "جزئیات درخواست خرید" header.
    // Isolate it by splitting on that header (which only appears in Step 6).
    const step6WantedBlock = page.split("جزئیات درخواست خرید")[1]?.split("تصاویر")[0] ?? "";
    // The read-only badge must be present.
    expect(step6WantedBlock).toContain("انتخاب‌شده در مرحله ۱");
    // The interactive selector buttons must NOT be in Step 6.
    expect(step6WantedBlock).not.toContain("handleWantedIntentChange(t.v)");
  });

  it("P0-B: location shown as labels (not raw IDs) in Step 7", () => {
    const step7Block = page.split('label="موقعیت"')[1]?.split('label="ویژگی‌ها"')[0] ?? "";
    expect(step7Block).toContain("countryLabel");
    expect(step7Block).toContain("provinceLabel");
    expect(step7Block).toContain("cityLabel");
    // Must NOT use raw IDs.
    expect(step7Block).not.toContain("countryId, location.provinceId, location.cityId");
  });

  it("P0-B: LocationValue type includes label fields", () => {
    const picker = read("src/components/listings/LocationPicker.tsx");
    expect(picker).toContain("countryLabel?");
    expect(picker).toContain("provinceLabel?");
    expect(picker).toContain("cityLabel?");
  });

  it("P0-B: LocationPicker onChange passes labels", () => {
    const picker = read("src/components/listings/LocationPicker.tsx");
    // The country select onChange must look up the selected country's name.
    expect(picker).toContain("countries.find((c) => c.id === e.target.value)");
    expect(picker).toContain("countryLabel: selected?.name");
    // Province select onChange must pass provinceLabel.
    expect(picker).toContain("provinces.find((p) => p.id === e.target.value)");
    expect(picker).toContain("provinceLabel: selected?.name");
    // City select onChange must pass cityLabel.
    expect(picker).toContain("cities.find((c) => c.id === e.target.value)");
    expect(picker).toContain("cityLabel: selected?.name");
  });

  it("P0-B: success screen captures created id + slug", () => {
    expect(page).toContain("setCreatedId(String(data.id))");
    expect(page).toContain("setCreatedSlug(String(data.slug))");
  });

  it("P0-B: success screen links to the created listing/request", () => {
    const successBlock = page.split("submitted ?")[1]?.split(") : (")[0] ?? "";
    expect(successBlock).toContain("createdSlug");
    expect(successBlock).toContain("createdId");
    expect(successBlock).toContain("مشاهده آگهی ثبت‌شده");
    // H.1: WANTED success links to the dashboard (not the public API).
    expect(successBlock).toContain("مشاهده درخواست در داشبورد");
  });

  it("P0-B: review screen has additional review rows", () => {
    const step7Block = page.split('label="موقعیت"')[1]?.split("</form>")[0] ?? "";
    expect(step7Block).toContain('label="خلاصه"');
    expect(step7Block).toContain('label="توضیحات"');
    expect(step7Block).toContain('label="نام تماس"');
    expect(step7Block).toContain('label="شماره تماس"');
    expect(step7Block).toContain('label="نوع تقاضا"');
  });

  it("P0-B: handleTransactionTypeChange clears createdId/createdSlug", () => {
    const handlerBlock = page.split("handleTransactionTypeChange")[1]?.split("canProceed")[0] ?? "";
    expect(handlerBlock).toContain("setCreatedId(null)");
    expect(handlerBlock).toContain("setCreatedSlug(null)");
  });
});
