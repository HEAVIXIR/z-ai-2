import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("HEAVIX listing wizard end-to-end source contract", () => {
  it("keeps the complete seven-step path and gates progression on step-specific data", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain('const STEP_LABELS = [');
    for (const marker of [
      '"نوع معامله"',
      '"دسته‌بندی"',
      '"اطلاعات پایه"',
      '"مشخصات تخصصی"',
      '"موقعیت"',
      '"جزئیات"',
      '"تکمیل"',
    ]) expect(page).toContain(marker);

    for (const step of [1, 2, 3, 4, 5, 6]) {
      expect(page).toContain(`if (step === ${step})`);
    }
    expect(page).toContain("return attributesLoaded && (isServiceFlow || attributeDefs.length > 0) && Object.keys(errs).length === 0;");
    expect(page).toContain("فرم فنی اختصاصی این دسته‌بندی هنوز به کاتالوگ فعال متصل نشده است");
    expect(page).toContain("if (imagesUploading) return false");
    expect(page).toContain("const next = () => canProceed() && setStep((s) => Math.min(7, s + 1))");
  });

  it("routes each demand and supply transaction to its canonical API and carries the review payload", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain('const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings"');
    expect(page).toContain("attributeValues: attributePayload");
    expect(page).toContain('images: transactionType === "WANTED" || transactionType === "SERVICE_REQUEST" ? undefined : images.map((url) => ({ url }))');
    expect(page).toContain("body.assetIds = stagedMediaAssets.map((asset) => asset.assetId)");
    expect(page).toContain('"Idempotency-Key": idempotencyKeyRef.current');
    expect(page).toContain("setSubmitted(true)");
    expect(page).toContain('label="دسته‌بندی"');
    expect(page).toContain('label="موقعیت"');
    expect(page).toContain('label="تصاویر"');
    expect(page).toContain("ثبت نهایی آگهی");
  });

  it("keeps staged media optional only for request/service flows and required for supply sale, rent and auction", () => {
    const page = read("src/app/listings/new/page.tsx");
    const uploader = read("src/components/listings/ListingImageUploader.tsx");
    const api = read("src/app/api/listings/route.ts");
    expect(page).toContain("required={!isRequestFlow && !isServiceFlow}");
    expect(uploader).toContain("required = false");
    expect(api).toContain("requiresListingImage(transactionType.key)");
    expect(api).toContain("asset.uploadedBy !== user.id");
    expect(api).toContain('asset.status !== "STAGED"');
    expect(api).toContain("attachAsset(asset.id, \"Listing\", listing.id, user.id)");
  });

  it("routes direct SERVICE_REQUEST through the canonical BuyRequest flow", () => {
    const page = read("src/app/listings/new/page.tsx");
    const routing = read("src/lib/transaction-type-routing.ts");
    const listings = read("src/app/api/listings/route.ts");
    expect(page).toContain('transactionType === "SERVICE_REQUEST" ? "SERVICE_REQUEST" : wanted.intent');
    expect(page).toContain('body.description = [form.shortDesc.trim(), form.description.trim()]');
    expect(page).toContain('transactionType === "WANTED" || transactionType === "SERVICE_REQUEST"');
    expect(page).toContain('const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings"');
    expect(page).toContain("if (isServiceRequest)");
    expect(page).not.toContain("isWantedServiceRequest");
    expect(page).not.toContain('data-testid="wanted-media-disabled"');
    expect(page).toContain("<ListingImageUploader");
    expect(page).not.toContain('{transactionType !== "WANTED" && (');
    expect(page).toContain('entityType={isServiceRequest || transactionType === "WANTED" ? "BuyRequest" : "Listing"}');
    expect(routing).toContain('normalized === "SERVICE_REQUEST"');
    expect(listings).toContain("isRequestTransactionType(transactionType.key)");
  });

  it("persists WANTED through its canonical API rather than creating a supply Listing", () => {
    const wanted = read("src/app/api/wanted/route.ts");
    const listings = read("src/app/api/listings/route.ts");
    expect(wanted).toContain("requesterName: normalizedRequesterName || null");
    expect(wanted).toContain("requesterPhone: normalizedRequesterPhone || null");
    expect(wanted).toContain("categoryId: requestedCategoryId");
    expect(listings).toContain('transactionType.key !== "QUOTE"');
    expect(listings).toContain("/api/wanted");
  });

  it("validates WANTED country/province hierarchy and provides a dashboard destination for service demand", () => {
    const wantedApi = read("src/app/api/wanted/route.ts");
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wantedApi).toContain("const requestedCountryId = countryId ? String(countryId) : null");
    expect(wantedApi).toContain("resolvedProvince.countryId !== requestedCountryId");
    expect(wantedApi).toContain("countryId: resolvedCountryId");
    expect(wantedApi).toContain("provinceId: resolvedProvince?.id ?? null");
    expect(wantedApi).toContain("cityId: selectedCity?.id ?? null");
    expect(wantedApi).toContain("استان انتخاب‌شده با کشور انتخاب‌شده مطابقت ندارد.");
    expect(wizard).toContain('transactionType === "WANTED" || transactionType === "SERVICE_REQUEST" ? "درخواست شما ثبت شد!"');
    expect(wizard).toContain('createdId && (transactionType === "WANTED" || transactionType === "SERVICE_REQUEST")');
    expect(wizard).toContain('href="/dashboard/wanted"');
  });
});
