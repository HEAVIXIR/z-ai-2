import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("Sell in 7 Days public flow security contract", () => {
  it("never treats a browser-submitted flag as proof of prepayment", () => {
    const api = read("src/app/api/sell-in-7-days/route.ts");
    expect(api).not.toContain("prepayNow");
    expect(api).toContain("const prepaymentPaid = false");
    expect(api).toContain('const status = "PENDING_PREPAYMENT"');
    expect(api).toContain("SELL_IN_7_DAYS_CREATE");
  });

  it("rate-limits public tracking and returns only the explicit public projection", () => {
    const api = read("src/app/api/sell-in-7-days/route.ts");
    expect(api).toContain("SELL_IN_7_DAYS_TRACK");
    expect(api).toContain("toPublicSellIn7DaysTracking");
    expect(api).not.toContain("sellerMobile: true");
    expect(api).not.toContain("sellerEmail: true");
    expect(api).not.toContain("expectedPrice: true");
    expect(api).not.toContain("salePrice: true");
  });

  it("does not present a simulated payment control in the registration form", () => {
    const form = read("src/app/sell-in-7-days/register/RegisterForm.tsx");
    expect(form).not.toContain("prepayNow");
    expect(form).not.toContain("const prepay = async");
    expect(form).not.toContain("setPaid(true)");
    expect(form).toContain("پرداخت آنلاین در این نسخه فعال نیست");
  });

  it("uses the shared trusted proxy IP extractor for public rate limits", () => {
    const context = read("src/lib/request-context.ts");
    expect(context).toContain('headers.get("cf-connecting-ip")');
    expect(context).toContain("hops[hops.length - 1]");
    expect(context).not.toContain("xff.split(",")[0]");
  });

  it("validates that public submissions reference active catalog entities", () => {
    const api = read("src/app/api/sell-in-7-days/route.ts");
    expect(api).toContain('active: true, layer: "CATALOG"');
    expect(api).toContain('active: true, status: "ACTIVE"');
  });

  it("does not display a configured prepayment amount before a payment flow exists", () => {
    const form = read("src/app/sell-in-7-days/register/RegisterForm.tsx");
    const page = read("src/app/sell-in-7-days/register/page.tsx");
    expect(form).not.toContain("prepaymentAmount");
    expect(page).not.toContain("getPrepaymentAmount");
    expect(form).toContain("هیچ مبلغی برای ثبت اولیه دریافت نمی‌شود");
  });

  it("does not expose contact or private financial data in the public tracking UI", () => {
    const client = read("src/app/sell-in-7-days/track/TrackClient.tsx");
    for (const field of [
      "sellerMobile",
      "sellerEmail",
      "sellerName",
      "expectedPrice",
      "valuationPrice",
      "salePrice",
      "commissionAmount",
      "app.description",
    ]) {
      expect(client).not.toContain(field);
    }
    expect(client).toContain("برای حفظ حریم خصوصی");
  });

  it("does not claim an unimplemented payment, fixed commission, or guaranteed sale", () => {
    const landing = read("src/app/sell-in-7-days/page.tsx");
    expect(landing).toContain("فروش دستگاه در ۷ روز تضمین می‌شود؟");
    expect(landing).toContain("در این نسخه فعال نیست");
    expect(landing).not.toContain("کارمزد فقط ۱٪");
    expect(landing).not.toContain("روز تضمین فروش");
  });
});
