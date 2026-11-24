import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wizard = readFileSync(join(process.cwd(), "src/app/listings/new/page.tsx"), "utf8");

describe("listing technical form gate", () => {
  it("blocks catalog listings when the selected category has no active technical form", () => {
    expect(wizard).toContain("return attributesLoaded && (isServiceFlow || attributeDefs.length > 0) && Object.keys(errs).length === 0;");
  });

  it("keeps service-flow empty state non-blocking while catalog empty state is an alert", () => {
    expect(wizard).toContain('role={isServiceFlow ? "status" : "alert"}');
    expect(wizard).toContain("ادامه تا فعال‌سازی فرم تخصصی غیرفعال است");
  });

  it("keeps the technical step blocked until the attribute definitions finish loading", () => {
    expect(wizard).toContain("return attributesLoaded && (isServiceFlow || attributeDefs.length > 0) && Object.keys(errs).length === 0;");
  });
});
