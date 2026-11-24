import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const wizard = read("src/app/listings/new/page.tsx");
const transactionPicker = read("src/components/listings/TransactionTypePicker.tsx");
const categoryPicker = read("src/components/listings/CascadingCategoryPicker.tsx");
const attributes = read("src/components/listings/AttributeFields.tsx");
const location = read("src/components/listings/LocationPicker.tsx");
const media = read("src/components/listings/ListingImageUploader.tsx");
const createListingApi = read("src/app/api/listings/route.ts");

describe("Listing wizard seven-step source contract", () => {
  it("keeps the seven user-facing sections in the declared order", () => {
    expect(wizard).toContain('const STEP_LABELS = [');
    for (const label of ["نوع معامله", "دسته‌بندی", "اطلاعات پایه", "مشخصات تخصصی", "موقعیت", "جزئیات", "تکمیل"]) {
      expect(wizard).toContain(`"${label}"`);
    }
  });


  it("uses industrial marketplace language rather than machine-only wording", () => {
    expect(wizard).toContain("ثبت آگهی در بازار صنعتی HEAVIX");
    expect(wizard).toContain("کالا، مواد معدنی، خدمات یا فرصت صنعتی");
    expect(wizard).toContain("<CascadingCategoryPicker");
    expect(categoryPicker).toContain("دسته اصلی");
    expect(categoryPicker).toContain("سطح ${level + 1} دسته‌بندی");
    expect(wizard).toContain("<LocationPicker");
    expect(location).toContain("کشور");
    expect(location).toContain("استان");
    expect(location).toContain("شهر");
    expect(wizard).not.toContain("ثبت آگهی ماشین‌آلات");
  });

  it("loads transaction types from the canonical endpoint and requires explicit selection", () => {
    expect(transactionPicker).toContain('fetch("/api/transaction-types", { cache: "no-store" })');
    expect(transactionPicker).toContain('onClick={() => onChange(t.key)}');
    expect(transactionPicker).toContain("setRetryKey((current) => current + 1)");
    expect(transactionPicker).not.toMatch(/if\s*\(!value\s*&&[\s\S]*?onChange\(sale\.key\)/);
  });

  it("surfaces taxonomy loading failures instead of leaving a permanent loading placeholder", () => {
    expect(wizard).toContain('fetch("/api/taxonomy", { cache: "no-store" })');
    expect(wizard).toContain("taxonomyError");
    expect(wizard).toContain("setTaxonomyRetryKey((current) => current + 1)");
    expect(categoryPicker).toContain("/api/taxonomy/categories/");
    expect(categoryPicker).toContain("تلاش مجدد برای دریافت زیر‌دسته‌ها");
  });

  it("loads the global brand registry, free-text model and inherited category attributes", () => {
    expect(wizard).toContain("/api/brands/search?q=");
    expect(wizard).toContain("/api/brands/search?q=");
    expect(wizard).toContain("/api/taxonomy/brands/");
    expect(wizard).toContain("modelId={modelId || null}");
    expect(wizard).toContain('const [modelName, setModelName] = useState<string>("");');
    expect(wizard).toContain("value={modelName}");
    expect(wizard).toContain("setModelName(e.target.value.slice(0, 120))");
    expect(attributes).toContain("/api/categories/");
    expect(attributes).toContain("/attributes");
    expect(attributes).toContain("تلاش مجدد برای بارگذاری ویژگی‌ها");
  });

  it("surfaces global brand lookup failures with an explicit retry control", () => {
    expect(wizard).toContain("brandError");
    expect(wizard).toContain("setBrandRetryKey((key) => key + 1)");
    expect(wizard).toContain("modelsError");
    expect(wizard).toContain("setModelsRetryKey((value) => value + 1)");
    expect(wizard).toContain("brandAbort.current?.abort()");
    expect(wizard).toContain("ctrl.signal.aborted");
  });

  it("uses canonical location APIs and authenticated staged media upload", () => {
    expect(location).toContain('fetch("/api/locations"');
    expect(location).toContain("تلاش مجدد");
    expect(media).toContain('fetch("/api/media/staging"');
  });

  it("submits through the authenticated listing API with server-side transaction and attribute validation", () => {
    expect(wizard).toContain('const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings"');
    expect(wizard).toContain("fetch(endpoint");
    expect(createListingApi).toContain("getCurrentUser()");
    expect(createListingApi).toContain("checkCsrf(req)");
    expect(createListingApi).toContain("validateListingAttributeValues");
    expect(createListingApi).toContain('status: "PENDING"');
  });
});
