import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const footer = readFileSync(path.join(root, "src/components/layout/Footer.tsx"), "utf8");

describe("public footer navigation targets", () => {
  it("provides the about anchor used by homepage/footer links", () => {
    expect(footer).toMatch(/id="about"/);
    expect(footer).toMatch(/href="\/\#about"/);
  });

  it("routes the seven-day selling link to an existing page, not a missing homepage section", () => {
    expect(footer).toMatch(/label: "فروش در ۷ روز", href: "\/sell-in-7-days"/);
    expect(existsSync(path.join(root, "src/app/sell-in-7-days/page.tsx"))).toBe(true);
  });

  it("retains the real contact anchor", () => {
    expect(footer).toMatch(/id="contact"/);
    expect(footer).toMatch(/href="\/\#contact"/);
  });
});
