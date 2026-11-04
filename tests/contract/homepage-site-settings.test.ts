import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("homepage public site settings", () => {
  it("loads settings read-only and passes them to Header and Footer", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/db\.siteSettings\.findUnique\(\{ where: \{ id: "main" \} \}\)/);
    expect(page).toMatch(/<Header siteSettings=\{headerSettings\}/);
    expect(page).toMatch(/<Footer settings=\{footerSettings\}/);
  });

  it("renders admin-configured public contact and footer text with safe fallbacks", () => {
    const footer = read("src/components/layout/Footer.tsx");
    for (const key of ["about", "phone", "email", "address", "workingHours", "copyright"]) {
      expect(footer).toContain("settings?." + key);
    }
    expect(footer).toMatch(/const DEFAULT_ABOUT/);
    expect(footer).toMatch(/const DEFAULT_COPYRIGHT/);
  });
});
