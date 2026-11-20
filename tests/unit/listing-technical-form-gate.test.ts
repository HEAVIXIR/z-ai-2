import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wizard = readFileSync(join(process.cwd(), "src/app/listings/new/page.tsx"), "utf8");

describe("listing technical form fail-closed gate", () => {
  it("does not allow the wizard to proceed when a selected category has no resolved attributes", () => {
    expect(wizard).toContain("attributesLoaded && attributeDefs.length > 0 && Object.keys(errs).length === 0");
  });

  it("explains why an empty technical form blocks listing submission", () => {
    expect(wizard).toContain("برای این دسته‌بندی هنوز فرم مشخصات فنی فعالی تعریف نشده است");
    expect(wizard).toContain("ادامه ثبت تا تکمیل فرم این دسته‌بندی ممکن نیست");
  });
});
