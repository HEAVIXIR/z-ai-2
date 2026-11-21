import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wizard = readFileSync(join(process.cwd(), "src/app/listings/new/page.tsx"), "utf8");

describe("listing technical form gate", () => {
  it("allows progression when a successfully loaded category has no active technical attributes", () => {
    expect(wizard).toContain("return attributesLoaded && Object.keys(errs).length === 0;");
    expect(wizard).not.toContain("attributesLoaded && attributeDefs.length > 0 && Object.keys(errs).length === 0");
  });

  it("shows a non-blocking empty state when the category has no active technical attributes", () => {
    expect(wizard).toContain('role="status"');
    expect(wizard).toContain("می‌توانید بدون مشخصات فنی ادامه دهید");
    expect(wizard).not.toContain("ادامه ثبت تا تکمیل فرم این دسته‌بندی ممکن نیست");
  });

  it("keeps the technical step fail-closed until the attribute definitions finish loading", () => {
    expect(wizard).toContain("return attributesLoaded && Object.keys(errs).length === 0;");
  });
});
